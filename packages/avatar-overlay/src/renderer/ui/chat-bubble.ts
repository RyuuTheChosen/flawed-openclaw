import type { AgentState, AgentPhase } from "../../shared/types.js";
import {
	CHAT_IDLE_FADE_MS,
	CHAT_MAX_HISTORY,
	CHAT_INPUT_MAX_LENGTH,
	INPUT_MAX_DISPLAY_CHARS,
} from "../../shared/config.js";
import { createTypingIndicator, type TypingIndicator, type IndicatorPhase } from "./typing-indicator.js";
import { createIcon } from "./icons.js";

export interface ChatBubble {
	handleAgentState(state: AgentState): void;
	show(): void;
	hide(): void;
	toggle(): void;
	destroy(): void;
	loadHistory(): Promise<void>;
}

export interface ChatBubbleOptions {
	onVisibilityChange?: (visible: boolean) => void;
}

// Extended bridge type with persistence methods
type PersistentBridge = Pick<AvatarBridge | ChatBridge, "sendChat"> & {
	getChatHistory?: () => Promise<ChatHistory>;
	appendChatMessage?: (role: "user" | "assistant", text: string, agentId?: string) => void;
	onChatHistoryCleared?: (callback: () => void) => void;
	getIdleTimeout?: () => Promise<number>;
	onIdleTimeoutChanged?: (callback: (ms: number) => void) => void;
};

