// Types and interfaces
export type {
	TTSEvents,
	TTSService,
	TTSVoice,
	TTSEngineType,
	TTSControllerConfig,
} from "./types.js";
export { TTS_ENGINES, KOKORO_VOICES, KOKORO_DEFAULT_VOICE } from "./types.js";

// Phoneme mapping
export { wordToVisemes, estimateWordDuration, type Viseme, type VisemeFrame } from "./phoneme-mapper.js";

// Audio player
export { createAudioPlayer, type AudioPlayer, type AudioPlayerEvents } from "./audio-player.js";

// Frequency analyzer
export {
	createFrequencyAnalyzer,
	type FrequencyAnalyzer,
	type FrequencyBands,
	type FrequencyAnalyzerConfig,
} from "./frequency-analyzer.js";

// TTS services
export { createWebSpeechTTSService } from "./web-speech-tts.js";
export { createKokoroTTSService, disposeKokoroLoader } from "./kokoro-tts-service.js";

// Factory
export { createTTSServiceFactory, createTTSServiceWithFallback, type TTSServiceFactory } from "./tts-service-factory.js";

// Controller
export { createTTSController, type TTSController } from "./tts-controller.js";
