import type { VRM } from "@pixiv/three-vrm";
import {
	EXPRESSION_DURATION_SURPRISED,
	EXPRESSION_DURATION_ANGRY,
	EXPRESSION_DURATION_HAPPY,
	EXPRESSION_DURATION_NEUTRAL,
	EXPRESSION_DURATION_SAD,
	EXPRESSION_DURATION_RELAXED,
} from "../../shared/config.js";

export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "relaxed";

// Blend shape names that compound expressions can write.
// NOTE: "blink" is reserved for the procedural blink system. Never include here.
type BlendShapeName = "happy" | "sad" | "angry" | "surprised" | "relaxed" | "aa" | "ee";

const ALL_BLEND_SHAPES: BlendShapeName[] = [
	"happy", "sad", "angry", "surprised", "relaxed", "aa", "ee",
];

const COMPOUND_MAP: Record<Expression, Array<{ name: BlendShapeName; weight: number }>> = {
	happy:     [{ name: "happy", weight: 1.0 }, { name: "aa", weight: 0.3 }],
	sad:       [{ name: "sad", weight: 1.0 }],
	angry:     [{ name: "angry", weight: 1.0 }, { name: "ee", weight: 0.4 }],
	surprised: [{ name: "surprised", weight: 1.0 }, { name: "aa", weight: 0.5 }],
	relaxed:   [{ name: "relaxed", weight: 1.0 }],
	neutral:   [],
};

const BLEND_DURATION: Record<Expression, number> = {
	surprised: EXPRESSION_DURATION_SURPRISED,
	angry:     EXPRESSION_DURATION_ANGRY,
	happy:     EXPRESSION_DURATION_HAPPY,
	neutral:   EXPRESSION_DURATION_NEUTRAL,
	sad:       EXPRESSION_DURATION_SAD,
	relaxed:   EXPRESSION_DURATION_RELAXED,
};

interface BlendState {
	current: number;
	start: number;
	target: number;
	elapsed: number;
	duration: number;
}

function cubicEaseInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function createBlendState(): BlendState {
	return { current: 0, start: 0, target: 0, elapsed: 0, duration: 0 };
}

export interface ExpressionController {
	setExpression(expression: Expression): void;
	update(delta: number): void;
	setVrm(vrm: VRM): void;
	applyOverlay(expression: Expression, weight: number): void;
}

export function createExpressionController(vrm: VRM): ExpressionController {
	let currentVrm = vrm;
	let currentExpression: Expression = "neutral";
	let pendingOverlay: { expression: Expression; weight: number } | null = null;

	const blendStates: Record<BlendShapeName, BlendState> = {} as any;
	for (const name of ALL_BLEND_SHAPES) {
		blendStates[name] = createBlendState();
	}

	function applyExpression(expression: Expression): void {
		const map = COMPOUND_MAP[expression];
		const duration = BLEND_DURATION[expression];

		// Build a set of shapes that have targets in this expression
		const activeShapes = new Set<BlendShapeName>();
		for (const entry of map) {
			activeShapes.add(entry.name);
		}

		// Set targets for all blend shapes
		for (const name of ALL_BLEND_SHAPES) {
			const state = blendStates[name];
			let newTarget = 0;

			// Check if this shape is in the compound map
			for (const entry of map) {
				if (entry.name === name) {
					newTarget = entry.weight;
					break;
				}
			}

			// Only reset elapsed if target actually changed
			if (newTarget !== state.target) {
				state.start = state.current;
				state.target = newTarget;
				state.elapsed = 0;
				state.duration = duration;
			}
		}
	}

	return {
		setExpression(expression: Expression): void {
			if (expression === currentExpression) return;
			currentExpression = expression;
			applyExpression(expression);
		},

		update(delta: number): void {
			const expr = currentVrm.expressionManager;
			if (!expr) return;

			// Update all blend shapes with cubic easing
			for (const name of ALL_BLEND_SHAPES) {
				const state = blendStates[name];

				// Skip if already at target
				if (state.current === state.target && state.elapsed >= state.duration) {
					continue;
				}

				state.elapsed = Math.min(state.elapsed + delta, state.duration);
				const t = state.duration > 0 ? state.elapsed / state.duration : 1;
				state.current = lerp(state.start, state.target, cubicEaseInOut(t));

				expr.setValue(name, state.current);
			}

			// Apply overlay additively
			if (pendingOverlay) {
				const current = expr.getValue(pendingOverlay.expression) ?? 0;
				expr.setValue(
					pendingOverlay.expression,
					Math.min(1, current + pendingOverlay.weight),
				);
				pendingOverlay = null;
			}
		},

		setVrm(vrm: VRM): void {
			currentVrm = vrm;
			for (const name of ALL_BLEND_SHAPES) {
				const s = blendStates[name];
				s.current = 0;
				s.start = 0;
				s.target = 0;
				s.elapsed = 0;
				s.duration = 0;
			}
			currentExpression = "neutral";
			pendingOverlay = null;
		},

		applyOverlay(expression: Expression, weight: number): void {
			pendingOverlay = { expression, weight };
		},
	};
}
