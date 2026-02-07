<p align="center">
  <img src="assets/icon.png" width="80" alt="flawed-avatar icon" />
</p>

<h1 align="center">flawed-avatar</h1>

<p align="center">
  A 3D avatar overlay that gives your <a href="https://github.com/nichochar/open-claw">OpenClaw</a> agent a face.<br/>
  Real-time expressions, lip-sync, text-to-speech, and eye tracking — all running locally.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flawed-avatar"><img src="https://img.shields.io/npm/v/flawed-avatar?color=cb3837&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/RyuuTheChosen/flawed-openclaw?color=blue" alt="MIT License" /></a>
  <a href="https://github.com/RyuuTheChosen/flawed-openclaw"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platforms" /></a>
</p>

---

## What it does

The avatar sits in a transparent, always-on-top overlay and reacts to your agent in real time:

| Agent state | Avatar behavior |
|---|---|
| **Idle** | Breathing animation, relaxed posture, ambient eye saccades |
| **Thinking** | Surprised expression, amplified head sway |
| **Speaking** | Happy expression, lip-sync driven by TTS audio or text |
| **Working** | Relaxed expression, subtle working tilt, head nod |

It connects to the OpenClaw gateway over WebSocket and listens for agent lifecycle events — no polling, no config wiring.

## Features

**Avatar & Animation**
- VRM model rendering via Three.js and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- Compound facial expressions with cubic-eased blend shape transitions
- Procedural breathing, head sway, speaking nod, and working tilt
- FBX animation clips per phase (idle, thinking, speaking, working) with Mixamo retargeting
- Spring bone physics for hair and accessories
- Image-based lighting (IBL) with spherical harmonics

**Lip-sync & TTS**
- Audio-driven viseme blending via [wLipSync](https://github.com/hecomi/uLipSync)
- Local neural TTS via [Kokoro](https://github.com/hexgrad/kokoro) (11 voices, offline ONNX)
- Browser Web Speech API as a lightweight alternative
- Text-based lip-sync fallback when TTS is off

**Eye & Gaze**
- Eyes track your cursor across the entire screen
- Micro-saccades with configurable yaw/pitch range and hold durations
- Hover awareness — avatar reacts when you mouse over it

**Desktop Integration**
- Transparent, click-through Electron overlay (mouse passes through empty pixels)
- Native drag to reposition
- Scroll-wheel zoom (0.5x to 6.0x)
- System tray with show/hide, model picker, and settings
- Chat window to message the active agent directly
- Settings panel for scale, lighting, TTS engine, and voice selection
- All preferences persisted between sessions

**Multi-agent**
- Per-agent VRM model assignment (different agents get different avatars)
- Automatic model switching when the active agent changes

## Install

### macOS / Linux

```bash
openclaw plugins install flawed-avatar
openclaw plugins enable flawed-avatar
```

### Windows

> `openclaw plugins install <npm-package>` is currently broken on Windows + Node.js v22+ due to an upstream OpenClaw bug. Use the tarball workaround:

```bash
npm pack flawed-avatar
openclaw plugins install ./flawed-avatar-0.2.1.tgz
cd %USERPROFILE%\.openclaw\extensions\flawed-avatar
npm install --omit=dev
openclaw plugins enable flawed-avatar
```

Then restart the gateway:

```bash
openclaw gateway restart
```

The avatar overlay will appear automatically.

## Configuration

Add plugin settings to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "flawed-avatar": {
        "enabled": true,
        "config": {
          "autoStart": true,
          "vrmPath": "/path/to/custom-model.vrm",
          "gatewayUrl": "ws://127.0.0.1:18789",
          "agents": {
            "agent:researcher:main": { "vrmPath": "/models/researcher.vrm" },
            "agent:coder:main": { "vrmPath": "/models/coder.vrm" }
          }
        }
      }
    }
  }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `autoStart` | `boolean` | `true` | Launch overlay when OpenClaw starts |
| `vrmPath` | `string` | bundled model | Path to a default VRM model |
| `gatewayUrl` | `string` | `ws://127.0.0.1:18789` | OpenClaw gateway WebSocket URL |
| `agents` | `object` | — | Per-agent VRM overrides keyed by session key |

## Controls

| Input | Action |
|---|---|
| **Scroll wheel** | Zoom in/out |
| **Drag handle** | Reposition the overlay |
| Chat icon | Toggle chat window |
| Speaker icon | Toggle TTS |
| Gear icon | Open settings panel |
| Tray icon | Show/hide, change model, quit |

## Settings panel

- **Scale** — 0.5x to 2.0x avatar size
- **Lighting** — Studio, Warm, Cool, Neutral, or Custom profiles
- **TTS Engine** — Web Speech (browser) or Kokoro (local neural)
- **TTS Voice** — 11 Kokoro voices (American/British, male/female) or system voices

## Architecture

```
Plugin Service (Node.js)
  │
  ├── Spawns Electron child process
  │     │
  │     ├── Main Process
  │     │     ├── Gateway WebSocket client (agent events)
  │     │     ├── Window manager (avatar + chat + settings)
  │     │     ├── System tray
  │     │     └── Persistence (settings, chat history)
  │     │
  │     └── Renderer (Three.js)
  │           ├── VRM loader + spring bones + IBL
  │           ├── Animator (expressions, breathing, gaze, lip-sync)
  │           └── Audio pipeline (Kokoro TTS → wLipSync → visemes)
  │
  └── Stdin IPC (show/hide/shutdown/model-switch)
```

## Development

```bash
git clone https://github.com/RyuuTheChosen/flawed-openclaw.git
cd flawed-openclaw
npm install
npm run dev     # build + launch Electron
```

| Script | Description |
|---|---|
| `npm run build` | TypeScript + Rolldown bundle + copy renderer assets |
| `npm run dev` | Build and launch in one step |
| `npm run start` | Launch the last build without recompiling |

### Project structure

```
index.ts                        Plugin registration (OpenClaw SDK)
src/service.ts                  Electron process lifecycle manager
src/main/
  main.ts                       Electron entry point
  gateway-client.ts             WebSocket client (protocol v3)
  window-manager.ts             Multi-window coordination
  tray.ts                       System tray menu
  persistence/                  JSON file store with migrations
src/renderer/
  renderer.ts                   Boot sequence and render loop
  avatar/                       VRM, animator, expressions, eye gaze, spring bones
  audio/                        TTS engines, lip-sync, phoneme mapping
  ui/                           Chat bubble, typing indicator
  chat-window/                  Chat panel renderer
  settings-window/              Settings panel renderer
src/shared/
  config.ts                     All tunable constants
  types.ts                      AgentPhase, AgentState
  ipc-channels.ts               Electron IPC channel definitions
assets/
  models/                       Bundled VRM avatars
  animations/{idle,thinking,speaking,working}/   FBX motion clips
```

## Requirements

- Node.js >= 18
- OpenClaw (peer dependency)
- Desktop environment with display server (auto-skips on headless Linux)

## License

[MIT](LICENSE)
