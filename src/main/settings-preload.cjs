// Channel strings duplicated from src/shared/ipc-channels.ts (CJS cannot import ESM).
// Keep both files in sync when adding/renaming channels.
const { contextBridge, ipcRenderer } = require("electron");

const IPC = {
	// Settings window lifecycle
	CLOSE_SETTINGS: "settings:close",
	PICK_VRM_FILE: "settings:pick-vrm-file",
	// Full settings bundle
	GET_SETTINGS: "avatar:get-settings",
	// Opacity
	SET_OPACITY: "avatar:set-opacity",
	OPACITY_CHANGED: "avatar:opacity-changed",
	// Scale
	SET_SCALE: "avatar:set-scale",
	SCALE_CHANGED: "avatar:scale-changed",
	// Camera
	SET_CAMERA_ZOOM: "avatar:set-camera-zoom",
	SAVE_CAMERA_ZOOM: "avatar:save-camera-zoom",
	// TTS
	SET_TTS_ENABLED: "avatar:tts-set-enabled",
	TTS_ENABLED_CHANGED: "avatar:tts-enabled-changed",
	SET_TTS_ENGINE: "avatar:tts-set-engine",
	TTS_ENGINE_CHANGED: "avatar:tts-engine-changed",
	SET_TTS_VOICE: "avatar:tts-set-voice",
	TTS_VOICE_CHANGED: "avatar:tts-voice-changed",
	// Idle timeout
	SET_IDLE_TIMEOUT: "chat:set-idle-timeout",
	IDLE_TIMEOUT_CHANGED: "chat:idle-timeout-changed",
	// Lighting
	SET_LIGHTING_PROFILE: "avatar:set-lighting-profile",
	LIGHTING_PROFILE_CHANGED: "avatar:lighting-profile-changed",
	SET_LIGHTING_CUSTOM: "avatar:set-lighting-custom",
	LIGHTING_CUSTOM_CHANGED: "avatar:lighting-custom-changed",
	// VRM model
	VRM_MODEL_CHANGED: "avatar:vrm-model-changed",
	// Chat
	CLEAR_CHAT_HISTORY: "chat:clear-history",
	// Snap
	SNAP_TO: "avatar:snap-to",
};

contextBridge.exposeInMainWorld("settingsBridge", {
	// Getters (async invoke)
	getSettings() {
		return ipcRenderer.invoke(IPC.GET_SETTINGS);
	},

	// Setters (fire-and-forget send)
	setOpacity(v) {
		ipcRenderer.send(IPC.SET_OPACITY, v);
	},

	setScale(v) {
		ipcRenderer.send(IPC.SET_SCALE, v);
	},

	setCameraZoom(v) {
		ipcRenderer.send(IPC.SAVE_CAMERA_ZOOM, v);
	},

	setTtsEnabled(v) {
		ipcRenderer.send(IPC.SET_TTS_ENABLED, v);
	},

	setTtsEngine(v) {
		ipcRenderer.send(IPC.SET_TTS_ENGINE, v);
	},

	setTtsVoice(v) {
		ipcRenderer.send(IPC.SET_TTS_VOICE, v);
	},

	setIdleTimeout(ms) {
		ipcRenderer.send(IPC.SET_IDLE_TIMEOUT, ms);
	},

	setLightingProfile(profile) {
		ipcRenderer.send(IPC.SET_LIGHTING_PROFILE, profile);
	},

	setLightingCustom(custom) {
		ipcRenderer.send(IPC.SET_LIGHTING_CUSTOM, custom);
	},

	// Actions
	pickVrmFile() {
		return ipcRenderer.invoke(IPC.PICK_VRM_FILE);
	},

	snapTo(corner) {
		ipcRenderer.send(IPC.SNAP_TO, corner);
	},

	clearChat() {
		ipcRenderer.send(IPC.CLEAR_CHAT_HISTORY);
	},

	close() {
		ipcRenderer.send(IPC.CLOSE_SETTINGS);
	},

	// Change listeners (main -> settings renderer)
	onOpacityChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.OPACITY_CHANGED);
		ipcRenderer.on(IPC.OPACITY_CHANGED, (_event, v) => cb(v));
	},

	onScaleChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.SCALE_CHANGED);
		ipcRenderer.on(IPC.SCALE_CHANGED, (_event, v) => cb(v));
	},

	onCameraZoomChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.SET_CAMERA_ZOOM);
		ipcRenderer.on(IPC.SET_CAMERA_ZOOM, (_event, v) => cb(v));
	},

	onTtsEnabledChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.TTS_ENABLED_CHANGED);
		ipcRenderer.on(IPC.TTS_ENABLED_CHANGED, (_event, v) => cb(v));
	},

	onTtsEngineChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.TTS_ENGINE_CHANGED);
		ipcRenderer.on(IPC.TTS_ENGINE_CHANGED, (_event, v) => cb(v));
	},

	onTtsVoiceChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.TTS_VOICE_CHANGED);
		ipcRenderer.on(IPC.TTS_VOICE_CHANGED, (_event, v) => cb(v));
	},

	onIdleTimeoutChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.IDLE_TIMEOUT_CHANGED);
		ipcRenderer.on(IPC.IDLE_TIMEOUT_CHANGED, (_event, ms) => cb(ms));
	},

	onLightingProfileChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.LIGHTING_PROFILE_CHANGED);
		ipcRenderer.on(IPC.LIGHTING_PROFILE_CHANGED, (_event, v) => cb(v));
	},

	onLightingCustomChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.LIGHTING_CUSTOM_CHANGED);
		ipcRenderer.on(IPC.LIGHTING_CUSTOM_CHANGED, (_event, v) => cb(v));
	},

	onVrmModelChanged(cb) {
		ipcRenderer.removeAllListeners(IPC.VRM_MODEL_CHANGED);
		ipcRenderer.on(IPC.VRM_MODEL_CHANGED, (_event, path) => cb(path));
	},
});
