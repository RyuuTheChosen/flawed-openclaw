import type { VRM } from "@pixiv/three-vrm";
import { createExpressionController, type Expression } from "./expressions.js";
import { createLipSync } from "./lip-sync.js";

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
}

export function createAnimator(vrm: VRM): Animator {
	let currentVrm = vrm;
	let nextBlinkTime = randomBlinkInterval();
	let blinkPhase: "idle" | "closing" | "opening" = "idle";
	let blinkTimer = 0;
	let currentPhase: AgentPhase = "idle";
	const expressionCtrl = createExpressionController(vrm);
	const lipSync = createLipSync(vrm);

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

		// Modulate sway amplitude by agent phase
		const swayMultiplier = currentPhase === "thinking" ? 2.5 : currentPhase === "speaking" ? 1.5 : 1.0;

		// Lissajous sine waves for natural-looking sway
		head.rotation.x = Math.sin(elapsed * 0.5) * 0.01 * swayMultiplier;
		head.rotation.y = Math.sin(elapsed * 0.3) * 0.01 * swayMultiplier;

		// Working: slight downward head tilt
		if (currentPhase === "working") {
			head.rotation.x += 0.05;
		}

		// Speaking: add nodding motion
		if (currentPhase === "speaking") {
			head.rotation.x += Math.sin(elapsed * 3.0) * 0.015;
		}
	}

	return {
		update(delta: number, elapsed: number): void {
			updateBreathing(elapsed);
			updateBlinking(delta, elapsed);
			updateHeadSway(elapsed);
			expressionCtrl.update(delta);
			lipSync.update(delta);
		},

		setVrm(newVrm: VRM): void {
			currentVrm = newVrm;
			blinkPhase = "idle";
			nextBlinkTime = randomBlinkInterval();
			expressionCtrl.setVrm(newVrm);
			lipSync.setVrm(newVrm);
		},

		setExpression(expression: Expression): void {
			expressionCtrl.setExpression(expression);
		},

		setPhase(phase: AgentPhase): void {
			currentPhase = phase;
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
	};
}
