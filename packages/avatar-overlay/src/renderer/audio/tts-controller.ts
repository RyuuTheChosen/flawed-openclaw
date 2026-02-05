/**
 * TTS Controller - Orchestrates TTS service, phoneme mapper, and lip sync.
 * Handles cumulative text from gateway and coordinates audio-driven lip sync.
 */

import { createTTSService, type TTSService } from "./tts-service.js";
import { wordToVisemes, estimateWordDuration } from "./phoneme-mapper.js";
import type { LipSync } from "../avatar/lip-sync.js";

export interface TTSController {
	/**
	 * Enable or disable TTS.
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Check if TTS is enabled.
	 */
	isEnabled(): boolean;

	/**
	 * Queue text for speaking. Handles cumulative text from gateway.
	 */
	queueText(fullText: string): void;

	/**
	 * Cancel current speech and reset state.
	 */
	cancel(): void;

	/**
	 * Reset spoken index for a new speaking session (without cancelling current speech).
	 */
	resetForNewSession(): void;

	/**
	 * Check if currently speaking.
	 */
	isSpeaking(): boolean;

	/**
	 * Register callback for speaking state changes.
	 */
	onSpeakingChange(cb: (speaking: boolean) => void): void;

	/**
	 * Cleanup resources.
	 */
	dispose(): void;
}

export function createTTSController(
	lipSync: LipSync,
	enabled: boolean
): TTSController {
	let ttsEnabled = enabled;
	let ttsService: TTSService | null = null;
	let speakingCallbacks: Array<(speaking: boolean) => void> = [];
	let disposed = false;
	let wasSpeaking = false;
	let lastFedTextLength = 0; // Track how much text we've fed to lip sync

	function notifySpeakingChange(speaking: boolean): void {
		if (speaking !== wasSpeaking) {
			wasSpeaking = speaking;
			for (const cb of speakingCallbacks) {
				cb(speaking);
			}
		}
	}

	function initService(): TTSService {
		if (ttsService) return ttsService;

		ttsService = createTTSService({
			onStart: () => {
				if (disposed) return;
				console.log("[TTS] onStart - TTS playback started");
				// Keep text mode for lip sync (more reliable than boundary events)
				notifySpeakingChange(true);
			},
			onEnd: () => {
				if (disposed) return;
				console.log("[TTS] onEnd - speech finished");
				// Switch back to text mode when TTS finishes
				// (allows fallback if TTS is disabled mid-speech)
				notifySpeakingChange(false);
			},
			onBoundary: (word, _charIndex, _charLength) => {
				if (disposed || !ttsEnabled) return;

				// Convert word to viseme frames and feed to lip sync
				const duration = estimateWordDuration(word);
				const frames = wordToVisemes(word, duration);
				console.log(`[TTS] onBoundary: "${word}" -> ${frames.length} visemes, duration=${duration}ms, mode=${lipSync.getMode()}`, frames);

				if (frames.length > 0) {
					lipSync.feedVisemeFrames(frames);
				}
			},
			onError: (error) => {
				if (disposed) return;
				console.warn("[TTS] error:", error);
				// Fall back to text mode on error
				lipSync.setMode("text");
				notifySpeakingChange(false);
			},
		});

		return ttsService;
	}

	return {
		setEnabled(enabled: boolean): void {
			if (disposed) return;

			const wasEnabled = ttsEnabled;
			ttsEnabled = enabled;

			if (!enabled && wasEnabled) {
				// TTS was just disabled - cancel any ongoing speech
				if (ttsService) {
					ttsService.cancel();
					ttsService.resetSpokenIndex();
				}
				lipSync.clearQueue();
				notifySpeakingChange(false);
			} else if (enabled && !wasEnabled) {
				// TTS was just enabled - initialize service
				initService();
				// Keep text mode for lip sync - more reliable than audio boundary events
			}
		},

		isEnabled(): boolean {
			return ttsEnabled;
		},

		queueText(fullText: string): void {
			if (disposed || !ttsEnabled) return;

			const service = initService();

			// Use text-based lip sync (more reliable than boundary events)
			// Only feed the new portion (delta) to avoid duplicates
			if (fullText.length > lastFedTextLength) {
				const deltaText = fullText.slice(lastFedTextLength);
				lastFedTextLength = fullText.length;

				console.log(`[TTS] queueText: feeding delta "${deltaText.slice(0, 50)}..." to lip sync`);
				lipSync.setMode("text");
				lipSync.feedText(deltaText);
			}

			// Also play TTS audio
			service.speakDelta(fullText);
		},

		cancel(): void {
			if (ttsService) {
				ttsService.cancel();
				ttsService.resetSpokenIndex();
			}
			lipSync.clearQueue();
			lastFedTextLength = 0;
			notifySpeakingChange(false);
		},

		resetForNewSession(): void {
			// Reset tracking for new speaking session without cancelling current speech
			if (ttsService) {
				ttsService.resetSpokenIndex();
			}
			lastFedTextLength = 0;
		},

		isSpeaking(): boolean {
			return ttsService?.isSpeaking() ?? false;
		},

		onSpeakingChange(cb: (speaking: boolean) => void): void {
			speakingCallbacks.push(cb);
		},

		dispose(): void {
			disposed = true;
			if (ttsService) {
				ttsService.dispose();
				ttsService = null;
			}
			speakingCallbacks = [];
			wasSpeaking = false;
		},
	};
}
