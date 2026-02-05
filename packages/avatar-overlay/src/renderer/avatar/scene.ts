import * as THREE from "three";
import { CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX, CAMERA_ZOOM_DEFAULT } from "../../shared/config.js";

export interface AvatarScene {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	setCameraZoom(zoom: number): number;
}

export function createScene(canvas: HTMLCanvasElement): AvatarScene {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: true,
	});
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setClearColor(0x000000, 0);

	const camera = new THREE.PerspectiveCamera(
		30,
		window.innerWidth / window.innerHeight,
		0.1,
		20.0,
	);

	const scene = new THREE.Scene();

	// Ambient light
	const ambient = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambient);

	// Key light: front-top-right
	const keyLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.8);
	keyLight.position.set(1, 2, 1).normalize();
	scene.add(keyLight);

	// Fill light: left
	const fillLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.3);
	fillLight.position.set(-1, 1, 0.5).normalize();
	scene.add(fillLight);

	// Handle resize
	window.addEventListener("resize", () => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
	});

	function setCameraZoom(zoom: number): number {
		if (!Number.isFinite(zoom)) zoom = CAMERA_ZOOM_DEFAULT;
		const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, zoom));
		const t = (clamped - CAMERA_ZOOM_MIN) / (CAMERA_ZOOM_MAX - CAMERA_ZOOM_MIN);
		const lookAtY = 1.55 + (0.85 - 1.55) * t;
		camera.position.set(0, lookAtY, clamped);
		camera.lookAt(0, lookAtY, 0);
		return clamped;
	}

	return { renderer, scene, camera, setCameraZoom };
}
