import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { OpenClawPluginApi, OpenClawPluginService, OpenClawPluginServiceContext } from "openclaw/plugin-sdk";
import { resolveElectronBinary, resolveElectronMain, buildElectronArgs } from "./electron-launcher.js";

export type StdinMessage =
	| { type: "show" }
	| { type: "hide" }
	| { type: "shutdown" }
	| { type: "model-switch"; vrmPath: string };

const RESTART_BASE_MS = 5_000;
const RESTART_MAX_MS = 30_000;
const RESTART_RESET_MS = 60_000;

export function createAvatarOverlayService(api: OpenClawPluginApi) {
	let child: ChildProcess | null = null;
	let stopped = false;
	let restartBackoffMs = RESTART_BASE_MS;
	let restartTimer: ReturnType<typeof setTimeout> | null = null;
	let startedAt: number | null = null;

	const pluginDir = path.resolve(api.source, "..");

	function send(msg: StdinMessage): void {
		if (!child?.stdin?.writable) return;
		child.stdin.write(JSON.stringify(msg) + "\n");
	}

	function spawnElectron(ctx: OpenClawPluginServiceContext): void {
		const electronPath = resolveElectronBinary(pluginDir);
		const mainEntry = resolveElectronMain(pluginDir);

		const config = api.pluginConfig as Record<string, unknown> | undefined;
		const gatewayUrl = (config?.gatewayUrl as string) ?? "ws://127.0.0.1:18789";
		const vrmPath = config?.vrmPath as string | undefined;
		const authToken = (config?.authToken as string | undefined)
			?? process.env.OPENCLAW_GATEWAY_TOKEN;

		// Serialize per-agent VRM configs so Electron can read them
		const agents = config?.agents as Record<string, { vrmPath?: string }> | undefined;
		const agentConfigs = agents ? JSON.stringify(agents) : undefined;

		const args = buildElectronArgs({
			mainEntry,
			gatewayUrl,
			vrmPath,
			agentConfigs,
			authToken,
		});

		child = spawn(electronPath, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});

		startedAt = Date.now();

		child.stdout?.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n").filter(Boolean);
			for (const line of lines) {
				ctx.logger.info(`flawed-avatar: ${line}`);
			}
		});

		child.stderr?.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n").filter(Boolean);
			for (const line of lines) {
				ctx.logger.warn(`flawed-avatar: ${line}`);
			}
		});

		child.on("exit", (code, signal) => {
			child = null;
			if (stopped) return;

			ctx.logger.warn(`flawed-avatar: exited (code=${code}, signal=${signal}), scheduling restart`);

			// Reset backoff if process ran long enough
			if (startedAt && Date.now() - startedAt >= RESTART_RESET_MS) {
				restartBackoffMs = RESTART_BASE_MS;
			}

			restartTimer = setTimeout(() => {
				if (!stopped) {
					ctx.logger.info(`flawed-avatar: restarting (backoff=${restartBackoffMs}ms)`);
					spawnElectron(ctx);
				}
			}, restartBackoffMs);

			restartBackoffMs = Math.min(restartBackoffMs * 2, RESTART_MAX_MS);
		});

		ctx.logger.info("flawed-avatar: started");
	}

	const service: OpenClawPluginService & { send: (msg: StdinMessage) => void } = {
		id: "flawed-avatar",

		start(ctx: OpenClawPluginServiceContext): void {
			stopped = false;

			const config = api.pluginConfig as Record<string, unknown> | undefined;
			if (config?.autoStart === false) {
				ctx.logger.info("flawed-avatar: autoStart disabled, skipping");
				return;
			}

			// Skip on headless Linux
			if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
				ctx.logger.info("flawed-avatar: no display available, skipping");
				return;
			}

			spawnElectron(ctx);
		},

		stop(ctx: OpenClawPluginServiceContext): Promise<void> {
			stopped = true;

			if (restartTimer) {
				clearTimeout(restartTimer);
				restartTimer = null;
			}

			if (!child) {
				return Promise.resolve();
			}

			return new Promise<void>((resolve) => {
				const proc = child!;

				// Try graceful shutdown via stdin
				send({ type: "shutdown" });

				const forceKillTimer = setTimeout(() => {
					if (proc.exitCode === null) {
						ctx.logger.warn("flawed-avatar: force-killing after graceful timeout");
						proc.kill("SIGKILL");
					}
				}, 5_000);

				proc.once("exit", () => {
					clearTimeout(forceKillTimer);
					child = null;
					ctx.logger.info("flawed-avatar: stopped");
					resolve();
				});

				// If graceful stdin didn't work, try SIGTERM after 3s
				setTimeout(() => {
					if (proc.exitCode === null) {
						proc.kill("SIGTERM");
					}
				}, 3_000);
			});
		},

		send,
	};

	return service;
}
