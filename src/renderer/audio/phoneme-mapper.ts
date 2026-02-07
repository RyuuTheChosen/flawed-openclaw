/**
 * Pure function module for mapping words to viseme frames.
 * Used by TTS to drive lip sync based on speech boundary events.
 */

export type Viseme = "aa" | "ih" | "ou" | "ee" | "oh";

export interface VisemeFrame {
	viseme: Viseme;
	duration: number; // ms
	weight: number; // 0-1
}

const DEFAULT_WEIGHT = 0.8;
const MIN_FRAME_DURATION = 40; // ms, minimum for smooth animation

// Phoneme patterns - order matters (more specific patterns first)
const PHONEME_RULES: Array<{ pattern: RegExp; visemes: Viseme[] }> = [
	// Common endings
	{ pattern: /tion$/i, visemes: ["oh", "ih"] },
	{ pattern: /sion$/i, visemes: ["oh", "ih"] },
	{ pattern: /ing$/i, visemes: ["ih"] },
	{ pattern: /ed$/i, visemes: ["ee"] },
	{ pattern: /ly$/i, visemes: ["ih", "ee"] },

	// Common beginnings
	{ pattern: /^th/i, visemes: ["oh"] },
	{ pattern: /^ch/i, visemes: ["ee"] },
	{ pattern: /^sh/i, visemes: ["ee"] },
	{ pattern: /^wh/i, visemes: ["ou"] },

	// Vowel combinations
	{ pattern: /oo/gi, visemes: ["ou"] },
	{ pattern: /ee/gi, visemes: ["ee"] },
	{ pattern: /ea/gi, visemes: ["ee"] },
	{ pattern: /ai/gi, visemes: ["ee"] },
	{ pattern: /ay/gi, visemes: ["ee"] },
	{ pattern: /ow/gi, visemes: ["oh", "ou"] },
	{ pattern: /ou/gi, visemes: ["aa", "ou"] },
	{ pattern: /oi/gi, visemes: ["oh", "ee"] },
	{ pattern: /oy/gi, visemes: ["oh", "ee"] },

	// Single vowels
	{ pattern: /[aá]/gi, visemes: ["aa"] },
	{ pattern: /[eé]/gi, visemes: ["ee"] },
	{ pattern: /[ií]/gi, visemes: ["ih"] },
	{ pattern: /[oó]/gi, visemes: ["oh"] },
	{ pattern: /[uú]/gi, visemes: ["ou"] },
	{ pattern: /y$/i, visemes: ["ee"] },
];

/**
 * Convert a word to a sequence of viseme frames.
 * Pure function - no side effects.
 *
 * @param word - The word to convert
 * @param durationMs - Total duration for this word in milliseconds
 * @returns Array of viseme frames
 */
export function wordToVisemes(word: string, durationMs: number): VisemeFrame[] {
	if (!word || durationMs <= 0) return [];

	const visemes: Viseme[] = [];
	let remaining = word.toLowerCase();

	// Apply rules to extract visemes
	for (const rule of PHONEME_RULES) {
		const matches = remaining.match(rule.pattern);
		if (matches) {
			for (const _match of matches) {
				visemes.push(...rule.visemes);
			}
			// Remove matched portions for more specific rules
			remaining = remaining.replace(rule.pattern, "");
		}
	}

	// Fallback: if no visemes extracted, use vowel-based approach
	if (visemes.length === 0) {
		const vowels = word.match(/[aeiouáéíóú]/gi) || [];
		for (const v of vowels) {
			const lower = v.toLowerCase();
			if (lower === "a" || lower === "á") visemes.push("aa");
			else if (lower === "e" || lower === "é") visemes.push("ee");
			else if (lower === "i" || lower === "í") visemes.push("ih");
			else if (lower === "o" || lower === "ó") visemes.push("oh");
			else if (lower === "u" || lower === "ú") visemes.push("ou");
		}
	}

	// If still no visemes, use a default mouth shape
	if (visemes.length === 0) {
		visemes.push("aa");
	}

	// Distribute duration across visemes
	const frameDuration = Math.max(MIN_FRAME_DURATION, durationMs / visemes.length);

	return visemes.map((viseme) => ({
		viseme,
		duration: frameDuration,
		weight: DEFAULT_WEIGHT,
	}));
}

/**
 * Estimate word duration based on character count and speaking rate.
 *
 * @param word - The word to estimate
 * @param rateMultiplier - Speaking rate (1.0 = normal, 0.5 = slow, 1.5 = fast)
 * @returns Estimated duration in milliseconds
 */
export function estimateWordDuration(word: string, rateMultiplier = 1.0): number {
	// Average speaking rate: ~150 words/min = ~400ms per word
	// Adjust by character count (longer words take longer)
	const baseMs = 300;
	const perCharMs = 30;
	const rawDuration = baseMs + word.length * perCharMs;
	return Math.round(rawDuration / rateMultiplier);
}
