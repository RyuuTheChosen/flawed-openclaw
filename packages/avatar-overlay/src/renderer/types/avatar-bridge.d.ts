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
}

interface Window {
	avatarBridge: AvatarBridge;
}
