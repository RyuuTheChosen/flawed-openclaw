export const IPC = {
	// Avatar window
	DRAG_MOVE: "avatar:drag-move",
	SET_IGNORE_MOUSE: "avatar:set-ignore-mouse",
	GET_VRM_PATH: "avatar:get-vrm-path",
	VRM_MODEL_CHANGED: "avatar:vrm-model-changed",
	SHOW_CONTEXT_MENU: "avatar:show-context-menu",
	GET_CAMERA_ZOOM: "avatar:get-camera-zoom",
	SAVE_CAMERA_ZOOM: "avatar:save-camera-zoom",
	SET_CAMERA_ZOOM: "avatar:set-camera-zoom",
	AGENT_STATE: "avatar:agent-state",
	GET_ANIMATIONS_CONFIG: "avatar:get-animations-config",
	SEND_CHAT: "avatar:send-chat",
	TOGGLE_CHAT: "avatar:toggle-chat",
	CHAT_VISIBILITY: "avatar:chat-visibility",

	// Settings persistence
	GET_SETTINGS: "avatar:get-settings",
	SET_OPACITY: "avatar:set-opacity",
	OPACITY_CHANGED: "avatar:opacity-changed",

	// Chat window
	SET_IGNORE_MOUSE_CHAT: "chat:set-ignore-mouse",
	CHAT_CONTENT_HIDDEN: "chat:content-hidden",
	CHAT_CONTENT_SHOWN: "chat:content-shown",
	SHOW_CHAT_BUBBLE: "chat:show-bubble",

	// Chat history persistence
	GET_CHAT_HISTORY: "chat:get-history",
	APPEND_CHAT_MESSAGE: "chat:append-message",
	CLEAR_CHAT_HISTORY: "chat:clear-history",
	CHAT_HISTORY_CLEARED: "chat:history-cleared",

	// Idle timeout settings
	GET_IDLE_TIMEOUT: "chat:get-idle-timeout",
	SET_IDLE_TIMEOUT: "chat:set-idle-timeout",
	IDLE_TIMEOUT_CHANGED: "chat:idle-timeout-changed",

	// TTS settings
	GET_TTS_ENABLED: "avatar:tts-get-enabled",
	SET_TTS_ENABLED: "avatar:tts-set-enabled",
	TTS_ENABLED_CHANGED: "avatar:tts-enabled-changed",
} as const;
