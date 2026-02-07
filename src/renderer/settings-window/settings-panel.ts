import {
	createSlider,
	createToggle,
	createSelect,
	createRadioGroup,
	createRow,
	createStackedRow,
	createSection,
	createButton,
} from "./settings-controls.js";

const TABS = ["Avatar", "Camera", "Voice", "Lighting", "Advanced"] as const;

export function createSettingsPanel(container: HTMLElement, bridge: SettingsBridge): void {
	// Title bar
	const titlebar = document.createElement("div");
	titlebar.className = "settings__titlebar";

	const titleText = document.createElement("span");
	titleText.className = "settings__titlebar-text";
	titleText.textContent = "Settings";

	const closeBtn = document.createElement("button");
	closeBtn.className = "settings__titlebar-close";
	closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
		<path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
	</svg>`;
	closeBtn.addEventListener("click", () => bridge.close());

	titlebar.appendChild(titleText);
	titlebar.appendChild(closeBtn);
	container.appendChild(titlebar);

	// Tab bar
	const tabBar = document.createElement("div");
	tabBar.className = "settings__tabs";

	const panels: Map<string, HTMLElement> = new Map();
	const tabButtons: Map<string, HTMLButtonElement> = new Map();

	for (const tab of TABS) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "settings__tab";
		btn.textContent = tab;
		if (tab === TABS[0]) btn.classList.add("is-active");

		btn.addEventListener("click", () => {
			for (const b of tabButtons.values()) b.classList.remove("is-active");
			btn.classList.add("is-active");
			for (const [name, panel] of panels) {
				panel.hidden = name !== tab;
			}
		});

		tabButtons.set(tab, btn);
		tabBar.appendChild(btn);
	}
	container.appendChild(tabBar);

	// Create panels
	for (const tab of TABS) {
		const panel = document.createElement("div");
		panel.className = "settings__panel";
		panel.hidden = tab !== TABS[0];
		panels.set(tab, panel);
		container.appendChild(panel);
	}

	// ── Avatar Tab ──
	const avatarPanel = panels.get("Avatar")!;
	const avatarSection = createSection("Model");

	const modelPathEl = document.createElement("div");
	modelPathEl.className = "settings__model-path";
	modelPathEl.textContent = "No model selected";
	avatarSection.appendChild(modelPathEl);

	const changeModelBtn = createButton("Change Model\u2026", {
		variant: "secondary",
		onClick: async () => {
			const path = await bridge.pickVrmFile();
			if (path) {
				modelPathEl.textContent = formatPath(path);
				modelPathEl.title = path;
			}
		},
	});
	avatarSection.appendChild(changeModelBtn);

	avatarPanel.appendChild(avatarSection);

	const scaleSection = createSection("Scale");
	const scaleSlider = createSlider({
		min: 0.5, max: 2.0, step: 0.1, value: 1.0,
		debounceMs: 50,
		onChange: (v) => bridge.setScale(v),
	});
	scaleSection.appendChild(createRow("Avatar Scale", scaleSlider.el));
	avatarPanel.appendChild(scaleSection);

	// ── Camera Tab ──
	const cameraPanel = panels.get("Camera")!;
	const framingSection = createSection("Framing");
	const framingRadio = createRadioGroup({
		options: [
			{ value: "0.6", label: "Head" },
			{ value: "1.5", label: "Upper Body" },
			{ value: "4.0", label: "Full Body" },
		],
		selected: "1.5",
		onChange: (v) => bridge.setCameraZoom(parseFloat(v)),
	});
	framingSection.appendChild(framingRadio.el);
	cameraPanel.appendChild(framingSection);

	const zoomSection = createSection("Zoom");
	const zoomSlider = createSlider({
		min: 0.5, max: 6.0, step: 0.2, value: 3.0,
		debounceMs: 50,
		onChange: (v) => bridge.setCameraZoom(v),
	});
	zoomSection.appendChild(createRow("Camera Zoom", zoomSlider.el));
	cameraPanel.appendChild(zoomSection);

	// ── Voice Tab ──
	const voicePanel = panels.get("Voice")!;
	const ttsSection = createSection("Text-to-Speech");

	const ttsToggle = createToggle({
		initial: false,
		onChange: (v) => bridge.setTtsEnabled(v),
	});
	ttsSection.appendChild(createRow("Enable TTS", ttsToggle.el));

	const engineSelect = createSelect({
		options: [
			{ value: "web-speech", label: "Web Speech (System)" },
			{ value: "kokoro", label: "Kokoro (Local AI)" },
		],
		selected: "web-speech",
		onChange: (v) => bridge.setTtsEngine(v as "web-speech" | "kokoro"),
	});
	ttsSection.appendChild(createRow("Engine", engineSelect.el));

	const voiceInput = document.createElement("input");
	voiceInput.type = "text";
	voiceInput.className = "settings__text-input";
	voiceInput.placeholder = "Voice name (optional)";
	let voiceDebounce: ReturnType<typeof setTimeout> | null = null;
	voiceInput.addEventListener("input", () => {
		if (voiceDebounce) clearTimeout(voiceDebounce);
		voiceDebounce = setTimeout(() => bridge.setTtsVoice(voiceInput.value), 300);
	});
	ttsSection.appendChild(createStackedRow("Voice", voiceInput));

	voicePanel.appendChild(ttsSection);

	// ── Lighting Tab ──
	const lightingPanel = panels.get("Lighting")!;
	const profileSection = createSection("Profile");

	const lightingRadio = createRadioGroup({
		options: [
			{ value: "studio", label: "Studio" },
			{ value: "warm", label: "Warm" },
			{ value: "cool", label: "Cool" },
			{ value: "neutral", label: "Neutral" },
			{ value: "custom", label: "Custom" },
		],
		selected: "studio",
		onChange: (v) => {
			bridge.setLightingProfile(v);
			customControls.style.display = v === "custom" ? "block" : "none";
		},
	});
	profileSection.appendChild(lightingRadio.el);
	lightingPanel.appendChild(profileSection);

	// Custom lighting controls (hidden by default)
	const customControls = document.createElement("div");
	customControls.style.display = "none";

	const customSection = createSection("Custom Settings");
	const intensitySlider = createSlider({
		min: 0, max: 2, step: 0.1, value: 0.3,
		debounceMs: 50,
		onChange: () => sendCustomLighting(),
	});
	customSection.appendChild(createRow("Intensity", intensitySlider.el));

	const ambientSlider = createSlider({
		min: 0, max: 1, step: 0.05, value: 0.5,
		debounceMs: 50,
		onChange: () => sendCustomLighting(),
	});
	customSection.appendChild(createRow("Ambient", ambientSlider.el));

	const colorInput = document.createElement("input");
	colorInput.type = "color";
	colorInput.className = "settings__color-input";
	colorInput.value = "#ffffff";
	colorInput.addEventListener("input", () => sendCustomLighting());
	customSection.appendChild(createRow("Color", colorInput));

	customControls.appendChild(customSection);
	lightingPanel.appendChild(customControls);

	function sendCustomLighting(): void {
		bridge.setLightingCustom({
			intensity: parseFloat((intensitySlider.el.querySelector("input") as HTMLInputElement).value),
			color: colorInput.value,
			ambient: parseFloat((ambientSlider.el.querySelector("input") as HTMLInputElement).value),
		});
	}

	// ── Advanced Tab ──
	const advancedPanel = panels.get("Advanced")!;

	const opacitySection = createSection("Appearance");
	const opacitySlider = createSlider({
		min: 0.3, max: 1.0, step: 0.05, value: 1.0,
		debounceMs: 50,
		onChange: (v) => bridge.setOpacity(v),
	});
	opacitySection.appendChild(createRow("Opacity", opacitySlider.el));
	advancedPanel.appendChild(opacitySection);

	const timeoutSection = createSection("Chat");
	const timeoutSelect = createSelect({
		options: [
			{ value: "5000", label: "5 seconds" },
			{ value: "10000", label: "10 seconds" },
			{ value: "30000", label: "30 seconds" },
			{ value: "0", label: "Never" },
		],
		selected: "10000",
		onChange: (v) => bridge.setIdleTimeout(parseInt(v, 10)),
	});
	timeoutSection.appendChild(createRow("Auto-hide", timeoutSelect.el));
	advancedPanel.appendChild(timeoutSection);

	const positionSection = createSection("Position");
	const snapGrid = document.createElement("div");
	snapGrid.style.display = "grid";
	snapGrid.style.gridTemplateColumns = "1fr 1fr";
	snapGrid.style.gap = "6px";

	const corners = [
		{ value: "topLeft", label: "Top Left" },
		{ value: "topRight", label: "Top Right" },
		{ value: "bottomLeft", label: "Bottom Left" },
		{ value: "bottomRight", label: "Bottom Right" },
	] as const;

	for (const corner of corners) {
		const btn = createButton(corner.label, {
			variant: "secondary",
			onClick: () => bridge.snapTo(corner.value),
		});
		snapGrid.appendChild(btn);
	}
	positionSection.appendChild(snapGrid);
	advancedPanel.appendChild(positionSection);

	// Clear chat
	const chatActionsSection = createSection("Actions");
	const clearChatBtn = createButton("Clear Chat History", {
		variant: "secondary",
		onClick: () => bridge.clearChat(),
	});
	chatActionsSection.appendChild(clearChatBtn);
	advancedPanel.appendChild(chatActionsSection);

	// ── Init: Populate controls from persisted settings ──
	bridge.getSettings().then((settings) => {
		// Avatar tab
		if (settings.vrmModelPath) {
			modelPathEl.textContent = formatPath(settings.vrmModelPath);
			modelPathEl.title = settings.vrmModelPath;
		}
		scaleSlider.setValue(settings.scale);

		// Camera tab
		zoomSlider.setValue(settings.zoom);
		// Match closest framing preset
		const presets = [0.6, 1.5, 4.0];
		const closest = presets.reduce((a, b) =>
			Math.abs(b - settings.zoom) < Math.abs(a - settings.zoom) ? b : a,
		);
		framingRadio.setValue(String(closest));

		// Voice tab
		ttsToggle.setValue(settings.ttsEnabled);
		engineSelect.setValue(settings.ttsEngine);
		voiceInput.value = settings.ttsVoice || "";

		// Lighting tab
		lightingRadio.setValue(settings.lightingProfile);
		customControls.style.display = settings.lightingProfile === "custom" ? "block" : "none";
		if (settings.lightingCustom) {
			intensitySlider.setValue(settings.lightingCustom.intensity);
			ambientSlider.setValue(settings.lightingCustom.ambient);
			colorInput.value = settings.lightingCustom.color;
		}

		// Advanced tab
		opacitySlider.setValue(settings.opacity);
		timeoutSelect.setValue(String(settings.idleTimeoutMs));
	});

	// ── Live sync: Update controls from external changes ──
	bridge.onOpacityChanged((v) => opacitySlider.setValue(v));
	bridge.onScaleChanged((v) => scaleSlider.setValue(v));
	bridge.onCameraZoomChanged((v) => {
		zoomSlider.setValue(v);
		const presets = [0.6, 1.5, 4.0];
		const closest = presets.reduce((a, b) =>
			Math.abs(b - v) < Math.abs(a - v) ? b : a,
		);
		framingRadio.setValue(String(closest));
	});
	bridge.onTtsEnabledChanged((v) => ttsToggle.setValue(v));
	bridge.onTtsEngineChanged((v) => engineSelect.setValue(v));
	bridge.onTtsVoiceChanged((v) => { voiceInput.value = v; });
	bridge.onIdleTimeoutChanged((ms) => timeoutSelect.setValue(String(ms)));
	bridge.onLightingProfileChanged((v) => {
		lightingRadio.setValue(v);
		customControls.style.display = v === "custom" ? "block" : "none";
	});
	bridge.onLightingCustomChanged((v) => {
		intensitySlider.setValue(v.intensity);
		ambientSlider.setValue(v.ambient);
		colorInput.value = v.color;
	});
	bridge.onVrmModelChanged((path) => {
		modelPathEl.textContent = formatPath(path);
		modelPathEl.title = path;
	});
}

function formatPath(fullPath: string): string {
	const parts = fullPath.replace(/\\/g, "/").split("/");
	const filename = parts[parts.length - 1] || fullPath;
	return filename;
}
