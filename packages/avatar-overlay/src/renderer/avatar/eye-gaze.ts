import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";

export interface EyeGazeConfig {
	// Eye limits
	eyeYawLimit?: number; // Default: 20 degrees
	eyePitchLimit?: number; // Default: 15 degrees
	// Head limits (smaller than eyes for natural layering)
	headYawLimit?: number; // Default: 25 degrees
	headPitchLimit?: number; // Default: 15 degrees
	// Behavior
	deadzonePx?: number; // Default: 50 pixels
	idleTimeout?: number; // Default: 3.0 seconds
	eyeSmoothFactor?: number; // Default: 10 (faster)
	headSmoothFactor?: number; // Default: 4 (slower, more deliberate)
}

export interface EyeGazeController {
	update(delta: number): void;
	setScreenPosition(
		x: number,
		y: number,
		windowWidth: number,
		windowHeight: number,
	): void;
	setTrackingMultiplier(multiplier: number): void;
	setVrm(vrm: VRM): void;
	reset(): void;
}

// Eye tracking - faster, fine adjustments
const DEFAULT_EYE_YAW_LIMIT = 20;
const DEFAULT_EYE_PITCH_LIMIT = 15;
const DEFAULT_EYE_SMOOTH_FACTOR = 10;

// Head tracking - slower, larger movements
const DEFAULT_HEAD_YAW_LIMIT = 25;
const DEFAULT_HEAD_PITCH_LIMIT = 15;
const DEFAULT_HEAD_SMOOTH_FACTOR = 4;

const DEFAULT_DEADZONE_PX = 50;
const DEFAULT_IDLE_TIMEOUT = 3.0;

// Convert degrees to radians
const DEG_TO_RAD = Math.PI / 180;

/**
 * Get the head bone from VRM, with fallback for different VRM versions.
 * Works with both VRM 0.x and VRM 1.0 models.
 */
function getHeadBone(vrm: VRM): THREE.Object3D | null {
	const humanoid = vrm.humanoid;
	if (!humanoid) return null;

	// Try normalized bone first (preferred, consistent across models)
	const normalizedHead = humanoid.getNormalizedBoneNode("head");
	if (normalizedHead) return normalizedHead;

	// Fallback to raw bone for older/non-standard VRM models
	const rawHead = humanoid.getRawBoneNode("head");
	if (rawHead) return rawHead;

	return null;
}

/**
 * Check if this is a VRM 0.x model (vs VRM 1.0).
 * VRM 0.x models may have different bone orientation conventions.
 */
function isVrm0(vrm: VRM): boolean {
	// metaVersion is "0" for VRM 0.x, "1" for VRM 1.0
	return vrm.meta?.metaVersion === "0";
}

