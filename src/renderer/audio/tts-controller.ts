/**
 * TTS Controller - Orchestrates TTS service, phoneme mapper, and lip sync.
 * Handles cumulative text from gateway and coordinates audio-driven lip sync.
 * Supports multiple TTS engines with voice selection.
 */

import type { TTSService, TTSEvents, TTSEngineType, TTSVoice, TTSControllerConfig } from "./types.js";
import { createTTSServiceFactory, type TTSServiceFactory } from "./tts-service-factory.js";
import { wordToVisemes, estimateWordDuration } from "./phoneme-mapper.js";
import type { LipSync } from "../avatar/lip-sync.js";
import { createWLipSyncAnalyzer, type WLipSyncAnalyzer } from "./wlipsync-analyzer.js";
import type { AudioPlayer } from "./audio-player.js";

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
	 * Get the current TTS engine type.
	 */
	getEngine(): TTSEngineType;

	/**
	 * Set the TTS engine type.
	 */
	setEngine(engine: TTSEngineType): void;

	/**
	 * Get available voices for the current engine.
	 */
	getAvailableVoices(): TTSVoice[];

	/**
	 * Get the current voice ID.
	 */
	getVoice(): string | null;

	/**
	 * Set the current voice by ID.
	 */
	setVoice(voiceId: string): void;

	/**
	 * Set the audio player for wLipSync integration.
	 */
	setAudioPlayer(player: AudioPlayer): void;

	/**
	 * Pump wLipSync weights to lip sync each frame.
	 */
	update(delta: number): void;

	/**
	 * Cleanup resources.
	 */
	dispose(): void;
}

export function createTTSController(
	lipSync: LipSync,
	config: TTSControllerConfig,
	factory?: TTSServiceFactory
): TTSController {
	const serviceFactory = factory ?? createTTSServiceFactory();

	let ttsEnabled = config.enabled;
	let currentEngine: TTSEngineType = config.engine;
	let currentVoiceId: string = config.voice;
	let ttsService: TTSService | null = null;
	let speakingCallbacks: Array<(speaking: boolean) => void> = [];
	let disposed = false;
	let wasSpeaking = false;
	let wlipSync: WLipSyncAnalyzer | null = null;
	let wlipSyncInitializing = false;
	let audioPlayer: AudioPlayer | null = null;

	function notifySpeakingChange(speaking: boolean): void {
		if (speaking !== wasSpeaking) {
			wasSpeaking = speaking;
			for (const cb of speakingCallbacks) {
				cb(speaking);
			}
		}
	}

	function initWLipSync(): void {
		if (wlipSync || wlipSyncInitializing) return;

		// Get the audio player from the TTS service (Kokoro creates its own)
		const player = ttsService?.getAudioPlayer?.() ?? audioPlayer;
		if (!player) return;
		const ctx = player.getAudioContext();
		if (!ctx) return;

		wlipSyncInitializing = true;
		createWLipSyncAnalyzer(ctx).then((analyzer) => {
			if (disposed) {
				analyzer.dispose();
				return;
			}
			wlipSync = analyzer;
			player.setAnalysisNode(analyzer.node);
		}).catch((err) => {
			console.warn("[TTS] Failed to initialize wLipSync:", err);
		}).finally(() => {
			wlipSyncInitializing = false;
		});
	}

	function createEvents(): TTSEvents {
		return {
			onStart: () => {
				if (disposed) return;
				// If Kokoro, set up wLipSync on first speech
				if (currentEngine === "kokoro") {
					initWLipSync();
				}
				notifySpeakingChange(true);
			},
			onEnd: () => {
				if (disposed) return;
				// Clear lip sync queue when speech ends
				lipSync.clearQueue();
				notifySpeakingChange(false);
			},
			onBoundary: (word, _charIndex, _charLength) => {
				if (disposed || !ttsEnabled) return;

				// Skip phoneme-mapper when wLipSync is active
				if (wlipSync) return;

				// Convert word to viseme frames and feed to lip sync
				const duration = estimateWordDuration(word);
				const frames = wordToVisemes(word, duration);

				if (frames.length > 0) {
					// Use audio mode for audio-driven lip sync
					lipSync.setMode("audio");
					lipSync.feedVisemeFrames(frames);
				}
			},
			onError: (error) => {
				if (disposed) return;
				console.warn(`[TTS] ${currentEngine} error:`, error);
				// Fall back to text mode on error
				lipSync.setMode("text");
				notifySpeakingChange(false);
			},
		};
	}

	function initService(): TTSService {
		if (ttsService) return ttsService;

		ttsService = serviceFactory.createService(currentEngine, createEvents());

		// Apply saved voice if available
		if (currentVoiceId) {
			ttsService.setVoice(currentVoiceId);
		}

		return ttsService;
	}

	function disposeService(): void {
		if (ttsService) {
			ttsService.dispose();
			ttsService = null;
		}
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
			}
		},

		isEnabled(): boolean {
			return ttsEnabled;
		},

		queueText(fullText: string): void {
			if (disposed || !ttsEnabled) return;

			const service = initService();

			// Don't feed text to lip sync here - let audio boundary events drive it
			// This ensures lip sync follows actual audio playback, not text arrival

			// Play TTS audio (boundary events will drive lip sync)
			service.speakDelta(fullText);
		},

		cancel(): void {
			if (ttsService) {
				ttsService.cancel();
				ttsService.resetSpokenIndex();
			}
			lipSync.clearQueue();
			notifySpeakingChange(false);
		},

		resetForNewSession(): void {
			// Reset tracking for new speaking session without cancelling current speech
			if (ttsService) {
				ttsService.resetSpokenIndex();
			}
			lipSync.clearQueue();
		},

		isSpeaking(): boolean {
			return ttsService?.isSpeaking() ?? false;
		},

		onSpeakingChange(cb: (speaking: boolean) => void): void {
			speakingCallbacks.push(cb);
		},

		getEngine(): TTSEngineType {
			return currentEngine;
		},

		setEngine(engine: TTSEngineType): void {
			if (disposed || engine === currentEngine) return;

			// Cancel and dispose current service
			if (ttsService) {
				ttsService.cancel();
				disposeService();
			}

			currentEngine = engine;

			// Clean up wLipSync if switching away from Kokoro
			if (wlipSync && engine !== "kokoro") {
				audioPlayer?.setAnalysisNode(null);
				wlipSync.dispose();
				wlipSync = null;
				lipSync.setMode("text"); // Reset to text mode (also disables realtime)
			}

			// Reset voice when switching engines (voices are engine-specific)
			currentVoiceId = "";

			// If TTS is enabled, initialize new service
			if (ttsEnabled) {
				initService();
			}

			notifySpeakingChange(false);
		},

		getAvailableVoices(): TTSVoice[] {
			const service = ttsService ?? initService();
			return service.getVoices();
		},

		getVoice(): string | null {
			return currentVoiceId || ttsService?.getCurrentVoice() || null;
		},

		setVoice(voiceId: string): void {
			if (disposed) return;

			currentVoiceId = voiceId;
			if (ttsService) {
				ttsService.setVoice(voiceId);
			}
		},

		setAudioPlayer(player: AudioPlayer): void {
			audioPlayer = player;
		},

		update(delta: number): void {
			if (wlipSync) {
				wlipSync.update(delta);
				const weights = wlipSync.getWeights();
				lipSync.setRealtimeWeights(weights);
			}
		},

		dispose(): void {
			disposed = true;
			if (wlipSync) {
				wlipSync.dispose();
				wlipSync = null;
			}
			disposeService();
			speakingCallbacks = [];
			wasSpeaking = false;
		},
	};
}
