import { createHash } from "node:crypto";
import { screen } from "electron";

/**
 * Compute a hash of the current display configuration.
 * Used to key saved window positions per monitor setup.
 */
export function computeDisplayHash(): string {
	const displays = screen.getAllDisplays()
		.map((d) => ({
			x: d.bounds.x,
			y: d.bounds.y,
			w: d.bounds.width,
			h: d.bounds.height,
			s: d.scaleFactor,
		}))
		.sort((a, b) => a.x - b.x || a.y - b.y);

	const input = JSON.stringify(displays);
	return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Clamp a window rectangle to the work area of the nearest display.
 */
export function clampBoundsToWorkArea(
	x: number,
	y: number,
	w: number,
	h: number,
): { x: number; y: number } {
	const display = screen.getDisplayNearestPoint({ x, y });
	const wa = display.workArea;

	const cx = Math.max(wa.x, Math.min(wa.x + wa.width - w, x));
	const cy = Math.max(wa.y, Math.min(wa.y + wa.height - h, y));

	return { x: Math.round(cx), y: Math.round(cy) };
}
