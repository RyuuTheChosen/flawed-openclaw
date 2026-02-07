import type { BrowserWindow } from "electron";

let target: BrowserWindow | null = null;

export function setSettingsBroadcastTarget(win: BrowserWindow | null): void {
	target = win;
}

export function broadcastToSettings(channel: string, ...args: unknown[]): void {
	if (target && !target.isDestroyed()) {
		target.webContents.send(channel, ...args);
	}
}
