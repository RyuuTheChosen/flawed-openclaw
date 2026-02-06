import { BrowserWindow, Menu, app, dialog, ipcMain, screen } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	WINDOW_WIDTH,
	WINDOW_HEIGHT,
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
	CAMERA_PRESETS,
	IDLE_TIMEOUT_OPTIONS,
	OPACITY_MIN,
	OPACITY_MAX,
} from "../shared/config.js";
import { IPC } from "../shared/ipc-channels.js";
import {
	loadSettings,
	savePosition,
	saveZoom,
	saveOpacity,
	saveIdleTimeout,
	saveTtsEnabled,
	saveTtsEngine,
	saveTtsVoice,
	saveVrmModelPath,
	getPosition,
	getZoom,
	getOpacity,
	getIdleTimeout,
	getTtsEnabled,
	getTtsEngine,
	getTtsVoice,
	cleanupSettings,
	migrateLegacyFiles,
	migrateV1ToV2,
	getChatHistory,
	appendMessage,
	clearChatHistory,
	cleanupChat,
	type ChatMessage,
} from "./persistence/index.js";
import { clampBoundsToWorkArea } from "./display-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migrations are deferred to createOverlayWindow() because
// computeDisplayHash() requires the Electron 'screen' module,
// which can't be used before app 'ready'.
let migrationsDone = false;

function getDefaultPosition(): { x: number; y: number } {
	const display = screen.getPrimaryDisplay();
	const { width, height } = display.workAreaSize;
	return {
		x: width - WINDOW_WIDTH - 20,
		y: height - WINDOW_HEIGHT - 20,
	};
}

function getSnapPosition(corner: "bottomRight" | "bottomLeft" | "topRight" | "topLeft"): { x: number; y: number } {
	const display = screen.getPrimaryDisplay();
	const { width, height } = display.workAreaSize;
	const margin = 20;

	switch (corner) {
		case "bottomRight":
			return { x: width - WINDOW_WIDTH - margin, y: height - WINDOW_HEIGHT - margin };
		case "bottomLeft":
			return { x: margin, y: height - WINDOW_HEIGHT - margin };
		case "topRight":
			return { x: width - WINDOW_WIDTH - margin, y: margin };
		case "topLeft":
			return { x: margin, y: margin };
	}
}

export async function showVrmPicker(win: BrowserWindow): Promise<void> {
	const modelsDir = path.join(__dirname, "..", "..", "..", "assets", "models");
	const result = await dialog.showOpenDialog(win, {
		title: "Select VRM Model",
		defaultPath: modelsDir,
		filters: [{ name: "VRM Models", extensions: ["vrm"] }],
		properties: ["openFile"],
	});
	if (!result.canceled && result.filePaths.length > 0) {
		const selectedPath = result.filePaths[0];
		saveVrmModelPath(selectedPath); // Persist selection
		win.webContents.send(IPC.VRM_MODEL_CHANGED, selectedPath);
	}
}

