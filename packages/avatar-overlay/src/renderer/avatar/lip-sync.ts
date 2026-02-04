import type { VRM } from "@pixiv/three-vrm";

type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";

const ALL_VISEMES: Viseme[] = ["aa", "ih", "ou", "ee", "oh"];
const CHAR_DURATION = 0.05; // 50ms per character
const VISEME_LERP_SPEED = 15; // fast lerp for snappy mouth movement
const NON_WORD_RE = /[^\w]/;

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
}

export function createLipSync(vrm: VRM): LipSync {
	let currentVrm = vrm;
	let queue: string[] = [];
	let readIndex = 0;
	let timer = 0;
	let activeViseme: Viseme | null = null;
	const weights: Record<Viseme, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

	function resetQueue(): void {
		queue = [];
		readIndex = 0;
		timer = 0;
		activeViseme = null;
	}

	return {
		feedText(text: string): void {
			// If queue was fully consumed, start fresh to avoid unbounded growth
			if (readIndex > 0 && readIndex >= queue.length) {
				queue = [];
				readIndex = 0;
			}
			queue.push(...text);
		},

		stop(): void {
			resetQueue();
		},

		update(delta: number): void {
			const expr = currentVrm.expressionManager;
			if (!expr) return;

			const remaining = queue.length - readIndex;

			if (remaining > 0) {
				timer += delta;
				while (timer >= CHAR_DURATION && readIndex < queue.length) {
					timer -= CHAR_DURATION;
					const ch = queue[readIndex++].toLowerCase();
					if (ch === " " || ch === "\n" || NON_WORD_RE.test(ch)) {
						activeViseme = null;
					} else {
						activeViseme = CHAR_TO_VISEME[ch] ?? "aa";
					}
				}
			}

			// Queue fully consumed → close mouth, cap timer to prevent accumulation
			if (readIndex >= queue.length) {
				activeViseme = null;
				timer = Math.min(timer, CHAR_DURATION);
			}

			const step = Math.min(delta * VISEME_LERP_SPEED, 1);
			for (const v of ALL_VISEMES) {
				const goal = v === activeViseme ? 0.8 : 0;
				weights[v] += (goal - weights[v]) * step;
				expr.setValue(v, weights[v]);
			}
		},

		isSpeaking(): boolean {
			return readIndex < queue.length;
		},

		setVrm(vrm: VRM): void {
			currentVrm = vrm;
			resetQueue();
			for (const v of ALL_VISEMES) weights[v] = 0;
		},
	};
}
