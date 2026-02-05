interface ChatMessage {
	id: string;
	timestamp: number;
	role: "user" | "assistant";
	text: string;
	agentId?: string;
}

interface ChatHistory {
	schemaVersion: number;
	messages: ChatMessage[];
	lastUpdated: number;
}

interface ChatBridge {
	onAgentState(callback: (state: import("../../shared/types.js").AgentState) => void): void;
	sendChat(text: string): void;
	setIgnoreMouseEvents(ignore: boolean): void;
	notifyContentHidden(): void;
	notifyContentShown(): void;
	onShowBubble(callback: () => void): void;

	// Chat history
	getChatHistory(): Promise<ChatHistory>;
	appendChatMessage(role: "user" | "assistant", text: string, agentId?: string): void;
	clearChatHistory(): void;
	onChatHistoryCleared(callback: () => void): void;

	// Idle timeout
	getIdleTimeout(): Promise<number>;
	setIdleTimeout(ms: number): void;
	onIdleTimeoutChanged(callback: (ms: number) => void): void;
}

interface Window {
	chatBridge: ChatBridge;
}
