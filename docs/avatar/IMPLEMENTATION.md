# OpenClaw 3D Avatar Overlay — Implementation Details

Documents the implementation of the avatar overlay Electron package, covering the standalone app (Steps 1-3) and the OpenClaw plugin integration (Step 4).

**Stack**: Electron ~33 + Three.js ~0.170 + @pixiv/three-vrm ~3
**Location**: `packages/avatar-overlay/` (new workspace package)
**Target**: Windows (Electron supports Mac/Linux later)

---

## Step 1: Scaffold the Package

### Directory structure
```
packages/avatar-overlay/
  package.json
  tsconfig.json               # References main + renderer
  tsconfig.main.json          # Main process (Node target)
  tsconfig.renderer.json      # Renderer process (DOM target)
  src/
    main/
      main.ts
      window.ts
      tray.ts
      preload.ts
    renderer/
      index.html
      renderer.ts
      types/
        avatar-bridge.d.ts
      avatar/
        scene.ts
        vrm-loader.ts
        animator.ts
    shared/
      config.ts
      ipc-channels.ts
  assets/
    default-avatar.vrm         # VRM Consortium sample (MIT)
    icon.png                   # 32x32 tray icon
```

### package.json
```jsonc
{
  "name": "@openclaw/avatar-overlay",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "tsc --build && electron dist/main/main.js",
    "build": "tsc --build",
    "start": "electron dist/main/main.js"
  },
  "dependencies": {
    "three": "~0.170.0",
    "@pixiv/three-vrm": "~3.3.0"
  },
  "devDependencies": {
    "electron": "~33.0.0",
    "electron-builder": "~25.1.0",
    "typescript": "^5.9.3",
    "@types/three": "~0.170.0"
  }
}
```

### TypeScript configs
- `tsconfig.json` — project references for `tsconfig.main.json` and `tsconfig.renderer.json`
- `tsconfig.main.json` — `module: "NodeNext"`, `outDir: "dist/main"`, includes `src/main/**` + `src/shared/**`
- `tsconfig.renderer.json` — `module: "es2022"`, `moduleResolution: "bundler"`, `outDir: "dist/renderer"`, `lib: ["DOM", "ES2023"]`, includes `src/renderer/**` + `src/shared/**`

### Assets
- Download `AvatarSample_A.vrm` from VRM Consortium samples (MIT) → `assets/default-avatar.vrm`
- Create a simple 32x32 PNG tray icon → `assets/icon.png`

**Verify**: `pnpm install && cd packages/avatar-overlay && pnpm build` compiles without errors.

---

## Step 2: Electron Main Process

### `src/shared/config.ts`
Constants: `WINDOW_WIDTH=300`, `WINDOW_HEIGHT=400`, `WINDOW_POSITION_FILE="avatar-overlay-position.json"`
Camera zoom constants: `CAMERA_ZOOM_MIN=0.5`, `CAMERA_ZOOM_MAX=3.5`, `CAMERA_ZOOM_DEFAULT=0.8`, `CAMERA_ZOOM_STEP=0.15`, `CAMERA_ZOOM_FILE="avatar-overlay-camera.json"`, `CAMERA_PRESETS={ head: 0.6, upperBody: 1.2, fullBody: 3.0 }`
Gateway constants: `GATEWAY_URL_DEFAULT="ws://127.0.0.1:18789"`, `GATEWAY_RECONNECT_BASE_MS=3000`, `GATEWAY_RECONNECT_MAX_MS=30000`

### `src/shared/ipc-channels.ts`
IPC channel name constants shared between main and renderer: `DRAG_MOVE`, `SET_IGNORE_MOUSE`, `GET_VRM_PATH`, `VRM_MODEL_CHANGED`, `SHOW_CONTEXT_MENU`, `GET_CAMERA_ZOOM`, `SAVE_CAMERA_ZOOM`, `SET_CAMERA_ZOOM`, `AGENT_STATE`

### `src/main/window.ts` — Transparent overlay
- BrowserWindow: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, `hasShadow: false`
- `contextIsolation: true`, `nodeIntegration: false`, loads `preload.js`
- Position persistence: debounced save to `~/.openclaw/avatar-overlay-position.json`, restore on startup
- Camera zoom persistence: debounced save to `~/.openclaw/avatar-overlay-camera.json` (separate `zoomSaveTimeout` to avoid collision with position debounce), restore on startup via `GET_CAMERA_ZOOM` handler
- Default position: bottom-right of primary display
- IPC cleanup: `removeAllListeners`/`removeHandler` before registering handlers (safe for window re-creation)
- IPC handlers: `SET_IGNORE_MOUSE` → `setIgnoreMouseEvents(ignore, { forward: true })`, `DRAG_MOVE` → `setPosition`, `GET_CAMERA_ZOOM` → return persisted zoom, `SAVE_CAMERA_ZOOM` → validate + clamp + debounced write
- Context menu: "Change Avatar Model...", Framing submenu (Head / Upper Body / Full Body presets → sends `SET_CAMERA_ZOOM` to renderer), separator, Quit

