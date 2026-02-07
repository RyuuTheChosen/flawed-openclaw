// Reusable form control factories for settings panel

function debounce(fn: (v: number) => void, ms: number): (v: number) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (v: number) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(v), ms);
	};
}

export interface SliderHandle {
	el: HTMLElement;
	setValue(v: number): void;
}

export function createSlider(opts: {
	min: number;
	max: number;
	step: number;
	value: number;
	label?: string;
	debounceMs?: number;
	onChange: (v: number) => void;
}): SliderHandle {
	const el = document.createElement("div");
	el.style.display = "flex";
	el.style.alignItems = "center";
	el.style.gap = "8px";
	el.style.width = "100%";

	const input = document.createElement("input");
	input.type = "range";
	input.className = "settings__range";
	input.min = String(opts.min);
	input.max = String(opts.max);
	input.step = String(opts.step);
	input.value = String(opts.value);
	input.style.flex = "1";

	const valueDisplay = document.createElement("span");
	valueDisplay.className = "settings__value";
	valueDisplay.style.minWidth = "36px";
	valueDisplay.textContent = formatSliderValue(opts.value, opts.step);

	const debouncedChange = opts.debounceMs
		? debounce(opts.onChange, opts.debounceMs)
		: opts.onChange;

	input.addEventListener("input", () => {
		const v = parseFloat(input.value);
		valueDisplay.textContent = formatSliderValue(v, opts.step);
		debouncedChange(v);
	});

	el.appendChild(input);
	el.appendChild(valueDisplay);

	return {
		el,
		setValue(v: number) {
			input.value = String(v);
			valueDisplay.textContent = formatSliderValue(v, opts.step);
		},
	};
}

function formatSliderValue(v: number, step: number): string {
	const decimals = step < 1 ? Math.max(1, String(step).split(".")[1]?.length ?? 1) : 0;
	return v.toFixed(decimals);
}

export interface ToggleHandle {
	el: HTMLElement;
	setValue(v: boolean): void;
}

export function createToggle(opts: {
	initial: boolean;
	onChange: (v: boolean) => void;
}): ToggleHandle {
	const el = document.createElement("div");
	el.className = "settings__toggle";
	if (opts.initial) el.classList.add("is-on");

	let value = opts.initial;

	el.addEventListener("click", () => {
		value = !value;
		el.classList.toggle("is-on", value);
		opts.onChange(value);
	});

	return {
		el,
		setValue(v: boolean) {
			value = v;
			el.classList.toggle("is-on", v);
		},
	};
}

export interface SelectHandle {
	el: HTMLSelectElement;
	setValue(v: string): void;
}

export function createSelect(opts: {
	options: { value: string; label: string }[];
	selected: string;
	onChange: (v: string) => void;
}): SelectHandle {
	const el = document.createElement("select");
	el.className = "settings__select";

	for (const opt of opts.options) {
		const option = document.createElement("option");
		option.value = opt.value;
		option.textContent = opt.label;
		if (opt.value === opts.selected) option.selected = true;
		el.appendChild(option);
	}

	el.addEventListener("change", () => {
		opts.onChange(el.value);
	});

	return {
		el,
		setValue(v: string) {
			el.value = v;
		},
	};
}

export interface RadioGroupHandle {
	el: HTMLElement;
	setValue(v: string): void;
}

export function createRadioGroup(opts: {
	options: { value: string; label: string }[];
	selected: string;
	onChange: (v: string) => void;
}): RadioGroupHandle {
	const el = document.createElement("div");
	el.className = "settings__radio-group";
	const buttons: Map<string, HTMLButtonElement> = new Map();

	for (const opt of opts.options) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "settings__radio";
		btn.textContent = opt.label;
		btn.dataset.value = opt.value;
		if (opt.value === opts.selected) btn.classList.add("is-selected");
		btn.addEventListener("click", () => {
			for (const b of buttons.values()) b.classList.remove("is-selected");
			btn.classList.add("is-selected");
			opts.onChange(opt.value);
		});
		buttons.set(opt.value, btn);
		el.appendChild(btn);
	}

	return {
		el,
		setValue(v: string) {
			for (const [value, btn] of buttons) {
				btn.classList.toggle("is-selected", value === v);
			}
		},
	};
}

export function createRow(label: string, control: HTMLElement): HTMLElement {
	const row = document.createElement("div");
	row.className = "settings__row";

	const labelEl = document.createElement("span");
	labelEl.className = "settings__label";
	labelEl.textContent = label;

	row.appendChild(labelEl);
	row.appendChild(control);
	return row;
}

export function createStackedRow(label: string, control: HTMLElement): HTMLElement {
	const row = document.createElement("div");
	row.className = "settings__row settings__row--stacked";

	const labelEl = document.createElement("span");
	labelEl.className = "settings__label";
	labelEl.textContent = label;

	row.appendChild(labelEl);
	row.appendChild(control);
	return row;
}

export function createSection(title: string): HTMLElement {
	const section = document.createElement("div");
	section.className = "settings__section";

	const titleEl = document.createElement("div");
	titleEl.className = "settings__section-title";
	titleEl.textContent = title;

	section.appendChild(titleEl);
	return section;
}

export function createButton(label: string, opts?: {
	variant?: "primary" | "secondary" | "ghost";
	onClick?: () => void;
}): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = `btn btn--${opts?.variant ?? "secondary"}`;
	btn.textContent = label;
	if (opts?.onClick) btn.addEventListener("click", opts.onClick);
	return btn;
}
