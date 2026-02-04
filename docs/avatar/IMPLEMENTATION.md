# OpenClaw 3D Avatar Overlay — Implementation Plan (Phases 1-3)

Implement the first 3 build steps from `docs/avatar/PLAN.md`: scaffold the Electron package, create the transparent overlay window with tray, and render an animated VRM avatar using Three.js.

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

### `src/shared/ipc-channels.ts`
IPC channel name constants shared between main and renderer: `DRAG_MOVE`, `SET_IGNORE_MOUSE`, `GET_VRM_PATH`, `VRM_MODEL_CHANGED`

### `src/main/window.ts` — Transparent overlay
- BrowserWindow: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, `hasShadow: false`
- `contextIsolation: true`, `nodeIntegration: false`, loads `preload.js`
- Position persistence: debounced save to `~/.openclaw/avatar-overlay-position.json`, restore on startup
- Default position: bottom-right of primary display
- IPC handlers: `SET_IGNORE_MOUSE` → `setIgnoreMouseEvents(ignore, { forward: true })`, `DRAG_MOVE` → `setPosition`

### `src/main/tray.ts` — System tray
- Menu items: Show/Hide toggle, Change Avatar Model (file picker for `.vrm`), Quit
- On model change: send `VRM_MODEL_CHANGED` to renderer via `webContents.send`

### `src/main/preload.ts` — Context bridge
Exposes `window.avatarBridge` with:
- `setIgnoreMouseEvents(ignore: boolean)` — click-through toggle
- `dragMove(deltaX, deltaY)` — window dragging
- `onVrmModelChanged(callback)` — model swap notification
- `getVrmPath(): Promise<string>` — get default model path

### `src/main/main.ts` — App lifecycle
- `requestSingleInstanceLock()` to prevent multiple instances
- `app.whenReady()` → `createOverlayWindow()` + `createTray()`
- `ipcMain.handle(GET_VRM_PATH)` → return path to `assets/default-avatar.vrm`
- `window-all-closed` → no-op (tray keeps app alive)

**Verify**: `pnpm dev` shows a transparent 300x400 window + tray icon. Show/Hide and Quit work.

---

## Step 3: Three.js VRM Renderer

### `src/renderer/types/avatar-bridge.d.ts`
Type declaration for `window.avatarBridge` interface (mirrors preload API).

### `src/renderer/index.html`
- Transparent body (`background: transparent`)
- Loads `renderer.js` as `type="module"`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

### `src/renderer/avatar/scene.ts`
- `WebGLRenderer({ alpha: true, antialias: true })`, clearColor `0x000000` with alpha 0
- `PerspectiveCamera` FOV 30, positioned at `(0, 1.35, 0.8)` looking at `(0, 1.35, 0)` — chest-up framing
- Lighting: ambient (0.6 intensity) + directional key light (front-top-right) + fill light (left)
- Handle window resize

### `src/renderer/avatar/vrm-loader.ts`
- `GLTFLoader` with `VRMLoaderPlugin` registered
- `loadVrmModel(path, scene)`: load `.vrm`, apply `VRMUtils.removeUnnecessaryVertices/combineSkeletons/combineMorphs`, disable frustumCulled, add to scene
- `unloadVrmModel(vrm, scene)`: remove from scene, dispose geometries/materials

### `src/renderer/avatar/animator.ts`
Three procedural animations using VRM humanoid bones:
- **Breathing**: sine wave on `chest` bone `rotation.x` (amplitude 0.005 rad, ~1.8 Hz)
- **Blinking**: random interval 2-6s, `blink` expression ramp close (60ms) → open (100ms)
- **Head sway**: Lissajous sine waves on `head` bone rotation.x/y (amplitude ~0.01 rad)

Interface: `createAnimator(vrm)` → `{ update(delta, elapsed), setVrm(newVrm) }`

### `src/renderer/renderer.ts` — Entry
- Boot: `createScene()` → `loadVrmModel()` → `createAnimator()`
- Click-through: `mouseenter` → `setIgnoreMouseEvents(false)`, `mouseleave` → `setIgnoreMouseEvents(true)`
- Drag: mousedown/mousemove/mouseup → `avatarBridge.dragMove(dx, dy)`
- Model swap: listen for `onVrmModelChanged`, unload old, load new
- Animation loop: `requestAnimationFrame` → `animator.update(delta, elapsed)` → `vrm.update(delta)` → `renderer.render(scene, camera)`

**Note**: Three.js bare specifier imports (`three/addons/...`) won't resolve from `file://` in Electron. If this is an issue at runtime, add a rolldown bundling step for the renderer (rolldown is already a devDep in the root workspace).

---

## Build & File Order

1. `package.json`, `tsconfig*.json` — scaffold
2. `src/shared/config.ts`, `src/shared/ipc-channels.ts` — shared constants
3. `src/main/preload.ts` → `window.ts` → `tray.ts` → `main.ts` — Electron shell
4. `src/renderer/types/avatar-bridge.d.ts` — type declarations
5. `src/renderer/avatar/scene.ts` → `vrm-loader.ts` → `animator.ts` — Three.js core
6. `src/renderer/renderer.ts`, `src/renderer/index.html` — renderer entry
7. `assets/default-avatar.vrm`, `assets/icon.png` — assets

## Verification

```bash
cd C:\Projects\openclaw
pnpm install
cd packages\avatar-overlay
pnpm dev
```

Checklist:
- [ ] VRM avatar renders in a transparent, frameless, always-on-top window
- [ ] Desktop visible through transparent pixels around avatar
- [ ] Avatar breathes (subtle chest movement)
- [ ] Avatar blinks at random intervals (2-6s)
- [ ] Avatar has slight head sway
- [ ] Drag avatar by clicking on the mesh
- [ ] Clicks on transparent areas pass through to desktop
- [ ] Tray icon with Show/Hide, Change Avatar Model, Quit
- [ ] Swapping VRM model via tray works
- [ ] Window position persists across restarts
