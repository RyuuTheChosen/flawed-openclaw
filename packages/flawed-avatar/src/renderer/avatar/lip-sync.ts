import type { VRM } from "@pixiv/three-vrm";
import type { VisemeFrame } from "../audio/phoneme-mapper.js";

export type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";
export type LipSyncMode = "text" | "audio";

const ALL_VISEMES: Viseme[] = ["aa", "ih", "ou", "ee", "oh"];
const CHAR_DURATION = 0.05; // 50ms per character
const VISEME_LERP_SPEED = 15; // fast lerp for snappy mouth movement
const NON_WORD_RE = /[^\w]/;
const MAX_QUEUE_SIZE = 10_000;
const MAX_VISEME_QUEUE = 100; // For audio mode

const CHAR_TO_VISEME: Record<string, Viseme> = {
	a: "aa", á: "aa", à: "aa",
	i: "ih", í: "ih", ì: "ih", y: "ih",
	u: "ou", ú: "ou", ù: "ou",
	e: "ee", é: "ee", è: "ee",
	o: "oh", ó: "oh", ò: "oh",
};

export interface LipSync {
	feedText(text: string): void;
	stop(): void;
	update(delta: number): void;
	isSpeaking(): boolean;
	setVrm(vrm: VRM): void;

	// Audio mode API
	setMode(mode: LipSyncMode): void;
	getMode(): LipSyncMode;
	feedVisemeFrames(frames: VisemeFrame[]): void;
	clearQueue(): void;

	// Audio-reactive intensity
	setEnergyMultiplier(energy: number): void;

	// Realtime audio-driven weights (from wLipSync analyzer)
	setRealtimeWeights(weights: Record<Viseme, number>): void;
}

