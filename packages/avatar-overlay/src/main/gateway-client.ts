import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { IPC } from "../shared/ipc-channels.js";
import { GATEWAY_RECONNECT_BASE_MS, GATEWAY_RECONNECT_MAX_MS } from "../shared/config.js";

const PROTOCOL_VERSION = 3;

export type AgentPhase = "idle" | "thinking" | "speaking" | "working";

export type AgentState = {
	phase: AgentPhase;
	text?: string;
	agentId?: string;
};

type AgentEventPayload = {
	runId: string;
	seq: number;
	stream: string;
	ts: number;
	data: Record<string, unknown>;
	sessionKey?: string;
};

type EventFrame = {
	type: "event";
	event: string;
	payload?: unknown;
	seq?: number;
};

type ResponseFrame = {
	type: "res";
	id: string;
	ok: boolean;
	payload?: unknown;
	error?: { message?: string };
};

/**
 * Lightweight gateway WebSocket client for the Electron main process.
 * Implements the minimal protocol v3 handshake (without device auth)
 * and listens for "agent" event frames to drive avatar animations.
 */
export function createGatewayClient(
	gatewayUrl: string,
	win: BrowserWindow,
	agentConfigs?: Record<string, { vrmPath?: string }>,
): { destroy: () => void } {
	let ws: WebSocket | null = null;
	let destroyed = false;
	let backoffMs = GATEWAY_RECONNECT_BASE_MS;
	let connectNonce: string | null = null;
	let connectSent = false;
	let connectTimer: ReturnType<typeof setTimeout> | null = null;
	let currentAgentId: string | null = null;

	function sendToRenderer(state: AgentState): void {
		if (win.isDestroyed()) return;
		win.webContents.send(IPC.AGENT_STATE, state);
	}

	function processAgentEvent(evt: AgentEventPayload): void {
		const { stream, data, sessionKey } = evt;

		// Track agent changes for per-agent VRM switching
		if (sessionKey && sessionKey !== currentAgentId) {
			currentAgentId = sessionKey;
			if (agentConfigs?.[sessionKey]?.vrmPath) {
				win.webContents.send(IPC.VRM_MODEL_CHANGED, agentConfigs[sessionKey].vrmPath);
			}
		}

		if (stream === "lifecycle") {
			const phase = data?.phase;
			if (phase === "start") {
				sendToRenderer({ phase: "thinking", agentId: sessionKey });
			} else if (phase === "end" || phase === "error") {
				sendToRenderer({ phase: "idle", agentId: sessionKey });
			}
		} else if (stream === "assistant") {
			const text = typeof data?.text === "string" ? data.text : undefined;
			sendToRenderer({ phase: "speaking", text, agentId: sessionKey });
		} else if (stream === "tool") {
			sendToRenderer({ phase: "working", agentId: sessionKey });
		}
	}

	function handleMessage(raw: string): void {
		try {
			const parsed = JSON.parse(raw);

			// Event frames
			if (parsed?.type === "event") {
				const evt = parsed as EventFrame;

				// Handle connect challenge: gateway sends a nonce before we send connect
				if (evt.event === "connect.challenge") {
					const payload = evt.payload as { nonce?: string } | undefined;
					if (payload?.nonce) {
						connectNonce = payload.nonce;
						sendConnect();
					}
					return;
				}

				// Agent events drive the avatar
				if (evt.event === "agent" && evt.payload) {
					processAgentEvent(evt.payload as AgentEventPayload);
				}
				return;
			}

			// Response frames (for our connect request)
			if (parsed?.type === "res") {
				const res = parsed as ResponseFrame;
				if (res.ok) {
					// Connected successfully, reset backoff
					backoffMs = GATEWAY_RECONNECT_BASE_MS;
				}
			}
		} catch {
			// Ignore parse errors
		}
	}

	function sendConnect(): void {
		if (connectSent || !ws || ws.readyState !== WebSocket.OPEN) return;
		connectSent = true;

		if (connectTimer) {
			clearTimeout(connectTimer);
			connectTimer = null;
		}

		const frame = {
			type: "req",
			id: randomUUID(),
			method: "connect",
			params: {
				minProtocol: PROTOCOL_VERSION,
				maxProtocol: PROTOCOL_VERSION,
				client: {
					id: "gateway-client",
					displayName: "Avatar Overlay",
					version: "0.1.0",
					platform: process.platform,
					mode: "backend",
				},
				caps: [],
				role: "operator",
				scopes: ["operator.admin"],
				auth: {},
			},
		};

		ws.send(JSON.stringify(frame));
	}

	function queueConnect(): void {
		connectNonce = null;
		connectSent = false;
		if (connectTimer) clearTimeout(connectTimer);
		connectTimer = setTimeout(() => sendConnect(), 750);
	}

	function connect(): void {
		if (destroyed) return;

		ws = new WebSocket(gatewayUrl, { maxPayload: 25 * 1024 * 1024 });

		ws.on("open", () => {
			queueConnect();
		});

		ws.on("message", (data) => {
			const raw = typeof data === "string" ? data : data.toString();
			handleMessage(raw);
		});

		ws.on("close", () => {
			ws = null;
			scheduleReconnect();
		});

		ws.on("error", () => {
			// Error handler required to prevent uncaught exceptions;
			// the close handler will fire and schedule reconnect.
		});
	}

	function scheduleReconnect(): void {
		if (destroyed) return;
		const delay = backoffMs;
		backoffMs = Math.min(backoffMs * 2, GATEWAY_RECONNECT_MAX_MS);
		setTimeout(() => connect(), delay);
	}

	// Start the initial connection
	connect();

	return {
		destroy() {
			destroyed = true;
			if (connectTimer) clearTimeout(connectTimer);
			if (ws) {
				ws.removeAllListeners();
				ws.close();
				ws = null;
			}
		},
	};
}
