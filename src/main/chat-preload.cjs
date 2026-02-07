const { contextBridge, ipcRenderer } = require("electron");

const IPC = {
	AGENT_STATE: "avatar:agent-state",
	SEND_CHAT: "avatar:send-chat",
	SET_IGNORE_MOUSE_CHAT: "chat:set-ignore-mouse",
	CHAT_CONTENT_HIDDEN: "chat:content-hidden",
	CHAT_CONTENT_SHOWN: "chat:content-shown",
	SHOW_CHAT_BUBBLE: "chat:show-bubble",
	// Chat history
	GET_CHAT_HISTORY: "chat:get-history",
	APPEND_CHAT_MESSAGE: "chat:append-message",
	CLEAR_CHAT_HISTORY: "chat:clear-history",
	CHAT_HISTORY_CLEARED: "chat:history-cleared",
	// Idle timeout
	GET_IDLE_TIMEOUT: "chat:get-idle-timeout",
	SET_IDLE_TIMEOUT: "chat:set-idle-timeout",
	IDLE_TIMEOUT_CHANGED: "chat:idle-timeout-changed",
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
});
