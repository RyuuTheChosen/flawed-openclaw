import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { createExpressionController, type Expression } from "./expressions.js";
import { createLipSync, type LipSync } from "./lip-sync.js";
import { loadAnimationLibrary, type AnimationLibrary } from "./animation-loader.js";
import { createStateMachine, type AnimationStateMachine } from "./state-machine.js";
import { createEyeGazeController, type EyeGazeController } from "./eye-gaze.js";
import { createEyeSaccadeController, type EyeSaccadeController } from "./eye-saccades.js";
import {
	createHoverAwarenessController,
	type HoverAwarenessController,
} from "./hover-awareness.js";

import type { AgentPhase } from "../../shared/types.js";
import {
	BREATHING_FREQ,
	BREATHING_AMP,
	HEAD_SWAY_MULTIPLIER_THINKING,
	HEAD_SWAY_MULTIPLIER_SPEAKING,
	HEAD_SWAY_MULTIPLIER_DEFAULT,
	HEAD_SWAY_FREQ_X,
	HEAD_SWAY_FREQ_Y,
	HEAD_SWAY_AMP,
	SPEAKING_NOD_AMP,
	SPEAKING_NOD_FREQ,
	WORKING_TILT,
} from "../../shared/config.js";

/**
 * Get a bone from VRM with fallback for VRM 0.x/1.0 compatibility.
 * Tries normalized bone first, then falls back to raw bone.
 */
function getBone(vrm: VRM, boneName: VRMHumanBoneName): THREE.Object3D | null {
	const humanoid = vrm.humanoid;
	if (!humanoid) return null;

	// Try normalized bone first (preferred)
	const normalized = humanoid.getNormalizedBoneNode(boneName);
	if (normalized) return normalized;

	// Fallback to raw bone for older/non-standard VRM models
	return humanoid.getRawBoneNode(boneName);
}

export type { Expression };

export interface Animator {
	update(delta: number, elapsed: number): void;
	setVrm(vrm: VRM): void;
	setExpression(expression: Expression): void;
	setPhase(phase: AgentPhase): void;
	feedLipSyncText(text: string): void;
	stopLipSync(): void;
	isSpeaking(): boolean;
	initAnimations(clipPaths: Record<AgentPhase, string[]>): Promise<void>;
	getLipSync(): LipSync;
	setGazeScreenPosition(
		x: number,
		y: number,
		windowWidth: number,
		windowHeight: number,
	): void;
	setGazeTrackingMultiplier(multiplier: number): void;
	setHovering(hovering: boolean): void;
	getEyeGaze(): EyeGazeController;
	getHoverAwareness(): HoverAwarenessController;
}

