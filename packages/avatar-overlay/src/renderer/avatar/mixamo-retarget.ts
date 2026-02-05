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

	// Compute hip position scale factor
	const vrmHips = vrm.humanoid?.getNormalizedBoneNode("hips");
	const mixamoHips = fbxGroup.getObjectByName("mixamorigHips");
	const hipScale =
		vrmHips && mixamoHips && mixamoHips.position.y !== 0
			? vrmHips.position.y / mixamoHips.position.y
			: 1;

	const tracks: THREE.KeyframeTrack[] = [];

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

		// Remap track to target VRM bone by uuid
		const newTrackName = `${vrmBoneNode.uuid}.${property}`;

		if (property === "position") {
			// Scale position tracks (particularly hips) to match VRM proportions
			const values = new Float32Array(track.values.length);
			for (let i = 0; i < track.values.length; i++) {
				values[i] = track.values[i] * hipScale;
			}
			tracks.push(
				new THREE.VectorKeyframeTrack(
					newTrackName,
					Array.from(track.times),
					Array.from(values),
				),
			);
		} else if (property === "quaternion") {
			tracks.push(
				new THREE.QuaternionKeyframeTrack(
					newTrackName,
					Array.from(track.times),
					Array.from(track.values),
				),
			);
		} else {
			// scale or other properties
			const cloned = track.clone();
			cloned.name = newTrackName;
			tracks.push(cloned);
		}
	}

	if (tracks.length === 0) return null;

	return new THREE.AnimationClip(clipName, sourceClip.duration, tracks);
}
