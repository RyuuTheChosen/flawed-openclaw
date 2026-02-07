import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { mixamoClipToVRMAnimation } from "./mixamo-retarget.js";
import type { AgentPhase } from "../../shared/types.js";

export interface AnimationLibrary {
	getClips(phase: AgentPhase): THREE.AnimationClip[];
	retargetToVrm(vrm: VRM): void;
	isLoaded(): boolean;
	dispose(): void;
}

/** Converts a file system path to a file:// URL for the FBXLoader. */
function toFileUrl(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized.startsWith("/")) return `file://${normalized}`;
	return `file:///${normalized}`;
}

export async function loadAnimationLibrary(
	clipPaths: Record<AgentPhase, string[]>,
	vrm: VRM,
): Promise<AnimationLibrary> {
	const loader = new FBXLoader();

	// Cache raw FBX groups keyed by file path (survives VRM swap)
	const fbxCache = new Map<string, THREE.Group>();
	// Per-phase -> list of { filePath, clipName }
	const phaseFiles = new Map<AgentPhase, { filePath: string; clipName: string }[]>();
	// Current retargeted clips per phase
	let clipsByPhase = new Map<AgentPhase, THREE.AnimationClip[]>();

	// Load all FBX files
	const phases: AgentPhase[] = ["idle", "thinking", "speaking", "working"];
	for (const phase of phases) {
		const paths = clipPaths[phase] ?? [];
		const files: { filePath: string; clipName: string }[] = [];

		for (const filePath of paths) {
			try {
				const url = toFileUrl(filePath);
				const fbxGroup: THREE.Group = await loader.loadAsync(url);
				fbxCache.set(filePath, fbxGroup);

				// Derive clip name from filename without extension
				const name = filePath.replace(/\\/g, "/").split("/").pop() ?? "clip";
				const clipName = `${phase}/${name.replace(/\.fbx$/i, "")}`;
				files.push({ filePath, clipName });
			} catch (err) {
				console.warn(`Failed to load FBX animation: ${filePath}`, err);
			}
		}

		phaseFiles.set(phase, files);
	}

	// Retarget all cached FBX groups to the current VRM
	function retargetAll(targetVrm: VRM): void {
		const newClips = new Map<AgentPhase, THREE.AnimationClip[]>();

		for (const phase of phases) {
			const files = phaseFiles.get(phase) ?? [];
			const phaseClips: THREE.AnimationClip[] = [];

			for (const { filePath, clipName } of files) {
				const fbxGroup = fbxCache.get(filePath);
				if (!fbxGroup) continue;

				const clip = mixamoClipToVRMAnimation(fbxGroup, targetVrm, clipName);
				if (clip) phaseClips.push(clip);
			}

			newClips.set(phase, phaseClips);
		}

		clipsByPhase = newClips;
	}

	// Initial retarget
	retargetAll(vrm);

	return {
		getClips(phase: AgentPhase): THREE.AnimationClip[] {
			return clipsByPhase.get(phase) ?? [];
		},

		retargetToVrm(newVrm: VRM): void {
			retargetAll(newVrm);
		},

		isLoaded(): boolean {
			return fbxCache.size > 0;
		},

		dispose(): void {
			for (const group of fbxCache.values()) {
				group.traverse((obj) => {
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
			fbxCache.clear();
			phaseFiles.clear();
			clipsByPhase.clear();
		},
	};
}
