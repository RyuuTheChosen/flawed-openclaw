# Avatar-Overlay: Hardening Pass

Exhaustive review of all 24 source files found 42 issues. 18 fixes were implemented across 10 modified files and 1 new file. All changes pass `pnpm build`.

---

## Critical (5 fixes) -- DONE

### C1: Remove `webSecurity: false` and `sandbox: false`

**File:** `packages/avatar-overlay/src/main/window.ts`

Deleted both lines from `webPreferences`. These disabled Same-Origin Policy, CSP enforcement, and process sandboxing. Nothing in the codebase requires them -- Three.js texture loading uses `blob:` URLs which the CSP already allows. VRM loading uses `file://` URLs which work with default security settings.

### C2: Validate CLI args in `buildElectronArgs()`

**File:** `packages/avatar-overlay/src/electron-launcher.ts`

`gatewayUrl`, `vrmPath`, and `agentConfigs` were passed straight from plugin config to Electron CLI without validation. A malicious config could inject Electron flags like `--inspect=0.0.0.0:9229` or `--remote-debugging-port=9222`.

Added validation:
- `gatewayUrl`: must match `ws://` or `wss://` prefix, throws otherwise
- `vrmPath`: resolved to absolute path, rejects `..` segments
- `agentConfigs`: parsed JSON validated as object, rejects `__proto__`/`constructor`/`prototype` keys

### C3: Add IPC input validation

**File:** `packages/avatar-overlay/src/main/window.ts`

Three handlers now validate renderer input at runtime:
- `SET_IGNORE_MOUSE`: `typeof ignore !== "boolean"` guard
- `DRAG_MOVE`: `typeof` + `Number.isFinite()` checks on both deltas
- `SAVE_CAMERA_ZOOM`: `typeof zoom === "number" && Number.isFinite(zoom)`

### C4: Validate `agentConfigs` JSON structure

**File:** `packages/avatar-overlay/src/main/main.ts`

`JSON.parse(cliAgentConfigs)` was cast without validation. Now validates:
- Must be a non-null, non-array object
- Filters out `__proto__`, `constructor`, `prototype` keys
- Uses `Object.create(null)` for the safe output
- Validates each value's `vrmPath` is a string (or omits it)

### C5: Validate VRM file paths

**File:** `packages/avatar-overlay/src/renderer/avatar/vrm-loader.ts`

Added `validateVrmPath()` before `toFileUrl()` conversion:
- Rejects paths containing `..` after normalization
- Verifies `.vrm` extension

---

## High (7 fixes) -- DONE

### H1: Move shared types to `src/shared/types.ts`

**New file:** `packages/avatar-overlay/src/shared/types.ts`

`AgentPhase` was defined identically in both `gateway-client.ts` and `animator.ts`. `AgentState` was defined in `gateway-client.ts` and manually duplicated as an inline type in `avatar-bridge.d.ts`.

Created `src/shared/types.ts` exporting `AgentPhase` and `AgentState`. Updated:
- `gateway-client.ts` -- imports `AgentState` from shared types, removed local definitions
- `animator.ts` -- imports `AgentPhase` from shared types, removed local definition
- `avatar-bridge.d.ts` -- uses `import()` type expression to reference `AgentState` (preserves global ambient declaration)

### H2: Handle `error` stream in gateway client

**File:** `packages/avatar-overlay/src/main/gateway-client.ts`

The gateway protocol specifies 4 streams: `lifecycle`, `assistant`, `tool`, `error`. The code handled 3 -- `stream === "error"` fell through silently. Added `else if (stream === "error")` branch that transitions to idle.

### H3: Fix race condition -- gateway events before renderer ready

**File:** `packages/avatar-overlay/src/renderer/renderer.ts`

Gateway client starts immediately in `main.ts`, but the renderer's `onAgentState` listener wasn't registered until after async VRM loading completed. Events sent during boot were silently dropped.

Moved `bridge.onAgentState()` and `bridge.onVrmModelChanged()` registration above the VRM load call. The existing `if (!animator) return` guard prevents crashes during boot.

### H4: Add error handling to VRM model swap

**File:** `packages/avatar-overlay/src/renderer/renderer.ts`