### `src/main/tray.ts` — System tray
- Menu items: Show/Hide toggle, Change Avatar Model (file picker for `.vrm`), Quit
- On model change: send `VRM_MODEL_CHANGED` to renderer via `webContents.send`

### `src/main/preload.ts` — Context bridge
Exposes `window.avatarBridge` with:
- `setIgnoreMouseEvents(ignore: boolean)` — click-through toggle
- `dragMove(deltaX, deltaY)` — window dragging
- `onVrmModelChanged(callback)` — model swap notification (clears previous listener before registering)
- `getVrmPath(): Promise<string>` — get default model path
- `showContextMenu()` — trigger context menu from renderer
- `getCameraZoom(): Promise<number>` — invoke main process to get persisted zoom
- `saveCameraZoom(zoom: number)` — send zoom value to main process for persistence
- `onCameraZoomChanged(callback)` — listen for preset changes from main process (clears previous listener before registering)
- `onAgentState(callback)` — receive agent phase updates from gateway client (clears previous listener before registering)

### `src/main/main.ts` — App lifecycle
- `requestSingleInstanceLock()` to prevent multiple instances
- `app.whenReady()` → `createOverlayWindow()` + `createTray()`
- `ipcMain.handle(GET_VRM_PATH)` → return CLI-overridden path or `assets/default-avatar.vrm`
- CLI arg parsing: `--gateway-url`, `--vrm-path`, `--agent-configs` (JSON)
- Stdin listener: receives `show`/`hide`/`shutdown`/`model-switch` commands from plugin service
- Gateway client: connects to gateway WS, forwards agent events to renderer via IPC
- `window-all-closed` → no-op (tray keeps app alive)

**Verify**: `pnpm dev` shows a transparent 300x400 window + tray icon. Show/Hide and Quit work.

---

## Step 3: Three.js VRM Renderer

### `src/renderer/types/avatar-bridge.d.ts`
Type declaration for `window.avatarBridge` interface (mirrors preload API). Includes `getCameraZoom()`, `saveCameraZoom()`, `onCameraZoomChanged()`, and `onAgentState()` methods.

### `src/renderer/index.html`
- Transparent body (`background: transparent`)
- Loads `renderer.js` as `type="module"`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

### `src/renderer/avatar/scene.ts`
- `WebGLRenderer({ alpha: true, antialias: true })`, clearColor `0x000000` with alpha 0
- `PerspectiveCamera` FOV 30, initial position set via `setCameraZoom(default)` on boot
- Lighting: ambient (0.6 intensity) + directional key light (front-top-right) + fill light (left)
- Handle window resize
- `setCameraZoom(zoom): number` — clamps Z to `CAMERA_ZOOM_MIN..MAX`, computes `lookAtY = lerp(1.45, 0.75, t)` where `t = (z - min) / (max - min)`, sets camera position and lookAt, returns clamped value. Exposed on `AvatarScene` interface

### `src/renderer/avatar/vrm-loader.ts`
- `GLTFLoader` with `VRMLoaderPlugin` registered
- `loadVrmModel(path, scene)`: load `.vrm`, apply `VRMUtils.removeUnnecessaryVertices/combineSkeletons/combineMorphs`, disable frustumCulled, add to scene
- `unloadVrmModel(vrm, scene)`: remove from scene, dispose geometries/materials

### `src/renderer/avatar/animator.ts`
Three procedural animations using VRM humanoid bones:
- **Breathing**: sine wave on `chest` bone `rotation.x` (amplitude 0.005 rad, ~1.8 Hz)
- **Blinking**: random interval 2-6s, `blink` expression ramp close (60ms) → open (100ms)
- **Head sway**: Lissajous sine waves on `head` bone rotation.x/y (amplitude ~0.01 rad), modulated by agent phase:
  - `thinking`: 2.5x sway amplitude
  - `speaking`: 1.5x sway + nodding (sin at 3.0 Hz, 0.015 rad)
  - `working`: +0.05 rad downward head tilt
  - `idle`: normal sway

Interface: `createAnimator(vrm)` → `{ update, setVrm, setExpression, setPhase, feedLipSyncText, stopLipSync, isSpeaking }`