export function createChatBubble(
	parent: HTMLElement,
	bridge: PersistentBridge,
	options?: ChatBubbleOptions,
): ChatBubble {
	// --- DOM ---
	const container = document.createElement("div");
	container.id = "chat-bubble";

	const messagesEl = document.createElement("div");
	messagesEl.id = "chat-messages";
	messagesEl.setAttribute("role", "log");
	messagesEl.setAttribute("aria-live", "polite");
	messagesEl.setAttribute("aria-label", "Chat messages");

	const inputRow = document.createElement("div");
	inputRow.id = "chat-input-row";

	const inputEl = document.createElement("input");
	inputEl.id = "chat-input";
	inputEl.type = "text";
	inputEl.placeholder = "Send a message...";
	inputEl.maxLength = CHAT_INPUT_MAX_LENGTH;
	inputEl.setAttribute("aria-label", "Message input");

	const charCounter = document.createElement("span");
	charCounter.id = "char-counter";
	charCounter.setAttribute("aria-live", "polite");

	const sendBtn = document.createElement("button");
	sendBtn.id = "send-btn";
	sendBtn.type = "button";
	sendBtn.disabled = true;
	sendBtn.setAttribute("aria-label", "Send message");
	sendBtn.appendChild(createIcon("send", { size: 14 }));

	inputRow.appendChild(inputEl);
	inputRow.appendChild(charCounter);
	inputRow.appendChild(sendBtn);
	container.appendChild(messagesEl);
	container.appendChild(inputRow);
	parent.appendChild(container);

	// --- State ---
	let currentPhase: AgentPhase = "idle";
	let prevPhase: AgentPhase = "idle";
	let currentMsgEl: HTMLDivElement | null = null;
	let currentMsgText = ""; // Track full text for persistence
	let currentAgentId: string | undefined;
	let indicator: TypingIndicator | null = null;
	let visible = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let userScrolled = false;
	let idleTimeoutMs = CHAT_IDLE_FADE_MS;

	// --- Timer management ---
	function clearTimers(): void {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	}

	function startIdleTimer(): void {
		clearTimers();
		if (idleTimeoutMs > 0) {
			idleTimer = setTimeout(() => hide(), idleTimeoutMs);
		}
		// If idleTimeoutMs === 0, never auto-hide
	}

	// --- Show / Hide ---
	function show(): void {
		visible = true;
		container.style.opacity = "1";
		container.style.pointerEvents = "auto";
		inputEl.focus();
		options?.onVisibilityChange?.(true);
	}

	function hide(): void {
		visible = false;
		container.style.opacity = "0";
		container.style.pointerEvents = "none";
		options?.onVisibilityChange?.(false);
	}

	// --- Status indicator helpers ---
	function removeStatus(): void {
		if (indicator) {
			indicator.destroy();
			indicator = null;
		}
	}

	function createStatus(phase: IndicatorPhase): void {
		removeStatus();
		indicator = createTypingIndicator();
		indicator.setPhase(phase);
		messagesEl.appendChild(indicator.element);
		autoScroll();
	}

	// --- Scroll ---
	function autoScroll(): void {
		if (!userScrolled) {
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}
	}

	function onScroll(): void {
		const atBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 10;
		userScrolled = !atBottom;
	}

	messagesEl.addEventListener("scroll", onScroll);

	// --- History pruning ---
	function pruneHistory(): void {
		while (messagesEl.children.length > CHAT_MAX_HISTORY) {
			messagesEl.removeChild(messagesEl.firstChild!);
		}
	}

	// --- Clear all messages (new conversation) ---
	function clearMessages(): void {
		messagesEl.textContent = "";
		currentMsgEl = null;
		currentMsgText = "";
		currentAgentId = undefined;
		removeStatus();
		userScrolled = false;
	}

	// --- Append message to DOM (for loading history) ---
	function appendMessageToDOM(role: "user" | "assistant", text: string): void {
		const msgDiv = document.createElement("div");
		msgDiv.className = role === "user" ? "chat-user-msg" : "chat-assistant-msg";
		msgDiv.textContent = text;
		messagesEl.appendChild(msgDiv);
		pruneHistory();
	}

	// --- Send message ---
	function sendMessage(text: string): void {
		bridge.sendChat(text);

		const msgDiv = document.createElement("div");
		msgDiv.className = "chat-user-msg";
		msgDiv.textContent = text;
		messagesEl.appendChild(msgDiv);
		pruneHistory();

		// Persist user message
		bridge.appendChatMessage?.("user", text);

		inputEl.value = "";
		sendBtn.disabled = true;
		updateCharCounter(0);
		autoScroll();
	}

	// --- Character counter ---
	function updateCharCounter(len: number): void {
		if (len > INPUT_MAX_DISPLAY_CHARS) {
			charCounter.classList.add("visible");
			charCounter.textContent = `${len}/${CHAT_INPUT_MAX_LENGTH}`;

			if (len >= CHAT_INPUT_MAX_LENGTH) {
				charCounter.classList.remove("warning");
				charCounter.classList.add("error");
			} else if (len >= CHAT_INPUT_MAX_LENGTH * 0.9) {
				charCounter.classList.add("warning");
				charCounter.classList.remove("error");
			} else {
				charCounter.classList.remove("warning");
				charCounter.classList.remove("error");
			}
		} else {
			charCounter.classList.remove("visible");
			charCounter.classList.remove("warning");
			charCounter.classList.remove("error");
		}
	}

	// --- Persist assistant message when done speaking ---
	function persistCurrentAssistantMessage(): void {
		if (currentMsgText.length > 0) {
			bridge.appendChatMessage?.("assistant", currentMsgText, currentAgentId);
			currentMsgText = "";
			currentAgentId = undefined;
		}
	}

	// --- Phase handlers ---
	function handleThinking(state: AgentState): void {
		clearTimers();

		// Persist any pending assistant message
		persistCurrentAssistantMessage();

		// Don't clear messages - we want to preserve chat history
		removeStatus();
		createStatus("thinking");
		currentMsgEl = null;
		currentAgentId = state.agentId;
		show();
	}

	function handleSpeaking(state: AgentState): void {
		clearTimers();
		removeStatus();
		if (currentMsgEl === null) {
			currentMsgEl = document.createElement("div");
			currentMsgEl.className = "chat-assistant-msg";
			messagesEl.appendChild(currentMsgEl);
			pruneHistory();
			currentMsgText = "";
			currentAgentId = state.agentId;
		}
		if (state.text) {
			currentMsgEl.textContent += state.text;
			currentMsgText += state.text;
		}
		autoScroll();
		// Reset idle timer — will fire if no more speaking events arrive
		startIdleTimer();
	}

	function handleWorking(_state: AgentState): void {
		clearTimers();

		// Persist any pending assistant message
		persistCurrentAssistantMessage();

		removeStatus();
		createStatus("working");
		currentMsgEl = null;
		show();
	}

	function handleIdle(_state: AgentState): void {
		clearTimers();

		// Persist any pending assistant message when going idle
		persistCurrentAssistantMessage();

		removeStatus();
		currentMsgEl = null;
		startIdleTimer();
	}

	// --- Input handling ---
	function onInput(): void {
		const len = inputEl.value.length;
		sendBtn.disabled = len === 0;
		updateCharCounter(len);
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === "Escape") {
			hide();
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const text = inputEl.value.trim();
			if (text) sendMessage(text);
		}
	}

	function onSendClick(): void {
		const text = inputEl.value.trim();
		if (text) sendMessage(text);
	}

	inputEl.addEventListener("keydown", onKeydown);
	inputEl.addEventListener("input", onInput);
	sendBtn.addEventListener("click", onSendClick);

	// --- Listen for clear history from main process ---
	bridge.onChatHistoryCleared?.(() => {
		clearMessages();
	});

	// --- Listen for idle timeout changes ---
	bridge.onIdleTimeoutChanged?.((ms) => {
		idleTimeoutMs = ms;
	});

	// --- Load persisted idle timeout ---
	void bridge.getIdleTimeout?.().then((ms) => {
		idleTimeoutMs = ms;
	});

	// --- Public API ---
	function handleAgentState(state: AgentState): void {
		prevPhase = currentPhase;
		currentPhase = state.phase;

		switch (state.phase) {
			case "thinking":
				handleThinking(state);
				break;
			case "speaking":
				handleSpeaking(state);
				break;
			case "working":
				handleWorking(state);
				break;
			case "idle":
				handleIdle(state);
				break;
		}
	}

	function toggle(): void {
		if (visible) {
			hide();
		} else {
			show();
		}
	}

	async function loadHistory(): Promise<void> {
		if (!bridge.getChatHistory) return;

		try {
			const history = await bridge.getChatHistory();
			// Load last 50 messages for performance
			const recent = history.messages.slice(-50);
			for (const msg of recent) {
				appendMessageToDOM(msg.role, msg.text);
			}
			autoScroll();
		} catch (err) {
			console.warn("[chat-bubble] Failed to load chat history:", err);
		}
	}

	function destroy(): void {
		clearTimers();
		removeStatus();
		inputEl.removeEventListener("keydown", onKeydown);
		inputEl.removeEventListener("input", onInput);
		sendBtn.removeEventListener("click", onSendClick);
		messagesEl.removeEventListener("scroll", onScroll);
		container.remove();
	}

	return { handleAgentState, show, hide, toggle, destroy, loadHistory };
}
