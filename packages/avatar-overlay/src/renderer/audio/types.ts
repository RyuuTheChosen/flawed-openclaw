/**
 * TTS type definitions and interfaces.
 * Shared across all TTS service implementations.
 */

// === Engine Types ===

export const TTS_ENGINES = ["web-speech", "kokoro"] as const;
export type TTSEngineType = (typeof TTS_ENGINES)[number];

// === Voice Types ===

export interface TTSVoice {
	id: string;
	name: string;
	lang: string;
	gender?: "male" | "female";
}

// === Event Callbacks ===

export interface TTSEvents {
	onStart: () => void;
	onEnd: () => void;
	onBoundary: (word: string, charIndex: number, charLength: number) => void;
	onError: (error: string) => void;
}

// === Service Interfaces ===

/**
 * Base TTS service interface - minimal contract for all implementations.
 */
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

	/**
	 * Get the engine type for this service.
	 */
	getEngineType(): TTSEngineType;

	/**
	 * Get available voices for this engine.
	 */
	getVoices(): TTSVoice[];

	/**
	 * Set the current voice by ID.
	 */
	setVoice(voiceId: string): void;

	/**
	 * Get the current voice ID.
	 */
	getCurrentVoice(): string | null;
}

// === Controller Config ===

export interface TTSControllerConfig {
	enabled: boolean;
	engine: TTSEngineType;
	voice: string;
}

// === Kokoro Voice Definitions ===

export const KOKORO_VOICES: TTSVoice[] = [
	// American Female
	{ id: "af_heart", name: "Heart (Female)", lang: "en-US", gender: "female" },
	{ id: "af_bella", name: "Bella (Female)", lang: "en-US", gender: "female" },
	{ id: "af_nicole", name: "Nicole (Female)", lang: "en-US", gender: "female" },
	{ id: "af_sarah", name: "Sarah (Female)", lang: "en-US", gender: "female" },
	{ id: "af_sky", name: "Sky (Female)", lang: "en-US", gender: "female" },
	// American Male
	{ id: "am_adam", name: "Adam (Male)", lang: "en-US", gender: "male" },
	{ id: "am_michael", name: "Michael (Male)", lang: "en-US", gender: "male" },
	// British Female
	{ id: "bf_emma", name: "Emma (British F)", lang: "en-GB", gender: "female" },
	{ id: "bf_isabella", name: "Isabella (British F)", lang: "en-GB", gender: "female" },
	// British Male
	{ id: "bm_george", name: "George (British M)", lang: "en-GB", gender: "male" },
	{ id: "bm_lewis", name: "Lewis (British M)", lang: "en-GB", gender: "male" },
];

export const KOKORO_DEFAULT_VOICE = "af_heart";
