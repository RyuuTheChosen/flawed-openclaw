# OpenClaw 3D Avatar Overlay — Implementation Plan

## Overview
Add a floating, always-on-top anime/VTuber 3D avatar widget to OpenClaw. The avatar reacts to AI messages, supports click-to-chat, and connects to OpenClaw via its existing gateway WebSocket.

**Stack**: Electron (transparent window) + Three.js + @pixiv/three-vrm
**Location**: `packages/avatar-overlay/` (new workspace package)
**Target**: Windows (Electron supports Mac/Linux later)

---

## Phase 1: Scaffold the Electron Package

Create `packages/avatar-overlay/` with this structure:

```
packages/avatar-overlay/
  package.json
  tsconfig.json
  src/
    main/
      main.ts                 # Electron main process
      window.ts               # Transparent, frameless, always-on-top BrowserWindow
      tray.ts                 # System tray (show/hide, settings, quit)
      preload.ts              # Context bridge for renderer IPC
    renderer/
      index.html              # Entry HTML (loads Three.js scene)
      renderer.ts             # Renderer entry — boots scene + UI
      avatar/
        scene.ts              # Three.js scene, camera, lighting, render loop
        vrm-loader.ts         # Load .vrm model via @pixiv/three-vrm
        animator.ts           # Procedural animations (idle, breathing, blinking)
        lip-sync.ts           # Mouth movement from text/audio
        expressions.ts        # Map emotions to VRM blendshapes
      ui/
        chat-bubble.ts        # Floating chat bubble (show messages, type input)
      state/
        avatar-state.ts       # State machine: IDLE → THINKING → SPEAKING → etc.
        event-bridge.ts       # Maps gateway WebSocket events → state transitions
    shared/
      config.ts               # Gateway URL, avatar model path, window position
  assets/
    default-avatar.vrm        # Free VRM model (VRM Consortium sample, MIT)
    icon.ico                  # Tray icon
```

**Dependencies** to add:
- `electron` ~33
- `three` ~0.170
- `@pixiv/three-vrm` ~3
- `electron-builder` (dev)

Already in workspace via `pnpm-workspace.yaml` → `packages/*`.

---

## Phase 2: Electron Main Process

### `window.ts` — Transparent Overlay
```
BrowserWindow config:
  width: 300, height: 400
  transparent: true, frame: false
  alwaysOnTop: true, skipTaskbar: true
  resizable: false, hasShadow: false
```
- Draggable by clicking on the avatar mesh
- Click-through on transparent pixels via `setIgnoreMouseEvents` forwarding
- Persist window position to disk
- Persist camera zoom level to disk (separate file, separate debounce timer)
- Context menu with Framing submenu (Head / Upper Body / Full Body presets)

### `main.ts` — App Lifecycle
- Create the overlay window
- Connect to OpenClaw gateway WebSocket (`ws://127.0.0.1:18789` default)
- Forward gateway events to renderer via IPC
- System tray setup

### `tray.ts` — System Tray Menu
- Show/Hide avatar
- Change VRM model (file picker)
- Framing presets (Head / Upper Body / Full Body)
- Gateway URL setting
- Quit

---

## Phase 3: Gateway WebSocket Integration ✅

Implemented as an OpenClaw plugin with a lightweight gateway client. See `docs/avatar/PLUGIN-PLAN.md` for full details.

### Connection (minimal protocol v3 handshake in `gateway-client.ts`)
1. Open WebSocket to `ws://127.0.0.1:18789`
2. Handle `connect.challenge` → respond with connect params (no device auth)
3. Client identifies as `gateway-client` / `backend` mode
4. Listen for `"agent"` broadcast events
5. Reconnect with exponential backoff (3s base, 30s max)

### Event Mapping (in `gateway-client.ts`)
| Gateway Event | Avatar Phase | Expression | Motion |
|---|---|---|---|
| `stream: "lifecycle"`, `phase: "start"` | thinking | surprised | 2.5x sway |
| `stream: "assistant"`, `data.text` | speaking | happy | lip-sync + nodding |
| `stream: "tool"` | working | relaxed | head-down tilt |
| `stream: "lifecycle"`, `phase: "end"/"error"` | idle | neutral | normal sway |

### Plugin Architecture
- Avatar-overlay is an OpenClaw plugin (loaded via jiti at gateway startup)
- Plugin service spawns Electron as child process with stdin pipe control
- Gateway client runs in Electron main process, forwards events to renderer via IPC
- Per-agent VRM model switching via `--agent-configs` CLI arg
- Commands: `/avatar-show`, `/avatar-hide`

**Key source files**:
- `packages/avatar-overlay/index.ts` — plugin entry
- `packages/avatar-overlay/src/service.ts` — Electron lifecycle management
- `packages/avatar-overlay/src/main/gateway-client.ts` — WS client
- `packages/avatar-overlay/src/main/stdin-listener.ts` — stdin command protocol

---

