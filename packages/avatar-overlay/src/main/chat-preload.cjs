const { contextBridge, ipcRenderer } = require("electron");

const IPC = {
	AGENT_STATE: "avatar:agent-state",
	SEND_CHAT: "avatar:send-chat",
	SET_IGNORE_MOUSE_CHAT: "chat:set-ignore-mouse",
	CHAT_CONTENT_HIDDEN: "chat:content-hidden",
	CHAT_CONTENT_SHOWN: "chat:content-shown",
	SHOW_CHAT_BUBBLE: "chat:show-bubble",
};

contextBridge.exposeInMainWorld("chatBridge", {
	onAgentState(callback) {
		ipcRenderer.removeAllListeners(IPC.AGENT_STATE);
		ipcRenderer.on(IPC.AGENT_STATE, (_event, state) => {
			callback(state);
		});
	},

	sendChat(text) {
		ipcRenderer.send(IPC.SEND_CHAT, text);
	},

	setIgnoreMouseEvents(ignore) {
		ipcRenderer.send(IPC.SET_IGNORE_MOUSE_CHAT, ignore);
	},

	notifyContentHidden() {
		ipcRenderer.send(IPC.CHAT_CONTENT_HIDDEN);
	},

	notifyContentShown() {
		ipcRenderer.send(IPC.CHAT_CONTENT_SHOWN);
	},

	onShowBubble(callback) {
		ipcRenderer.removeAllListeners(IPC.SHOW_CHAT_BUBBLE);
		ipcRenderer.on(IPC.SHOW_CHAT_BUBBLE, () => {
			callback();
		});
	},
});
