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

### `main.ts` — App Lifecycle
- Create the overlay window
- Connect to OpenClaw gateway WebSocket (`ws://127.0.0.1:18789` default)
- Forward gateway events to renderer via IPC
- System tray setup

### `tray.ts` — System Tray Menu
- Show/Hide avatar
- Change VRM model (file picker)
- Gateway URL setting
- Quit

---

## Phase 3: Gateway WebSocket Integration

### Connection (replicating `src/gateway/client.ts` pattern)
1. Open WebSocket to `ws://127.0.0.1:18789`
2. Handle `connect.challenge` → respond with connect params
3. Authenticate with password from `~/.openclaw/config.yaml`
4. Listen for `"agent"` broadcast events

### Event Mapping (`event-bridge.ts`)
| Gateway Event | Avatar Action |
|---|---|
| `stream: "lifecycle"`, `phase: "start"` | → THINKING (look up, slow blink) |
| `stream: "assistant"`, `data.text` | → SPEAKING (lip sync, show chat bubble) |
| `stream: "tool"` | → WORKING (curious expression) |
| `stream: "lifecycle"`, `phase: "end"` | → IDLE (return to breathing/blinking) |
| `stream: "error"` | → brief confused face, then IDLE |

### Sending Messages
- User types in chat bubble → send via gateway `chat.send` method
- Mic input (future) → transcribe and send

**Key source files**:
- `src/gateway/client.ts` — GatewayClient class to replicate
- `src/infra/agent-events.ts:5-12` — AgentEventPayload type definition
- `src/gateway/server-chat.ts` — how agent events are broadcast

---

## Phase 4: Three.js Avatar Renderer

### `scene.ts`
- WebGLRenderer with `alpha: true` (transparent background)
- Perspective camera framing avatar from chest up
- Soft ambient + directional light (anime-style)
- 30fps idle, 60fps when speaking

### `vrm-loader.ts`
- Load `.vrm` via GLTFLoader + VRMLoaderPlugin
- Default: bundled `AvatarSample_A.vrm` from VRM Consortium (MIT license)
- User can swap via tray menu file picker

### `animator.ts` — Procedural Animations
- **Breathing**: sine wave on chest bone rotation
- **Blinking**: trigger `blink` expression every 2-6s randomly
- **Micro-movement**: slight head sway via VRM LookAt
- **Speaking bounce**: subtle body bob when talking

### `lip-sync.ts`
- Text-based: map characters to VRM mouth shapes (aa, ih, ou, ee, oh) at ~50ms/char
- Cycle through visemes as text streams in

### `expressions.ts`
- VRM blendshapes: `happy`, `sad`, `angry`, `surprised`, `relaxed`, `neutral`
- Simple keyword detection from assistant text to pick expression
- Smooth transitions via lerp over 300ms

---

## Phase 5: Chat Bubble UI

- Semi-transparent rounded bubble above/beside avatar
- Shows streamed assistant text word-by-word
- Text input at bottom for user messages
- Click avatar to toggle bubble visibility
- Auto-hides after 10s of inactivity
- Styled with anime-inspired aesthetics (rounded, soft colors)

---

## Phase 6: Avatar State Machine

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

1. **Scaffold** — Create `packages/avatar-overlay/`, `package.json`, `tsconfig.json`
2. **Electron shell** — `main.ts`, `window.ts`, `tray.ts`, `preload.ts` → verify transparent window works
3. **Three.js scene** — `scene.ts`, `vrm-loader.ts` → verify VRM model renders in the transparent window
4. **Animations** — `animator.ts`, `expressions.ts`, `lip-sync.ts` → avatar breathes, blinks, speaks
5. **Gateway bridge** — `event-bridge.ts`, gateway WebSocket client → avatar reacts to real OpenClaw events
6. **Chat bubble** — `chat-bubble.ts` → interactive text input/output
7. **State machine** — `avatar-state.ts` → wire everything together
8. **Polish** — position persistence, tray menu, default model bundling

---

## Verification

1. Start OpenClaw gateway: `cd C:\Projects\openclaw && pnpm run gateway:dev`
2. Start avatar overlay: `cd C:\Projects\openclaw\packages\avatar-overlay && pnpm dev`
3. Verify: transparent window appears with anime avatar floating on desktop
4. Send a message through any OpenClaw channel (Telegram, Discord, etc.)
5. Verify: avatar transitions to thinking → speaking with lip sync and chat bubble
6. Click avatar → chat bubble opens → type message → verify it reaches OpenClaw
7. Verify: avatar returns to idle with breathing/blinking after response completes
