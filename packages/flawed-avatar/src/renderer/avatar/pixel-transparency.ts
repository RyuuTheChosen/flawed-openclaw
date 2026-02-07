import { PIXEL_SAMPLE_RADIUS, PIXEL_ALPHA_THRESHOLD } from "../../shared/config.js";

/**
 * Check if a circular region of pixels around a point is transparent.
 * Uses WebGL `readPixels` to sample a bounding-box and checks alpha
 * within a circular mask.
 */
export function isTransparentAtPoint(opts: {
	gl: WebGLRenderingContext;
	canvasEl: HTMLCanvasElement;
	clientX: number;
	clientY: number;
	radius?: number;
	threshold?: number;
}): boolean {
	const {
		gl,
		canvasEl,
		clientX,
		clientY,
		radius = PIXEL_SAMPLE_RADIUS,
		threshold = PIXEL_ALPHA_THRESHOLD,
	} = opts;

	const rect = canvasEl.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;

	// Convert client coords to canvas pixel coords
	const cx = Math.round((clientX - rect.left) * dpr);
	const cy = Math.round((clientY - rect.top) * dpr);
	// WebGL y is flipped
	const glY = canvasEl.height - cy;

	const r = Math.round(radius * dpr);
	const size = r * 2;

	// Clamp to canvas bounds
	const x0 = Math.max(0, cx - r);
	const y0 = Math.max(0, glY - r);
	const x1 = Math.min(canvasEl.width, cx + r);
	const y1 = Math.min(canvasEl.height, glY + r);

	const w = x1 - x0;
	const h = y1 - y0;
	if (w <= 0 || h <= 0) return true;

	const pixels = new Uint8Array(w * h * 4);
	gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

	const r2 = r * r;
	// Check alpha values in circular region
	for (let py = 0; py < h; py++) {
		for (let px = 0; px < w; px++) {
			// Distance from center of the sample circle
			const dx = (x0 + px) - cx;
			const dy = (y0 + py) - glY;
			if (dx * dx + dy * dy > r2) continue;

			const alpha = pixels[(py * w + px) * 4 + 3];
			if (alpha > threshold) return false;
		}
	}

	return true;
}
