/**
 * Spherical Harmonics IBL (Image-Based Lighting) enhancer for MToon materials.
 * Computes SH coefficients from scene lights and injects them into VRM materials
 * for soft wrap-around diffuse lighting.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { IBL_INTENSITY } from "../../shared/config.js";

export interface IBLEnhancer {
	/** Compute SH3 coefficients from scene lights */
	computeSHFromLights(lights: THREE.Light[]): void;
	/** Inject IBL into a single material (MToon ShaderMaterial) */
	enhanceMaterial(material: THREE.Material): void;
	/** Convenience: traverse VRM and enhance all materials */
	enhanceVrm(vrm: VRM): void;
	/** Update IBL intensity at runtime */
	setIntensity(intensity: number): void;
	dispose(): void;
}

export function createIBLEnhancer(): IBLEnhancer {
	// SH band 0 + band 1 = 4 coefficients (RGB vectors)
	const shCoefficients: THREE.Vector3[] = Array.from({ length: 9 }, () => new THREE.Vector3());
	let intensity = IBL_INTENSITY;

	function computeSHFromLights(lights: THREE.Light[]): void {
		// Reset all coefficients
		for (const c of shCoefficients) c.set(0, 0, 0);

		for (const light of lights) {
			if (light instanceof THREE.AmbientLight) {
				// Ambient → band 0 (Y₀⁰ constant coefficient)
				const color = light.color;
				const i = light.intensity;
				shCoefficients[0].x += color.r * i;
				shCoefficients[0].y += color.g * i;
				shCoefficients[0].z += color.b * i;
			} else if (light instanceof THREE.DirectionalLight) {
				// Directional → bands 0 and 1
				const color = light.color;
				const i = light.intensity;
				const dir = light.position.clone().normalize();

				// Band 0: constant term
				shCoefficients[0].x += color.r * i * 0.25;
				shCoefficients[0].y += color.g * i * 0.25;
				shCoefficients[0].z += color.b * i * 0.25;

				// Band 1: Y₁⁻¹ (y), Y₁⁰ (z), Y₁¹ (x)
				shCoefficients[1].x += color.r * i * dir.y * 0.5;
				shCoefficients[1].y += color.g * i * dir.y * 0.5;
				shCoefficients[1].z += color.b * i * dir.y * 0.5;

				shCoefficients[2].x += color.r * i * dir.z * 0.5;
				shCoefficients[2].y += color.g * i * dir.z * 0.5;
				shCoefficients[2].z += color.b * i * dir.z * 0.5;

				shCoefficients[3].x += color.r * i * dir.x * 0.5;
				shCoefficients[3].y += color.g * i * dir.x * 0.5;
				shCoefficients[3].z += color.b * i * dir.x * 0.5;
			}
		}
	}

	function enhanceMaterial(mat: THREE.Material): void {
		if (!(mat as any).isShaderMaterial && !(mat as any).isMeshStandardMaterial) return;
		if ((mat as any).__iblEnhanced) return; // Guard: already enhanced

		// Chain onBeforeCompile — preserve MToon's existing hook
		const prev = mat.onBeforeCompile;
		mat.onBeforeCompile = (shader, renderer) => {
			prev?.call(mat, shader, renderer);

			// Inject vertex: world normal varying
			if (!shader.vertexShader.includes("IBL_VS_DECL")) {
				shader.vertexShader = `
#ifndef IBL_VS_DECL
#define IBL_VS_DECL
varying vec3 vWorldNormal;
#endif
` + shader.vertexShader;

				// Insert after normal computation
				const normalHook = shader.vertexShader.includes("#include <defaultnormal_vertex>")
					? "#include <defaultnormal_vertex>"
					: "#include <normal_vertex>";
				if (shader.vertexShader.includes(normalHook)) {
					shader.vertexShader = shader.vertexShader.replace(
						normalHook,
						normalHook + "\nvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);",
					);
				}
			}

			// Inject fragment: SH evaluation + uniforms
			if (!shader.fragmentShader.includes("IBL_FS_DECL")) {
				shader.fragmentShader = shader.fragmentShader.replace(
					"#include <common>",
					`#include <common>
#ifndef IBL_FS_DECL
#define IBL_FS_DECL
uniform vec3 uSHCoeffs[9];
uniform float uIBLIntensity;
varying vec3 vWorldNormal;
vec3 evalSH(vec3 n) {
  n = normalize(n);
  return uSHCoeffs[0]*0.2821
    + uSHCoeffs[1]*0.4886*n.y + uSHCoeffs[2]*0.4886*n.z + uSHCoeffs[3]*0.4886*n.x;
}
#endif`,
				);

				// Apply before dithering (with fallback)
				const applyHook = shader.fragmentShader.includes("#include <dithering_fragment>")
					? "#include <dithering_fragment>"
					: "#include <output_fragment>";
				if (shader.fragmentShader.includes(applyHook)) {
					shader.fragmentShader = shader.fragmentShader.replace(
						applyHook,
						"gl_FragColor.rgb += evalSH(normalize(vWorldNormal)) * uIBLIntensity;\n" + applyHook,
					);
				}
			}

			// Set uniforms
			shader.uniforms.uSHCoeffs = { value: shCoefficients };
			shader.uniforms.uIBLIntensity = { value: intensity };
			(mat as any).__iblUniforms = shader.uniforms; // Store for runtime updates
		};

		// Invalidate shader cache
		const baseKey = (mat as any).customProgramCacheKey?.() ?? "";
		(mat as any).customProgramCacheKey = () => baseKey + "|ibl";
		(mat as any).__iblEnhanced = true;
		mat.needsUpdate = true;
	}

	function enhanceVrm(vrm: VRM): void {
		vrm.scene.traverse((obj) => {
			if ((obj as THREE.Mesh).isMesh) {
				const mesh = obj as THREE.Mesh;
				const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
				for (const mat of materials) {
					enhanceMaterial(mat);
				}
			}
		});
	}

	return {
		computeSHFromLights,
		enhanceMaterial,
		enhanceVrm,
		setIntensity(newIntensity: number): void {
			intensity = newIntensity;
		},
		dispose(): void {
			// Nothing to clean up — shader modifications live with the materials
		},
	};
}
