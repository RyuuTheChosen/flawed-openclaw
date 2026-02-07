import { app, ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { createWindowManager } from "./window-manager.js";
import { createTray } from "./tray.js";
import { createStdinListener, type StdinCommand } from "./stdin-listener.js";
import { createGatewayClient } from "./gateway-client.js";
import { IPC } from "../shared/ipc-channels.js";
import { GATEWAY_URL_DEFAULT, CHAT_INPUT_MAX_LENGTH } from "../shared/config.js";
import { getVrmModelPath, saveVrmModelPath } from "./persistence/index.js";

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
const cliAuthToken = getCliArg("--auth-token=");

// Resolve auth token: CLI arg > env var > openclaw.json
function resolveAuthToken(): string | undefined {
	if (cliAuthToken) return cliAuthToken;
	if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;
	try {
		const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
		const raw = fs.readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw);
		const token = config?.gateway?.auth?.token;
		if (typeof token === "string" && token.length > 0) return token;
	} catch {
		// No config or unreadable
	}
	return undefined;
}

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
	const wm = createWindowManager();
	createTray(wm);

	// Return VRM model path (CLI override > persisted > default)
	const defaultVrmPath = path.join(__dirname, "..", "..", "..", "assets", "models", "CaptainLobster.vrm");
	ipcMain.handle(IPC.GET_VRM_PATH, () => {
		if (cliVrmPath) return cliVrmPath;
		const persisted = getVrmModelPath();
		if (persisted && fs.existsSync(persisted)) return persisted;
		return defaultVrmPath;
	});

	// Return animation clip paths from assets/animations/{phase}/ directories
	ipcMain.handle(IPC.GET_ANIMATIONS_CONFIG, () => {
		const animBase = path.resolve(__dirname, "..", "..", "..", "assets", "animations");
		const phases = ["idle", "thinking", "speaking", "working"] as const;
		const clips: Record<string, string[]> = {};

		for (const phase of phases) {
			const dir = path.join(animBase, phase);
			try {
				clips[phase] = fs.readdirSync(dir)
					.filter(f => f.toLowerCase().endsWith(".fbx"))
					.filter(f => !/[\\\/]/.test(f))
					.map(f => {
						const full = fs.realpathSync(path.join(dir, f));
						if (!full.replace(/\\/g, "/").startsWith(animBase.replace(/\\/g, "/"))) {
							return null;
						}
						return full;
					})
					.filter((f): f is string => f !== null);
			} catch {
				clips[phase] = [];
			}
		}
		return { clips };
	});

	// Stdin listener for commands from the plugin service
	const cleanupStdin = createStdinListener((cmd: StdinCommand) => {
		switch (cmd.type) {
			case "show":
				wm.showAvatar();
				break;
			case "hide":
				wm.hideAll();
				break;
			case "shutdown":
				app.quit();
				break;
			case "model-switch":
				wm.sendToAvatar(IPC.VRM_MODEL_CHANGED, cmd.vrmPath);
				break;
		}
	});

	// Connect to gateway WebSocket for agent event streaming
	const gatewayUrl = cliGatewayUrl ?? GATEWAY_URL_DEFAULT;
	const authToken = resolveAuthToken();
	console.log(`flawed-avatar: connecting to ${gatewayUrl} (auth=${authToken ? "token" : "none"})`);
	const gw = createGatewayClient(
		gatewayUrl,
		(state) => wm.sendAgentState(state),
		(vrmPath) => wm.sendToAvatar(IPC.VRM_MODEL_CHANGED, vrmPath),
		agentConfigs,
		authToken,
	);

	// IPC: send chat message to active agent
	ipcMain.on(IPC.SEND_CHAT, (_event, text: unknown) => {
		if (typeof text !== "string" || text.trim().length === 0 || text.length > CHAT_INPUT_MAX_LENGTH) {
			return;
		}
		const agentId = gw.getCurrentAgentId();
		gw.sendChat(text.trim(), agentId);
	});

	// Clean up resources on quit
	app.on("before-quit", () => {
		gw.destroy();
		cleanupStdin();
		wm.destroyAll();
	});
});

// Keep app alive when all windows are closed (tray stays)
app.on("window-all-closed", () => {
	// no-op: tray keeps the app alive
});
