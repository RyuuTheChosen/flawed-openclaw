import { app, ipcMain } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createOverlayWindow } from "./window.js";
import { createTray } from "./tray.js";
import { createStdinListener, type StdinCommand } from "./stdin-listener.js";
import { createGatewayClient } from "./gateway-client.js";
import { IPC } from "../shared/ipc-channels.js";
import { GATEWAY_URL_DEFAULT } from "../shared/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
function getCliArg(prefix: string): string | undefined {
	for (const arg of process.argv) {
		if (arg.startsWith(prefix)) {
			return arg.slice(prefix.length);
		}
	}
	return undefined;
}

const cliGatewayUrl = getCliArg("--gateway-url=");
const cliVrmPath = getCliArg("--vrm-path=");
const cliAgentConfigs = getCliArg("--agent-configs=");

// Parse per-agent VRM configs if provided (with prototype pollution protection)
let agentConfigs: Record<string, { vrmPath?: string }> | undefined;
if (cliAgentConfigs) {
	try {
		const parsed: unknown = JSON.parse(cliAgentConfigs);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			const safe: Record<string, { vrmPath?: string }> = Object.create(null);
			for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
				if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
				if (typeof val === "object" && val !== null) {
					const v = val as Record<string, unknown>;
					safe[key] = { vrmPath: typeof v.vrmPath === "string" ? v.vrmPath : undefined };
				}
			}
			agentConfigs = safe;
		}
	} catch {
		// Ignore malformed JSON
	}
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}

app.whenReady().then(() => {
	const win = createOverlayWindow();
	createTray(win);

	// Return VRM model path (CLI override or default)
	ipcMain.handle(IPC.GET_VRM_PATH, () => {
		if (cliVrmPath) return cliVrmPath;
		return path.join(__dirname, "..", "..", "..", "assets", "default-avatar.vrm");
	});

	// Stdin listener for commands from the plugin service
	const cleanupStdin = createStdinListener((cmd: StdinCommand) => {
		switch (cmd.type) {
			case "show":
				win.show();
				break;
			case "hide":
				win.hide();
				break;
			case "shutdown":
				app.quit();
				break;
			case "model-switch":
				win.webContents.send(IPC.VRM_MODEL_CHANGED, cmd.vrmPath);
				break;
		}
	});

	// Connect to gateway WebSocket for agent event streaming
	const gatewayUrl = cliGatewayUrl ?? GATEWAY_URL_DEFAULT;
	const gw = createGatewayClient(
		gatewayUrl,
		(state) => win.webContents.send(IPC.AGENT_STATE, state),
		(vrmPath) => win.webContents.send(IPC.VRM_MODEL_CHANGED, vrmPath),
		agentConfigs,
	);

	// Clean up resources on quit
	app.on("before-quit", () => {
		gw.destroy();
		cleanupStdin();
	});
});

// Keep app alive when all windows are closed (tray stays)
app.on("window-all-closed", () => {
	// no-op: tray keeps the app alive
});