export function createOverlayWindow(): BrowserWindow {
	// Run migrations once (deferred here because screen requires app ready)
	if (!migrationsDone) {
		migrationsDone = true;
		migrateLegacyFiles();
		migrateV1ToV2();
	}

	// Load persisted settings
	loadSettings();
	const rawPos = getPosition() ?? getDefaultPosition();
	const pos = clampBoundsToWorkArea(rawPos.x, rawPos.y, WINDOW_WIDTH, WINDOW_HEIGHT);

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
			preload: path.join(__dirname, "..", "..", "preload.cjs"),
		},
	});

	// Apply persisted opacity
	win.setOpacity(getOpacity());

	// Open DevTools with F12 key (detached so it's interactive)
	win.webContents.on("before-input-event", (_event, input) => {
		if (input.key === "F12" && input.type === "keyDown") {
			win.webContents.openDevTools({ mode: "detach" });
		}
	});

	win.loadFile(path.join(__dirname, "..", "..", "renderer-bundle", "index.html"));

	// Persist position on move
	win.on("moved", () => {
		const [x, y] = win.getPosition();
		savePosition(x, y);
	});

	// Clean up persistence on close
	win.on("close", () => {
		cleanupSettings();
		cleanupChat();
	});

	// Clean up previous IPC handlers (safe for window re-creation)
	const listenChannels = [
		IPC.SET_IGNORE_MOUSE, IPC.START_DRAG, "avatar:stop-drag",
		IPC.SAVE_CAMERA_ZOOM,
		IPC.SHOW_CONTEXT_MENU, IPC.APPEND_CHAT_MESSAGE, IPC.CLEAR_CHAT_HISTORY,
		IPC.SET_IDLE_TIMEOUT, IPC.SET_OPACITY, IPC.SET_TTS_ENABLED,
		IPC.SET_TTS_ENGINE, IPC.SET_TTS_VOICE, IPC.START_CURSOR_TRACKING,
		IPC.STOP_CURSOR_TRACKING, IPC.SNAP_TO,
	];
	for (const ch of listenChannels) ipcMain.removeAllListeners(ch);

	const handleChannels = [
		IPC.GET_CAMERA_ZOOM, IPC.GET_SETTINGS, IPC.GET_CHAT_HISTORY,
		IPC.GET_IDLE_TIMEOUT, IPC.GET_TTS_ENABLED, IPC.GET_TTS_ENGINE,
		IPC.GET_TTS_VOICE,
	];
	for (const ch of handleChannels) ipcMain.removeHandler(ch);

	// IPC: click-through toggle
	ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore: unknown) => {
		if (typeof ignore !== "boolean") return;
		win.setIgnoreMouseEvents(ignore, { forward: true });
	});

	// IPC: native window drag — main process polls cursor until mouse released
	let dragInterval: ReturnType<typeof setInterval> | null = null;

	ipcMain.on(IPC.START_DRAG, () => {
		if (dragInterval) return;
		const cursor0 = screen.getCursorScreenPoint();
		const [wx0, wy0] = win.getPosition();

		dragInterval = setInterval(() => {
			if (win.isDestroyed()) {
				clearInterval(dragInterval!);
				dragInterval = null;
				return;
			}
			const cursor = screen.getCursorScreenPoint();
			win.setPosition(wx0 + cursor.x - cursor0.x, wy0 + cursor.y - cursor0.y);
		}, 16);
	});

	ipcMain.on("avatar:stop-drag", () => {
		if (dragInterval) {
			clearInterval(dragInterval);
			dragInterval = null;
		}
	});

	// IPC: camera zoom persistence
	ipcMain.handle(IPC.GET_CAMERA_ZOOM, () => {
		return getZoom();
	});

	ipcMain.on(IPC.SAVE_CAMERA_ZOOM, (_event, zoom: unknown) => {
		if (typeof zoom === "number" && Number.isFinite(zoom)) {
			const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
			saveZoom(clamped);
		}
	});

	// IPC: get full settings
	ipcMain.handle(IPC.GET_SETTINGS, () => {
		return {
			opacity: getOpacity(),
			idleTimeoutMs: getIdleTimeout(),
			zoom: getZoom(),
			position: getPosition(),
		};
	});

	// IPC: chat history
	ipcMain.handle(IPC.GET_CHAT_HISTORY, () => {
		return getChatHistory();
	});

	ipcMain.on(IPC.APPEND_CHAT_MESSAGE, (_event, role: unknown, text: unknown, agentId?: unknown) => {
		if (typeof role !== "string" || (role !== "user" && role !== "assistant")) return;
		if (typeof text !== "string" || text.length === 0) return;
		const aid = typeof agentId === "string" ? agentId : undefined;
		appendMessage(role, text, aid);
	});

	ipcMain.on(IPC.CLEAR_CHAT_HISTORY, () => {
		clearChatHistory();
		win.webContents.send(IPC.CHAT_HISTORY_CLEARED);
	});

	// IPC: idle timeout
	ipcMain.handle(IPC.GET_IDLE_TIMEOUT, () => {
		return getIdleTimeout();
	});

	ipcMain.on(IPC.SET_IDLE_TIMEOUT, (_event, ms: unknown) => {
		if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0) return;
		saveIdleTimeout(ms);
		win.webContents.send(IPC.IDLE_TIMEOUT_CHANGED, ms);
	});

	// IPC: opacity
	ipcMain.on(IPC.SET_OPACITY, (_event, opacity: unknown) => {
		if (typeof opacity !== "number" || !Number.isFinite(opacity)) return;
		const clamped = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity));
		saveOpacity(clamped);
		win.setOpacity(clamped);
		win.webContents.send(IPC.OPACITY_CHANGED, clamped);
	});

	// IPC: TTS enabled
	ipcMain.handle(IPC.GET_TTS_ENABLED, () => {
		return getTtsEnabled();
	});

	ipcMain.on(IPC.SET_TTS_ENABLED, (_event, enabled: unknown) => {
		if (typeof enabled !== "boolean") return;
		saveTtsEnabled(enabled);
		win.webContents.send(IPC.TTS_ENABLED_CHANGED, enabled);
	});

	// IPC: TTS engine
	ipcMain.handle(IPC.GET_TTS_ENGINE, () => {
		return getTtsEngine();
	});

	ipcMain.on(IPC.SET_TTS_ENGINE, (_event, engine: unknown) => {
		if (engine !== "web-speech" && engine !== "kokoro") return;
		saveTtsEngine(engine);
		win.webContents.send(IPC.TTS_ENGINE_CHANGED, engine);
	});

	// IPC: TTS voice
	ipcMain.handle(IPC.GET_TTS_VOICE, () => {
		return getTtsVoice();
	});

	ipcMain.on(IPC.SET_TTS_VOICE, (_event, voice: unknown) => {
		if (typeof voice !== "string") return;
		saveTtsVoice(voice);
		win.webContents.send(IPC.TTS_VOICE_CHANGED, voice);
	});

	// Helper functions for context menu actions
	function setZoom(zoom: number): void {
		win.webContents.send(IPC.SET_CAMERA_ZOOM, zoom);
	}

	function setOpacity(opacity: number): void {
		const clamped = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity));
		saveOpacity(clamped);
		win.setOpacity(clamped);
		win.webContents.send(IPC.OPACITY_CHANGED, clamped);
	}

	function snapTo(corner: "bottomRight" | "bottomLeft" | "topRight" | "topLeft"): void {
		const pos = getSnapPosition(corner);
		win.setPosition(pos.x, pos.y);
		savePosition(pos.x, pos.y);
	}

	function setIdleTimeoutMenu(ms: number): void {
		saveIdleTimeout(ms);
		win.webContents.send(IPC.IDLE_TIMEOUT_CHANGED, ms);
	}

	function clearChat(): void {
		clearChatHistory();
		win.webContents.send(IPC.CHAT_HISTORY_CLEARED);
	}

	// Helper functions for TTS settings
	function setTtsEngine(engine: "web-speech" | "kokoro"): void {
		saveTtsEngine(engine);
		win.webContents.send(IPC.TTS_ENGINE_CHANGED, engine);
	}

	// IPC: cursor tracking for eye gaze
	let cursorTrackingInterval: ReturnType<typeof setInterval> | null = null;

	ipcMain.on(IPC.START_CURSOR_TRACKING, () => {
		if (cursorTrackingInterval) return; // Already tracking

		cursorTrackingInterval = setInterval(() => {
			if (win.isDestroyed()) {
				clearInterval(cursorTrackingInterval!);
				cursorTrackingInterval = null;
				return;
			}
			const cursor = screen.getCursorScreenPoint();
			const display = screen.getPrimaryDisplay();
			const { width, height } = display.workAreaSize;
			win.webContents.send(IPC.CURSOR_POSITION, cursor.x, cursor.y, width, height);
		}, 16); // ~60fps
	});

	ipcMain.on(IPC.STOP_CURSOR_TRACKING, () => {
		if (cursorTrackingInterval) {
			clearInterval(cursorTrackingInterval);
			cursorTrackingInterval = null;
		}
	});

	// Stop tracking when window closes
	win.on("close", () => {
		if (cursorTrackingInterval) {
			clearInterval(cursorTrackingInterval);
			cursorTrackingInterval = null;
		}
	});

	// Re-clamp window when displays change
	function reclamp(): void {
		if (win.isDestroyed()) return;
		const [x, y] = win.getPosition();
		const [w, h] = win.getSize();
		const clamped = clampBoundsToWorkArea(x, y, w, h);
		if (clamped.x !== x || clamped.y !== y) {
			win.setPosition(clamped.x, clamped.y);
			savePosition(clamped.x, clamped.y);
		}
	}

	screen.on("display-added", reclamp);
	screen.on("display-removed", reclamp);

	win.on("close", () => {
		screen.removeListener("display-added", reclamp);
		screen.removeListener("display-removed", reclamp);
	});

	// IPC: snap to corner
	ipcMain.on(IPC.SNAP_TO, (_event, corner: unknown) => {
		if (corner !== "bottomRight" && corner !== "bottomLeft" && corner !== "topRight" && corner !== "topLeft") return;
		snapTo(corner);
	});

	// IPC: show context menu from renderer settings button
	ipcMain.on(IPC.SHOW_CONTEXT_MENU, () => {
		const currentOpacity = getOpacity();
		const currentTimeout = getIdleTimeout();
		const currentEngine = getTtsEngine();

		const menu = Menu.buildFromTemplate([
			{
				label: "Framing",
				submenu: [
					{
						label: "Head",
						click: () => setZoom(CAMERA_PRESETS.head),
					},
					{
						label: "Upper Body",
						click: () => setZoom(CAMERA_PRESETS.upperBody),
					},
					{
						label: "Full Body",
						click: () => setZoom(CAMERA_PRESETS.fullBody),
					},
				],
			},
			{
				label: "Opacity",
				submenu: [
					{
						label: "100%",
						type: "radio",
						checked: currentOpacity === 1.0,
						click: () => setOpacity(1.0),
					},
					{
						label: "75%",
						type: "radio",
						checked: currentOpacity === 0.75,
						click: () => setOpacity(0.75),
					},
					{
						label: "50%",
						type: "radio",
						checked: currentOpacity === 0.5,
						click: () => setOpacity(0.5),
					},
					{
						label: "30%",
						type: "radio",
						checked: currentOpacity === 0.3,
						click: () => setOpacity(0.3),
					},
				],
			},
			{
				label: "Position",
				submenu: [
					{
						label: "Bottom Right",
						click: () => snapTo("bottomRight"),
					},
					{
						label: "Bottom Left",
						click: () => snapTo("bottomLeft"),
					},
					{
						label: "Top Right",
						click: () => snapTo("topRight"),
					},
					{
						label: "Top Left",
						click: () => snapTo("topLeft"),
					},
				],
			},
			{
				label: "Chat",
				submenu: [
					{
						label: "Clear History",
						click: clearChat,
					},
					{ type: "separator" },
					{
						label: "Auto-hide: 5s",
						type: "radio",
						checked: currentTimeout === IDLE_TIMEOUT_OPTIONS[0],
						click: () => setIdleTimeoutMenu(IDLE_TIMEOUT_OPTIONS[0]),
					},
					{
						label: "Auto-hide: 10s",
						type: "radio",
						checked: currentTimeout === IDLE_TIMEOUT_OPTIONS[1],
						click: () => setIdleTimeoutMenu(IDLE_TIMEOUT_OPTIONS[1]),
					},
					{
						label: "Auto-hide: 30s",
						type: "radio",
						checked: currentTimeout === IDLE_TIMEOUT_OPTIONS[2],
						click: () => setIdleTimeoutMenu(IDLE_TIMEOUT_OPTIONS[2]),
					},
					{
						label: "Auto-hide: Never",
						type: "radio",
						checked: currentTimeout === IDLE_TIMEOUT_OPTIONS[3],
						click: () => setIdleTimeoutMenu(IDLE_TIMEOUT_OPTIONS[3]),
					},
				],
			},
			{
				label: "Voice",
				submenu: [
					{
						label: "Engine",
						submenu: [
							{
								label: "Web Speech (System)",
								type: "radio",
								checked: currentEngine === "web-speech",
								click: () => setTtsEngine("web-speech"),
							},
							{
								label: "Kokoro (Local AI)",
								type: "radio",
								checked: currentEngine === "kokoro",
								click: () => setTtsEngine("kokoro"),
							},
						],
					},
				],
			},
			{ type: "separator" },
			{
				label: "Change Avatar Model\u2026",
				click: () => showVrmPicker(win),
			},
			{ type: "separator" },
			{
				label: "Quit",
				click: () => app.quit(),
			},
		]);
		menu.popup({ window: win });
	});

	return win;
}
