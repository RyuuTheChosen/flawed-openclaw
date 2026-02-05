/**
 * TTS Service - Re-exports for backwards compatibility.
 *
 * The implementation has been split into:
 * - types.ts: Interface definitions
 * - web-speech-tts.ts: Web Speech API implementation
 * - kokoro-tts-service.ts: Kokoro.js implementation
 * - tts-service-factory.ts: Factory for creating services
 */

// Re-export types for backwards compatibility
export type { TTSEvents, TTSService, TTSVoice, TTSEngineType, TTSControllerConfig } from "./types.js";
export { TTS_ENGINES, KOKORO_VOICES, KOKORO_DEFAULT_VOICE } from "./types.js";

// Re-export Web Speech implementation as default factory for backwards compatibility
export { createWebSpeechTTSService as createTTSService } from "./web-speech-tts.js";
