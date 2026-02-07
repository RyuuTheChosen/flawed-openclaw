// Types
export type {
	Settings,
	ChatMessage,
	ChatHistory,
	LoadResult,
} from "./types.js";

export type { LightingCustom } from "./types.js";

export {
	SETTINGS_SCHEMA_VERSION,
	CHAT_SCHEMA_VERSION,
	SettingsSchema,
	LightingCustomSchema,
	ChatMessageSchema,
	ChatHistorySchema,
	createDefaultSettings,
	createDefaultChatHistory,
} from "./types.js";

// File store
export type { FileStore, StoreOptions } from "./file-store.js";
export { createFileStore, getOpenclawDir } from "./file-store.js";

// Settings store
export {
	loadSettings,
	saveSettings,
	savePosition,
	saveZoom,
	saveOpacity,
	saveIdleTimeout,
	saveTtsEnabled,
	saveTtsEngine,
	saveTtsVoice,
	saveVrmModelPath,
	getPosition,
	getZoom,
	getOpacity,
	getIdleTimeout,
	getTtsEnabled,
	getTtsEngine,
	getTtsVoice,
	getVrmModelPath,
	saveScale,
	getScale,
	saveLightingProfile,
	getLightingProfile,
	saveLightingCustom,
	getLightingCustom,
	flushSettings,
	cleanupSettings,
	getSettingsStore,
} from "./settings-store.js";

// Chat store
export {
	loadChatHistory,
	appendMessage,
	clearChatHistory,
	getRecentMessages,
	getChatHistory,
	flushChat,
	cleanupChat,
} from "./chat-store.js";

// Migrations
export { migrateFileNames, migrateLegacyFiles, migrateV1ToV2, migrateV2ToV3 } from "./migrations.js";
