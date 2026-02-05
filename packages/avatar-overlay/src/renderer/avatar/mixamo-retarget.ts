import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * Mapping from Mixamo bone names to VRM humanoid bone names.
 */
const MIXAMO_TO_VRM: Record<string, string> = {
	mixamorigHips: "hips",
	mixamorigSpine: "spine",
	mixamorigSpine1: "chest",
	mixamorigSpine2: "upperChest",
	mixamorigNeck: "neck",
	mixamorigHead: "head",
	// Left arm
	mixamorigLeftShoulder: "leftShoulder",
	mixamorigLeftArm: "leftUpperArm",
	mixamorigLeftForeArm: "leftLowerArm",
	mixamorigLeftHand: "leftHand",
	// Right arm
	mixamorigRightShoulder: "rightShoulder",
	mixamorigRightArm: "rightUpperArm",
	mixamorigRightForeArm: "rightLowerArm",
	mixamorigRightHand: "rightHand",
	// Left leg
	mixamorigLeftUpLeg: "leftUpperLeg",
	mixamorigLeftLeg: "leftLowerLeg",
	mixamorigLeftFoot: "leftFoot",
	mixamorigLeftToeBase: "leftToes",
	// Right leg
	mixamorigRightUpLeg: "rightUpperLeg",
	mixamorigRightLeg: "rightLowerLeg",
	mixamorigRightFoot: "rightFoot",
	mixamorigRightToeBase: "rightToes",
	// Left hand fingers
	mixamorigLeftHandThumb1: "leftThumbMetacarpal",
	mixamorigLeftHandThumb2: "leftThumbProximal",
	mixamorigLeftHandThumb3: "leftThumbDistal",
	mixamorigLeftHandIndex1: "leftIndexProximal",
	mixamorigLeftHandIndex2: "leftIndexIntermediate",
	mixamorigLeftHandIndex3: "leftIndexDistal",
	mixamorigLeftHandMiddle1: "leftMiddleProximal",
	mixamorigLeftHandMiddle2: "leftMiddleIntermediate",
	mixamorigLeftHandMiddle3: "leftMiddleDistal",
	mixamorigLeftHandRing1: "leftRingProximal",
	mixamorigLeftHandRing2: "leftRingIntermediate",
	mixamorigLeftHandRing3: "leftRingDistal",
	mixamorigLeftHandPinky1: "leftLittleProximal",
	mixamorigLeftHandPinky2: "leftLittleIntermediate",
	mixamorigLeftHandPinky3: "leftLittleDistal",
	// Right hand fingers
	mixamorigRightHandThumb1: "rightThumbMetacarpal",
	mixamorigRightHandThumb2: "rightThumbProximal",
	mixamorigRightHandThumb3: "rightThumbDistal",
	mixamorigRightHandIndex1: "rightIndexProximal",
	mixamorigRightHandIndex2: "rightIndexIntermediate",
	mixamorigRightHandIndex3: "rightIndexDistal",
	mixamorigRightHandMiddle1: "rightMiddleProximal",
	mixamorigRightHandMiddle2: "rightMiddleIntermediate",
	mixamorigRightHandMiddle3: "rightMiddleDistal",
	mixamorigRightHandRing1: "rightRingProximal",
	mixamorigRightHandRing2: "rightRingIntermediate",
	mixamorigRightHandRing3: "rightRingDistal",
	mixamorigRightHandPinky1: "rightLittleProximal",
	mixamorigRightHandPinky2: "rightLittleIntermediate",
	mixamorigRightHandPinky3: "rightLittleDistal",
};

/**
 * Retargets a single Mixamo FBX animation clip to a VRM model's bone structure.
 * Returns null if the FBX has no animation clip.
 */
export function mixamoClipToVRMAnimation(
	fbxGroup: THREE.Group,
	vrm: VRM,
	clipName: string,
): THREE.AnimationClip | null {
	const sourceClip = fbxGroup.animations[0];
	if (!sourceClip) return null;

	// Compute hip height ratio for position scaling
	const vrmHips = vrm.humanoid?.getNormalizedBoneNode("hips");
	const mixamoHips = fbxGroup.getObjectByName("mixamorigHips");
	const _vec3 = new THREE.Vector3();
	const vrmHipsY = vrmHips ? vrmHips.getWorldPosition(_vec3).y : 1;
	const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
	const mixamoHipsY = mixamoHips ? mixamoHips.position.y : 1;
	const hipScale = mixamoHipsY !== 0 ? (vrmHipsY - vrmRootY) / mixamoHipsY : 0.01;

	const tracks: THREE.KeyframeTrack[] = [];
	const restRotationInverse = new THREE.Quaternion();
	const parentRestWorldRotation = new THREE.Quaternion();
	const _quatA = new THREE.Quaternion();

	// VRM 0.x uses different coordinate handedness than VRM 1.0
	const isVrm0 = (vrm.meta as unknown as { metaVersion?: string })?.metaVersion === "0";

	for (const track of sourceClip.tracks) {
		// Track names are like "mixamorigHead.quaternion" or "mixamorigHips.position"
		const dotIdx = track.name.indexOf(".");
		if (dotIdx === -1) continue;

		const mixamoBoneName = track.name.substring(0, dotIdx);
		const property = track.name.substring(dotIdx + 1);

		const vrmBoneName = MIXAMO_TO_VRM[mixamoBoneName];
		if (!vrmBoneName) continue;

		const vrmBoneNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as VRMHumanBoneName);
		if (!vrmBoneNode) continue;

		const mixamoBone = fbxGroup.getObjectByName(mixamoBoneName);
		if (!mixamoBone || !mixamoBone.parent) continue;

		const newTrackName = `${vrmBoneNode.name}.${property}`;

		// Get WORLD rest quaternions (not local) — matches official three-vrm approach
		mixamoBone.getWorldQuaternion(restRotationInverse).invert();
		mixamoBone.parent.getWorldQuaternion(parentRestWorldRotation);

		if (property === "position") {
			// Scale position tracks to match VRM proportions
			const values = new Float32Array(track.values.length);
			for (let i = 0; i < track.values.length; i += 3) {
				values[i] = (isVrm0 ? -track.values[i] : track.values[i]) * hipScale;
				values[i + 1] = track.values[i + 1] * hipScale;
				values[i + 2] = (isVrm0 ? -track.values[i + 2] : track.values[i + 2]) * hipScale;
			}
			tracks.push(
				new THREE.VectorKeyframeTrack(
					newTrackName,
					Array.from(track.times),
					Array.from(values),
				),
			);
		} else if (property === "quaternion") {
			// Convert from Mixamo bone space to VRM normalized bone space:
			// result = parentRestWorldRot * trackQuat * restWorldRotInverse
			const values = new Float32Array(track.values.length);
			for (let i = 0; i < track.values.length; i += 4) {
				_quatA.set(
					track.values[i],
					track.values[i + 1],
					track.values[i + 2],
					track.values[i + 3],
				);
				_quatA
					.premultiply(parentRestWorldRotation)
					.multiply(restRotationInverse);

				values[i] = isVrm0 ? -_quatA.x : _quatA.x;
				values[i + 1] = _quatA.y;
				values[i + 2] = isVrm0 ? -_quatA.z : _quatA.z;
				values[i + 3] = _quatA.w;
			}

			tracks.push(
				new THREE.QuaternionKeyframeTrack(
					newTrackName,
					Array.from(track.times),
					Array.from(values),
				),
			);
		}
	}

	if (tracks.length === 0) return null;

	return new THREE.AnimationClip(clipName, sourceClip.duration, tracks);
}
