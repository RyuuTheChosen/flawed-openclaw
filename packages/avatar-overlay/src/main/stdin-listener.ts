import * as readline from "node:readline";

export type StdinCommand =
	| { type: "show" }
	| { type: "hide" }
	| { type: "shutdown" }
	| { type: "model-switch"; vrmPath: string };

/**
 * Listen for newline-delimited JSON commands on stdin.
 * Returns a cleanup function to stop listening.
 */
export function createStdinListener(handler: (cmd: StdinCommand) => void): () => void {
	const rl = readline.createInterface({ input: process.stdin });

	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		try {
			const parsed = JSON.parse(trimmed);
			if (typeof parsed?.type === "string") {
				if (parsed.type === "model-switch" && typeof parsed.vrmPath !== "string") return;
				handler(parsed as StdinCommand);
			}
		} catch {
			// Ignore malformed lines
		}
	});

	return () => {
		rl.close();
	};
}
