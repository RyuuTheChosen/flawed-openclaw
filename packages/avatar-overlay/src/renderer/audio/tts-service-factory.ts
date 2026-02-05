/**
 * TTS Service Factory - Creates appropriate TTS service based on engine type.
 * Supports fallback to Web Speech API on Kokoro failures.
 */

import type { TTSService, TTSEvents, TTSEngineType } from "./types.js";
import { createWebSpeechTTSService } from "./web-speech-tts.js";
import { createKokoroTTSService } from "./kokoro-tts-service.js";

export interface TTSServiceFactory {
	/**
	 * Create a TTS service for the specified engine.
	 */
	createService(engine: TTSEngineType, events: TTSEvents): TTSService;
}

/**
 * Create the default TTS service factory.
 */
export function createTTSServiceFactory(): TTSServiceFactory {
	return {
		createService(engine: TTSEngineType, events: TTSEvents): TTSService {
			switch (engine) {
				case "kokoro":
					return createKokoroTTSService(events);
				case "web-speech":
				default:
					return createWebSpeechTTSService(events);
			}
		},
	};
}

/**
 * Create a TTS service with automatic fallback on errors.
 * If the primary engine fails during initialization, falls back to Web Speech.
 */
export function createTTSServiceWithFallback(
	engine: TTSEngineType,
	events: TTSEvents,
	onFallback?: (from: TTSEngineType, to: TTSEngineType, reason: string) => void
): TTSService {
	const factory = createTTSServiceFactory();

	// Wrap events to intercept errors for fallback logic
	let currentService: TTSService | null = null;
	let hasInitialized = false;

	const wrappedEvents: TTSEvents = {
		onStart: () => {
			hasInitialized = true;
			events.onStart();
		},
		onEnd: events.onEnd,
		onBoundary: events.onBoundary,
		onError: (error: string) => {
			// If Kokoro fails before first successful init, fallback
			if (engine === "kokoro" && !hasInitialized && currentService) {
				console.warn(`[TTS] Kokoro failed: ${error}, falling back to Web Speech`);
				onFallback?.(engine, "web-speech", error);

				// Dispose failed service and create fallback
				currentService.dispose();
				currentService = factory.createService("web-speech", events);
				return;
			}

			// Otherwise just forward the error
			events.onError(error);
		},
	};

	currentService = factory.createService(engine, wrappedEvents);
	return currentService;
}
