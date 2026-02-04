import { BrowserWindow, Menu, app, dialog, ipcMain, screen } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import {
	WINDOW_WIDTH,
	WINDOW_HEIGHT,
	WINDOW_POSITION_FILE,
	CAMERA_ZOOM_DEFAULT,
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
	CAMERA_ZOOM_FILE,
	CAMERA_PRESETS,
} from "../shared/config.js";
import { IPC } from "../shared/ipc-channels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openclawDir = path.join(os.homedir(), ".openclaw");
const positionFile = path.join(openclawDir, WINDOW_POSITION_FILE);
const zoomFile = path.join(openclawDir, CAMERA_ZOOM_FILE);

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let zoomSaveTimeout: ReturnType<typeof setTimeout> | null = null;

function loadPosition(): { x: number; y: number } | null {
	try {
		const data = fs.readFileSync(positionFile, "utf-8");
		const pos = JSON.parse(data) as { x: number; y: number };
		if (typeof pos.x === "number" && typeof pos.y === "number") {
			return pos;
		}
	} catch {
		// No saved position or invalid file — use default
	}
	return null;
}

function savePosition(x: number, y: number): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		try {
			fs.mkdirSync(openclawDir, { recursive: true });
			fs.writeFileSync(positionFile, JSON.stringify({ x, y }));
		} catch {
			// Silently ignore write errors
		}
	}, 500);
}

function loadZoom(): number {
	try {
		const data = fs.readFileSync(zoomFile, "utf-8");
		const parsed = JSON.parse(data) as { zoom: number };
		if (typeof parsed.zoom === "number" && parsed.zoom >= CAMERA_ZOOM_MIN && parsed.zoom <= CAMERA_ZOOM_MAX) {
			return parsed.zoom;
		}
	} catch {
		// No saved zoom or invalid file — use default
	}
	return CAMERA_ZOOM_DEFAULT;
}

function saveZoom(zoom: number): void {
	if (zoomSaveTimeout) clearTimeout(zoomSaveTimeout);
	zoomSaveTimeout = setTimeout(() => {
		try {
			fs.mkdirSync(openclawDir, { recursive: true });
			fs.writeFileSync(zoomFile, JSON.stringify({ zoom }));
		} catch {
			// Silently ignore write errors
		}
	}, 500);
}

function getDefaultPosition(): { x: number; y: number } {
	const display = screen.getPrimaryDisplay();
	const { width, height } = display.workAreaSize;
	return {
		x: width - WINDOW_WIDTH - 20,
		y: height - WINDOW_HEIGHT - 20,
	};
}

export function createOverlayWindow(): BrowserWindow {
	const saved = loadPosition();
	const pos = saved ?? getDefaultPosition();

	const win = new BrowserWindow({
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		x: pos.x,
		y: pos.y,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		hasShadow: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			webSecurity: false,
			preload: path.join(__dirname, "..", "..", "preload.cjs"),
		},
	});

	win.loadFile(path.join(__dirname, "..", "..", "renderer-bundle", "index.html"));

	// Persist position on move
	win.on("moved", () => {
		const [x, y] = win.getPosition();
		savePosition(x, y);
	});

	// Clean up previous IPC handlers (safe for window re-creation)
	ipcMain.removeAllListeners(IPC.SET_IGNORE_MOUSE);
	ipcMain.removeAllListeners(IPC.DRAG_MOVE);
	ipcMain.removeHandler(IPC.GET_CAMERA_ZOOM);
	ipcMain.removeAllListeners(IPC.SAVE_CAMERA_ZOOM);
	ipcMain.removeAllListeners(IPC.SHOW_CONTEXT_MENU);

	// IPC: click-through toggle
	ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore: boolean) => {
		win.setIgnoreMouseEvents(ignore, { forward: true });
	});

	// IPC: window drag
	ipcMain.on(IPC.DRAG_MOVE, (_event, deltaX: number, deltaY: number) => {
		const [x, y] = win.getPosition();
		win.setPosition(x + deltaX, y + deltaY);
	});

	// IPC: camera zoom persistence
	ipcMain.handle(IPC.GET_CAMERA_ZOOM, () => {
		return loadZoom();
	});

	ipcMain.on(IPC.SAVE_CAMERA_ZOOM, (_event, zoom: number) => {
		if (typeof zoom === "number") {
			const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
			saveZoom(clamped);
		}
	});

	// IPC: show context menu from renderer settings button
	ipcMain.on(IPC.SHOW_CONTEXT_MENU, () => {
		const menu = Menu.buildFromTemplate([
			{
				label: "Change Avatar Model\u2026",
				async click() {
					const result = await dialog.showOpenDialog(win, {
						title: "Select VRM Model",
						filters: [{ name: "VRM Models", extensions: ["vrm"] }],
						properties: ["openFile"],
					});
					if (!result.canceled && result.filePaths.length > 0) {
						win.webContents.send(IPC.VRM_MODEL_CHANGED, result.filePaths[0]);
					}
				},
			},
			{
				label: "Framing",
				submenu: [
					{
						label: "Head",
						click() {
							win.webContents.send(IPC.SET_CAMERA_ZOOM, CAMERA_PRESETS.head);
						},
					},
					{
						label: "Upper Body",
						click() {
							win.webContents.send(IPC.SET_CAMERA_ZOOM, CAMERA_PRESETS.upperBody);
						},
					},
					{
						label: "Full Body",
						click() {
							win.webContents.send(IPC.SET_CAMERA_ZOOM, CAMERA_PRESETS.fullBody);
						},
					},
				],
			},
			{ type: "separator" },
			{
				label: "Quit",
				click() {
					app.quit();
				},
			},
		]);
		menu.popup({ window: win });
	});

	return win;
}
