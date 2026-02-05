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
});
