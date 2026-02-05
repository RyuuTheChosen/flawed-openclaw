import {
	CHAT_HISTORY_FILE,
	CHAT_MAX_HISTORY,
	CHAT_DEBOUNCE_MS,
	APPEND_QUEUE_FLUSH_MS,
} from "../../shared/config.js";
import { createFileStore, type FileStore } from "./file-store.js";
import {
	ChatHistorySchema,
	createDefaultChatHistory,
	type ChatHistory,
	type ChatMessage,
} from "./types.js";

let store: FileStore<ChatHistory> | null = null;
let appendQueue: ChatMessage[] = [];
let appendTimeout: ReturnType<typeof setTimeout> | null = null;

function getStore(): FileStore<ChatHistory> {
	if (!store) {
		store = createFileStore({
			filename: CHAT_HISTORY_FILE,
			schema: ChatHistorySchema,
			defaultValue: createDefaultChatHistory,
			debounceMs: CHAT_DEBOUNCE_MS,
		});
	}
	return store;
}

function generateId(): string {
	// Simple unique ID: timestamp + random hex
	return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function flushAppendQueue(): void {
	if (appendQueue.length === 0) return;

	const current = getStore().getCache() ?? loadChatHistory();
	const messages = [...current.messages, ...appendQueue];

	// Prune if over limit
	const pruned = messages.length > CHAT_MAX_HISTORY
		? messages.slice(-CHAT_MAX_HISTORY)
		: messages;

	const updated: ChatHistory = {
		...current,
		messages: pruned,
		lastUpdated: Date.now(),
	};

	getStore().save(updated);
	appendQueue = [];
}

export function loadChatHistory(): ChatHistory {
	const result = getStore().load();
	return result.ok ? result.data : result.fallback;
}

export function appendMessage(
	role: "user" | "assistant",
	text: string,
	agentId?: string,
): ChatMessage {
	const message: ChatMessage = {
		id: generateId(),
		timestamp: Date.now(),
		role,
		text,
		agentId,
	};

	appendQueue.push(message);

	// Coalesce rapid appends
	if (appendTimeout) {
		clearTimeout(appendTimeout);
	}
	appendTimeout = setTimeout(() => {
		appendTimeout = null;
		flushAppendQueue();
	}, APPEND_QUEUE_FLUSH_MS);

	return message;
}

export function clearChatHistory(): void {
	// Clear pending queue
	appendQueue = [];
	if (appendTimeout) {
		clearTimeout(appendTimeout);
		appendTimeout = null;
	}

	// Save empty history
	const empty = createDefaultChatHistory();
	getStore().save(empty);
}

export function getRecentMessages(limit: number = 50): ChatMessage[] {
	// First, include any pending messages not yet flushed
	const current = getStore().getCache() ?? loadChatHistory();
	const allMessages = [...current.messages, ...appendQueue];
	return allMessages.slice(-limit);
}

export function getChatHistory(): ChatHistory {
	const current = getStore().getCache() ?? loadChatHistory();
	// Include pending queue in response
	if (appendQueue.length > 0) {
		return {
			...current,
			messages: [...current.messages, ...appendQueue],
		};
	}
	return current;
}

export async function flushChat(): Promise<void> {
	// Flush append queue first
	if (appendTimeout) {
		clearTimeout(appendTimeout);
		appendTimeout = null;
	}
	flushAppendQueue();

	// Then flush store
	await getStore().flush();
}

export function cleanupChat(): void {
	if (appendTimeout) {
		clearTimeout(appendTimeout);
		appendTimeout = null;
	}
	// Synchronously flush queue
	if (appendQueue.length > 0) {
		flushAppendQueue();
	}
	getStore().cleanup();
}
