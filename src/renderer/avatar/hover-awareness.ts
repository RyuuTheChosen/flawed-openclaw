import type { Expression } from "./expressions.js";

export type AwarenessState = "unaware" | "noticing" | "attentive" | "curious";

export interface AwarenessConfig {
	noticingDuration?: number; // Default: 0.5s
	attentiveDuration?: number; // Default: 2.0s
	fadeOutDuration?: number; // Default: 0.3s
	maxOverlayWeight?: number; // Default: 0.5
}

export interface ExpressionOverlay {
	expression: Expression;
	weight: number;
}

export interface HoverAwarenessController {
	update(delta: number): void;
	setHovering(hovering: boolean): void;
	getState(): AwarenessState;
	getExpressionOverlay(): ExpressionOverlay | null;
	getGazeMultiplier(): number; // 1.0 normally, 1.2 when attentive
	reset(): void;
}

const STATE_CONFIG: Record<
	AwarenessState,
	{ expression: Expression; weight: number } | null
> = {
	unaware: null,
	noticing: { expression: "surprised", weight: 0.3 },
	attentive: { expression: "happy", weight: 0.4 },
	curious: { expression: "surprised", weight: 0.5 },
};

const GAZE_MULTIPLIERS: Record<AwarenessState, number> = {
	unaware: 1.0,
	noticing: 1.1,
	attentive: 1.2,
	curious: 1.15,
};

const DEFAULT_NOTICING_DURATION = 0.5;
const DEFAULT_ATTENTIVE_DURATION = 2.0;
const DEFAULT_FADE_OUT_DURATION = 0.3;
const DEFAULT_MAX_WEIGHT = 0.5;

export function createHoverAwarenessController(
	config?: AwarenessConfig,
): HoverAwarenessController {
	const noticingDuration = config?.noticingDuration ?? DEFAULT_NOTICING_DURATION;
	const attentiveDuration =
		config?.attentiveDuration ?? DEFAULT_ATTENTIVE_DURATION;
	const fadeOutDuration = config?.fadeOutDuration ?? DEFAULT_FADE_OUT_DURATION;
	const maxWeight = config?.maxOverlayWeight ?? DEFAULT_MAX_WEIGHT;

	let state: AwarenessState = "unaware";
	let stateTimer = 0;
	let isHovering = false;

	return {
		update(delta: number): void {
			stateTimer += delta;

			if (isHovering) {
				// Progress through awareness states
				switch (state) {
					case "unaware":
						state = "noticing";
						stateTimer = 0;
						break;
					case "noticing":
						if (stateTimer >= noticingDuration) {
							state = "attentive";
							stateTimer = 0;
						}
						break;
					case "attentive":
						if (stateTimer >= attentiveDuration) {
							state = "curious";
							stateTimer = 0;
						}
						break;
					// curious: stay here while hovering
				}
			} else {
				// Fade back to unaware
				if (state !== "unaware" && stateTimer >= fadeOutDuration) {
					state = "unaware";
					stateTimer = 0;
				}
			}
		},

		setHovering(hovering: boolean): void {
			if (hovering !== isHovering) {
				isHovering = hovering;
				stateTimer = 0; // Reset timer on state change
			}
		},

		getState(): AwarenessState {
			return state;
		},

		getExpressionOverlay(): ExpressionOverlay | null {
			const cfg = STATE_CONFIG[state];
			if (!cfg) return null;
			return {
				expression: cfg.expression,
				weight: Math.min(cfg.weight, maxWeight),
			};
		},

		getGazeMultiplier(): number {
			return GAZE_MULTIPLIERS[state];
		},

		reset(): void {
			state = "unaware";
			stateTimer = 0;
			isHovering = false;
		},
	};
}
