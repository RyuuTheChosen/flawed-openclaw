import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { z } from "zod";
import {
	SETTINGS_DEBOUNCE_MS,
	LOCK_TIMEOUT_MS,
	LOCK_STALE_MS,
} from "../../shared/config.js";
import type { LoadResult } from "./types.js";

const openclawDir = path.join(os.homedir(), ".openclaw");

export interface StoreOptions<T> {
	filename: string;
	schema: z.ZodType<T>;
	defaultValue: () => T;
	debounceMs?: number;
}

export interface FileStore<T> {
	load(): LoadResult<T>;
	save(data: T): void;
	flush(): Promise<void>;
	getCache(): T | null;
	cleanup(): void;
}

function ensureDir(): void {
	try {
		fs.mkdirSync(openclawDir, { recursive: true });
	} catch {
		// Directory likely already exists
	}
}

function getLockPath(filePath: string): string {
	return `${filePath}.lock`;
}

function acquireLock(filePath: string): boolean {
	const lockPath = getLockPath(filePath);
	try {
		// Check for stale lock
		try {
			const stat = fs.statSync(lockPath);
			const age = Date.now() - stat.mtimeMs;
			if (age > LOCK_STALE_MS) {
				// Lock is stale, remove it
				fs.unlinkSync(lockPath);
			}
		} catch {
			// Lock doesn't exist, good
		}

		// Try to create lock file exclusively
		fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return true;
	} catch {
		return false;
	}
}

function releaseLock(filePath: string): void {
	const lockPath = getLockPath(filePath);
	try {
		fs.unlinkSync(lockPath);
	} catch {
		// Lock already released or never acquired
	}
}

async function waitForLock(filePath: string, timeoutMs: number = LOCK_TIMEOUT_MS): Promise<boolean> {
	const startTime = Date.now();
	const interval = 50;

	while (Date.now() - startTime < timeoutMs) {
		if (acquireLock(filePath)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
	return false;
}

export function createFileStore<T>(options: StoreOptions<T>): FileStore<T> {
	const { filename, schema, defaultValue, debounceMs = SETTINGS_DEBOUNCE_MS } = options;
	const filePath = path.join(openclawDir, filename);

	let cache: T | null = null;
	let pendingData: T | null = null;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let isFlushing = false;

	function load(): LoadResult<T> {
		try {
			const data = fs.readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(data);
			const result = schema.safeParse(parsed);

			if (result.success) {
				cache = result.data;
				return { ok: true, data: result.data };
			}

			// Schema validation failed
			console.warn(`[file-store] Schema validation failed for ${filename}:`, result.error.message);
			const fallback = defaultValue();
			cache = fallback;
			return { ok: false, error: result.error.message, fallback };
		} catch (err) {
			// File not found or parse error - normal for first run
			const fallback = defaultValue();
			cache = fallback;
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				console.warn(`[file-store] Error reading ${filename}:`, err);
				return { ok: false, error: String(err), fallback };
			}
			return { ok: true, data: fallback };
		}
	}

	function scheduleWrite(data: T): void {
		pendingData = data;
		cache = data;

		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		saveTimeout = setTimeout(() => {
			void performWrite();
		}, debounceMs);
	}

	async function performWrite(): Promise<void> {
		if (pendingData === null || isFlushing) return;

		isFlushing = true;
		const dataToWrite = pendingData;
		pendingData = null;
		saveTimeout = null;

		const lockAcquired = await waitForLock(filePath);
		if (!lockAcquired) {
			console.warn(`[file-store] Failed to acquire lock for ${filename}, will retry on next save`);
			pendingData = dataToWrite; // Restore pending data for retry
			isFlushing = false;
			return;
		}

		try {
			ensureDir();

			// On Windows, atomic rename doesn't work well across drives,
			// so we write directly
			const content = JSON.stringify(dataToWrite, null, "\t");
			if (process.platform === "win32") {
				fs.writeFileSync(filePath, content);
			} else {
				// Atomic write: temp file + rename
				const tempPath = `${filePath}.tmp.${process.pid}`;
				fs.writeFileSync(tempPath, content);
				fs.renameSync(tempPath, filePath);
			}
		} catch (err) {
			console.warn(`[file-store] Error writing ${filename}:`, err);
		} finally {
			releaseLock(filePath);
			isFlushing = false;
		}
	}

	function save(data: T): void {
		scheduleWrite(data);
	}

	async function flush(): Promise<void> {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		if (pendingData !== null) {
			await performWrite();
		}
	}

	function getCache(): T | null {
		return cache;
	}

	function cleanup(): void {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		// Synchronous flush on cleanup
		if (pendingData !== null) {
			try {
				ensureDir();
				const content = JSON.stringify(pendingData, null, "\t");
				fs.writeFileSync(filePath, content);
			} catch {
				// Ignore errors during cleanup
			}
			pendingData = null;
		}
	}

	return {
		load,
		save,
		flush,
		getCache,
		cleanup,
	};
}

export function getOpenclawDir(): string {
	return openclawDir;
}
