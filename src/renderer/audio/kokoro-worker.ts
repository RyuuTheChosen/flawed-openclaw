/**
 * Web Worker for Kokoro TTS synthesis.
 * Runs ONNX inference off the renderer thread to avoid blocking Three.js.
 */

// This file runs as a Web Worker — typed for worker scope
interface WorkerScope {
	onmessage: ((e: MessageEvent) => void) | null;
	postMessage(message: unknown, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

type KokoroModel = {
	generate(
		text: string,
		options: { voice: string },
	): Promise<{ audio: Float32Array; sampling_rate: number }>;
};

let model: KokoroModel | null = null;

async function initModel(): Promise<string> {
	const { KokoroTTS } = await import("kokoro-js");

	// Try WebGPU first for GPU-accelerated inference
	try {
		if (typeof navigator !== "undefined" && "gpu" in navigator) {
			const adapter = await (navigator as any).gpu?.requestAdapter();
			if (adapter) {
				model = (await KokoroTTS.from_pretrained(
					"onnx-community/Kokoro-82M-v1.0-ONNX",
					{ dtype: "q8", device: "webgpu" },
				)) as unknown as KokoroModel;
				return "webgpu";
			}
		}
	} catch {
		// WebGPU unavailable — fall through to WASM
	}

	// Fallback: WASM (CPU)
	model = (await KokoroTTS.from_pretrained(
		"onnx-community/Kokoro-82M-v1.0-ONNX",
		{ dtype: "q8" },
	)) as unknown as KokoroModel;
	return "wasm";
}

ctx.onmessage = async (e: MessageEvent) => {
	const { type, id } = e.data;

	if (type === "init") {
		try {
			const device = await initModel();
			ctx.postMessage({ type: "ready", device });
		} catch (err) {
			ctx.postMessage({
				type: "init-error",
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return;
	}

	if (type === "generate") {
		if (!model) {
			ctx.postMessage({ type: "error", id, error: "Model not loaded" });
			return;
		}
		try {
			const result = await model.generate(e.data.text, {
				voice: e.data.voice,
			});
			// Transfer the Float32Array buffer (zero-copy)
			ctx.postMessage(
				{
					type: "audio",
					id,
					audio: result.audio,
					sampleRate: result.sampling_rate,
				},
				[result.audio.buffer],
			);
		} catch (err) {
			ctx.postMessage({
				type: "error",
				id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
		return;
	}

	if (type === "dispose") {
		model = null;
		ctx.postMessage({ type: "disposed" });
	}
};
