interface LightingCustom {
	intensity: number;
	color: string;
	ambient: number;
}

interface SettingsBridge {
	// Getters (async invoke)
	getSettings(): Promise<{
		opacity: number;
		scale: number;
		zoom: number;
		ttsEnabled: boolean;
		ttsEngine: "web-speech" | "kokoro";
		ttsVoice: string;
		lightingProfile: string;
		lightingCustom?: LightingCustom;
		vrmModelPath?: string;
		idleTimeoutMs: number;
	}>;

	// Setters (fire-and-forget send)
	setOpacity(v: number): void;
	setScale(v: number): void;
	setCameraZoom(v: number): void;
	setTtsEnabled(v: boolean): void;
	setTtsEngine(v: "web-speech" | "kokoro"): void;
	setTtsVoice(v: string): void;
	setIdleTimeout(ms: number): void;
	setLightingProfile(profile: string): void;
	setLightingCustom(custom: LightingCustom): void;

	// Actions
	pickVrmFile(): Promise<string | null>;
	snapTo(corner: "bottomRight" | "bottomLeft" | "topRight" | "topLeft"): void;
	clearChat(): void;
	close(): void;

	// Change listeners (main -> settings renderer)
	onOpacityChanged(cb: (v: number) => void): void;
	onScaleChanged(cb: (v: number) => void): void;
	onCameraZoomChanged(cb: (v: number) => void): void;
	onTtsEnabledChanged(cb: (v: boolean) => void): void;
	onTtsEngineChanged(cb: (v: string) => void): void;
	onTtsVoiceChanged(cb: (v: string) => void): void;
	onIdleTimeoutChanged(cb: (ms: number) => void): void;
	onLightingProfileChanged(cb: (v: string) => void): void;
	onLightingCustomChanged(cb: (v: LightingCustom) => void): void;
	onVrmModelChanged(cb: (path: string) => void): void;
}

interface Window {
	settingsBridge: SettingsBridge;
}
