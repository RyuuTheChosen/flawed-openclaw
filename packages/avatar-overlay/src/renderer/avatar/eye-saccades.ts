import {
	SACCADE_YAW_RANGE,
	SACCADE_PITCH_RANGE,
	SACCADE_MOVE_DURATION,
	SACCADE_HOLD_DURATION_MIN,
	SACCADE_HOLD_DURATION_MAX,
	SACCADE_TRACKING_DAMPING,
	SACCADE_INTERVAL_STEP,
} from "../../shared/config.js";

export interface EyeSaccadeController {
	update(delta: number, isTracking: boolean): { yaw: number; pitch: number };
	reset(): void;
}

// Weighted cumulative probability distribution for saccade intervals.
// Shorter intervals are more likely. Range: 800ms–4400ms, step 400ms.
const INTERVAL_CDF = [0.15, 0.35, 0.55, 0.70, 0.82, 0.90, 0.95, 0.98, 1.0];

function sampleInterval(): number {
	const r = Math.random();
	for (let i = 0; i < INTERVAL_CDF.length; i++) {
		if (r <= INTERVAL_CDF[i]) {
			return (800 + i * SACCADE_INTERVAL_STEP) / 1000; // convert ms to seconds
		}
	}
	return 4.4; // fallback
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

type SaccadePhase = "wait" | "move" | "hold" | "return";

export function createEyeSaccadeController(): EyeSaccadeController {
	let phase: SaccadePhase = "wait";
	let timer = 0;
	let waitDuration = sampleInterval();

	// Current offset being output
	let currentYaw = 0;
	let currentPitch = 0;

	// Target for current saccade
	let targetYaw = 0;
	let targetPitch = 0;

	// Start position for lerp (saved when phase transitions)
	let startYaw = 0;
	let startPitch = 0;

	let holdDuration = 0;

	function generateTarget(): void {
		targetYaw = (Math.random() * 2 - 1) * SACCADE_YAW_RANGE;
		targetPitch = (Math.random() * 2 - 1) * SACCADE_PITCH_RANGE;
	}

	return {
		update(delta: number, isTracking: boolean): { yaw: number; pitch: number } {
			timer += delta;

			switch (phase) {
				case "wait":
					if (timer >= waitDuration) {
						// Start a new saccade
						phase = "move";
						timer = 0;
						startYaw = currentYaw;
						startPitch = currentPitch;
						generateTarget();
					}
					break;

				case "move": {
					const t = Math.min(timer / SACCADE_MOVE_DURATION, 1);
					currentYaw = lerp(startYaw, targetYaw, t);
					currentPitch = lerp(startPitch, targetPitch, t);
					if (t >= 1) {
						phase = "hold";
						timer = 0;
						holdDuration = SACCADE_HOLD_DURATION_MIN +
							Math.random() * (SACCADE_HOLD_DURATION_MAX - SACCADE_HOLD_DURATION_MIN);
					}
					break;
				}

				case "hold":
					if (timer >= holdDuration) {
						phase = "return";
						timer = 0;
						startYaw = currentYaw;
						startPitch = currentPitch;
					}
					break;

				case "return": {
					const t = Math.min(timer / SACCADE_MOVE_DURATION, 1);
					currentYaw = lerp(startYaw, 0, t);
					currentPitch = lerp(startPitch, 0, t);
					if (t >= 1) {
						currentYaw = 0;
						currentPitch = 0;
						phase = "wait";
						timer = 0;
						waitDuration = sampleInterval();
					}
					break;
				}
			}

			// Dampen saccade offset when actively tracking cursor
			const damping = isTracking ? SACCADE_TRACKING_DAMPING : 1.0;
			return {
				yaw: currentYaw * damping,
				pitch: currentPitch * damping,
			};
		},

		reset(): void {
			phase = "wait";
			timer = 0;
			waitDuration = sampleInterval();
			currentYaw = 0;
			currentPitch = 0;
			targetYaw = 0;
			targetPitch = 0;
			startYaw = 0;
			startPitch = 0;
		},
	};
}
