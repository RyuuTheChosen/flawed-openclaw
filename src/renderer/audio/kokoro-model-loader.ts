/**
 * Worker-based Kokoro TTS loader.
 * Runs ONNX inference in a Web Worker to avoid blocking the renderer thread.
 * Tries WebGPU first, falls back to WASM.
 */

export interface KokoroLoader {
	/** Wait for the worker model to be ready. */
	waitReady(): Promise<void>;

	/** Generate audio in the worker (off main thread). */
	generate(
		text: string,
		voice: string,
	): Promise<{ audio: Float32Array; sampleRate: number }>;

	/** Check if model is currently loading. */
	isLoading(): boolean;

	/** Check if model is loaded and ready. */
	isLoaded(): boolean;

	/** Dispose the worker and free resources. */
	dispose(): void;
}

type Pending = {
	resolve: (result: { audio: Float32Array; sampleRate: number }) => void;
	reject: (error: Error) => void;
};

let instance: KokoroLoader | null = null;

function createLoader(): KokoroLoader {
	let ready = false;
	let loading = true;
	let disposed = false;
	let readyResolve: (() => void) | null = null;
	let readyReject: ((err: Error) => void) | null = null;
	const readyPromise = new Promise<void>((res, rej) => {
		readyResolve = res;
		readyReject = rej;
	});
	const pending = new Map<string, Pending>();

	const worker = new Worker(
		new URL("./kokoro-worker.js", import.meta.url),
		{ type: "module" },
	);

	worker.onmessage = (e: MessageEvent) => {
		const { type, id } = e.data;

		if (type === "ready") {
			ready = true;
			loading = false;
			console.log(`[Kokoro] Worker model loaded (${e.data.device})`);
			readyResolve?.();
			return;
		}

		if (type === "init-error") {
			loading = false;
			console.error("[Kokoro] Worker init failed:", e.data.error);
			readyReject?.(new Error(e.data.error));
			return;
		}

		if (type === "audio") {
			const p = pending.get(id);
			if (p) {
				pending.delete(id);
				p.resolve({
					audio: e.data.audio,
					sampleRate: e.data.sampleRate,
				});
			}
			return;
		}

		if (type === "error" && id) {
			const p = pending.get(id);
			if (p) {
				pending.delete(id);
				p.reject(new Error(e.data.error));
			}
		}
	};

	worker.onerror = (e) => {
		console.error("[Kokoro] Worker error:", e);
	};

	// Start loading immediately
	worker.postMessage({ type: "init" });

	return {
		waitReady: () => readyPromise,

		async generate(
			text: string,
			voice: string,
		): Promise<{ audio: Float32Array; sampleRate: number }> {
			if (disposed) throw new Error("Loader disposed");
			if (!ready) await readyPromise;

			const id = crypto.randomUUID();
			return new Promise<{ audio: Float32Array; sampleRate: number }>(
				(resolve, reject) => {
					pending.set(id, { resolve, reject });
					worker.postMessage({ type: "generate", id, text, voice });
				},
			);
		},

		isLoading: () => loading,
		isLoaded: () => ready,

		dispose() {
			disposed = true;
			ready = false;
			loading = false;
			for (const [, p] of pending) {
				p.reject(new Error("Loader disposed"));
			}
			pending.clear();
			worker.postMessage({ type: "dispose" });
			worker.terminate();
		},
	};
}

/**
 * Get the singleton Kokoro worker loader instance.
 */
export function getKokoroLoader(): KokoroLoader {
	if (!instance) {
		instance = createLoader();
	}
	return instance;
}

/**
 * Dispose the singleton loader (for cleanup).
 */
export function disposeKokoroLoader(): void {
	if (instance) {
		instance.dispose();
		instance = null;
	}
}
