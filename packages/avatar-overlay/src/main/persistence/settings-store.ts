import {
	SETTINGS_FILE,
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
	CAMERA_ZOOM_DEFAULT,
	OPACITY_MIN,
	OPACITY_MAX,
	OPACITY_DEFAULT,
	IDLE_TIMEOUT_DEFAULT,
	SETTINGS_DEBOUNCE_MS,
	TTS_ENABLED_DEFAULT,
	TTS_ENGINE_DEFAULT,
	TTS_VOICE_DEFAULT,
} from "../../shared/config.js";
import { createFileStore, type FileStore } from "./file-store.js";
import {
	SettingsSchema,
	createDefaultSettings,
	type Settings,
} from "./types.js";

let store: FileStore<Settings> | null = null;

function getStore(): FileStore<Settings> {
	if (!store) {
		store = createFileStore({
			filename: SETTINGS_FILE,
			schema: SettingsSchema,
			defaultValue: createDefaultSettings,
			debounceMs: SETTINGS_DEBOUNCE_MS,
		});
	}
	return store;
}

export function loadSettings(): Settings {
	const result = getStore().load();
	return result.ok ? result.data : result.fallback;
}

export function saveSettings(settings: Partial<Settings>): void {
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = { ...current, ...settings };
	getStore().save(updated);
}

export function savePosition(x: number, y: number): void {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return;
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		position: { x: Math.round(x), y: Math.round(y) },
	};
	getStore().save(updated);
}

export function saveZoom(zoom: number): void {
	if (!Number.isFinite(zoom)) return;
	const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		camera: { zoom: clamped },
	};
	getStore().save(updated);
}

export function saveOpacity(opacity: number): void {
	if (!Number.isFinite(opacity)) return;
	const clamped = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, opacity));
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		opacity: clamped,
	};
	getStore().save(updated);
}

export function saveIdleTimeout(ms: number): void {
	if (!Number.isInteger(ms) || ms < 0) return;
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		idleTimeoutMs: ms,
	};
	getStore().save(updated);
}

export function getPosition(): { x: number; y: number } | null {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.position ?? null;
}

export function getZoom(): number {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.camera?.zoom ?? CAMERA_ZOOM_DEFAULT;
}

export function getOpacity(): number {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.opacity ?? OPACITY_DEFAULT;
}

export function getIdleTimeout(): number {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.idleTimeoutMs ?? IDLE_TIMEOUT_DEFAULT;
}

export function saveTtsEnabled(enabled: boolean): void {
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		ttsEnabled: enabled,
	};
	getStore().save(updated);
}

export function getTtsEnabled(): boolean {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.ttsEnabled ?? TTS_ENABLED_DEFAULT;
}

export function saveTtsEngine(engine: "web-speech" | "kokoro"): void {
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		ttsEngine: engine,
	};
	getStore().save(updated);
}

export function getTtsEngine(): "web-speech" | "kokoro" {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.ttsEngine ?? TTS_ENGINE_DEFAULT;
}

export function saveTtsVoice(voice: string): void {
	const current = getStore().getCache() ?? loadSettings();
	const updated: Settings = {
		...current,
		ttsVoice: voice,
	};
	getStore().save(updated);
}

export function getTtsVoice(): string {
	const settings = getStore().getCache() ?? loadSettings();
	return settings.ttsVoice ?? TTS_VOICE_DEFAULT;
}

export async function flushSettings(): Promise<void> {
	await getStore().flush();
}

export function cleanupSettings(): void {
	getStore().cleanup();
}

// For direct store access (e.g., migrations)
export function getSettingsStore(): FileStore<Settings> {
	return getStore();
}
