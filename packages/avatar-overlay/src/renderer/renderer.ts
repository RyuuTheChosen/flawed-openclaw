import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { createScene } from "./avatar/scene.js";
import { loadVrmModel, unloadVrmModel } from "./avatar/vrm-loader.js";
import { createAnimator, type Animator } from "./avatar/animator.js";
import { createTTSController, type TTSController } from "./audio/index.js";
import { CAMERA_ZOOM_STEP } from "../shared/config.js";

const bridge = window.avatarBridge;

let currentVrm: VRM | null = null;
let animator: Animator | null = null;
let ttsController: TTSController | null = null;

async function boot(): Promise<void> {
	const canvas = document.getElementById("avatar-canvas") as HTMLCanvasElement;
	const { renderer, scene, camera, setCameraZoom } = createScene(canvas);

	// Register agent state listener early (before async VRM load)
	bridge.onAgentState((state) => {
		if (!animator) return;

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
				animator.stopLipSync();
				ttsController?.cancel();
				break;
		}
	});

	// Model swap from tray or gateway agent switch
	bridge.onVrmModelChanged(async (newPath: string) => {
		if (currentVrm) unloadVrmModel(currentVrm, scene);
		try {
			currentVrm = await loadVrmModel(newPath, scene);
		} catch (err) {
			console.error("Failed to load VRM model, reverting to default:", err);
			const defaultPath = await bridge.getVrmPath();
			currentVrm = await loadVrmModel(defaultPath, scene);
		}
		if (animator) animator.setVrm(currentVrm);
	});

	// Load default VRM
	const vrmPath = await bridge.getVrmPath();
	currentVrm = await loadVrmModel(vrmPath, scene);
	animator = createAnimator(currentVrm);

	// Initialize TTS controller with persisted state
	const ttsEnabled = await bridge.getTtsEnabled();
	ttsController = createTTSController(animator.getLipSync(), ttsEnabled);

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

	// Click-through: ignore mouse on transparent areas
	document.addEventListener("mouseenter", () => {
		bridge.setIgnoreMouseEvents(false);
	});
	document.addEventListener("mouseleave", () => {
		bridge.setIgnoreMouseEvents(true);
	});

	// Drag support via drag handle
	const dragHandle = document.getElementById("drag-handle")!;
	let isDragging = false;
	let lastX = 0;
	let lastY = 0;

	dragHandle.addEventListener("mousedown", (e) => {
		isDragging = true;
		lastX = e.screenX;
		lastY = e.screenY;
	});

	window.addEventListener("mousemove", (e) => {
		if (!isDragging) return;
		const dx = e.screenX - lastX;
		const dy = e.screenY - lastY;
		lastX = e.screenX;
		lastY = e.screenY;
		bridge.dragMove(dx, dy);
	});

	window.addEventListener("mouseup", () => {
		isDragging = false;
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

	// Settings button → context menu
	const settingsBtn = document.getElementById("settings-btn")!;
	settingsBtn.addEventListener("click", () => {
		bridge.showContextMenu();
	});

	// Chat toggle button → toggle chat window via main process
	const chatToggleBtn = document.getElementById("chat-toggle-btn")!;
	chatToggleBtn.addEventListener("click", () => {
		bridge.toggleChat();
	});

	// Listen for chat visibility changes to update button highlight
	bridge.onChatVisibility((visible: boolean) => {
		chatToggleBtn.classList.toggle("active", visible);
	});

	// TTS toggle button
	const ttsToggleBtn = document.getElementById("tts-toggle-btn")!;

	// Set initial button state
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
			currentVrm.update(delta);
		}

		renderer.render(scene, camera);
	}

	animate();
}

boot().catch(console.error);
