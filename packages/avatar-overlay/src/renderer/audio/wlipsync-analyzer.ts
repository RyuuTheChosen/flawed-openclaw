/**
 * Standalone wLipSync audio analyzer using MFCC analysis.
 * Produces per-viseme weights with winner/runner selection and exponential smoothing.
 * No awareness of lip-sync.ts or tts-controller.ts.
 */

import type { Profile } from "wlipsync";
import { createWLipSyncNode } from "wlipsync";

import {
	WLIPSYNC_WINNER_CAP,
	WLIPSYNC_RUNNER_CAP,
	WLIPSYNC_ATTACK,
	WLIPSYNC_RELEASE,
	WLIPSYNC_SILENCE_VOL,
	WLIPSYNC_SILENCE_IDLE_MS,
} from "../../shared/config.js";

// Profile loaded dynamically to avoid JSON import attribute issues
let profileCache: any = null;
async function loadProfile(): Promise<any> {
	if (profileCache) return profileCache;
	const resp = await fetch(new URL("./lip-sync-profile.json", import.meta.url));
	profileCache = await resp.json();
	return profileCache;
}

export type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";

const RAW_KEYS = ["A", "E", "I", "O", "U", "S"] as const;
type RawKey = typeof RAW_KEYS[number];
type LipKey = "A" | "E" | "I" | "O" | "U";

const LIP_KEYS: LipKey[] = ["A", "E", "I", "O", "U"];

const BLENDSHAPE_MAP: Record<LipKey, Viseme> = {
	A: "aa",
	E: "ee",
	I: "ih",
	O: "oh",
	U: "ou",
};

const RAW_TO_LIP: Record<RawKey, LipKey> = {
	A: "A",
	E: "E",
	I: "I",
	O: "O",
	U: "U",
	S: "I", // Sibilant → front vowel shape
};

export interface WLipSyncAnalyzer {
	/** The AudioNode to connect sources to (parallel tap) */
	readonly node: AudioNode;
	/** Read current smoothed viseme weights after winner/runner processing */
	getWeights(): Record<Viseme, number>;
	/** Call each frame to advance smoothing */
	update(delta: number): void;
	dispose(): void;
}

export async function createWLipSyncAnalyzer(audioContext: AudioContext): Promise<WLipSyncAnalyzer> {
	const profile = await loadProfile();
	const node = await createWLipSyncNode(audioContext, profile as Profile);

	const smoothState: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 };
	let lastActiveAt = 0;

	function update(delta: number): void {
		const vol = (node as any).volume ?? 0;
		const amp = Math.min(vol * 0.9, 1) ** 0.7;

		// Remap wLipSync output AEIOUS → AEIOU
		const projected: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 };
		for (const raw of RAW_KEYS) {
			const lip = RAW_TO_LIP[raw];
			const rawVal = ((node as any).weights as Record<string, number>)?.[raw] ?? 0;
			projected[lip] = Math.max(projected[lip], rawVal * amp);
		}

		// Winner + runner: find top 2 visemes
		let winner: LipKey = "I";
		let runner: LipKey = "E";
		let winnerVal = -Infinity;
		let runnerVal = -Infinity;
		for (const key of LIP_KEYS) {
			const val = projected[key];
			if (val > winnerVal) {
				runnerVal = winnerVal;
				runner = winner;
				winnerVal = val;
				winner = key;
			} else if (val > runnerVal) {
				runnerVal = val;
				runner = key;
			}
		}

		// Silence detection
		const now = performance.now();
		let silent = amp < WLIPSYNC_SILENCE_VOL || winnerVal < 0.05;
		if (!silent) lastActiveAt = now;
		if (now - lastActiveAt > WLIPSYNC_SILENCE_IDLE_MS) silent = true;

		// Build target weights
		const target: Record<LipKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 };
		if (!silent) {
			target[winner] = Math.min(WLIPSYNC_WINNER_CAP, winnerVal);
			target[runner] = Math.min(WLIPSYNC_RUNNER_CAP, runnerVal * 0.6);
		}

		// Exponential smoothing
		for (const key of LIP_KEYS) {
			const from = smoothState[key];
			const to = target[key];
			const rate = 1 - Math.exp(-(to > from ? WLIPSYNC_ATTACK : WLIPSYNC_RELEASE) * delta);
			smoothState[key] = from + (to - from) * rate;
			if (smoothState[key] <= 0.01) smoothState[key] = 0;
		}
	}

	function getWeights(): Record<Viseme, number> {
		const result: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
		for (const key of LIP_KEYS) {
			result[BLENDSHAPE_MAP[key]] = smoothState[key] * 0.7;
		}
		return result;
	}

	function dispose(): void {
		try {
			(node as AudioNode).disconnect();
		} catch {
			// Already disconnected
		}
	}

	return {
		node: node as unknown as AudioNode,
		getWeights,
		update,
		dispose,
	};
}