export function createAnimator(vrm: VRM): Animator {
	let currentVrm = vrm;
	let nextBlinkTime = randomBlinkInterval();
	let blinkPhase: "idle" | "closing" | "opening" = "idle";
	let blinkTimer = 0;
	let currentPhase: AgentPhase = "idle";
	const expressionCtrl = createExpressionController(vrm);
	const lipSync = createLipSync(vrm);
	const eyeGaze = createEyeGazeController(vrm);
	const eyeSaccade = createEyeSaccadeController();
	const hoverAwareness = createHoverAwarenessController();

	// Animation system state
	let mixer: THREE.AnimationMixer | null = null;
	let library: AnimationLibrary | null = null;
	let stateMachine: AnimationStateMachine | null = null;
	let animationsLoaded = false;
	let initPromise: Promise<void> | null = null;
	let pendingPhase: AgentPhase | null = null;
	let phaseGazeMultiplier = 1.0;

	const BLINK_CLOSE_DURATION = 0.06; // 60ms
	const BLINK_OPEN_DURATION = 0.1; // 100ms

	function randomBlinkInterval(): number {
		return 2 + Math.random() * 4; // 2-6s
	}

	function updateBreathing(elapsed: number): void {
		const chest = getBone(currentVrm, "chest");
		if (chest) {
			chest.rotation.x = Math.sin(elapsed * BREATHING_FREQ * Math.PI * 2) * BREATHING_AMP;
		}
	}

	function updateBlinking(delta: number, elapsed: number): void {
		const expr = currentVrm.expressionManager;
		if (!expr) return;

		if (blinkPhase === "idle") {
			if (elapsed >= nextBlinkTime) {
				blinkPhase = "closing";
				blinkTimer = 0;
			}
			return;
		}

		blinkTimer += delta;

		if (blinkPhase === "closing") {
			const t = Math.min(blinkTimer / BLINK_CLOSE_DURATION, 1);
			expr.setValue("blink", t);
			if (t >= 1) {
				blinkPhase = "opening";
				blinkTimer = 0;
			}
		} else if (blinkPhase === "opening") {
			const t = Math.min(blinkTimer / BLINK_OPEN_DURATION, 1);
			expr.setValue("blink", 1 - t);
			if (t >= 1) {
				blinkPhase = "idle";
				nextBlinkTime = elapsed + randomBlinkInterval();
			}
		}
	}

	function updateHeadSway(elapsed: number): void {
		const head = getBone(currentVrm, "head");
		if (!head) return;

		const swayMultiplier =
			currentPhase === "thinking" ? HEAD_SWAY_MULTIPLIER_THINKING :
			currentPhase === "speaking" ? HEAD_SWAY_MULTIPLIER_SPEAKING :
			HEAD_SWAY_MULTIPLIER_DEFAULT;

		head.rotation.x = Math.sin(elapsed * HEAD_SWAY_FREQ_X) * HEAD_SWAY_AMP * swayMultiplier;
		head.rotation.y = Math.sin(elapsed * HEAD_SWAY_FREQ_Y) * HEAD_SWAY_AMP * swayMultiplier;

		if (currentPhase === "working") {
			head.rotation.x += WORKING_TILT;
		}

		if (currentPhase === "speaking") {
			head.rotation.x += Math.sin(elapsed * SPEAKING_NOD_FREQ) * SPEAKING_NOD_AMP;
		}
	}

	async function doInitAnimations(clipPaths: Record<AgentPhase, string[]>): Promise<void> {
		library = await loadAnimationLibrary(clipPaths, currentVrm);

		if (!library.isLoaded()) {
			// No FBX files loaded at all - stay on procedural fallback
			return;
		}

		mixer = new THREE.AnimationMixer(currentVrm.scene);
		stateMachine = createStateMachine(mixer, library);
		animationsLoaded = true;

		// Apply any phase that was set before init completed
		if (pendingPhase) {
			stateMachine.setPhase(pendingPhase);
			pendingPhase = null;
		} else {
			stateMachine.setPhase(currentPhase);
		}
	}

	return {
		update(delta: number, elapsed: number): void {
			// 1. Animation clips or procedural (bone positions)
			if (stateMachine && animationsLoaded) {
				stateMachine.update(delta);
			} else {
				updateBreathing(elapsed);
				updateHeadSway(elapsed);
			}

			// 2. Blinking (procedural expression)
			updateBlinking(delta, elapsed);

			// 2.5. Eye saccades (before gaze so offset is applied when gaze writes lookAt)
			const saccadeOffset = eyeSaccade.update(delta, eyeGaze.isActivelyTracking());
			eyeGaze.applySaccadeOffset(saccadeOffset.yaw, saccadeOffset.pitch);

			// 3. Eye gaze tracking
			eyeGaze.update(delta);

			// 4. Hover awareness (affects gaze multiplier + expression)
			hoverAwareness.update(delta);
			const gazeMultiplier = hoverAwareness.getGazeMultiplier();
			eyeGaze.setTrackingMultiplier(gazeMultiplier * phaseGazeMultiplier);

			// 5. Base expressions
			expressionCtrl.update(delta);

			// 6. Expression overlay from hover
			const overlay = hoverAwareness.getExpressionOverlay();
			if (overlay) {
				expressionCtrl.applyOverlay(overlay.expression, overlay.weight);
			}

			// 7. Lip sync (viseme expressions)
			lipSync.update(delta);
		},

		setVrm(newVrm: VRM): void {
			// Dispose old animation resources
			if (stateMachine) {
				stateMachine.dispose();
				stateMachine = null;
			}
			if (mixer) {
				mixer.stopAllAction();
				mixer.uncacheRoot(mixer.getRoot());
				mixer = null;
			}

			currentVrm = newVrm;
			blinkPhase = "idle";
			nextBlinkTime = randomBlinkInterval();
			expressionCtrl.setVrm(newVrm);
			lipSync.setVrm(newVrm);
			eyeGaze.setVrm(newVrm);
			eyeSaccade.reset();
			hoverAwareness.reset();

			// Re-retarget and rebuild state machine if library is available
			if (library && library.isLoaded()) {
				library.retargetToVrm(newVrm);
				mixer = new THREE.AnimationMixer(newVrm.scene);
				stateMachine = createStateMachine(mixer, library);
				animationsLoaded = true;

				if (pendingPhase) {
					stateMachine.setPhase(pendingPhase);
					pendingPhase = null;
				} else {
					stateMachine.setPhase(currentPhase);
				}
			} else {
				animationsLoaded = false;
			}
		},

		setExpression(expression: Expression): void {
			expressionCtrl.setExpression(expression);
		},

		setPhase(phase: AgentPhase): void {
			currentPhase = phase;

			// Set phase-specific gaze multiplier
			phaseGazeMultiplier = phase === "working" ? 0.3 : 1.0;

			if (!stateMachine) {
				pendingPhase = phase;
				return;
			}
			stateMachine.setPhase(phase);
		},

		feedLipSyncText(text: string): void {
			lipSync.feedText(text);
		},

		stopLipSync(): void {
			lipSync.stop();
		},

		isSpeaking(): boolean {
			return lipSync.isSpeaking();
		},

		async initAnimations(clipPaths: Record<AgentPhase, string[]>): Promise<void> {
			if (initPromise) return initPromise;
			initPromise = doInitAnimations(clipPaths);
			try {
				await initPromise;
			} finally {
				initPromise = null;
			}
		},

		getLipSync(): LipSync {
			return lipSync;
		},

		setGazeScreenPosition(
			x: number,
			y: number,
			windowWidth: number,
			windowHeight: number,
		): void {
			eyeGaze.setScreenPosition(x, y, windowWidth, windowHeight);
		},

		setGazeTrackingMultiplier(multiplier: number): void {
			phaseGazeMultiplier = multiplier;
		},

		setHovering(hovering: boolean): void {
			hoverAwareness.setHovering(hovering);
		},

		getEyeGaze(): EyeGazeController {
			return eyeGaze;
		},

		getHoverAwareness(): HoverAwarenessController {
			return hoverAwareness;
		},
	};
}
