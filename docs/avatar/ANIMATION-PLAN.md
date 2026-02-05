# Plan: Mixamo Animation State Machine for Avatar Overlay

**Status**: ✅ Implemented — commits `bc12efa`, `761e8a7`, `f186e87`

## Goal

Replace procedural sine-wave bone manipulation (breathing, head sway) with Mixamo FBX animation clips retargeted at runtime to the active VRM model. A state machine drives clip selection per agent phase with crossfade transitions and variety rotation.

**Key constraint**: Expressions are VRM-model-dependent and visually unreliable. The animation system must carry the visual weight through skeletal motion (bones), not morph targets.

---

## Architecture

```
Main Process                          Renderer
  |                                     |
  |  IPC: GET_ANIMATIONS_CONFIG         |
  |  <- scans assets/animations/        |
  |    {idle,thinking,speaking,working}  |
  |  -> { clips: Record<Phase,Path[]> } |
  |    (validated: no symlinks,          |
  |     resolved real paths,             |
  |     .fbx extension enforced)         |
  |                                     |
  |                                     v
  |                              animation-loader.ts
  |                                 FBXLoader -> FBX groups (cached)
  |                                 retargetAnimation(fbx, vrm) -> AnimationClip[]
  |                                 Per-file try/catch (skip corrupt FBX)
  |                                     |
  |                                     v
  |                              state-machine.ts
  |                                 AnimationMixer (one per VRM)
  |                                 Per-phase clip pools
  |                                 Crossfade on phase change (0.5s)
  |                                 Variety rotation within phase
  |                                 "finished" event -> rotate clip
  |                                 dispose() cleans up all actions + listener
  |                                     |
  |                                     v
  |                              animator.ts
  |                                 mixer.update(delta)     <- bones (Mixamo clips)
  |                                 OR procedural fallback  <- if no clips loaded
  |                                 blinking(delta)         <- morph target (procedural, kept)
  |                                 expressions.update()    <- morph target (kept)
  |                                 lipSync.update()        <- morph target (kept)
  |                                     |
  |                                     v
  |                              vrm.update(delta)  <- VRM bone corrections
```

Morph targets (expressions, visemes, blink) and skeletal animation (Mixamo clips via AnimationMixer) are orthogonal and do not conflict.

---

## New files (3)

### 1. `src/renderer/avatar/animation-loader.ts`

Loads Mixamo FBX files and retargets them to a VRM model.

```ts
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

export async function loadAnimationLibrary(
  clipPaths: Record<AgentPhase, string[]>,
  vrm: VRM,
): Promise<AnimationLibrary>
```

**Internals:**
- `FBXLoader` loads each FBX file via `file://` URL (same pattern as `vrm-loader.ts:20-25`)
- Caches raw `THREE.Group` objects per file path (survives VRM swap)
- `mixamoClipToVRMAnimation(fbxGroup, vrm)` produces `AnimationClip` per FBX
- On VRM swap: `retargetToVrm(newVrm)` re-retargets all cached FBX groups (no re-download). No-op if not yet loaded.
- Per-file try/catch: if a single FBX fails to load, log warning and skip it. Other files continue loading.
- `dispose()`: traverses all cached `THREE.Group` objects, disposes geometry/materials, clears cache map.

### 2. `src/renderer/avatar/mixamo-retarget.ts`

Retargets a single Mixamo FBX animation to a VRM model's bone structure.

