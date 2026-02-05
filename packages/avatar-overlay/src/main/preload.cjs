const { contextBridge, ipcRenderer } = require("electron");

const IPC = {
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
	// Settings
	GET_SETTINGS: "avatar:get-settings",
	SET_OPACITY: "avatar:set-opacity",
	OPACITY_CHANGED: "avatar:opacity-changed",
	// Chat history
	GET_CHAT_HISTORY: "chat:get-history",
	APPEND_CHAT_MESSAGE: "chat:append-message",
	CLEAR_CHAT_HISTORY: "chat:clear-history",
	CHAT_HISTORY_CLEARED: "chat:history-cleared",
	// Idle timeout
	GET_IDLE_TIMEOUT: "chat:get-idle-timeout",
	SET_IDLE_TIMEOUT: "chat:set-idle-timeout",
	IDLE_TIMEOUT_CHANGED: "chat:idle-timeout-changed",
	// TTS
	GET_TTS_ENABLED: "avatar:tts-get-enabled",
	SET_TTS_ENABLED: "avatar:tts-set-enabled",
	TTS_ENABLED_CHANGED: "avatar:tts-enabled-changed",
	// TTS engine
	GET_TTS_ENGINE: "avatar:tts-get-engine",
	SET_TTS_ENGINE: "avatar:tts-set-engine",
	TTS_ENGINE_CHANGED: "avatar:tts-engine-changed",
	// TTS voice
	GET_TTS_VOICE: "avatar:tts-get-voice",
	SET_TTS_VOICE: "avatar:tts-set-voice",
	TTS_VOICE_CHANGED: "avatar:tts-voice-changed",
	// Debug
	DEBUG_LOG: "avatar:debug-log",
	// Cursor tracking
	CURSOR_POSITION: "avatar:cursor-position",
	START_CURSOR_TRACKING: "avatar:start-cursor-tracking",
	STOP_CURSOR_TRACKING: "avatar:stop-cursor-tracking",
};

contextBridge.exposeInMainWorld("avatarBridge", {
	setIgnoreMouseEvents(ignore) {
		ipcRenderer.send(IPC.SET_IGNORE_MOUSE, ignore);
	},

	dragMove(deltaX, deltaY) {
		ipcRenderer.send(IPC.DRAG_MOVE, deltaX, deltaY);
	},

	onVrmModelChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.VRM_MODEL_CHANGED);
		ipcRenderer.on(IPC.VRM_MODEL_CHANGED, (_event, path) => {
			callback(path);
		});
	},

	getVrmPath() {
		return ipcRenderer.invoke(IPC.GET_VRM_PATH);
	},

	showContextMenu() {
		ipcRenderer.send(IPC.SHOW_CONTEXT_MENU);
	},

	getCameraZoom() {
		return ipcRenderer.invoke(IPC.GET_CAMERA_ZOOM);
	},

	saveCameraZoom(zoom) {
		ipcRenderer.send(IPC.SAVE_CAMERA_ZOOM, zoom);
	},

	onCameraZoomChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.SET_CAMERA_ZOOM);
		ipcRenderer.on(IPC.SET_CAMERA_ZOOM, (_event, zoom) => {
			callback(zoom);
		});
	},

	getAnimationsConfig() {
		return ipcRenderer.invoke(IPC.GET_ANIMATIONS_CONFIG);
	},

	onAgentState(callback) {
		ipcRenderer.removeAllListeners(IPC.AGENT_STATE);
		ipcRenderer.on(IPC.AGENT_STATE, (_event, state) => {
			callback(state);
		});
	},

	sendChat(text) {
		ipcRenderer.send(IPC.SEND_CHAT, text);
	},

	toggleChat() {
		ipcRenderer.send(IPC.TOGGLE_CHAT);
	},

	onChatVisibility(callback) {
		ipcRenderer.removeAllListeners(IPC.CHAT_VISIBILITY);
		ipcRenderer.on(IPC.CHAT_VISIBILITY, (_event, visible) => {
			callback(visible);
		});
	},

	// Settings
	getSettings() {
		return ipcRenderer.invoke(IPC.GET_SETTINGS);
	},

	setOpacity(opacity) {
		ipcRenderer.send(IPC.SET_OPACITY, opacity);
	},

	onOpacityChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.OPACITY_CHANGED);
		ipcRenderer.on(IPC.OPACITY_CHANGED, (_event, opacity) => {
			callback(opacity);
		});
	},

	// Chat history
	getChatHistory() {
		return ipcRenderer.invoke(IPC.GET_CHAT_HISTORY);
	},

	appendChatMessage(role, text, agentId) {
		ipcRenderer.send(IPC.APPEND_CHAT_MESSAGE, role, text, agentId);
	},

	clearChatHistory() {
		ipcRenderer.send(IPC.CLEAR_CHAT_HISTORY);
	},

	onChatHistoryCleared(callback) {
		ipcRenderer.removeAllListeners(IPC.CHAT_HISTORY_CLEARED);
		ipcRenderer.on(IPC.CHAT_HISTORY_CLEARED, () => {
			callback();
		});
	},

	// Idle timeout
	getIdleTimeout() {
		return ipcRenderer.invoke(IPC.GET_IDLE_TIMEOUT);
	},

	setIdleTimeout(ms) {
		ipcRenderer.send(IPC.SET_IDLE_TIMEOUT, ms);
	},

	onIdleTimeoutChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.IDLE_TIMEOUT_CHANGED);
		ipcRenderer.on(IPC.IDLE_TIMEOUT_CHANGED, (_event, ms) => {
			callback(ms);
		});
	},

	// TTS
	getTtsEnabled() {
		return ipcRenderer.invoke(IPC.GET_TTS_ENABLED);
	},

	setTtsEnabled(enabled) {
		ipcRenderer.send(IPC.SET_TTS_ENABLED, enabled);
	},

	onTtsEnabledChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.TTS_ENABLED_CHANGED);
		ipcRenderer.on(IPC.TTS_ENABLED_CHANGED, (_event, enabled) => {
			callback(enabled);
		});
	},

	// TTS engine
	getTtsEngine() {
		return ipcRenderer.invoke(IPC.GET_TTS_ENGINE);
	},

	setTtsEngine(engine) {
		ipcRenderer.send(IPC.SET_TTS_ENGINE, engine);
	},

	onTtsEngineChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.TTS_ENGINE_CHANGED);
		ipcRenderer.on(IPC.TTS_ENGINE_CHANGED, (_event, engine) => {
			callback(engine);
		});
	},

	// TTS voice
	getTtsVoice() {
		return ipcRenderer.invoke(IPC.GET_TTS_VOICE);
	},

	setTtsVoice(voice) {
		ipcRenderer.send(IPC.SET_TTS_VOICE, voice);
	},

	onTtsVoiceChanged(callback) {
		ipcRenderer.removeAllListeners(IPC.TTS_VOICE_CHANGED);
		ipcRenderer.on(IPC.TTS_VOICE_CHANGED, (_event, voice) => {
			callback(voice);
		});
	},

	// Cursor tracking
	startCursorTracking() {
		ipcRenderer.send(IPC.START_CURSOR_TRACKING);
	},

	stopCursorTracking() {
		ipcRenderer.send(IPC.STOP_CURSOR_TRACKING);
	},

	onCursorPosition(callback) {
		ipcRenderer.removeAllListeners(IPC.CURSOR_POSITION);
		ipcRenderer.on(IPC.CURSOR_POSITION, (_event, x, y, screenWidth, screenHeight) => {
			callback(x, y, screenWidth, screenHeight);
		});
	},
});
