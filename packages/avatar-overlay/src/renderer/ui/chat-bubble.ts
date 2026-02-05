import type { AgentState, AgentPhase } from "../../shared/types.js";
import {
	CHAT_IDLE_FADE_MS,
	CHAT_MAX_HISTORY,
	CHAT_DOTS_INTERVAL_MS,
	CHAT_INPUT_MAX_LENGTH,
} from "../../shared/config.js";

export interface ChatBubble {
	handleAgentState(state: AgentState): void;
	toggle(): void;
	destroy(): void;
}

export function createChatBubble(
	parent: HTMLElement,
	bridge: Pick<AvatarBridge, "sendChat">,
): ChatBubble {
	// --- DOM ---
	const container = document.createElement("div");
	container.id = "chat-bubble";

	const messagesEl = document.createElement("div");
	messagesEl.id = "chat-messages";

	const inputRow = document.createElement("div");
	inputRow.id = "chat-input-row";

	const inputEl = document.createElement("input");
	inputEl.id = "chat-input";
	inputEl.type = "text";
	inputEl.placeholder = "Send a message...";
	inputEl.maxLength = CHAT_INPUT_MAX_LENGTH;

	inputRow.appendChild(inputEl);
	container.appendChild(messagesEl);
	container.appendChild(inputRow);
	parent.appendChild(container);

	// --- State ---
	let currentPhase: AgentPhase = "idle";
	let prevPhase: AgentPhase = "idle";
	let currentMsgEl: HTMLDivElement | null = null;
	let statusEl: HTMLDivElement | null = null;
	let visible = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let dotsTimer: ReturnType<typeof setInterval> | null = null;
	let userScrolled = false;

	// --- Timer management ---
	function clearTimers(): void {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
		if (dotsTimer !== null) {
			clearInterval(dotsTimer);
			dotsTimer = null;
		}
	}

	// --- Show / Hide ---
	function show(): void {
		visible = true;
		container.style.opacity = "1";
		container.style.pointerEvents = "auto";
	}

	function hide(): void {
		visible = false;
		container.style.opacity = "0";
		container.style.pointerEvents = "none";
	}

	// --- Status div helpers ---
	function removeStatus(): void {
		if (statusEl) {
			statusEl.remove();
			statusEl = null;
		}
	}

	function createStatus(label: string): void {
		removeStatus();
		statusEl = document.createElement("div");
		statusEl.className = "chat-status";
		statusEl.textContent = label;
		messagesEl.appendChild(statusEl);
		autoScroll();

		// Animate dots
		let dotCount = 0;
		dotsTimer = setInterval(() => {
			dotCount = (dotCount + 1) % 4;
			if (statusEl) {
				statusEl.textContent = label + ".".repeat(dotCount);
			}
		}, CHAT_DOTS_INTERVAL_MS);
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
		statusEl = null;
		userScrolled = false;
	}

	// --- Phase handlers ---
	function handleThinking(state: AgentState): void {
		clearTimers();
		if (prevPhase === "idle") {
			clearMessages();
		}
		removeStatus();
		createStatus("thinking");
		currentMsgEl = null;
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
		}
		if (state.text) {
			currentMsgEl.textContent += state.text;
		}
		autoScroll();
		// Reset idle timer — will fire if no more speaking events arrive
		idleTimer = setTimeout(() => hide(), CHAT_IDLE_FADE_MS);
	}

	function handleWorking(_state: AgentState): void {
		clearTimers();
		removeStatus();
		createStatus("working");
		currentMsgEl = null;
		show();
	}

	function handleIdle(_state: AgentState): void {
		clearTimers();
		removeStatus();
		currentMsgEl = null;
		idleTimer = setTimeout(() => hide(), CHAT_IDLE_FADE_MS);
	}

	// --- Input handling ---
	function onKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const text = inputEl.value.trim();
			if (!text) return;
			bridge.sendChat(text);

			const msgDiv = document.createElement("div");
			msgDiv.className = "chat-user-msg";
			msgDiv.textContent = text;
			messagesEl.appendChild(msgDiv);
			pruneHistory();

			inputEl.value = "";
			autoScroll();
		}
	}

	inputEl.addEventListener("keydown", onKeydown);

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

	function destroy(): void {
		clearTimers();
		inputEl.removeEventListener("keydown", onKeydown);
		messagesEl.removeEventListener("scroll", onScroll);
		container.remove();
	}

	return { handleAgentState, toggle, destroy };
}
