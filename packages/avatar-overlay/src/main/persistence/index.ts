// Types
export type {
	Settings,
	ChatMessage,
	ChatHistory,
	LoadResult,
} from "./types.js";

export {
	SETTINGS_SCHEMA_VERSION,
	CHAT_SCHEMA_VERSION,
	SettingsSchema,
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
export { migrateLegacyFiles, migrateV1ToV2 } from "./migrations.js";
