import { BrowserWindow, Menu, app, dialog, ipcMain, screen } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_POSITION_FILE } from "../shared/config.js";
import { IPC } from "../shared/ipc-channels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openclawDir = path.join(os.homedir(), ".openclaw");
const positionFile = path.join(openclawDir, WINDOW_POSITION_FILE);

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

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

	// IPC: click-through toggle
	ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore: boolean) => {
		win.setIgnoreMouseEvents(ignore, { forward: true });
	});

	// IPC: window drag
	ipcMain.on(IPC.DRAG_MOVE, (_event, deltaX: number, deltaY: number) => {
		const [x, y] = win.getPosition();
		win.setPosition(x + deltaX, y + deltaY);
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
