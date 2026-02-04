import type { VRM } from "@pixiv/three-vrm";

export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "relaxed";

const ALL_EXPRESSIONS: Expression[] = ["happy", "sad", "angry", "surprised", "relaxed"];
// Exponential ease-out speed. At 60fps (delta=0.016): step = 0.16 per frame.
// After 18 frames (300ms): 1 - (1-0.16)^18 = 1 - 0.84^18 ≈ 0.954 → 95% there.
const TRANSITION_SPEED = 10;

export interface ExpressionController {
	setExpression(expression: Expression): void;
	update(delta: number): void;
	setVrm(vrm: VRM): void;
}

export function createExpressionController(vrm: VRM): ExpressionController {
	let currentVrm = vrm;
	let target: Expression = "neutral";
	const weights: Record<Expression, number> = {
		happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0, neutral: 0,
	};

	return {
		setExpression(expression: Expression): void {
			target = expression;
		},

		update(delta: number): void {
			const expr = currentVrm.expressionManager;
			if (!expr) return;
			const step = Math.min(delta * TRANSITION_SPEED, 1);
			for (const name of ALL_EXPRESSIONS) {
				const goal = target === name ? 1 : 0;
				weights[name] += (goal - weights[name]) * step;
				expr.setValue(name, weights[name]);
			}
		},

		setVrm(vrm: VRM): void {
			currentVrm = vrm;
			for (const e of ALL_EXPRESSIONS) weights[e] = 0;
		},
	};
}
