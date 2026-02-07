import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { createScene } from "./avatar/scene.js";
import { loadVrmModel, unloadVrmModel } from "./avatar/vrm-loader.js";
import { createAnimator, type Animator } from "./avatar/animator.js";
import { createTTSController, type TTSController } from "./audio/index.js";
import {
	createSpringBoneController,
	type SpringBoneController,
} from "./avatar/spring-bones.js";
import { createIBLEnhancer, type IBLEnhancer } from "./avatar/ibl-enhancer.js";
import { CAMERA_ZOOM_STEP, IBL_ENABLED, PIXEL_SAMPLE_THROTTLE_MS } from "../shared/config.js";
import { isTransparentAtPoint } from "./avatar/pixel-transparency.js";

const bridge = window.avatarBridge;

let currentVrm: VRM | null = null;
let animator: Animator | null = null;
let ttsController: TTSController | null = null;
let springBones: SpringBoneController | null = null;
let iblEnhancer: IBLEnhancer | null = null;

async function boot(): Promise<void> {
	const canvas = document.getElementById("avatar-canvas") as HTMLCanvasElement;
	const { renderer, scene, camera, setCameraZoom, getLights } = createScene(canvas);

	// Initialize IBL enhancer
	if (IBL_ENABLED) {
		iblEnhancer = createIBLEnhancer();
		iblEnhancer.computeSHFromLights(getLights());
	}

	// Track previous phase for TTS session management
	let previousPhase: string = "idle";

	// Register agent state listener early (before async VRM load)
	bridge.onAgentState((state) => {
		if (!animator) return;

		const isNewSpeakingSession = state.phase === "speaking" && previousPhase !== "speaking";

		switch (state.phase) {
			case "thinking":
				animator.setExpression("surprised");
				animator.setPhase("thinking");
				animator.stopLipSync();
				ttsController?.cancel();
				break;
			case "speaking":
				animator.setExpression("happy");
				animator.setPhase("speaking");
				if (state.text) {
					// If TTS is enabled, use audio-driven lip sync
					if (ttsController?.isEnabled()) {
						// Reset for new speaking session (transition from non-speaking to speaking)
						if (isNewSpeakingSession) {
							ttsController.resetForNewSession();
						}
						ttsController.queueText(state.text);
					} else {
						// Fallback to text-based lip sync
						animator.feedLipSyncText(state.text);
					}
				}
				break;
			case "working":
				animator.setExpression("relaxed");
				animator.setPhase("working");
				animator.stopLipSync();
				ttsController?.cancel();
				break;
			case "idle":
				animator.setExpression("neutral");
				animator.setPhase("idle");
				// Don't stop lip sync if TTS is enabled - let it finish naturally with the audio
				// Only stop if TTS is disabled (using text-based lip sync)
				if (!ttsController?.isEnabled()) {
					animator.stopLipSync();
				}
				// Don't cancel TTS on idle - let queued speech finish naturally
				// TTS will be cancelled when a new interaction starts (thinking/working)
				break;
		}

		previousPhase = state.phase;
	});

	// Initialize spring bone controller
	springBones = createSpringBoneController();

	// Track current scale for re-applying on model swap
	let currentScale = 1.0;

	// Model swap from tray or gateway agent switch
	bridge.onVrmModelChanged(async (newPath: string) => {
		if (currentVrm) unloadVrmModel(currentVrm, scene);
		try {
			currentVrm = await loadVrmModel(newPath, scene, (gltf) => {
				springBones?.setFromGltf(gltf);
			});
		} catch (err) {
			console.error("Failed to load VRM model, reverting to default:", err);
			const defaultPath = await bridge.getVrmPath();
			currentVrm = await loadVrmModel(defaultPath, scene, (gltf) => {
				springBones?.setFromGltf(gltf);
			});
		}
		if (animator) animator.setVrm(currentVrm);
		iblEnhancer?.enhanceVrm(currentVrm);
		if (currentVrm) currentVrm.scene.scale.setScalar(currentScale);
	});

	// Load default VRM
	const vrmPath = await bridge.getVrmPath();
	currentVrm = await loadVrmModel(vrmPath, scene, (gltf) => {
		springBones?.setFromGltf(gltf);
	});
	animator = createAnimator(currentVrm);
	iblEnhancer?.enhanceVrm(currentVrm);

	// Initialize TTS controller with persisted state
	const ttsEnabled = await bridge.getTtsEnabled();
	const ttsEngine = await bridge.getTtsEngine();
	const ttsVoice = await bridge.getTtsVoice();
	console.log("[TTS] Initializing with:", { ttsEnabled, ttsEngine, ttsVoice });
	ttsController = createTTSController(animator.getLipSync(), {
		enabled: ttsEnabled,
		engine: ttsEngine || "web-speech",
		voice: ttsVoice || "",
	});

	// Load animation clips (non-blocking, avatar shows procedural fallback while loading)
	const animConfig = await bridge.getAnimationsConfig();
	if (animConfig) {
		try {
			await animator.initAnimations(animConfig.clips);
		} catch (err) {
			console.error("Failed to load animations, keeping procedural fallback:", err);
		}
	}

	// Restore persisted camera zoom before first frame
	let currentZoom = await bridge.getCameraZoom();
	currentZoom = setCameraZoom(currentZoom);

	// Restore persisted scale
	function applyScale(scale: number): void {
		currentScale = scale;
		if (currentVrm) {
			currentVrm.scene.scale.setScalar(scale);
		}
	}

	const initialScale = await bridge.getScale();
	applyScale(initialScale);

	bridge.onScaleChanged((scale: number) => {
		applyScale(scale);
	});

	// Click-through via pixel sampling: ignore mouse when cursor is over transparent pixels
	const gl = renderer.getContext() as WebGLRenderingContext;
	const controlsEl = document.getElementById("controls");
	let isHoveredOpaque = false;
	let lastSampleTime = 0;

	document.addEventListener("mousemove", (e) => {
		const now = performance.now();
		if (now - lastSampleTime < PIXEL_SAMPLE_THROTTLE_MS) return;
		lastSampleTime = now;

		// Never enable click-through when cursor is over a UI control
		const overControls = controlsEl?.contains(e.target as Node) ?? false;

		const transparent = overControls
			? false
			: isTransparentAtPoint({
					gl,
					canvasEl: canvas,
					clientX: e.clientX,
					clientY: e.clientY,
				});

		if (transparent && isHoveredOpaque) {
			isHoveredOpaque = false;
			bridge.setIgnoreMouseEvents(true);
			if (animator) animator.setHovering(false);
			document.body.classList.remove("avatar-hovered");
		} else if (!transparent && !isHoveredOpaque) {
			isHoveredOpaque = true;
			bridge.setIgnoreMouseEvents(false);
			if (animator) animator.setHovering(true);
			document.body.classList.add("avatar-hovered");
		}
	});

	document.addEventListener("mouseleave", () => {
		if (isHoveredOpaque) {
			isHoveredOpaque = false;
			bridge.setIgnoreMouseEvents(true);
			if (animator) animator.setHovering(false);
			document.body.classList.remove("avatar-hovered");
		}
	});

	// Global cursor tracking for eye/head gaze (works outside window)
	bridge.onCursorPosition((x, y, screenWidth, screenHeight) => {
		if (animator) {
			animator.setGazeScreenPosition(x, y, screenWidth, screenHeight);
		}
	});
	bridge.startCursorTracking();

	// Validate required DOM elements
	const dragHandle = document.getElementById("drag-handle");
	const settingsBtn = document.getElementById("settings-btn");
	const chatToggleBtn = document.getElementById("chat-toggle-btn");
	const ttsToggleBtn = document.getElementById("tts-toggle-btn");

	if (!dragHandle || !settingsBtn || !chatToggleBtn || !ttsToggleBtn) {
		console.error("Missing required DOM elements:", {
			dragHandle: !!dragHandle,
			settingsBtn: !!settingsBtn,
			chatToggleBtn: !!chatToggleBtn,
			ttsToggleBtn: !!ttsToggleBtn,
		});
		return;
	}

	// Native drag via main process cursor tracking
	dragHandle.addEventListener("mousedown", () => {
		bridge.startDrag();
	});

	window.addEventListener("mouseup", () => {
		bridge.stopDrag();
	});

	// Scroll-wheel zoom
	window.addEventListener("wheel", (e) => {
		e.preventDefault();
		const direction = e.deltaY > 0 ? 1 : -1;
		currentZoom = setCameraZoom(currentZoom + direction * CAMERA_ZOOM_STEP);
		bridge.saveCameraZoom(currentZoom);
	}, { passive: false });

	// Camera zoom changed from main process (preset selection)
	bridge.onCameraZoomChanged((zoom: number) => {
		currentZoom = setCameraZoom(zoom);
		bridge.saveCameraZoom(currentZoom);
	});

	// Settings button → open settings window
	settingsBtn.addEventListener("click", () => {
		bridge.openSettings();
	});

	// Chat toggle button → toggle chat window via main process
	chatToggleBtn.addEventListener("click", () => {
		bridge.toggleChat();
	});

	// Listen for chat visibility changes to update button highlight
	bridge.onChatVisibility((visible: boolean) => {
		chatToggleBtn.classList.toggle("active", visible);
	});

	// Set initial TTS button state
	ttsToggleBtn.classList.toggle("active", ttsEnabled);

	ttsToggleBtn.addEventListener("click", () => {
		if (!ttsController) return;
		const newEnabled = !ttsController.isEnabled();
		ttsController.setEnabled(newEnabled);
		ttsToggleBtn.classList.toggle("active", newEnabled);
		bridge.setTtsEnabled(newEnabled);
	});

	// Update button state when TTS is enabled/disabled from elsewhere (e.g., context menu)
	bridge.onTtsEnabledChanged((enabled: boolean) => {
		if (ttsController) {
			ttsController.setEnabled(enabled);
		}
		ttsToggleBtn.classList.toggle("active", enabled);
	});

	// Update TTS engine when changed from context menu
	bridge.onTtsEngineChanged((engine: string) => {
		if (ttsController && (engine === "web-speech" || engine === "kokoro")) {
			ttsController.setEngine(engine);
		}
	});

	// Update TTS voice when changed from context menu
	bridge.onTtsVoiceChanged((voice: string) => {
		if (ttsController) {
			ttsController.setVoice(voice);
		}
	});

	// Update speaking animation on TTS state change
	if (ttsController) {
		ttsController.onSpeakingChange((speaking: boolean) => {
			ttsToggleBtn.classList.toggle("speaking", speaking);
		});
	}

	// Animation loop
	const clock = new THREE.Clock();

	function animate(): void {
		requestAnimationFrame(animate);
		const delta = clock.getDelta();
		const elapsed = clock.elapsedTime;

		if (currentVrm && animator) {
			animator.update(delta, elapsed);
			ttsController?.update(delta); // Pump wLipSync weights to lip sync
			springBones?.update(delta); // Update spring bones after animator
			currentVrm.update(delta);
		}

		renderer.render(scene, camera);
	}

	animate();
}

boot().catch(console.error);
