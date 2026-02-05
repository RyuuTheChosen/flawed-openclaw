import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { GATEWAY_RECONNECT_BASE_MS, GATEWAY_RECONNECT_MAX_MS } from "../shared/config.js";
import type { AgentState } from "../shared/types.js";

const PROTOCOL_VERSION = 3;

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
	onStateChange: (state: AgentState) => void,
	onModelSwitch: (vrmPath: string) => void,
	agentConfigs?: Record<string, { vrmPath?: string }>,
	authToken?: string,
): { destroy: () => void; sendChat: (text: string, sessionKey: string | null) => void; getCurrentAgentId: () => string | null } {
	let ws: WebSocket | null = null;
	let destroyed = false;
	let backoffMs = GATEWAY_RECONNECT_BASE_MS;
	let connectNonce: string | null = null;
	let connectSent = false;
	let connectTimer: ReturnType<typeof setTimeout> | null = null;
	let currentAgentId: string | null = null;

	function processAgentEvent(evt: AgentEventPayload): void {
		const { stream, data, sessionKey } = evt;
		console.log("avatar-overlay: agent event received:", JSON.stringify(evt));

		// Track agent changes for per-agent VRM switching
		if (sessionKey && sessionKey !== currentAgentId) {
			console.log("avatar-overlay: setting currentAgentId to:", sessionKey);
			currentAgentId = sessionKey;
			if (agentConfigs?.[sessionKey]?.vrmPath) {
				onModelSwitch(agentConfigs[sessionKey].vrmPath!);
			}
		}

		if (stream === "lifecycle") {
			const phase = data?.phase;
			if (phase === "start") {
				onStateChange({ phase: "thinking", agentId: sessionKey });
			} else if (phase === "end" || phase === "error") {
				onStateChange({ phase: "idle", agentId: sessionKey });
			}
		} else if (stream === "assistant") {
			const text = typeof data?.text === "string" ? data.text : undefined;
			onStateChange({ phase: "speaking", text, agentId: sessionKey });
		} else if (stream === "tool") {
			onStateChange({ phase: "working", agentId: sessionKey });
		} else if (stream === "error") {
			onStateChange({ phase: "idle", agentId: sessionKey });
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

			// Response frames (for our connect request or agent list)
			if (parsed?.type === "res") {
				const res = parsed as ResponseFrame;
				if (res.ok) {
					const payload = res.payload as Record<string, unknown> | undefined;
					// Check if this is an agents list response
					if (payload?.agents && Array.isArray(payload.agents)) {
						const agents = payload.agents as Array<Record<string, unknown>>;
						if (agents.length > 0 && !currentAgentId) {
							// Use first agent's sessionKey as default
							const firstAgent = agents[0];
							const sessionKey = firstAgent.sessionKey ?? firstAgent.id ?? `agent:${firstAgent.name}:main`;
							if (typeof sessionKey === "string") {
								currentAgentId = sessionKey;
								console.log("avatar-overlay: auto-detected agent:", currentAgentId);
							}
						}
					}
					// Connect success
					if (connectSent) {
						console.log("avatar-overlay: gateway connected successfully");
						backoffMs = GATEWAY_RECONNECT_BASE_MS;
						// Request agents list if we don't have one yet
						if (!currentAgentId) {
							requestAgentsList();
						}
					}
				} else {
					console.error("avatar-overlay: gateway response error:", res.error?.message ?? "unknown");
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
				auth: authToken ? { token: authToken } : {},
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

	function requestAgentsList(): void {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		const frame = {
			type: "req",
			id: randomUUID(),
			method: "agents.list",
			params: {},
		};
		console.log("avatar-overlay: requesting agents list");
		ws.send(JSON.stringify(frame));
	}

	function connect(): void {
		if (destroyed) return;

		ws = new WebSocket(gatewayUrl, { maxPayload: 25 * 1024 * 1024 });

		ws.on("open", () => {
			console.log("avatar-overlay: ws open, sending connect frame");
			queueConnect();
		});

		ws.on("message", (data) => {
			const raw = typeof data === "string" ? data : data.toString();
			handleMessage(raw);
		});

		ws.on("close", (code, reason) => {
			console.log(`avatar-overlay: ws closed (code=${code}, reason=${reason?.toString() ?? ""})`);
			ws = null;
			scheduleReconnect();
		});

		ws.on("error", (err) => {
			console.error("avatar-overlay: gateway connection error:", err.message);
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

		sendChat(text: string, sessionKey: string | null) {
			// Use provided sessionKey, or fall back to auto-detected agent, or default
			const effectiveSessionKey = sessionKey ?? currentAgentId ?? "agent:main:main";
			console.log("avatar-overlay: sendChat called, ws state:", ws?.readyState, "sessionKey:", effectiveSessionKey);
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				console.log("avatar-overlay: WebSocket not open, message dropped");
				return;
			}
			const frame = {
				type: "req",
				id: randomUUID(),
				method: "chat.send",
				params: {
					sessionKey: effectiveSessionKey,
					message: text,
					idempotencyKey: randomUUID(),
				},
			};
			console.log("avatar-overlay: sending frame:", JSON.stringify(frame));
			ws.send(JSON.stringify(frame));
		},

		getCurrentAgentId() {
			return currentAgentId;
		},
	};
}
