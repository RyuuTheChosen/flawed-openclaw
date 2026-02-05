/**
 * Kokoro.js TTS service implementation.
 * Uses local ONNX model for high-quality, offline text-to-speech.
 */

import type { TTSService, TTSEvents, TTSVoice, TTSEngineType } from "./types.js";
import { KOKORO_VOICES, KOKORO_DEFAULT_VOICE } from "./types.js";
import { createAudioPlayer, type AudioPlayer } from "./audio-player.js";
import { getKokoroLoader, disposeKokoroLoader } from "./kokoro-model-loader.js";

interface PendingSegment {
	text: string;
	cancelled: boolean;
}

interface GeneratedAudio {
	audio: Float32Array;
	sampleRate: number;
	text: string;
}

const MAX_PENDING_SEGMENTS = 50;
const MAX_SEGMENT_CHARS = 1000; // Larger chunks = fewer generation calls
const PREFETCH_COUNT = 3; // Pre-generate this many segments ahead
const MIN_BUFFER_BEFORE_PLAY = 2; // Wait for this many segments before starting playback

export function createKokoroTTSService(events: TTSEvents): TTSService {
	let currentVoice = KOKORO_DEFAULT_VOICE;
	let lastSpokenIndex = 0;
	let speaking = false;
	let disposed = false;

	const pendingSegments: PendingSegment[] = [];
	const readyAudio: GeneratedAudio[] = []; // Pre-generated audio ready to play
	let isGenerating = false;
	let isPlaying = false;
	let audioPlayer: AudioPlayer | null = null;

	function getPlayer(): AudioPlayer {
		if (!audioPlayer) {
			audioPlayer = createAudioPlayer({
				onPlaybackStart: () => {
					if (disposed) return;
					speaking = true;
					events.onStart();
				},
				onPlaybackEnd: () => {
					if (disposed) return;
					isPlaying = false;
					// Play next ready audio immediately
					playNext();
				},
			});
		}
		return audioPlayer;
	}

	/**
	 * Fire estimated word boundary events based on audio duration.
	 * Kokoro doesn't provide word-level timestamps, so we estimate.
	 */
	function fireEstimatedBoundaryEvents(text: string, audioDurationSec: number): void {
		if (disposed) return;

		const words = text.match(/[\w'-]+/g) || [];
		if (words.length === 0) return;

		const totalChars = words.reduce((sum, w) => sum + w.length, 0);
		let charOffset = 0;
		let timeOffset = 0;

		for (const word of words) {
			const wordDuration = (word.length / totalChars) * audioDurationSec * 1000;

			// Find char index in original text
			const charIndex = text.indexOf(word, charOffset);
			if (charIndex !== -1) {
				charOffset = charIndex + word.length;
			}

			// Schedule boundary event
			const capturedWord = word;
			const capturedCharIndex = charIndex !== -1 ? charIndex : charOffset;
			const capturedTimeOffset = timeOffset;

			setTimeout(() => {
				if (disposed) return;
				events.onBoundary(capturedWord, capturedCharIndex, capturedWord.length);
			}, capturedTimeOffset);

			timeOffset += wordDuration;
		}
	}

	/**
	 * Split text into larger segments for fewer generation calls.
	 * Tries to split at paragraph/sentence boundaries when possible.
	 */
	function splitIntoSegments(text: string): string[] {
		const trimmed = text.trim();
		if (!trimmed) return [];

		// If text is short enough, return as single segment
		if (trimmed.length <= MAX_SEGMENT_CHARS) {
			return [trimmed];
		}

		// Split into paragraphs first, then sentences if needed
		const segments: string[] = [];
		const paragraphs = trimmed.split(/\n\n+/);

		let currentChunk = "";

		for (const para of paragraphs) {
			const paraText = para.trim();
			if (!paraText) continue;

			// If adding this paragraph would exceed limit, save current and start new
			if (currentChunk && (currentChunk.length + paraText.length + 2) > MAX_SEGMENT_CHARS) {
				if (currentChunk.trim()) {
					segments.push(currentChunk.trim());
				}
				currentChunk = paraText;
			} else {
				currentChunk = currentChunk ? currentChunk + "\n\n" + paraText : paraText;
			}
		}

		// Add remaining chunk
		if (currentChunk.trim()) {
			segments.push(currentChunk.trim());
		}

		return segments;
	}

	/**
	 * Generate audio for the next pending segment and add to ready queue.
	 * Runs in background, keeps prefetching ahead.
	 */
	async function generateNext(): Promise<void> {
		if (disposed || isGenerating) return;

		// Check if we have enough pre-generated audio
		if (readyAudio.length >= PREFETCH_COUNT) return;

		// Find next non-cancelled segment
		let segment: PendingSegment | undefined;
		while (pendingSegments.length > 0) {
			segment = pendingSegments.shift();
			if (segment && !segment.cancelled) break;
			segment = undefined;
		}

		if (!segment) return; // No more segments to generate

		isGenerating = true;

		try {
			const loader = getKokoroLoader();
			const model = await loader.getModel();

			if (disposed || segment.cancelled) {
				isGenerating = false;
				generateNext(); // Try next segment
				return;
			}

			console.log(`[Kokoro] Generating: "${segment.text.slice(0, 40)}..." (ready=${readyAudio.length}, pending=${pendingSegments.length})`);

			const result = await model.generate(segment.text, { voice: currentVoice });

			if (disposed || segment.cancelled) {
				isGenerating = false;
				generateNext();
				return;
			}

			// Add to ready queue
			readyAudio.push({
				audio: result.audio,
				sampleRate: result.sampling_rate,
				text: segment.text,
			});

			isGenerating = false;

			// Start playback if not already playing
			if (!isPlaying) {
				playNext();
			}

			// Continue prefetching
			generateNext();
		} catch (error) {
			console.error("[Kokoro] Generation error:", error);
			events.onError(error instanceof Error ? error.message : "Kokoro generation failed");
			isGenerating = false;
			// Continue with next segment
			generateNext();
		}
	}

	/**
	 * Play the next ready audio segment.
	 */
	function playNext(): void {
		if (disposed || isPlaying) return;

		// If we haven't started playing yet, wait for minimum buffer
		// (unless there's nothing more to generate)
		const moreToGenerate = isGenerating || pendingSegments.length > 0;
		if (!speaking && moreToGenerate && readyAudio.length < MIN_BUFFER_BEFORE_PLAY) {
			// Wait for more buffer before starting
			return;
		}

		const audio = readyAudio.shift();

		if (!audio) {
			// No ready audio - check if we're still generating
			if (moreToGenerate) {
				// Still generating, will be called again when audio is ready
				return;
			}
			// All done
			if (speaking) {
				speaking = false;
				events.onEnd();
			}
			return;
		}

		isPlaying = true;

		// Fire boundary events for this segment
		const audioDurationSec = audio.audio.length / audio.sampleRate;
		fireEstimatedBoundaryEvents(audio.text, audioDurationSec);

		// Play audio
		getPlayer().play(audio.audio, audio.sampleRate);

		// Trigger more generation while playing
		generateNext();
	}

	/**
	 * Queue text for speaking.
	 */
	function queueSegments(text: string): void {
		if (disposed || !text.trim()) return;

		const segments = splitIntoSegments(text);

		// Limit pending segments to prevent memory issues
		const availableSlots = MAX_PENDING_SEGMENTS - pendingSegments.length;
		const toAdd = segments.slice(0, availableSlots);

		for (const seg of toAdd) {
			pendingSegments.push({ text: seg, cancelled: false });
		}

		// Start generating (will also start playback when ready)
		generateNext();
	}

	/**
	 * Cancel all pending and current speech.
	 */
	function cancelAll(): void {
		// Mark all pending as cancelled
		for (const segment of pendingSegments) {
			segment.cancelled = true;
		}
		pendingSegments.length = 0;

		// Clear ready audio queue
		readyAudio.length = 0;

		// Stop current playback
		if (audioPlayer) {
			audioPlayer.stop();
		}

		speaking = false;
		isPlaying = false;
	}

	return {
		speak(text: string): void {
			if (disposed || !text.trim()) return;

			// Cancel current and queue new
			cancelAll();
			queueSegments(text);
		},

		speakDelta(fullText: string): void {
			if (disposed) return;

			// Only speak the new portion
			if (fullText.length <= lastSpokenIndex) return;

			const newText = fullText.slice(lastSpokenIndex).trim();
			if (!newText) return;

			// Update tracking
			lastSpokenIndex = fullText.length;

			// Queue new segments
			queueSegments(newText);
		},

		cancel(): void {
			cancelAll();
		},

		isSpeaking(): boolean {
			return speaking || isPlaying || isGenerating || readyAudio.length > 0 || pendingSegments.length > 0;
		},

		resetSpokenIndex(): void {
			lastSpokenIndex = 0;
		},

		dispose(): void {
			disposed = true;
			cancelAll();

			if (audioPlayer) {
				audioPlayer.dispose();
				audioPlayer = null;
			}

			// Note: We don't dispose the model loader here as it's shared
			// Call disposeKokoroLoader() separately when app shuts down

			lastSpokenIndex = 0;
			speaking = false;
			isPlaying = false;
			isGenerating = false;
		},

		getEngineType(): TTSEngineType {
			return "kokoro";
		},

		getVoices(): TTSVoice[] {
			return KOKORO_VOICES;
		},

		setVoice(voiceId: string): void {
			const voice = KOKORO_VOICES.find((v) => v.id === voiceId);
			if (voice) {
				currentVoice = voiceId;
			}
		},

		getCurrentVoice(): string | null {
			return currentVoice;
		},
	};
}

// Re-export for cleanup
export { disposeKokoroLoader };
