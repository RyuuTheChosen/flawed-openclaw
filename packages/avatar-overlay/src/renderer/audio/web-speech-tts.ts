/**
 * Web Speech API TTS service implementation.
 * Follows factory pattern consistent with other avatar-overlay modules.
 */

import type { TTSService, TTSEvents, TTSVoice, TTSEngineType } from "./types.js";

/**
 * Convert browser SpeechSynthesisVoice to TTSVoice.
 */
function toTTSVoice(voice: SpeechSynthesisVoice): TTSVoice {
	return {
		id: voice.voiceURI,
		name: voice.name,
		lang: voice.lang,
		// Browser doesn't provide gender reliably, so omit it
	};
}

export function createWebSpeechTTSService(events: TTSEvents): TTSService {
	const synth = window.speechSynthesis;
	let currentUtterance: SpeechSynthesisUtterance | null = null;
	let currentVoice: SpeechSynthesisVoice | null = null;
	let lastSpokenIndex = 0;
	let speaking = false;
	let disposed = false;

	function cleanupUtterance(): void {
		if (currentUtterance) {
			// Remove all listeners to prevent memory leaks
			currentUtterance.onstart = null;
			currentUtterance.onend = null;
			currentUtterance.onerror = null;
			currentUtterance.onboundary = null;
			currentUtterance = null;
		}
	}

	function createUtterance(text: string): SpeechSynthesisUtterance {
		const utterance = new SpeechSynthesisUtterance(text);
		// Capture the utterance text for boundary events (charIndex is relative to this)
		const utteranceText = text;

		// Apply current voice if set
		if (currentVoice) {
			utterance.voice = currentVoice;
		}

		// Use system default rate and pitch
		utterance.rate = 1.0;
		utterance.pitch = 1.0;
		utterance.volume = 1.0;

		utterance.onstart = () => {
			if (disposed) return;
			speaking = true;
			events.onStart();
		};

		utterance.onend = () => {
			if (disposed) return;
			speaking = false;
			cleanupUtterance();
			events.onEnd();
		};

		utterance.onerror = (e) => {
			if (disposed) return;
			speaking = false;
			cleanupUtterance();
			// Ignore "interrupted" errors (caused by cancel())
			if (e.error !== "interrupted") {
				events.onError(e.error || "Unknown TTS error");
			}
		};

		utterance.onboundary = (e) => {
			if (disposed) return;
			if (e.name === "word") {
				// Extract word from the utterance's own text (charIndex is relative to utterance)
				let word: string;
				if (e.charLength && e.charLength > 0) {
					word = utteranceText.slice(e.charIndex, e.charIndex + e.charLength);
				} else {
					// charLength not provided - find word boundary manually
					const afterIndex = utteranceText.slice(e.charIndex);
					const match = afterIndex.match(/^[\w'-]+/);
					word = match ? match[0] : afterIndex.slice(0, 1);
				}
				if (word.trim()) {
					events.onBoundary(word.trim(), e.charIndex, word.length);
				}
			}
		};

		return utterance;
	}

	return {
		speak(text: string): void {
			if (disposed || !text.trim()) return;

			// Cancel any ongoing speech
			synth.cancel();
			cleanupUtterance();

			currentUtterance = createUtterance(text);
			synth.speak(currentUtterance);
		},

		speakDelta(fullText: string): void {
			if (disposed) return;

			// Only speak the new portion
			if (fullText.length <= lastSpokenIndex) return;

			const newText = fullText.slice(lastSpokenIndex).trim();
			if (!newText) return;

			// Update tracking
			lastSpokenIndex = fullText.length;

			// If currently speaking, queue the new text
			// Otherwise start fresh
			if (!speaking) {
				cleanupUtterance();
			}

			const utterance = createUtterance(newText);
			synth.speak(utterance);
			currentUtterance = utterance;
		},

		cancel(): void {
			synth.cancel();
			speaking = false;
			cleanupUtterance();
		},

		isSpeaking(): boolean {
			return speaking || synth.speaking;
		},

		resetSpokenIndex(): void {
			lastSpokenIndex = 0;
		},

		dispose(): void {
			disposed = true;
			synth.cancel();
			cleanupUtterance();
			lastSpokenIndex = 0;
			speaking = false;
		},

		getEngineType(): TTSEngineType {
			return "web-speech";
		},

		getVoices(): TTSVoice[] {
			const voices = synth.getVoices();
			return voices.map(toTTSVoice);
		},

		setVoice(voiceId: string): void {
			const voices = synth.getVoices();
			const voice = voices.find((v) => v.voiceURI === voiceId);
			if (voice) {
				currentVoice = voice;
			}
		},

		getCurrentVoice(): string | null {
			return currentVoice?.voiceURI ?? null;
		},
	};
}
