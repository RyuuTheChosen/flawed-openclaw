```
  _____ _                        _    ___                    ____ _
 |  ___| | __ ___      _____  __| |  / _ \ _ __   ___ _ __ / ___| | __ ___      __
 | |_  | |/ _` \ \ /\ / / _ \/ _` | | | | | '_ \ / _ \ '_ \ |   | |/ _` \ \ /\ / /
 |  _| | | (_| |\ V  V /  __/ (_| | | |_| | |_) |  __/ | | | |___| | (_| |\ V  V /
 |_|   |_|\__,_| \_/\_/ \___|\__,_|  \___/| .__/ \___|_| |_|\____|_|\__,_| \_/\_/
                                           |_|
```

> **your local AI assistant, now with a face**

<p align="center">
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/fork_of-openclaw%2Fopenclaw-orange?style=for-the-badge" alt="Fork of openclaw/openclaw"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%E2%89%A522-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node >= 22"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron"></a>
</p>

---

## What is this?

**Flawed OpenClaw** is a fork of [openclaw/openclaw](https://github.com/openclaw/openclaw) — the personal AI assistant you run on your own devices. This fork adds **local LLM support** (LM Studio + Ollama with auto-discovery) and a **3D avatar overlay** (VTuber-style floating companion powered by Electron + Three.js + VRM). Everything upstream still works; this just bolts on new tricks.

---

## Fork Features

### Local LLM Onboarding

Run your assistant entirely offline. The onboarding wizard auto-discovers [LM Studio](https://lmstudio.ai/) and [Ollama](https://ollama.com/) instances on your network, configures provider routing, and sets zero-cost model entries — no API keys, no cloud, no drama.

- Auto-discovery of local LLM endpoints
- Provider config for `lmstudio/*` and `ollama/*` model refs
- 128k context window / 8192 max output tokens by default
- Seamless fallback to cloud providers when local models are unavailable

### 3D Avatar Overlay

A transparent, always-on-top Electron window that renders a VRM avatar using Three.js. Think VTuber companion that floats over your desktop while your assistant talks.

- **VRM model support** via `@pixiv/three-vrm`
- **Camera presets** — head (0.6), upper body (1.2), full body (3.0)
- **Draggable + resizable** — 300x400 default, remembers position
- **Zoom controls** — scroll to zoom (0.5x - 3.5x range)
- **System tray** integration with quick controls
- Ships with a default avatar (`assets/default-avatar.vrm`)

---

## Architecture

```
                         Flawed OpenClaw
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │   ┌──────────────┐        ┌───────────────────────┐  │
  │   │   Gateway     │        │   Avatar Overlay      │  │
  │   │              │        │   (Electron window)    │  │
  │   │  Channels:   │        │                       │  │
  │   │  - WhatsApp  │        │  Three.js + VRM       │  │
  │   │  - Telegram  │  IPC   │  ┌─────────────────┐  │  │
  │   │  - Slack     │◄──────►│  │  Animator        │  │  │
  │   │  - Discord   │        │  │  Scene           │  │  │
  │   │  - ...       │        │  │  VRM Loader      │  │  │
  │   │              │        │  └─────────────────┘  │  │
  │   │  Models:     │        │                       │  │
  │   │  - Cloud     │        │  System tray + drag   │  │
  │   │  - LM Studio │        └───────────────────────┘  │
  │   │  - Ollama    │                                   │
  │   └──────────────┘                                   │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

---

## Quick Start

> **Prerequisites:** Node >= 22, pnpm (recommended), Git

```bash
# Clone the fork
git clone https://github.com/AhmadMayo/openclaw.git flawed-openclaw
cd flawed-openclaw

# Install dependencies
pnpm install

# Build everything
pnpm build

# Run the onboarding wizard
pnpm openclaw onboard
```

The wizard walks you through gateway setup, workspace config, channel connections, model auth (including local LLM discovery), and skills.

---

## Avatar Overlay

The avatar overlay lives in `packages/avatar-overlay/` and runs as a standalone Electron app.

```bash
# Build the overlay
cd packages/avatar-overlay
pnpm build

# Launch it
pnpm start

# Or dev mode (build + launch)
pnpm dev
```

**What it does:**
- Opens a transparent, frameless, always-on-top window
- Loads a VRM avatar model and renders it with Three.js
- Provides idle animation and camera controls
- Sits in your system tray for quick access
- Remembers window position and camera zoom between sessions

**Custom avatars:** drop any `.vrm` file into `packages/avatar-overlay/assets/` and update the config to point to it.

<!-- screenshot placeholder: add a screenshot of the overlay here -->
<!-- ![Avatar Overlay](docs/assets/avatar-overlay-screenshot.png) -->

---

## Local LLM Setup

### Supported backends

| Backend | Default endpoint | Auto-discovered |
|---------|-----------------|-----------------|
| [LM Studio](https://lmstudio.ai/) | `http://localhost:1234` | Yes |
| [Ollama](https://ollama.com/) | `http://localhost:11434` | Yes |

### How it works

1. Run `openclaw onboard` (or re-run auth setup)
2. Select **Local LLM** as your provider
3. The wizard scans for running LM Studio / Ollama instances
4. Pick your model from the discovered list
5. Config is written with zero-cost billing entries and sensible defaults

Models are referenced as `lmstudio/<model-id>` or `ollama/<model-id>` in your config. You can mix local and cloud providers — the failover system handles routing automatically.

---

## Upstream

This fork is built on top of [**openclaw/openclaw**](https://github.com/openclaw/openclaw) by the OpenClaw team. All upstream features (channels, skills, canvas, voice, gateway) work as documented.

- Upstream repo: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- Docs: [docs.openclaw.ai](https://docs.openclaw.ai)
- Discord: [discord.gg/clawd](https://discord.gg/clawd)

---

## License

MIT -- same as upstream. See [LICENSE](LICENSE).