### `src/renderer/renderer.ts` — Entry
- Boot: `createScene()` → `loadVrmModel()` → `createAnimator()` → await `getCameraZoom()` → `setCameraZoom()` (before first `animate()` frame to avoid jump)
- Click-through: `mouseenter` → `setIgnoreMouseEvents(false)`, `mouseleave` → `setIgnoreMouseEvents(true)`
- Drag: mousedown/mousemove/mouseup → `avatarBridge.dragMove(dx, dy)`
- Scroll-wheel zoom: `wheel` listener (`passive: false`, `preventDefault`), steps by `CAMERA_ZOOM_STEP` per tick, calls `setCameraZoom` + `saveCameraZoom`
- Camera preset listener: `onCameraZoomChanged` → `setCameraZoom` + `saveCameraZoom` (for menu-driven presets)
- Agent state: `onAgentState` drives `setExpression`, `setPhase`, `feedLipSyncText`, `stopLipSync` based on agent phase (thinking/speaking/working/idle)
- Model swap: listen for `onVrmModelChanged`, unload old, load new
- Animation loop: `requestAnimationFrame` → `animator.update(delta, elapsed)` → `vrm.update(delta)` → `renderer.render(scene, camera)`

**Note**: Three.js bare specifier imports (`three/addons/...`) won't resolve from `file://` in Electron. A rolldown bundling step is used for the renderer to handle this.

---

## Step 4: OpenClaw Plugin Integration

Makes the avatar-overlay installable as an OpenClaw plugin. Full details in `docs/avatar/PLUGIN-PLAN.md`.

### `openclaw.plugin.json` — Plugin manifest
Config schema: `autoStart` (boolean), `vrmPath` (default model), `gatewayUrl`, `agents` (per-agent VRM map).

### `index.ts` — Plugin entry
Registers the service and two commands (`avatar-show`, `avatar-hide`). Loaded via jiti at gateway startup.

### `src/service.ts` — Plugin service
Implements `OpenClawPluginService` to spawn/kill the Electron child process:
- Resolves electron binary and main entry via `electron-launcher.ts`
- Spawns with `stdio: pipe` for stdin control protocol
- Crash recovery: exponential backoff (5s base, 30s max, resets after 60s uptime)
- Graceful shutdown: stdin `shutdown` → 3s wait → SIGTERM → 5s wait → SIGKILL

### `src/electron-launcher.ts` — Binary resolution
- `resolveElectronBinary()` — finds electron via `createRequire` from plugin dir
- `resolveElectronMain()` — points to `dist/main/main/main.js`
- `buildElectronArgs()` — constructs `--gateway-url`, `--vrm-path`, `--agent-configs` args

### `src/main/stdin-listener.ts` — Stdin protocol
Readline-based newline-delimited JSON: `show`, `hide`, `shutdown`, `model-switch`.

### `src/main/gateway-client.ts` — Gateway WebSocket client
Minimal protocol v3 handshake (no device auth). Listens for `"agent"` event frames and maps them to avatar phases. Tracks `sessionKey` changes for per-agent VRM hot-swapping.

---

## Build & File Order

1. `package.json`, `tsconfig*.json` — scaffold
2. `src/shared/config.ts`, `src/shared/ipc-channels.ts` — shared constants
3. `src/main/preload.cjs` → `window.ts` → `tray.ts` → `main.ts` — Electron shell
4. `src/main/stdin-listener.ts` → `gateway-client.ts` — plugin comms
5. `src/renderer/types/avatar-bridge.d.ts` — type declarations
6. `src/renderer/avatar/scene.ts` → `vrm-loader.ts` → `animator.ts` → `expressions.ts` → `lip-sync.ts` — Three.js core
7. `src/renderer/renderer.ts`, `src/renderer/index.html` — renderer entry
8. `openclaw.plugin.json`, `index.ts`, `src/service.ts`, `src/electron-launcher.ts` — plugin integration
9. `assets/default-avatar.vrm`, `assets/icon.png` — assets

## Verification

### Standalone mode
```bash
cd C:\Projects\openclaw\packages\avatar-overlay
pnpm dev
```

- [ ] VRM avatar renders in a transparent, frameless, always-on-top window
- [ ] Desktop visible through transparent pixels around avatar
- [ ] Avatar breathes, blinks, sways
- [ ] Drag, click-through, scroll-wheel zoom work
- [ ] Tray icon with Show/Hide, Change Avatar Model, Quit
- [ ] Window position and camera zoom persist across restarts
- [ ] Gear menu → Framing presets work

### Plugin mode
```bash
# Add to ~/.openclaw/config:
#   plugins.load.paths: ["C:/Projects/openclaw/packages/avatar-overlay"]
openclaw restart
```

- [ ] `openclaw plugins list` shows `avatar-overlay` as `loaded`
- [ ] Avatar window appears on gateway startup
- [ ] `/avatar-hide` hides, `/avatar-show` shows
- [ ] Agent messages drive avatar: thinking → speaking (lips move) → idle
- [ ] Tool calls show working pose (head tilted down)
- [ ] `openclaw stop` kills avatar cleanly
- [ ] Crash recovery: kill Electron manually, verify respawn
- [ ] Per-agent VRM configs hot-swap models on agent change
