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
}

interface Window {
	avatarBridge: AvatarBridge;
}
