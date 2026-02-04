interface AvatarBridge {
	setIgnoreMouseEvents(ignore: boolean): void;
	dragMove(deltaX: number, deltaY: number): void;
	onVrmModelChanged(callback: (path: string) => void): void;
	getVrmPath(): Promise<string>;
	showContextMenu(): void;
}

interface Window {
	avatarBridge: AvatarBridge;
}
