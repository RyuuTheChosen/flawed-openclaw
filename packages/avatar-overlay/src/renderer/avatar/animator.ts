import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { createExpressionController, type Expression } from "./expressions.js";
import { createLipSync } from "./lip-sync.js";
import { loadAnimationLibrary, type AnimationLibrary } from "./animation-loader.js";
import { createStateMachine, type AnimationStateMachine } from "./state-machine.js";

import type { AgentPhase } from "../../shared/types.js";

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
}

export function createAnimator(vrm: VRM): Animator {
	let currentVrm = vrm;
	let nextBlinkTime = randomBlinkInterval();
	let blinkPhase: "idle" | "closing" | "opening" = "idle";
	let blinkTimer = 0;
	let currentPhase: AgentPhase = "idle";
	const expressionCtrl = createExpressionController(vrm);
	const lipSync = createLipSync(vrm);

	// Animation system state
	let mixer: THREE.AnimationMixer | null = null;
	let library: AnimationLibrary | null = null;
	let stateMachine: AnimationStateMachine | null = null;
	let animationsLoaded = false;
	let initPromise: Promise<void> | null = null;
	let pendingPhase: AgentPhase | null = null;

	const BLINK_CLOSE_DURATION = 0.06; // 60ms
	const BLINK_OPEN_DURATION = 0.1; // 100ms

	function randomBlinkInterval(): number {
		return 2 + Math.random() * 4; // 2-6s
	}

	function updateBreathing(elapsed: number): void {
		const chest = currentVrm.humanoid?.getNormalizedBoneNode("chest");
		if (chest) {
			chest.rotation.x = Math.sin(elapsed * 1.8 * Math.PI * 2) * 0.005;
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
		const head = currentVrm.humanoid?.getNormalizedBoneNode("head");
		if (!head) return;

		const swayMultiplier = currentPhase === "thinking" ? 2.5 : currentPhase === "speaking" ? 1.5 : 1.0;

		head.rotation.x = Math.sin(elapsed * 0.5) * 0.01 * swayMultiplier;
		head.rotation.y = Math.sin(elapsed * 0.3) * 0.01 * swayMultiplier;

		if (currentPhase === "working") {
			head.rotation.x += 0.05;
		}

		if (currentPhase === "speaking") {
			head.rotation.x += Math.sin(elapsed * 3.0) * 0.015;
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
			if (stateMachine && animationsLoaded) {
				stateMachine.update(delta);
			} else {
				updateBreathing(elapsed);
				updateHeadSway(elapsed);
			}
			updateBlinking(delta, elapsed);
			expressionCtrl.update(delta);
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
	};
}
