import { z } from "zod";
import {
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
	CAMERA_ZOOM_DEFAULT,
	OPACITY_MIN,
	OPACITY_MAX,
	OPACITY_DEFAULT,
	IDLE_TIMEOUT_DEFAULT,
	CHAT_MAX_HISTORY,
	TTS_ENABLED_DEFAULT,
	TTS_ENGINE_DEFAULT,
	TTS_VOICE_DEFAULT,
} from "../../shared/config.js";

export const SETTINGS_SCHEMA_VERSION = 1;
export const CHAT_SCHEMA_VERSION = 1;

// === Settings Schema ===
export const SettingsSchema = z.object({
	schemaVersion: z.number().default(SETTINGS_SCHEMA_VERSION),
	position: z
		.object({
			x: z.number().finite(),
			y: z.number().finite(),
		})
		.optional(),
	camera: z
		.object({
			zoom: z.number().finite().min(CAMERA_ZOOM_MIN).max(CAMERA_ZOOM_MAX),
		})
		.optional(),
	opacity: z.number().min(OPACITY_MIN).max(OPACITY_MAX).default(OPACITY_DEFAULT),
	idleTimeoutMs: z.number().int().min(0).default(IDLE_TIMEOUT_DEFAULT),
	ttsEnabled: z.boolean().default(TTS_ENABLED_DEFAULT),
	ttsEngine: z.enum(["web-speech", "kokoro"]).default(TTS_ENGINE_DEFAULT),
	ttsVoice: z.string().default(TTS_VOICE_DEFAULT),
	vrmModelPath: z.string().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

// === Chat Message Schema ===
export const ChatMessageSchema = z.object({
	id: z.string(),
	timestamp: z.number().int().positive(),
	role: z.enum(["user", "assistant"]),
	text: z.string().max(10000),
	agentId: z.string().optional(),
});

export const ChatHistorySchema = z.object({
	schemaVersion: z.number().default(CHAT_SCHEMA_VERSION),
	messages: z.array(ChatMessageSchema).max(CHAT_MAX_HISTORY).default([]),
	lastUpdated: z.number().int().positive(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatHistory = z.infer<typeof ChatHistorySchema>;

// === Result Types ===
export type LoadResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: string; fallback: T };

// === Default Factories ===
export function createDefaultSettings(): Settings {
	return {
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		position: undefined,
		camera: { zoom: CAMERA_ZOOM_DEFAULT },
		opacity: OPACITY_DEFAULT,
		idleTimeoutMs: IDLE_TIMEOUT_DEFAULT,
		ttsEnabled: TTS_ENABLED_DEFAULT,
		ttsEngine: TTS_ENGINE_DEFAULT,
		ttsVoice: TTS_VOICE_DEFAULT,
	};
}

export function createDefaultChatHistory(): ChatHistory {
	return {
		schemaVersion: CHAT_SCHEMA_VERSION,
		messages: [],
		lastUpdated: Date.now(),
	};
}
