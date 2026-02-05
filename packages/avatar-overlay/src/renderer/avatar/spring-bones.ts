import type { VRMSpringBoneManager } from "@pixiv/three-vrm-springbone";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

export interface SpringBoneController {
	update(delta: number): void;
	setFromGltf(gltf: GLTF): void;
	reset(): void;
}

export function createSpringBoneController(): SpringBoneController {
	let manager: VRMSpringBoneManager | null = null;

	return {
		update(delta: number): void {
			manager?.update(delta);
		},

		setFromGltf(gltf: GLTF): void {
			manager = gltf.userData.vrmSpringBoneManager ?? null;
			manager?.reset(); // Initialize physics state
		},

		reset(): void {
			manager?.reset();
		},
	};
}
