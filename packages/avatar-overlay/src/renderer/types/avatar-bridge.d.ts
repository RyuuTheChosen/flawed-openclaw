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

interface AvatarSettings {
	opacity: number;
	idleTimeoutMs: number;
	zoom: number;
	position: { x: number; y: number } | null;
}

interface AvatarBridge {
	setIgnoreMouseEvents(ignore: boolean): void;
	dragMove(deltaX: number, deltaY: number): void;
	onVrmModelChanged(callback: (path: string) => void): void;
	getVrmPath(): Promise<string>;
	showContextMenu(): void;
	getCameraZoom(): Promise<number>;
	saveCameraZoom(zoom: number): void;
	onCameraZoomChanged(callback: (zoom: number) => void): void;
	onAgentState(callback: (state: import("../../shared/types.js").AgentState) => void): void;
	sendChat(text: string): void;
	toggleChat(): void;
	onChatVisibility(callback: (visible: boolean) => void): void;
	getAnimationsConfig(): Promise<{
		clips: Record<import("../../shared/types.js").AgentPhase, string[]>;
	} | null>;

	// Settings
	getSettings(): Promise<AvatarSettings>;
	setOpacity(opacity: number): void;
	onOpacityChanged(callback: (opacity: number) => void): void;

	// Chat history
	getChatHistory(): Promise<ChatHistory>;
	appendChatMessage(role: "user" | "assistant", text: string, agentId?: string): void;
	clearChatHistory(): void;
	onChatHistoryCleared(callback: () => void): void;

	// Idle timeout
	getIdleTimeout(): Promise<number>;
	setIdleTimeout(ms: number): void;
	onIdleTimeoutChanged(callback: (ms: number) => void): void;

	// TTS
	getTtsEnabled(): Promise<boolean>;
	setTtsEnabled(enabled: boolean): void;
	onTtsEnabledChanged(callback: (enabled: boolean) => void): void;
}

interface Window {
	avatarBridge: AvatarBridge;
}
