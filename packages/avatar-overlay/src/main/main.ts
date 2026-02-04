import { app, ipcMain } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createOverlayWindow } from "./window.js";
import { createTray } from "./tray.js";
import { IPC } from "../shared/ipc-channels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}

app.whenReady().then(() => {
	const win = createOverlayWindow();
	createTray(win);

	// Return default VRM model path
	ipcMain.handle(IPC.GET_VRM_PATH, () => {
		return path.join(__dirname, "..", "..", "..", "assets", "default-avatar.vrm");
	});
});

// Keep app alive when all windows are closed (tray stays)
app.on("window-all-closed", () => {
	// no-op: tray keeps the app alive
});
