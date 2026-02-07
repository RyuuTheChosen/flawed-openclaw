import { BrowserWindow, ipcMain, screen } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createOverlayWindow } from "./window.js";
import { IPC } from "../shared/ipc-channels.js";
import {
	WINDOW_HEIGHT,
	CHAT_WINDOW_WIDTH,
	CHAT_WINDOW_HEIGHT,
	CHAT_WINDOW_GAP,
	SETTINGS_WINDOW_WIDTH,
	SETTINGS_WINDOW_HEIGHT,
} from "../shared/config.js";
import type { AgentState } from "../shared/types.js";
import { clampBoundsToWorkArea } from "./display-utils.js";
import { setSettingsBroadcastTarget } from "./settings-broadcast.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WindowManager {
	avatarWin: BrowserWindow;
	chatWin: BrowserWindow;
	settingsWin: BrowserWindow | null;
	chatVisible: boolean;
	toggleChat(): void;
	showChat(): void;
	hideChat(): void;
	repositionChat(): void;
	showSettings(): void;
	hideSettings(): void;
	toggleSettings(): void;
	hideAll(): void;
	showAvatar(): void;
	sendAgentState(state: AgentState): void;
	sendToAvatar(channel: string, ...args: unknown[]): void;
	sendToChat(channel: string, ...args: unknown[]): void;
	sendToSettings(channel: string, ...args: unknown[]): void;
	destroyAll(): void;
}

function computeChatPosition(
	avatarX: number,
	avatarY: number,
	avatarWidth: number,
): { x: number; y: number } {
	const point = { x: avatarX + avatarWidth / 2, y: avatarY };
	const display = screen.getDisplayNearestPoint(point);
	const workArea = display.workArea;

	const chatX = Math.round(
		avatarX + avatarWidth / 2 - CHAT_WINDOW_WIDTH / 2,
	);

	// Try above avatar first
	const aboveY = avatarY - CHAT_WINDOW_HEIGHT - CHAT_WINDOW_GAP;
	if (aboveY >= workArea.y) {
		return clampBoundsToWorkArea(chatX, aboveY, CHAT_WINDOW_WIDTH, CHAT_WINDOW_HEIGHT);
	}

	// Fall back to below avatar
	const belowY = avatarY + WINDOW_HEIGHT + CHAT_WINDOW_GAP;
	return clampBoundsToWorkArea(chatX, belowY, CHAT_WINDOW_WIDTH, CHAT_WINDOW_HEIGHT);
}

function createChatWindow(): BrowserWindow {
	const chatWin = new BrowserWindow({
		width: CHAT_WINDOW_WIDTH,
		height: CHAT_WINDOW_HEIGHT,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		hasShadow: false,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "..", "..", "chat-preload.cjs"),
		},
	});

	chatWin.loadFile(
		path.join(__dirname, "..", "..", "chat-renderer-bundle", "chat-index.html"),
	);

	// Chat window should be interactive by default (not click-through)
	// Only the transparent areas around the chat body will pass clicks through

	return chatWin;
}

function createSettingsWindow(): BrowserWindow {
	const settingsWin = new BrowserWindow({
		width: SETTINGS_WINDOW_WIDTH,
		height: SETTINGS_WINDOW_HEIGHT,
		transparent: false,
		frame: false,
		alwaysOnTop: false,
		skipTaskbar: false,
		resizable: true,
		minWidth: 320,
		minHeight: 400,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, "..", "..", "settings-preload.cjs"),
		},
	});

	settingsWin.loadFile(
		path.join(__dirname, "..", "..", "settings-renderer-bundle", "settings-index.html"),
	);

	return settingsWin;
}