```ts
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

const MIXAMO_TO_VRM: Record<string, string> = {
  "mixamorigHips": "hips",
  "mixamorigSpine": "spine",
  "mixamorigSpine1": "chest",
  "mixamorigSpine2": "upperChest",
  "mixamorigNeck": "neck",
  "mixamorigHead": "head",
  "mixamorigLeftShoulder": "leftShoulder",
  "mixamorigLeftArm": "leftUpperArm",
  "mixamorigLeftForeArm": "leftLowerArm",
  "mixamorigLeftHand": "leftHand",
  "mixamorigRightShoulder": "rightShoulder",
  "mixamorigRightArm": "rightUpperArm",
  "mixamorigRightForeArm": "rightLowerArm",
  "mixamorigRightHand": "rightHand",
  "mixamorigLeftUpLeg": "leftUpperLeg",
  "mixamorigLeftLeg": "leftLowerLeg",
  "mixamorigLeftFoot": "leftFoot",
  "mixamorigRightUpLeg": "rightUpperLeg",
  "mixamorigRightLeg": "rightLowerLeg",
  "mixamorigRightFoot": "rightFoot",
  // finger bones omitted for brevity -- include full set in implementation
};

export function mixamoClipToVRMAnimation(
  fbxGroup: THREE.Group,
  vrm: VRM,
  clipName: string,
): THREE.AnimationClip | null
```

**Approach**: Implement retargeting directly (~120 lines) matching the official `@pixiv/three-vrm` Mixamo example. The logic:

1. Get the FBX animation clip from `fbxGroup.animations[0]`
2. Compute hip height ratio: `(vrmHipsWorldY - vrmRootY) / mixamoHipsY`
3. For each track in the clip:
   - Extract the Mixamo bone name from the track name (e.g., `"mixamorigHead.quaternion"`)
   - Look up the corresponding VRM bone name via the 65-bone mapping table (including fingers)
   - Get the VRM bone node via `vrm.humanoid.getNormalizedBoneNode(vrmBoneName)`
   - If bone not found, skip track (not all VRMs have all bones)
   - Remap the track name to target the VRM bone's `name`
4. For quaternion tracks — remove Mixamo rest pose rotation:
   ```ts
   // Use WORLD quaternions (not local .quaternion)
   mixamoBone.getWorldQuaternion(restRotationInverse).invert();
   mixamoBone.parent.getWorldQuaternion(parentRestWorldRotation);
   // Correct multiply order: parent * track * inverse (NOT inverse * parent * track)
   _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
   ```
   VRM 0.x: negate x/z components for coordinate handedness flip.
5. For position tracks — scale all axes by hip height ratio. VRM 0.x: negate x/z.
6. Return the remapped `AnimationClip`

**Critical retarget details** (discovered during implementation):
- Must use `getWorldQuaternion()` not `.quaternion` — local quaternion misses parent transforms
- Inverse goes on the RIGHT: `parent * track * inv` — not the left
- These match the official three-vrm `loadMixamoAnimation.js` example exactly

### 3. `src/renderer/avatar/state-machine.ts`

Finite state machine driving animation clip selection and transitions.

```ts
import * as THREE from "three";
import type { AgentPhase } from "../../shared/types.js";
import type { AnimationLibrary } from "./animation-loader.js";

export interface AnimationStateMachine {
  setPhase(phase: AgentPhase): void;
  update(delta: number): void;
  dispose(): void;
}

export function createStateMachine(
  mixer: THREE.AnimationMixer,
  library: AnimationLibrary,
): AnimationStateMachine
```

**Behavior:**
- Each phase has a pool of `AnimationClip[]` from the library
- On `setPhase(newPhase)`:
  1. If same phase, no-op
  2. Pick a random clip from the new phase's pool
  3. `currentAction.fadeOut(0.5)`
  4. `newAction = mixer.clipAction(clip)` -> `newAction.fadeIn(0.5).play()`
  5. Store `currentAction = newAction`
- Loop configuration:
  ```ts
  // idle/speaking: loop indefinitely (duration varies)
  action.setLoop(THREE.LoopRepeat, Infinity);
  // thinking/working: loop once, clamp at end
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  ```
- Variety rotation: register `"finished"` event listener on mixer. When current clip finishes, pick a different clip from the same phase's pool, crossfade with 0.3s.
- If a phase has 0 clips: keep playing whatever was last active.
- `dispose()`:
  ```ts
  mixer.removeEventListener("finished", finishedHandler);
  if (currentAction) currentAction.stop();
  mixer.stopAllAction();
  ```

