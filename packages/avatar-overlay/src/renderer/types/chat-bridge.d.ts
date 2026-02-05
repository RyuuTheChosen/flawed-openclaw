interface ChatBridge {
	onAgentState(callback: (state: import("../../shared/types.js").AgentState) => void): void;
	sendChat(text: string): void;
	setIgnoreMouseEvents(ignore: boolean): void;
	notifyContentHidden(): void;
	notifyContentShown(): void;
	onShowBubble(callback: () => void): void;
}

interface Window {
	chatBridge: ChatBridge;
}
