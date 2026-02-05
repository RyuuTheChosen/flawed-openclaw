export type IconName = "drag" | "chat" | "settings" | "send" | "close";

const ICONS: Record<IconName, string> = {
	drag: `<circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="11" cy="12" r="1"/>`,
	chat: `<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5l-3.5 2.5v-2.5h-.5a1 1 0 0 1-1-1v-6z"/>`,
	settings: `<circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4"/>`,
	send: `<path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z"/>`,
	close: `<path d="M4 4l8 8M12 4l-8 8"/>`,
};

export interface IconOptions {
	size?: number;
	ariaLabel?: string;
	className?: string;
}

export function createIcon(name: IconName, options: IconOptions = {}): SVGSVGElement {
	const { size = 16, ariaLabel, className } = options;

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("fill", name === "drag" ? "currentColor" : "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "1.5");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");

	if (ariaLabel) {
		svg.setAttribute("aria-label", ariaLabel);
		svg.setAttribute("role", "img");
	} else {
		svg.setAttribute("aria-hidden", "true");
	}

	if (className) {
		svg.setAttribute("class", className);
	}

	svg.innerHTML = ICONS[name];
	return svg;
}

export function getIconSVG(name: IconName): string {
	return ICONS[name];
}