---

## Modified files (6)

### 4. `src/renderer/avatar/animator.ts`

**Current state** (132 lines): Procedural `updateBreathing()` (chest sine wave), `updateBlinking()` (morph target), `updateHeadSway()` (head sine waves with phase multipliers), plus expression/lip-sync delegation.

**Changes:**
- Keep `updateBreathing()` and `updateHeadSway()` as **fallback** when no Mixamo clips are loaded
- Keep `updateBlinking()` (lines 42-71) -- morph target, orthogonal to skeleton
- Keep expression/lip-sync delegation -- morph target, orthogonal
- Add `THREE.AnimationMixer` field, `AnimationLibrary` field, `AnimationStateMachine` field
- Add `initAnimations()` async method with concurrency guard
- Add pending phase buffer for calls to `setPhase()` before init completes
- On `setVrm(newVrm)`: dispose old mixer + state machine, create new ones, re-retarget library

**New interface:**
```ts
export interface Animator {
  update(delta: number, elapsed: number): void;
  setVrm(vrm: VRM): void;
  setExpression(expression: Expression): void;
  setPhase(phase: AgentPhase): void;
  feedLipSyncText(text: string): void;
  stopLipSync(): void;
  isSpeaking(): boolean;
  initAnimations(clipPaths: Record<AgentPhase, string[]>): Promise<void>;
}
```

**Update loop (with fallback):**
```ts
update(delta, elapsed) {
  if (mixer && animationsLoaded) {
    mixer.update(delta);             // skeletal: Mixamo clips
  } else {
    updateBreathing(elapsed);        // skeletal: procedural fallback
    updateHeadSway(elapsed);         // skeletal: procedural fallback
  }
  updateBlinking(delta, elapsed);    // morph target (always)
  expressionCtrl.update(delta);      // morph target (always)
  lipSync.update(delta);             // morph target (always)
}
```

**Concurrency guard:**
```ts
let initPromise: Promise<void> | null = null;

async initAnimations(clipPaths) {
  if (initPromise) return initPromise;
  initPromise = doInitAnimations(clipPaths);
  try { await initPromise; } finally { initPromise = null; }
}
```

**Pending phase buffer:**
```ts
let pendingPhase: AgentPhase | null = null;

setPhase(phase) {
  if (!stateMachine) {
    pendingPhase = phase;  // apply after init completes
    return;
  }
  stateMachine.setPhase(phase);
}
```

**VRM swap disposal:**
```ts
setVrm(newVrm) {
  // Dispose old resources
  if (stateMachine) stateMachine.dispose();
  if (mixer) {
    mixer.stopAllAction();
    mixer.uncacheRoot(mixer.getRoot());
  }
  // Create new
  mixer = new THREE.AnimationMixer(newVrm.scene);
  if (library) {
    library.retargetToVrm(newVrm);
    stateMachine = createStateMachine(mixer, library);
    if (pendingPhase) {
      stateMachine.setPhase(pendingPhase);
      pendingPhase = null;
    }
  }
  // existing: update blinking, expressions, lip-sync
}
```

### 5. `src/renderer/renderer.ts`

**Changes** (after line 61, after `animator = createAnimator(currentVrm)`):

```ts
// Load animation clips (non-blocking, avatar shows procedural fallback while loading)
const animConfig = await bridge.getAnimationsConfig();
if (animConfig) {
  try {
    await animator.initAnimations(animConfig.clips);
  } catch (err) {
    console.error("Failed to load animations, keeping procedural fallback:", err);
  }
}
```

No changes needed to `onVrmModelChanged` handler -- `animator.setVrm()` internally handles re-retargeting.

### 6. `src/main/main.ts`

**Add IPC handler** (after `GET_VRM_PATH` handler, line 79-82):