If `loadVrmModel` throws during swap (corrupt file), `currentVrm` was left unloaded and `animator!` crashed. Wrapped in try/catch -- on failure, logs the error and reloads the default model via `bridge.getVrmPath()`.

### H5: Clean up gateway client and stdin listener on quit

**File:** `packages/avatar-overlay/src/main/main.ts`

Both `createStdinListener()` and `createGatewayClient()` return cleanup handles that were ignored. Added `app.on("before-quit")` handler that calls `gw.destroy()` and `cleanupStdin()`.

### H6: Clean up pending timeouts on window close

**File:** `packages/avatar-overlay/src/main/window.ts`

`saveTimeout` and `zoomSaveTimeout` could fire after window destruction. Added `win.on("close")` handler that clears both timeouts.

### H7: Fix tray visibility state desync

**File:** `packages/avatar-overlay/src/main/tray.ts`

The `visible` boolean tracked assumed state but didn't sync with actual window visibility. Stdin `show`/`hide` commands in `main.ts` changed visibility without updating tray state. Replaced `visible` flag with `win.isVisible()` queries throughout.

---

## Medium (6 fixes) -- DONE

### M1: Decouple gateway client from BrowserWindow

**File:** `packages/avatar-overlay/src/main/gateway-client.ts`

`createGatewayClient` took `BrowserWindow` directly, coupling WebSocket logic to Electron IPC. Changed signature to accept `onStateChange` and `onModelSwitch` callbacks. Caller in `main.ts` wires callbacks to `win.webContents.send()`. Removed `BrowserWindow` and `IPC` imports from gateway client.

### M2: Extract shared VRM file picker

**Files:** `packages/avatar-overlay/src/main/window.ts` + `src/main/tray.ts`

Identical dialog logic was duplicated. Extracted `showVrmPicker(win)` in `window.ts`, used by both the context menu and the tray menu. Removed `dialog` import from `tray.ts`.

### M3: Validate stdin `model-switch` command

**File:** `packages/avatar-overlay/src/main/stdin-listener.ts`

`parsed as StdinCommand` didn't validate discriminant fields. A `{ type: "model-switch" }` without `vrmPath` passed the type check but sent `undefined` to the renderer. Added guard: `if (parsed.type === "model-switch" && typeof parsed.vrmPath !== "string") return`.

### M4: Cap lip-sync queue size

**File:** `packages/avatar-overlay/src/renderer/avatar/lip-sync.ts`

Queue grew unbounded if `feedText()` was called faster than consumption (rapid gateway streaming). Added `MAX_QUEUE_SIZE = 10_000` cap -- excess characters are truncated.

### M5: Add NaN guard to `setCameraZoom`

**File:** `packages/avatar-overlay/src/renderer/avatar/scene.ts`

If `NaN` or `Infinity` reached `setCameraZoom`, `Math.max/min` propagated it, breaking the camera. Added `Number.isFinite()` check at top of function, falling back to `CAMERA_ZOOM_DEFAULT`.

### M6: Log gateway connection errors

**File:** `packages/avatar-overlay/src/main/gateway-client.ts`

Connection errors were silently swallowed. Added `console.error("avatar-overlay: gateway connection error:", err.message)` to the WebSocket error handler.

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| Critical | 5 | Done |
| High | 7 | Done |
| Medium | 6 | Done |
| **Total** | **18** | **Done** |

**Files modified (10):** window.ts, electron-launcher.ts, main.ts, vrm-loader.ts, gateway-client.ts, renderer.ts, tray.ts, stdin-listener.ts, lip-sync.ts, scene.ts
**Files created (1):** src/shared/types.ts

## Verification

```bash
cd packages/avatar-overlay && pnpm build
```

Build passes. Runtime checks:
1. `pnpm dev` -- avatar loads normally (security changes don't break VRM loading)
2. Scroll-wheel zoom -- still works (IPC validation doesn't reject valid inputs)
3. Tray -> Change Avatar Model -> pick invalid file -> verify error logged, default model reloaded
4. Start/stop app -> verify clean shutdown (no WebSocket errors, no pending timers)
5. Gateway not running -> verify avatar stays alive with idle animations, reconnect logs visible
