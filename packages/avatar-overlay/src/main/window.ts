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
	getPosition,
	getZoom,
	getOpacity,
	getIdleTimeout,
	getTtsEnabled,
	getTtsEngine,
	getTtsVoice,
	cleanupSettings,
	migrateLegacyFiles,
	getChatHistory,
	appendMessage,
	clearChatHistory,
	cleanupChat,
	type ChatMessage,
} from "./persistence/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run migration on module load
migrateLegacyFiles();

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
		win.webContents.send(IPC.VRM_MODEL_CHANGED, result.filePaths[0]);
	}
}

export function createOverlayWindow(): BrowserWindow {
	// Load persisted settings
	loadSettings();
	const pos = getPosition() ?? getDefaultPosition();

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
	ipcMain.removeAllListeners(IPC.SET_IGNORE_MOUSE);
	ipcMain.removeAllListeners(IPC.DRAG_MOVE);
	ipcMain.removeHandler(IPC.GET_CAMERA_ZOOM);
	ipcMain.removeAllListeners(IPC.SAVE_CAMERA_ZOOM);
	ipcMain.removeAllListeners(IPC.SHOW_CONTEXT_MENU);
	ipcMain.removeHandler(IPC.GET_SETTINGS);
	ipcMain.removeHandler(IPC.GET_CHAT_HISTORY);
	ipcMain.removeHandler(IPC.GET_IDLE_TIMEOUT);
	ipcMain.removeAllListeners(IPC.APPEND_CHAT_MESSAGE);
	ipcMain.removeAllListeners(IPC.CLEAR_CHAT_HISTORY);
	ipcMain.removeAllListeners(IPC.SET_IDLE_TIMEOUT);
	ipcMain.removeAllListeners(IPC.SET_OPACITY);
	ipcMain.removeHandler(IPC.GET_TTS_ENABLED);
	ipcMain.removeAllListeners(IPC.SET_TTS_ENABLED);
	ipcMain.removeHandler(IPC.GET_TTS_ENGINE);
	ipcMain.removeAllListeners(IPC.SET_TTS_ENGINE);
	ipcMain.removeHandler(IPC.GET_TTS_VOICE);
	ipcMain.removeAllListeners(IPC.SET_TTS_VOICE);
	ipcMain.removeAllListeners(IPC.START_CURSOR_TRACKING);
	ipcMain.removeAllListeners(IPC.STOP_CURSOR_TRACKING);

	// IPC: click-through toggle
	ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore: unknown) => {
		if (typeof ignore !== "boolean") return;
		win.setIgnoreMouseEvents(ignore, { forward: true });
	});

	// IPC: window drag
	ipcMain.on(IPC.DRAG_MOVE, (_event, deltaX: unknown, deltaY: unknown) => {
		if (typeof deltaX !== "number" || typeof deltaY !== "number") return;
		if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
		const [x, y] = win.getPosition();
		win.setPosition(x + deltaX, y + deltaY);
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
		const clamped = Math.max(0.3, Math.min(1.0, opacity));
		saveOpacity(clamped);
		win.setOpacity(clamped);
		win.webContents.send(IPC.OPACITY_CHANGED, clamped);
	});

	// IPC: TTS enabled
	ipcMain.handle(IPC.GET_TTS_ENABLED, () => {
		const enabled = getTtsEnabled();
		console.log("[TTS] getTtsEnabled:", enabled);
		return enabled;
	});

	ipcMain.on(IPC.SET_TTS_ENABLED, (_event, enabled: unknown) => {
		if (typeof enabled !== "boolean") return;
		console.log("[TTS] setTtsEnabled:", enabled);
		saveTtsEnabled(enabled);
		win.webContents.send(IPC.TTS_ENABLED_CHANGED, enabled);
	});

	// IPC: TTS engine
	ipcMain.handle(IPC.GET_TTS_ENGINE, () => {
		const engine = getTtsEngine();
		console.log("[TTS] getTtsEngine:", engine);
		return engine;
	});

	ipcMain.on(IPC.SET_TTS_ENGINE, (_event, engine: unknown) => {
		if (engine !== "web-speech" && engine !== "kokoro") return;
		console.log("[TTS] setTtsEngine:", engine);
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
		saveOpacity(opacity);
		win.setOpacity(opacity);
		win.webContents.send(IPC.OPACITY_CHANGED, opacity);
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
