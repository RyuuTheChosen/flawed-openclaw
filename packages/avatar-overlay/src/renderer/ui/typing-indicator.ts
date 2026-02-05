import { TYPING_DOT_DELAY_MS } from "../../shared/config.js";

export type IndicatorPhase = "thinking" | "working";

export interface TypingIndicator {
	element: HTMLElement;
	setPhase(phase: IndicatorPhase): void;
	destroy(): void;
}

export function createTypingIndicator(): TypingIndicator {
	const container = document.createElement("div");
	container.className = "typing-indicator";
	container.setAttribute("role", "status");
	container.setAttribute("aria-live", "polite");

	// Create 3 dots
	for (let i = 0; i < 3; i++) {
		const dot = document.createElement("span");
		dot.className = "typing-dot";
		dot.style.animationDelay = `${i * TYPING_DOT_DELAY_MS}ms`;
		container.appendChild(dot);
	}

	// Hidden text for screen readers
	const srText = document.createElement("span");
	srText.className = "sr-only";
	srText.textContent = "Agent is thinking";
	container.appendChild(srText);

	function setPhase(phase: IndicatorPhase): void {
		container.dataset.phase = phase;
		srText.textContent = phase === "thinking" ? "Agent is thinking" : "Agent is working";
	}

	function destroy(): void {
		container.remove();
	}

	return { element: container, setPhase, destroy };
}