export function createLipSync(vrm: VRM): LipSync {
	let currentVrm = vrm;
	let mode: LipSyncMode = "text";

	// Text mode state
	let textQueue: string[] = [];
	let textReadIndex = 0;
	let textTimer = 0;

	// Audio mode state
	let visemeQueue: VisemeFrame[] = [];
	let visemeTimer = 0;
	let currentVisemeIndex = 0;

	// Shared state
	let activeViseme: Viseme | null = null;
	const weights: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
	let energyMultiplier = 1.0;

	// Realtime weights from wLipSync (bypasses text/audio queue)
	let realtimeActive = false;
	const realtimeWeights: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

	function resetTextQueue(): void {
		textQueue = [];
		textReadIndex = 0;
		textTimer = 0;
	}

	function resetVisemeQueue(): void {
		visemeQueue = [];
		visemeTimer = 0;
		currentVisemeIndex = 0;
	}

	function resetAll(): void {
		resetTextQueue();
		resetVisemeQueue();
		activeViseme = null;
		realtimeActive = false;
		for (const v of ALL_VISEMES) realtimeWeights[v] = 0;
	}

	function updateTextMode(delta: number): void {
		const remaining = textQueue.length - textReadIndex;

		if (remaining > 0) {
			textTimer += delta;
			while (textTimer >= CHAR_DURATION && textReadIndex < textQueue.length) {
				textTimer -= CHAR_DURATION;
				const ch = textQueue[textReadIndex++].toLowerCase();
				if (ch === " " || ch === "\n" || NON_WORD_RE.test(ch)) {
					activeViseme = null;
				} else {
					activeViseme = CHAR_TO_VISEME[ch] ?? "aa";
				}
			}
		}

		// Queue fully consumed → close mouth, cap timer to prevent accumulation
		if (textReadIndex >= textQueue.length) {
			activeViseme = null;
			textTimer = Math.min(textTimer, CHAR_DURATION);
		}
	}

	function updateAudioMode(delta: number): void {
		if (visemeQueue.length === 0 || currentVisemeIndex >= visemeQueue.length) {
			activeViseme = null;
			return;
		}

		visemeTimer += delta * 1000; // Convert to ms

		// Advance through viseme frames based on their durations
		while (currentVisemeIndex < visemeQueue.length) {
			const frame = visemeQueue[currentVisemeIndex];
			if (visemeTimer < frame.duration) {
				// Still in current frame
				activeViseme = frame.viseme;
				break;
			}
			// Move to next frame
			visemeTimer -= frame.duration;
			currentVisemeIndex++;
		}

		// Queue exhausted
		if (currentVisemeIndex >= visemeQueue.length) {
			activeViseme = null;
			// Clean up consumed frames
			visemeQueue = [];
			currentVisemeIndex = 0;
			visemeTimer = 0;
		}
	}

	return {
		feedText(text: string): void {
			// If queue was fully consumed, start fresh to avoid unbounded growth
			if (textReadIndex > 0 && textReadIndex >= textQueue.length) {
				textQueue = [];
				textReadIndex = 0;
			}
			const available = MAX_QUEUE_SIZE - (textQueue.length - textReadIndex);
			if (text.length > available) {
				textQueue.push(...[...text].slice(0, Math.max(0, available)));
			} else {
				textQueue.push(...text);
			}
		},

		stop(): void {
			resetAll();
		},

		update(delta: number): void {
			const expr = currentVrm.expressionManager;
			if (!expr) {
				console.warn("[LipSync] No expressionManager!");
				return;
			}

			if (realtimeActive) {
				// Realtime mode: use wLipSync weights directly with max-merge
				for (const v of ALL_VISEMES) {
					const goal = realtimeWeights[v];
					const step = Math.min(delta * VISEME_LERP_SPEED, 1);
					weights[v] += (goal - weights[v]) * step;
					// Max-merge: preserve expression values when lip sync is silent
					const current = expr.getValue(v) ?? 0;
					expr.setValue(v, Math.max(current, weights[v]));
				}
			} else {
				// Text/audio queue mode
				if (mode === "text") {
					updateTextMode(delta);
				} else {
					updateAudioMode(delta);
				}

				// Apply viseme weights with smooth lerping, energy modulation, and max-merge
				const step = Math.min(delta * VISEME_LERP_SPEED, 1);
				for (const v of ALL_VISEMES) {
					const baseGoal = v === activeViseme ? 0.8 : 0;
					const goal = baseGoal * energyMultiplier;
					weights[v] += (goal - weights[v]) * step;
					// Max-merge: preserve expression values when lip sync is silent
					const current = expr.getValue(v) ?? 0;
					expr.setValue(v, Math.max(current, weights[v]));
				}
			}
		},

		isSpeaking(): boolean {
			if (mode === "text") {
				return textReadIndex < textQueue.length;
			}
			return visemeQueue.length > 0 && currentVisemeIndex < visemeQueue.length;
		},

		setVrm(vrm: VRM): void {
			currentVrm = vrm;
			resetAll();
			for (const v of ALL_VISEMES) weights[v] = 0;
		},

		// Audio mode API
		setMode(newMode: LipSyncMode): void {
			if (mode === newMode) return;
			console.log(`[LipSync] setMode: ${mode} -> ${newMode}`);
			mode = newMode;
			realtimeActive = false; // Switching modes disables realtime
			// Clear the other mode's queue when switching
			if (newMode === "text") {
				resetVisemeQueue();
			} else {
				resetTextQueue();
			}
		},

		getMode(): LipSyncMode {
			return mode;
		},

		feedVisemeFrames(frames: VisemeFrame[]): void {
			// Cap queue size to prevent unbounded growth
			const available = MAX_VISEME_QUEUE - visemeQueue.length;
			if (frames.length > available) {
				// Drop oldest frames to make room
				const toRemove = frames.length - available;
				visemeQueue = visemeQueue.slice(toRemove);
			}
			visemeQueue.push(...frames);
		},

		clearQueue(): void {
			if (mode === "text") {
				resetTextQueue();
			} else {
				resetVisemeQueue();
			}
			activeViseme = null;
		},

		setEnergyMultiplier(energy: number): void {
			energyMultiplier = Math.max(0, Math.min(1, energy));
		},

		setRealtimeWeights(newWeights: Record<Viseme, number>): void {
			realtimeActive = true;
			for (const v of ALL_VISEMES) {
				realtimeWeights[v] = newWeights[v] ?? 0;
			}
		},
	};
}
