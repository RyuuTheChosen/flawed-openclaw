import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { VRM } from "@pixiv/three-vrm";

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

function toFileUrl(filePath: string): string {
	// Convert Windows paths like C:\foo\bar.vrm to file:///C:/foo/bar.vrm
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized.startsWith("/")) return `file://${normalized}`;
	return `file:///${normalized}`;
}

export async function loadVrmModel(
	filePath: string,
	scene: THREE.Scene,
): Promise<VRM> {
	const url = toFileUrl(filePath);
	const gltf = await loader.loadAsync(url);
	const vrm = gltf.userData.vrm as VRM;

	VRMUtils.removeUnnecessaryVertices(gltf.scene);
	VRMUtils.combineSkeletons(gltf.scene);
	VRMUtils.combineMorphs(vrm);

	vrm.scene.traverse((obj) => {
		obj.frustumCulled = false;
	});

	scene.add(vrm.scene);
	return vrm;
}

export function unloadVrmModel(vrm: VRM, scene: THREE.Scene): void {
	scene.remove(vrm.scene);

	vrm.scene.traverse((obj) => {
		if (obj instanceof THREE.Mesh) {
			obj.geometry?.dispose();
			if (Array.isArray(obj.material)) {
				for (const mat of obj.material) mat.dispose();
			} else {
				obj.material?.dispose();
			}
		}
	});
}