## Phase 4: Three.js Avatar Renderer ✅

Scene, VRM loader, and base animator (breathing, blinking, head sway) were implemented in steps 1-3. Step 4 added expressions and lip-sync as renderer-only modules integrated into the existing `createAnimator()` pattern.

### `scene.ts` ✅
- WebGLRenderer with `alpha: true` (transparent background)
- Perspective camera framing avatar from chest up
- Soft ambient + directional light (anime-style)
- `setCameraZoom(z)` — clamps Z to 0.5–3.5, lerps lookAt Y (1.45 at close-up → 0.75 at full body), returns clamped value

### `vrm-loader.ts` ✅
- Load `.vrm` via GLTFLoader + VRMLoaderPlugin
- Default: bundled `AvatarSample_A.vrm` from VRM Consortium (MIT license)
- User can swap via tray menu file picker

### `animator.ts` — Procedural Animations ✅
- **Breathing**: sine wave on chest bone rotation
- **Blinking**: trigger `blink` expression every 2-6s randomly
- **Micro-movement**: slight head sway via Lissajous sine waves on head bone
- Delegates to `ExpressionController` and `LipSync` sub-controllers
- Extended interface: `setExpression()`, `feedLipSyncText()`, `stopLipSync()`, `isSpeaking()`

### `expressions.ts` ✅
- 6 named expressions: `neutral`, `happy`, `sad`, `angry`, `surprised`, `relaxed`
- `createExpressionController(vrm)` → `{ setExpression, update, setVrm }`
- Exponential ease-out crossfade (speed=10, ~300ms to 95% at 60fps)
- Writes via `expressionManager.setValue()` — no conflict with blink (separate expression names)
- `neutral` = all weights 0; setting e.g. `"happy"` targets happy=1, others=0

### `lip-sync.ts` ✅
- Text-driven viseme cycling through 5 VRM mouth shapes: `aa`, `ih`, `ou`, `ee`, `oh`
- `createLipSync(vrm)` → `{ feedText, stop, update, isSpeaking, setVrm }`
- `feedText(text)` appends characters to queue; `stop()` clears for speech interruption
- ~50ms per character, vowels mapped to visemes, consonants → light `aa`, punctuation/space → mouth closed
- O(1) consumption via read index pointer (not `shift()`)
- Active viseme targets 0.8 weight (avoids extreme mouth distortion), lerp speed=15 (~67ms transitions)
- Timer capped when idle to prevent accumulation; queue reclaimed when fully consumed
- VRM `overrideMouth` handles viseme vs emotion mouth conflicts automatically

---

## Phase 5: Chat Bubble UI (TODO)

- Semi-transparent rounded bubble above/beside avatar
- Shows streamed assistant text word-by-word
- Text input at bottom for user messages
- Click avatar to toggle bubble visibility
- Auto-hides after 10s of inactivity
- Styled with anime-inspired aesthetics (rounded, soft colors)

---

## Phase 6: Avatar State Machine (TODO)

```
IDLE ──(agent start)──→ THINKING
THINKING ──(text)──→ SPEAKING
SPEAKING ──(end)──→ IDLE
THINKING ──(tool)──→ WORKING ──(text)──→ SPEAKING
ANY ──(error)──→ CONFUSED → IDLE
ANY ──(click)──→ toggle chat bubble
```

Each state controls: active animations, VRM expression, lip sync on/off, chat bubble visibility.

---

## Build Sequence

1. ~~**Scaffold** — Create `packages/avatar-overlay/`, `package.json`, `tsconfig.json`~~ ✅
2. ~~**Electron shell** — `main.ts`, `window.ts`, `tray.ts`, `preload.ts` → verify transparent window works~~ ✅
3. ~~**Three.js scene** — `scene.ts`, `vrm-loader.ts` → verify VRM model renders in the transparent window~~ ✅
4. ~~**Animations** — `animator.ts`, `expressions.ts`, `lip-sync.ts` → avatar breathes, blinks, speaks~~ ✅
5. ~~**Gateway bridge** — `gateway-client.ts`, plugin service → avatar reacts to real OpenClaw events~~ ✅
6. **Chat bubble** — `chat-bubble.ts` → interactive text input/output
7. **State machine** — `avatar-state.ts` → wire everything together
8. ~~**Polish** — position persistence, tray menu, default model bundling~~ ✅

---

## Verification

1. Start OpenClaw gateway: `cd C:\Projects\openclaw && pnpm run gateway:dev`
2. Start avatar overlay: `cd C:\Projects\openclaw\packages\avatar-overlay && pnpm dev`
3. Verify: transparent window appears with anime avatar floating on desktop
4. Send a message through any OpenClaw channel (Telegram, Discord, etc.)
5. Verify: avatar transitions to thinking → speaking with lip sync and chat bubble
6. Click avatar → chat bubble opens → type message → verify it reaches OpenClaw
7. Verify: avatar returns to idle with breathing/blinking after response completes