export function createWindowManager(): WindowManager {
	const avatarWin = createOverlayWindow();
	let chatWin = createChatWindow();
	let chatVisible = false;
	let settingsWin: BrowserWindow | null = null;

	// Handle chat window being closed externally
	chatWin.on("closed", () => {
		chatVisible = false;
		chatWin = createChatWindow();
	});

	function repositionChat(): void {
		if (chatWin.isDestroyed()) return;
		const [ax, ay] = avatarWin.getPosition();
		const [aw] = avatarWin.getSize();
		const pos = computeChatPosition(ax, ay, aw);
		chatWin.setPosition(pos.x, pos.y);
	}

	function showChat(): void {
		if (chatVisible) return;
		chatVisible = true;
		repositionChat();
		chatWin.showInactive();
		chatWin.webContents.send(IPC.SHOW_CHAT_BUBBLE);
		avatarWin.webContents.send(IPC.CHAT_VISIBILITY, true);
	}

	function hideChat(): void {
		if (!chatVisible) return;
		chatVisible = false;
		if (!chatWin.isDestroyed()) chatWin.hide();
		avatarWin.webContents.send(IPC.CHAT_VISIBILITY, false);
	}

	function toggleChat(): void {
		if (chatVisible) {
			hideChat();
		} else {
			showChat();
		}
	}

	function showSettings(): void {
		if (avatarWin.isDestroyed()) return;
		if (!settingsWin || settingsWin.isDestroyed()) {
			settingsWin = createSettingsWindow();
			setSettingsBroadcastTarget(settingsWin);
			settingsWin.on("closed", () => {
				settingsWin = null;
				setSettingsBroadcastTarget(null);
			});
		}
		const [ax, ay] = avatarWin.getPosition();
		const pos = clampBoundsToWorkArea(
			ax - SETTINGS_WINDOW_WIDTH - 12,
			ay,
			SETTINGS_WINDOW_WIDTH,
			SETTINGS_WINDOW_HEIGHT,
		);
		settingsWin.setPosition(pos.x, pos.y);
		settingsWin.show();
		settingsWin.focus();
	}

	function hideSettings(): void {
		if (settingsWin && !settingsWin.isDestroyed()) settingsWin.hide();
	}

	function toggleSettings(): void {
		if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
			hideSettings();
		} else {
			showSettings();
		}
	}

	function sendToSettings(channel: string, ...args: unknown[]): void {
		if (settingsWin && !settingsWin.isDestroyed()) {
			settingsWin.webContents.send(channel, ...args);
		}
	}

	function hideAll(): void {
		hideChat();
		hideSettings();
		avatarWin.hide();
	}

	function showAvatar(): void {
		avatarWin.show();
	}

	function sendAgentState(state: AgentState): void {
		avatarWin.webContents.send(IPC.AGENT_STATE, state);
		if (!chatWin.isDestroyed()) {
			chatWin.webContents.send(IPC.AGENT_STATE, state);
		}
		// Auto-show chat on non-idle states
		if (state.phase !== "idle") {
			showChat();
		}
	}

	function sendToAvatar(channel: string, ...args: unknown[]): void {
		if (!avatarWin.isDestroyed()) {
			avatarWin.webContents.send(channel, ...args);
		}
	}

	function sendToChat(channel: string, ...args: unknown[]): void {
		if (!chatWin.isDestroyed()) {
			chatWin.webContents.send(channel, ...args);
		}
	}

	function destroyAll(): void {
		if (settingsWin && !settingsWin.isDestroyed()) settingsWin.destroy();
		if (!chatWin.isDestroyed()) chatWin.destroy();
		if (!avatarWin.isDestroyed()) avatarWin.destroy();
	}

	// Reposition chat when avatar moves
	avatarWin.on("moved", () => {
		if (chatVisible) repositionChat();
	});

	// Toggle chat from avatar renderer
	ipcMain.on(IPC.TOGGLE_CHAT, () => {
		toggleChat();
	});

	// Chat window click-through toggle
	ipcMain.on(IPC.SET_IGNORE_MOUSE_CHAT, (_event, ignore: unknown) => {
		if (typeof ignore !== "boolean" || chatWin.isDestroyed()) return;
		chatWin.setIgnoreMouseEvents(ignore, { forward: true });
	});

	// Chat content hidden (idle fade) → hide the BrowserWindow
	ipcMain.on(IPC.CHAT_CONTENT_HIDDEN, () => {
		hideChat();
	});

	// Chat content shown → ensure window is visible
	ipcMain.on(IPC.CHAT_CONTENT_SHOWN, () => {
		if (!chatVisible) showChat();
	});

	// Settings window open/close from renderer
	ipcMain.on(IPC.OPEN_SETTINGS, () => {
		showSettings();
	});

	ipcMain.on(IPC.CLOSE_SETTINGS, () => {
		hideSettings();
	});

	return {
		get avatarWin() { return avatarWin; },
		get chatWin() { return chatWin; },
		get settingsWin() { return settingsWin; },
		get chatVisible() { return chatVisible; },
		toggleChat,
		showChat,
		hideChat,
		repositionChat,
		showSettings,
		hideSettings,
		toggleSettings,
		hideAll,
		showAvatar,
		sendAgentState,
		sendToAvatar,
		sendToChat,
		sendToSettings,
		destroyAll,
	};
}
