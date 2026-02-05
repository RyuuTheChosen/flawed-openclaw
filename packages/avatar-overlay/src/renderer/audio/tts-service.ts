/**
 * Web Speech API wrapper for text-to-speech synthesis.
 * Follows factory pattern consistent with other avatar-overlay modules.
 */

export interface TTSEvents {
	onStart: () => void;
	onEnd: () => void;
	onBoundary: (word: string, charIndex: number, charLength: number) => void;
	onError: (error: string) => void;
}

export interface TTSService {
	/**
	 * Speak text (replaces any current utterance).
	 */
	speak(text: string): void;

	/**
	 * Speak only the new portion of cumulative text.
	 * Tracks what has already been spoken to avoid repetition.
	 */
	speakDelta(fullText: string): void;

	/**
	 * Cancel current speech and clear pending.
	 */
	cancel(): void;

	/**
	 * Check if currently speaking.
	 */
	isSpeaking(): boolean;

	/**
	 * Reset the spoken index (for new conversation turns).
	 */
	resetSpokenIndex(): void;

	/**
	 * Cleanup event listeners and resources.
	 */
	dispose(): void;
}

export function createTTSService(events: TTSEvents): TTSService {
	const synth = window.speechSynthesis;
	let currentUtterance: SpeechSynthesisUtterance | null = null;
	let lastSpokenIndex = 0;
	let speaking = false;
	let disposed = false;

	// Track full text for boundary event word extraction
	let currentFullText = "";

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

		// Use system default voice and rate
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
				// Extract the word from the text using charIndex and charLength
				const word = currentFullText.slice(e.charIndex, e.charIndex + (e.charLength || 1));
				events.onBoundary(word, e.charIndex, e.charLength || word.length);
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

			currentFullText = text;
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
			currentFullText = fullText;

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
			currentFullText = "";
		},

		dispose(): void {
			disposed = true;
			synth.cancel();
			cleanupUtterance();
			lastSpokenIndex = 0;
			speaking = false;
		},
	};
}
