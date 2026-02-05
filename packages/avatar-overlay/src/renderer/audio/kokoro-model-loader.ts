/**
 * Singleton model loader for Kokoro TTS.
 * Lazy-loads the model on first use and caches for session duration.
 */

// Import types - actual import is dynamic to avoid bundling issues
type KokoroTTS = {
	generate(text: string, options: { voice: string }): Promise<{ audio: Float32Array; sampling_rate: number }>;
};

interface KokoroModelLoader {
	/**
	 * Get the Kokoro TTS model instance.
	 * Lazy-loads on first call, returns cached instance on subsequent calls.
	 */
	getModel(): Promise<KokoroTTS>;

	/**
	 * Check if model is currently loading.
	 */
	isLoading(): boolean;

	/**
	 * Check if model is loaded.
	 */
	isLoaded(): boolean;

	/**
	 * Dispose the model and free resources.
	 */
	dispose(): void;
}

let instance: KokoroModelLoader | null = null;

function createModelLoader(): KokoroModelLoader {
	let model: KokoroTTS | null = null;
	let loadPromise: Promise<KokoroTTS> | null = null;
	let loading = false;
	let disposed = false;

	async function loadModel(): Promise<KokoroTTS> {
		if (disposed) {
			throw new Error("Model loader has been disposed");
		}

		console.log("[Kokoro] Loading model...");
		loading = true;

		try {
			// Dynamic import to avoid bundling issues with WASM
			const { KokoroTTS } = await import("kokoro-js");

			// Load quantized model for smaller size (~92MB)
			const tts = await KokoroTTS.from_pretrained(
				"onnx-community/Kokoro-82M-v1.0-ONNX",
				{ dtype: "q8" }
			);

			console.log("[Kokoro] Model loaded successfully");
			model = tts as unknown as KokoroTTS;
			loading = false;
			return model;
		} catch (error) {
			loading = false;
			loadPromise = null;
			console.error("[Kokoro] Failed to load model:", error);
			throw error;
		}
	}

	return {
		async getModel(): Promise<KokoroTTS> {
			if (disposed) {
				throw new Error("Model loader has been disposed");
			}

			// Return cached model if available
			if (model) {
				return model;
			}

			// Use existing promise if already loading (prevents concurrent loads)
			if (loadPromise) {
				return loadPromise;
			}

			// Start new load
			loadPromise = loadModel();
			return loadPromise;
		},

		isLoading(): boolean {
			return loading;
		},

		isLoaded(): boolean {
			return model !== null;
		},

		dispose(): void {
			disposed = true;
			model = null;
			loadPromise = null;
			loading = false;
		},
	};
}

/**
 * Get the singleton Kokoro model loader instance.
 */
export function getKokoroLoader(): KokoroModelLoader {
	if (!instance) {
		instance = createModelLoader();
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
