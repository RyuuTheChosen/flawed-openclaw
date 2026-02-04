import * as THREE from "three";

export interface AvatarScene {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
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
	camera.position.set(0, 1.35, 0.8);
	camera.lookAt(0, 1.35, 0);

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

	return { renderer, scene, camera };
}
