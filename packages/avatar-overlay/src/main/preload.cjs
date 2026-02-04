const { contextBridge, ipcRenderer } = require("electron");

const IPC = {
	DRAG_MOVE: "avatar:drag-move",
	SET_IGNORE_MOUSE: "avatar:set-ignore-mouse",
	GET_VRM_PATH: "avatar:get-vrm-path",
	VRM_MODEL_CHANGED: "avatar:vrm-model-changed",
	SHOW_CONTEXT_MENU: "avatar:show-context-menu",
};

contextBridge.exposeInMainWorld("avatarBridge", {
	setIgnoreMouseEvents(ignore) {
		ipcRenderer.send(IPC.SET_IGNORE_MOUSE, ignore);
	},

	dragMove(deltaX, deltaY) {
		ipcRenderer.send(IPC.DRAG_MOVE, deltaX, deltaY);
	},

	onVrmModelChanged(callback) {
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
});
