import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { createScene } from "./avatar/scene.js";
import { loadVrmModel, unloadVrmModel } from "./avatar/vrm-loader.js";
import { createAnimator, type Animator } from "./avatar/animator.js";
import { CAMERA_ZOOM_STEP } from "../shared/config.js";

const bridge = window.avatarBridge;

let currentVrm: VRM | null = null;
let animator: Animator | null = null;

async function boot(): Promise<void> {
	const canvas = document.getElementById("avatar-canvas") as HTMLCanvasElement;
	const { renderer, scene, camera, setCameraZoom } = createScene(canvas);

	// Load default VRM
	const vrmPath = await bridge.getVrmPath();
	currentVrm = await loadVrmModel(vrmPath, scene);
	animator = createAnimator(currentVrm);

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

	// Agent state → avatar reactions
	bridge.onAgentState((state) => {
		if (!animator) return;

		switch (state.phase) {
			case "thinking":
				animator.setExpression("surprised");
				animator.setPhase("thinking");
				animator.stopLipSync();
				break;
			case "speaking":
				animator.setExpression("happy");
				animator.setPhase("speaking");
				if (state.text) animator.feedLipSyncText(state.text);
				break;
			case "working":
				animator.setExpression("relaxed");
				animator.setPhase("working");
				animator.stopLipSync();
				break;
			case "idle":
				animator.setExpression("neutral");
				animator.setPhase("idle");
				animator.stopLipSync();
				break;
		}
	});

	// Model swap from tray
	bridge.onVrmModelChanged(async (newPath: string) => {
		if (currentVrm) {
			unloadVrmModel(currentVrm, scene);
		}
		currentVrm = await loadVrmModel(newPath, scene);
		animator!.setVrm(currentVrm);
	});

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
