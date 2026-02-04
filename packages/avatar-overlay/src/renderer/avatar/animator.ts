import type { VRM } from "@pixiv/three-vrm";

export interface Animator {
	update(delta: number, elapsed: number): void;
	setVrm(vrm: VRM): void;
}

export function createAnimator(vrm: VRM): Animator {
	let currentVrm = vrm;
	let nextBlinkTime = randomBlinkInterval();
	let blinkPhase: "idle" | "closing" | "opening" = "idle";
	let blinkTimer = 0;

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
		if (head) {
			// Lissajous sine waves for natural-looking sway
			head.rotation.x = Math.sin(elapsed * 0.5) * 0.01;
			head.rotation.y = Math.sin(elapsed * 0.3) * 0.01;
		}
	}

	return {
		update(delta: number, elapsed: number): void {
			updateBreathing(elapsed);
			updateBlinking(delta, elapsed);
			updateHeadSway(elapsed);
		},

		setVrm(newVrm: VRM): void {
			currentVrm = newVrm;
			blinkPhase = "idle";
			nextBlinkTime = randomBlinkInterval();
		},
	};
}