export function createEyeGazeController(
	vrm: VRM,
	config?: EyeGazeConfig,
): EyeGazeController {
	// Eye config
	const eyeYawLimit = config?.eyeYawLimit ?? DEFAULT_EYE_YAW_LIMIT;
	const eyePitchLimit = config?.eyePitchLimit ?? DEFAULT_EYE_PITCH_LIMIT;
	const eyeSmoothFactor = config?.eyeSmoothFactor ?? DEFAULT_EYE_SMOOTH_FACTOR;

	// Head config
	const headYawLimit = config?.headYawLimit ?? DEFAULT_HEAD_YAW_LIMIT;
	const headPitchLimit = config?.headPitchLimit ?? DEFAULT_HEAD_PITCH_LIMIT;
	const headSmoothFactor = config?.headSmoothFactor ?? DEFAULT_HEAD_SMOOTH_FACTOR;

	// Behavior config
	const deadzonePx = config?.deadzonePx ?? DEFAULT_DEADZONE_PX;
	const idleTimeout = config?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;

	let currentVrm = vrm;
	let pitchInverted = isVrm0(vrm); // VRM 0.x needs inverted pitch

	// Eye state (degrees for VRM lookAt)
	let targetEyeYaw = 0;
	let targetEyePitch = 0;
	let currentEyeYaw = 0;
	let currentEyePitch = 0;

	// Head state (radians for bone rotation)
	let targetHeadYaw = 0;
	let targetHeadPitch = 0;
	let currentHeadYaw = 0;
	let currentHeadPitch = 0;

	let lastMoveTime = 0;
	let trackingMultiplier = 1.0;
	let lastX = 0;
	let lastY = 0;

	return {
		update(delta: number): void {
			// Idle timeout check
			const now = performance.now() / 1000;
			if (now - lastMoveTime > idleTimeout) {
				targetEyeYaw = 0;
				targetEyePitch = 0;
				targetHeadYaw = 0;
				targetHeadPitch = 0;
			}

			// Update head (slower, more deliberate)
			const headStep = Math.min(delta * headSmoothFactor, 1);
			currentHeadYaw += (targetHeadYaw - currentHeadYaw) * headStep;
			currentHeadPitch += (targetHeadPitch - currentHeadPitch) * headStep;

			// Apply head rotation to bone (add to existing procedural sway)
			// Uses fallback chain for VRM 0.x/1.0 compatibility
			const head = getHeadBone(currentVrm);
			if (head) {
				head.rotation.y += currentHeadYaw;
				head.rotation.x += currentHeadPitch;
			}

			// Update eyes (faster, fine tracking)
			const eyeStep = Math.min(delta * eyeSmoothFactor, 1);
			currentEyeYaw += (targetEyeYaw - currentEyeYaw) * eyeStep;
			currentEyePitch += (targetEyePitch - currentEyePitch) * eyeStep;

			// Apply to VRM lookAt (graceful no-op if VRM lacks lookAt)
			const lookAt = currentVrm.lookAt;
			if (lookAt) {
				lookAt.yaw = currentEyeYaw;
				lookAt.pitch = currentEyePitch;
			}
		},

		setScreenPosition(
			x: number,
			y: number,
			windowWidth: number,
			windowHeight: number,
		): void {
			// Deadzone check - ignore small movements
			const dx = x - lastX;
			const dy = y - lastY;
			if (Math.sqrt(dx * dx + dy * dy) < deadzonePx) {
				return;
			}
			lastX = x;
			lastY = y;

			// Normalize to [-1, 1] using window dimensions
			const normalizedX = (x / windowWidth) * 2 - 1;
			const normalizedY = (y / windowHeight) * 2 - 1;

			// Pitch direction depends on VRM version due to different bone orientations
			const pitchSign = pitchInverted ? -1 : 1;

			// Head targets (radians, for bone rotation)
			targetHeadYaw =
				normalizedX * headYawLimit * DEG_TO_RAD * trackingMultiplier;
			targetHeadPitch =
				pitchSign * normalizedY * headPitchLimit * DEG_TO_RAD * trackingMultiplier;

			// Clamp head
			targetHeadYaw = Math.max(
				-headYawLimit * DEG_TO_RAD,
				Math.min(headYawLimit * DEG_TO_RAD, targetHeadYaw),
			);
			targetHeadPitch = Math.max(
				-headPitchLimit * DEG_TO_RAD,
				Math.min(headPitchLimit * DEG_TO_RAD, targetHeadPitch),
			);

			// Eye targets (degrees, for VRM lookAt)
			// VRM lookAt: positive pitch = looking up
			targetEyeYaw = normalizedX * eyeYawLimit * trackingMultiplier;
			targetEyePitch = -pitchSign * normalizedY * eyePitchLimit * trackingMultiplier;

			// Clamp eyes
			targetEyeYaw = Math.max(-eyeYawLimit, Math.min(eyeYawLimit, targetEyeYaw));
			targetEyePitch = Math.max(
				-eyePitchLimit,
				Math.min(eyePitchLimit, targetEyePitch),
			);

			lastMoveTime = performance.now() / 1000;
		},

		setTrackingMultiplier(multiplier: number): void {
			trackingMultiplier = multiplier;
		},

		setVrm(newVrm: VRM): void {
			currentVrm = newVrm;
			pitchInverted = isVrm0(newVrm); // Recalculate for new model
			// Reset state on VRM change
			currentEyeYaw = 0;
			currentEyePitch = 0;
			targetEyeYaw = 0;
			targetEyePitch = 0;
			currentHeadYaw = 0;
			currentHeadPitch = 0;
			targetHeadYaw = 0;
			targetHeadPitch = 0;
		},

		reset(): void {
			currentEyeYaw = 0;
			currentEyePitch = 0;
			targetEyeYaw = 0;
			targetEyePitch = 0;
			currentHeadYaw = 0;
			currentHeadPitch = 0;
			targetHeadYaw = 0;
			targetHeadPitch = 0;
			lastMoveTime = 0;
			lastX = 0;
			lastY = 0;
		},
	};
}
