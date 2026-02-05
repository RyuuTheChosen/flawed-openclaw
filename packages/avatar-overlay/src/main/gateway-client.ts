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
	let currentSessionKey: string | null = null;
	// Track pending request IDs to match responses
	let sessionsListRequestId: string | null = null;
	let agentsListRequestId: string | null = null;
	// Track if we've completed initial connection setup
	let connectionSetupDone = false;

	function processAgentEvent(evt: AgentEventPayload): void {
		const { stream, data, sessionKey } = evt;
		console.log("avatar-overlay: agent event received:", JSON.stringify(evt));

		// Track session changes - agent events contain the actual sessionKey
		if (sessionKey && sessionKey !== currentSessionKey) {
			console.log("avatar-overlay: setting currentSessionKey from agent event:", sessionKey);
			currentSessionKey = sessionKey;
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

			// Response frames (for our connect request, sessions list, or agents list)
			if (parsed?.type === "res") {
				const res = parsed as ResponseFrame;
				if (res.ok) {
					const payload = res.payload as Record<string, unknown> | undefined;

					// Check if this is a sessions.list response
					if (res.id === sessionsListRequestId && payload?.sessions && Array.isArray(payload.sessions)) {
						sessionsListRequestId = null;
						const sessions = payload.sessions as Array<{ key?: string; updatedAt?: number; displayName?: string }>;
						if (sessions.length > 0 && !currentSessionKey) {
							// Use the most recently active session (sessions are sorted by activity)
							const firstSession = sessions[0];
							if (firstSession.key) {
								currentSessionKey = firstSession.key;
								console.log("avatar-overlay: auto-detected session from sessions.list:", currentSessionKey, "displayName:", firstSession.displayName);
							}
						}
					}

					// Check if this is an agents list response (fallback)
					if (res.id === agentsListRequestId && payload?.agents && Array.isArray(payload.agents)) {
						agentsListRequestId = null;
						const agents = payload.agents as Array<Record<string, unknown>>;
						if (agents.length > 0 && !currentSessionKey) {
							// Use first agent's main session key as fallback
							const firstAgent = agents[0];
							const agentId = firstAgent.id ?? "main";
							const sessionKey = `agent:${agentId}:main`;
							currentSessionKey = sessionKey;
							console.log("avatar-overlay: fallback to agent main session:", currentSessionKey);
						}
					}

					// Connect success - request active sessions once
					if (connectSent && !connectionSetupDone && !sessionsListRequestId && !agentsListRequestId) {
						connectionSetupDone = true;
						console.log("avatar-overlay: gateway connected successfully");
						backoffMs = GATEWAY_RECONNECT_BASE_MS;
						// Request recently active sessions
						requestSessionsList();
					}
				} else {
					console.error("avatar-overlay: gateway response error:", res.error?.message ?? "unknown");
					// If sessions.list failed, fall back to agents.list
					if (res.id === sessionsListRequestId) {
						sessionsListRequestId = null;
						if (!currentSessionKey) {
							requestAgentsList();
						}
					}
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
		connectionSetupDone = false; // Reset for new connection
		if (connectTimer) clearTimeout(connectTimer);
		connectTimer = setTimeout(() => sendConnect(), 750);
	}

	function requestSessionsList(): void {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		sessionsListRequestId = randomUUID();
		const frame = {
			type: "req",
			id: sessionsListRequestId,
			method: "sessions.list",
			params: {
				// Get recently active sessions (within last 60 minutes)
				activeMinutes: 60,
				includeGlobal: false,
				includeUnknown: false,
				limit: 10,
			},
		};
		console.log("avatar-overlay: requesting sessions list");
		ws.send(JSON.stringify(frame));
	}

	function requestAgentsList(): void {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		agentsListRequestId = randomUUID();
		const frame = {
			type: "req",
			id: agentsListRequestId,
			method: "agents.list",
			params: {},
		};
		console.log("avatar-overlay: requesting agents list (fallback)");
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
			// Use provided sessionKey, or fall back to auto-detected session, or default
			const effectiveSessionKey = sessionKey ?? currentSessionKey ?? "agent:main:main";
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
			return currentSessionKey;
		},
	};
}
