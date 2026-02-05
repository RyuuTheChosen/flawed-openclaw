import * as THREE from "three";
import type { AgentPhase } from "../../shared/types.js";
import type { AnimationLibrary } from "./animation-loader.js";

export interface AnimationStateMachine {
	setPhase(phase: AgentPhase): void;
	update(delta: number): void;
	dispose(): void;
}

/** Phases that loop indefinitely. */
const LOOPING_PHASES = new Set<AgentPhase>(["idle", "speaking"]);

const PHASE_TRANSITION_FADE = 0.5;
const VARIETY_ROTATION_FADE = 0.3;

export function createStateMachine(
	mixer: THREE.AnimationMixer,
	library: AnimationLibrary,
): AnimationStateMachine {
	let currentPhase: AgentPhase | null = null;
	let currentAction: THREE.AnimationAction | null = null;
	let currentClipIndex = -1;

	function getClipPool(phase: AgentPhase): THREE.AnimationClip[] {
		return library.getClips(phase);
	}

	function pickClip(pool: THREE.AnimationClip[], excludeIndex: number): { clip: THREE.AnimationClip; index: number } | null {
		if (pool.length === 0) return null;
		if (pool.length === 1) return { clip: pool[0], index: 0 };

		// Pick a random clip that isn't the current one
		let index: number;
		do {
			index = Math.floor(Math.random() * pool.length);
		} while (index === excludeIndex && pool.length > 1);

		return { clip: pool[index], index };
	}

	function playClip(clip: THREE.AnimationClip, phase: AgentPhase, fadeIn: number): void {
		const action = mixer.clipAction(clip);
		action.reset();

		if (LOOPING_PHASES.has(phase)) {
			action.setLoop(THREE.LoopRepeat, Infinity);
		} else {
			action.setLoop(THREE.LoopOnce, 1);
			action.clampWhenFinished = true;
		}

		action.fadeIn(fadeIn).play();
		currentAction = action;
	}

	function onFinished(event: { action: THREE.AnimationAction }): void {
		if (event.action !== currentAction) return;
		if (!currentPhase) return;

		const pool = getClipPool(currentPhase);
		const pick = pickClip(pool, currentClipIndex);
		if (!pick) return;

		currentClipIndex = pick.index;
		currentAction.fadeOut(VARIETY_ROTATION_FADE);
		playClip(pick.clip, currentPhase, VARIETY_ROTATION_FADE);
	}

	mixer.addEventListener("finished", onFinished as THREE.EventListener<
		THREE.AnimationMixerEventMap["finished"],
		"finished",
		THREE.AnimationMixer
	>);

	return {
		setPhase(phase: AgentPhase): void {
			if (phase === currentPhase) return;

			const pool = getClipPool(phase);
			if (pool.length === 0) {
				// No clips for this phase: keep whatever is playing
				currentPhase = phase;
				return;
			}

			const pick = pickClip(pool, -1);
			if (!pick) return;

			currentPhase = phase;
			currentClipIndex = pick.index;

			if (currentAction) {
				currentAction.fadeOut(PHASE_TRANSITION_FADE);
			}

			playClip(pick.clip, phase, PHASE_TRANSITION_FADE);
		},

		update(delta: number): void {
			mixer.update(delta);
		},

		dispose(): void {
			mixer.removeEventListener("finished", onFinished as THREE.EventListener<
				THREE.AnimationMixerEventMap["finished"],
				"finished",
				THREE.AnimationMixer
			>);
			if (currentAction) currentAction.stop();
			mixer.stopAllAction();
			currentAction = null;
			currentPhase = null;
			currentClipIndex = -1;
		},
	};
}
