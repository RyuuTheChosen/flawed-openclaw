/**
 * Kokoro.js TTS service implementation.
 * Uses local ONNX model for high-quality, offline text-to-speech.
 *
 * Streaming strategy: text arrives word-by-word from the gateway.
 * We buffer until a sentence boundary, then immediately queue that
 * sentence for synthesis. Audio plays as soon as the first segment
 * is ready (no minimum buffer wait).
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
const MAX_SEGMENT_CHARS = 500;
const PREFETCH_COUNT = 3;

/**
 * Flush the sentence buffer if no punctuation arrives within this many chars.
 * Prevents long unpunctuated runs (lists, code, etc.) from blocking playback.
 */
const SENTENCE_BUFFER_FLUSH_CHARS = 200;

/**
 * Flush the sentence buffer if no sentence boundary arrives within this time.
 * Ensures partial text doesn't sit in the buffer forever during slow streams.
 */
const SENTENCE_BUFFER_FLUSH_MS = 3000;

export function createKokoroTTSService(events: TTSEvents): TTSService {
	let currentVoice = KOKORO_DEFAULT_VOICE;
	let lastSpokenIndex = 0;
	let speaking = false;
	let disposed = false;

	const pendingSegments: PendingSegment[] = [];
	const readyAudio: GeneratedAudio[] = [];
	let isGenerating = false;
	let isPlaying = false;
	let audioPlayer: AudioPlayer | null = null;

	// Sentence buffering for streaming text
	let sentenceBuffer = "";
	let flushTimer: ReturnType<typeof setTimeout> | null = null;

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

			const charIndex = text.indexOf(word, charOffset);
			if (charIndex !== -1) {
				charOffset = charIndex + word.length;
			}

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

	// ── Sentence extraction ───────────────────────────────────────

	/**
	 * Extract complete sentences from the buffer.
	 * A sentence ends with . ? or ! followed by whitespace.
	 * Returns extracted sentences and the remaining partial text.
	 */
	function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
		const sentences: string[] = [];
		// Split after sentence-ending punctuation (.?!) followed by whitespace.
		// The lookbehind keeps the punctuation attached to the sentence.
		const regex = /(?<=[.!?])\s+/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(buffer)) !== null) {
			const sentence = buffer.slice(lastIndex, match.index).trim();
			if (sentence) sentences.push(sentence);
			lastIndex = match.index + match[0].length;
		}

		return { sentences, remainder: buffer.slice(lastIndex) };
	}

	/**
	 * Feed text into the sentence buffer. Complete sentences are
	 * extracted and queued for synthesis immediately. Partial text
	 * stays in the buffer until more arrives or the flush timer fires.
	 */
	function feedBuffer(text: string): void {
		sentenceBuffer += text;

		const { sentences, remainder } = extractSentences(sentenceBuffer);

		// Queue every complete sentence
		for (const s of sentences) {
			queueSegment(s);
		}

		sentenceBuffer = remainder;

		// Force-flush if buffer is too long without punctuation
		if (sentenceBuffer.length >= SENTENCE_BUFFER_FLUSH_CHARS) {
			flushBuffer();
			return;
		}

		// Reset the timer — flush if no new sentence boundary soon
		resetFlushTimer();
	}

	function flushBuffer(): void {
		clearFlushTimer();
		const text = sentenceBuffer.trim();
		sentenceBuffer = "";
		if (text) queueSegment(text);
	}

	function resetFlushTimer(): void {
		clearFlushTimer();
		if (sentenceBuffer.trim()) {
			flushTimer = setTimeout(flushBuffer, SENTENCE_BUFFER_FLUSH_MS);
		}
	}

	function clearFlushTimer(): void {
		if (flushTimer !== null) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
	}

	// ── Segment splitting (for large blocks passed to speak()) ────

	function splitIntoSegments(text: string): string[] {
		const trimmed = text.trim();
		if (!trimmed) return [];
		if (trimmed.length <= MAX_SEGMENT_CHARS) return [trimmed];

		// Split on sentence boundaries first
		const segments: string[] = [];
		const { sentences, remainder } = extractSentences(trimmed);

		let chunk = "";
		for (const s of sentences) {
			if (chunk && chunk.length + s.length + 1 > MAX_SEGMENT_CHARS) {
				segments.push(chunk.trim());
				chunk = s;
			} else {
				chunk = chunk ? chunk + " " + s : s;
			}
		}
		if (remainder) {
			chunk = chunk ? chunk + " " + remainder : remainder;
		}
		if (chunk.trim()) segments.push(chunk.trim());

		return segments;
	}

	// ── Generation pipeline ───────────────────────────────────────

	function queueSegment(text: string): void {
		if (disposed || !text.trim()) return;

		// For very long text, split further
		const segments = splitIntoSegments(text);
		const available = MAX_PENDING_SEGMENTS - pendingSegments.length;
		const toAdd = segments.slice(0, available);

		for (const seg of toAdd) {
			pendingSegments.push({ text: seg, cancelled: false });
		}

		generateNext();
	}

	async function generateNext(): Promise<void> {
		if (disposed || isGenerating) return;
		if (readyAudio.length >= PREFETCH_COUNT) return;

		let segment: PendingSegment | undefined;
		while (pendingSegments.length > 0) {
			segment = pendingSegments.shift();
			if (segment && !segment.cancelled) break;
			segment = undefined;
		}

		if (!segment) return;

		isGenerating = true;

		try {
			const loader = getKokoroLoader();
			const result = await loader.generate(segment.text, currentVoice);

			if (disposed || segment.cancelled) {
				isGenerating = false;
				generateNext();
				return;
			}

			readyAudio.push({
				audio: result.audio,
				sampleRate: result.sampleRate,
				text: segment.text,
			});

			isGenerating = false;

			// Start playback immediately — no minimum buffer wait
			if (!isPlaying) {
				playNext();
			}

			generateNext();
		} catch (error) {
			console.error("[Kokoro] Generation error:", error);
			events.onError(error instanceof Error ? error.message : "Kokoro generation failed");
			isGenerating = false;
			generateNext();
		}
	}

	function playNext(): void {
		if (disposed || isPlaying) return;

		const audio = readyAudio.shift();

		if (!audio) {
			const moreToGenerate = isGenerating || pendingSegments.length > 0 || sentenceBuffer.trim().length > 0;
			if (moreToGenerate) return;
			if (speaking) {
				speaking = false;
				events.onEnd();
			}
			return;
		}

		isPlaying = true;

		const audioDurationSec = audio.audio.length / audio.sampleRate;
		fireEstimatedBoundaryEvents(audio.text, audioDurationSec);

		getPlayer().play(audio.audio, audio.sampleRate);

		generateNext();
	}

	// ── Cancellation ──────────────────────────────────────────────

	function cancelAll(): void {
		clearFlushTimer();
		sentenceBuffer = "";

		for (const segment of pendingSegments) {
			segment.cancelled = true;
		}
		pendingSegments.length = 0;
		readyAudio.length = 0;

		if (audioPlayer) audioPlayer.stop();

		speaking = false;
		isPlaying = false;
	}

	// ── Public API ────────────────────────────────────────────────

	return {
		speak(text: string): void {
			if (disposed || !text.trim()) return;
			cancelAll();
			// Full text — split into segments directly (no sentence buffering)
			const segments = splitIntoSegments(text);
			const available = MAX_PENDING_SEGMENTS - pendingSegments.length;
			for (const seg of segments.slice(0, available)) {
				pendingSegments.push({ text: seg, cancelled: false });
			}
			generateNext();
		},

		speakDelta(fullText: string): void {
			if (disposed) return;
			if (fullText.length <= lastSpokenIndex) return;

			const newText = fullText.slice(lastSpokenIndex);
			if (!newText) return;

			lastSpokenIndex = fullText.length;

			// Feed into sentence buffer — complete sentences are queued immediately
			feedBuffer(newText);
		},

		cancel(): void {
			cancelAll();
		},

		isSpeaking(): boolean {
			return speaking || isPlaying || isGenerating
				|| readyAudio.length > 0
				|| pendingSegments.length > 0
				|| sentenceBuffer.trim().length > 0;
		},

		resetSpokenIndex(): void {
			lastSpokenIndex = 0;
			// Flush any buffered text from the previous session
			flushBuffer();
		},

		dispose(): void {
			disposed = true;
			cancelAll();

			if (audioPlayer) {
				audioPlayer.dispose();
				audioPlayer = null;
			}

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

		getAudioPlayer(): AudioPlayer | null {
			return audioPlayer;
		},
	};
}

// Re-export for cleanup
export { disposeKokoroLoader };