```ts
ipcMain.handle(IPC.GET_ANIMATIONS_CONFIG, () => {
  const animBase = path.resolve(__dirname, "..", "..", "..", "assets", "animations");
  const phases = ["idle", "thinking", "speaking", "working"];
  const clips: Record<string, string[]> = {};

  for (const phase of phases) {
    const dir = path.join(animBase, phase);
    try {
      clips[phase] = fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith(".fbx"))
        .filter(f => !/[\\\/]/.test(f))          // reject names with path separators
        .map(f => {
          const full = fs.realpathSync(path.join(dir, f));
          // Verify resolved path is still within the animations directory
          if (!full.replace(/\\/g, "/").startsWith(animBase.replace(/\\/g, "/"))) {
            return null;  // symlink escape
          }
          return full;
        })
        .filter((f): f is string => f !== null);
    } catch {
      clips[phase] = [];
    }
  }
  return { clips };
});
```

Security: resolves symlinks via `realpathSync`, verifies the resolved path is still within `assets/animations/`. Rejects filenames containing path separators. Follows the pattern from `vrm-loader.ts:9-18`.

### 7. `src/main/preload.cjs`

**Add to bridge** (after `onAgentState`, line 59):

```js
getAnimationsConfig() {
  return ipcRenderer.invoke(IPC.GET_ANIMATIONS_CONFIG);
},
```

### 8. `src/shared/ipc-channels.ts`

**Add channel:**
```ts
GET_ANIMATIONS_CONFIG: "avatar:get-animations-config",
```

### 9. `src/renderer/types/avatar-bridge.d.ts`

**Add to AvatarBridge interface:**
```ts
getAnimationsConfig(): Promise<{
  clips: Record<import("../../shared/types.js").AgentPhase, string[]>;
} | null>;
```

### 10. `package.json`

**Add `fflate` dependency** (required by FBXLoader for compressed Mixamo FBX Binary files):
```json
"dependencies": {
  "three": "~0.170.0",
  "@pixiv/three-vrm": "~3.3.0",
  "ws": "^8.18.0",
  "fflate": "^0.8.2"
}
```

FBXLoader and retargeting are implemented in-house -- no other new dependencies.

---

## Animation assets

### Current assets (13 clips, ~9MB total)
```
assets/animations/
  idle/
    Breathing Idle.fbx
    look away gesture.fbx
    weight shift.fbx
  thinking/
    Thinking.fbx
    thoughtful head shake.fbx
  speaking/
    Agreeing.fbx
    head nod yes.fbx
    Talking.fbx
    Talking (1).fbx
    Talking (2).fbx
    Talking (3).fbx
  working/
    acknowledging.fbx
    lengthy head nod.fbx
```

### Mixamo download instructions

All animations from mixamo.com (free with Adobe account).

Download settings: **FBX Binary (.fbx)**, **Without Skin** (skeleton only), **In Place**, **30fps**. T-Pose not needed since we retarget at runtime.

To add more clips: drop `.fbx` files into the appropriate `assets/animations/{phase}/` directory. The IPC handler scans at startup.

---

## Implementation order (all completed ✅)

1. ✅ Add `fflate` dependency to package.json
2. ✅ Add IPC plumbing (ipc-channels.ts, preload.cjs, main.ts handler with path validation, bridge type)
3. ✅ Create `mixamo-retarget.ts` (bone name mapping + clip remapping + hip scaling)
4. ✅ Create `animation-loader.ts` (FBX loading + per-file try/catch + caching + dispose)
5. ✅ Create `state-machine.ts` (FSM + crossfade + loop config + variety rotation + finished listener + dispose)
6. ✅ Modify `animator.ts` (integrate mixer, keep procedural as fallback, concurrency guard, pending phase buffer, VRM swap disposal)
7. ✅ Modify `renderer.ts` (load animations config with try/catch)
8. ✅ Download Mixamo FBX files into `assets/animations/` subdirectories
9. ✅ Build and test
10. ✅ Fix retarget: world quaternions + correct multiply order (commit `f186e87`)

---

## Review findings addressed

The following gaps were identified during code review and are incorporated into this plan:

### Security (2 issues)
| # | Issue | Fix |
|---|-------|-----|
| S1 | Path traversal via symlinks in `assets/animations/` | `realpathSync` + verify resolved path is within `animBase` (main.ts handler) |
| S2 | No input validation on IPC file paths | Reject filenames with path separators, enforce `.fbx` extension, resolve symlinks |

### Resource management (3 issues)
| # | Issue | Fix |
|---|-------|-----|
| R1 | AnimationMixer not disposed on VRM swap | `mixer.stopAllAction()` + `mixer.uncacheRoot()` before creating new mixer (animator.ts) |
| R2 | AnimationActions not cleaned up in state machine | `dispose()` stops all actions, removes `"finished"` listener (state-machine.ts) |
| R3 | Cached FBX Groups leak GPU resources | `AnimationLibrary.dispose()` traverses and disposes geometry/materials (animation-loader.ts) |

### Concurrency (3 issues)
| # | Issue | Fix |
|---|-------|-----|
| C1 | `setPhase()` called before `initAnimations()` completes | Pending phase buffer, applied after init finishes (animator.ts) |
| C2 | Multiple `initAnimations()` calls race | Concurrency guard: return existing promise if in-flight (animator.ts) |
| C3 | VRM swap during animation load | `retargetToVrm()` is no-op if library not yet loaded (animation-loader.ts) |

### Fallback (2 issues)
| # | Issue | Fix |
|---|-------|-----|
| F1 | All FBX files missing/corrupt -> avatar frozen | Keep procedural breathing + head sway as fallback when `animationsLoaded === false` (animator.ts) |
| F2 | Individual FBX load failure breaks entire init | Per-file try/catch in loader, skip corrupt files (animation-loader.ts) |

### Implementation gaps (4 issues)
| # | Issue | Fix |
|---|-------|-----|
| I1 | `fflate` not in dependencies (FBXLoader needs it) | Add `fflate: ^0.8.2` to package.json dependencies |
| I2 | Loop settings not specified | `LoopRepeat` for idle/speaking, `LoopOnce + clampWhenFinished` for thinking/working (state-machine.ts) |
| I3 | Hip position scaling algorithm unspecified | VRM hip Y / Mixamo hip Y ratio applied to position tracks (mixamo-retarget.ts) |
| I4 | Mixer `"finished"` event listener leaks | `dispose()` calls `mixer.removeEventListener("finished", handler)` (state-machine.ts) |

### Bundling (1 issue)
| # | Issue | Fix |
|---|-------|-----|
| B1 | `three/addons/loaders/FBXLoader.js` may not resolve in rolldown | Existing `GLTFLoader` import from same path works. Test during build; add alias if needed. |

---

## Verification

### Manual testing
1. `npm run build` succeeds with no errors
2. `npm run dev` launches avatar with procedural fallback (while animations load)
3. Avatar transitions to Mixamo idle breathing after load completes
4. After clip ends, avatar switches to different idle clip (variety rotation)
5. Trigger agent thinking -> avatar crossfades to thinking animation
6. Trigger agent speaking -> avatar crossfades to speaking, lip-sync morph targets still work
7. Trigger agent working -> avatar crossfades to working animation
8. Return to idle -> smooth crossfade back
9. VRM model swap -> no crash, animations re-retarget to new model, old mixer disposed
10. Delete all FBX files -> avatar uses procedural fallback, no crash
11. Place a symlink in `assets/animations/idle/` pointing outside -> verify it is rejected (not loaded)
12. Call `setPhase("thinking")` immediately on startup before animations load -> verify it applies after load

### What to watch for
- ~~Bone orientation issues (Mixamo Y-up vs VRM coordinate space)~~ Fixed via world quaternion retarget
- Hip position scaling producing floating/sunken avatar
- Animation clip loop settings (verify idle loops, thinking clamps)
- Memory: watch devtools heap after VRM swap cycle (mixer + FBX cache should be cleaned)
- Rolldown bundle size: ~1,340 KB (includes FBXLoader + fflate)
