<p align="center">
  <img src="README-header.png" alt="Flawed OpenClaw" width="600">
</p>

<h3 align="center">your local AI assistant, now with a face</h3>

<p align="center">
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/fork_of-openclaw%2Fopenclaw-orange?style=flat-square" alt="Fork of openclaw/openclaw"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 22"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/electron-33-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 33"></a>
</p>

<p align="center">
  <a href="#avatar-overlay">Avatar</a> •
  <a href="#local-llm-support">Local LLMs</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#upstream">Upstream</a>
</p>

---

## What is this?

**Flawed OpenClaw** is a fork of [openclaw/openclaw](https://github.com/openclaw/openclaw) — a personal AI assistant that runs on your own devices. This fork adds two features:

1. **3D Avatar Overlay** — A VTuber-style floating companion that visualizes your assistant's state
2. **Local LLM Support** — Run entirely offline with LM Studio or Ollama

Everything upstream works as documented. This fork just bolts on new capabilities.

---

## Avatar Overlay

A transparent Electron window that renders a VRM avatar using Three.js. The avatar reacts to your assistant's state in real-time.

<!-- Screenshot placeholder: replace with actual screenshot -->
<!--
<p align="center">
  <img src="docs/assets/avatar-overlay-demo.gif" alt="Avatar Overlay Demo" width="400">
</p>
-->

### Quick Install (Plugin)

Add the avatar to any existing OpenClaw installation:

```bash
openclaw plugins install https://github.com/RyuuTheChosen/flawed-openclaw/releases/download/avatar-overlay-v0.1.1/openclaw-avatar-overlay-0.1.1.tgz
openclaw restart
# → avatar window appears automatically
```

The avatar spawns when the gateway starts — no extra commands needed.

### Features

| Feature | Description |
|---------|-------------|
| **State Machine** | 4-state FSM: idle → thinking → speaking → working |
| **Animations** | Mixamo FBX clips with crossfade transitions and variety rotation |
| **Expressions** | 6 blendable expressions (neutral, happy, sad, angry, surprised, relaxed) |
| **Lip Sync** | Text-driven (50ms/char) or phoneme-driven via Kokoro TTS |
| **TTS** | Kokoro (offline, phoneme-aware) or Web Speech API |
| **Camera** | Zoom 0.5×–3.5× with presets (head, upper body, full body) |
| **VRM Support** | Any VRM 0.x or 1.x model via `@pixiv/three-vrm` |
| **Persistence** | Window position and camera zoom saved between sessions |

### State Visualization

The avatar maps agent lifecycle events to visual states:

```
lifecycle.start  →  thinking  →  surprised expression, thinking animation
assistant.text   →  speaking  →  happy expression, lip sync active
tool.*           →  working   →  relaxed expression, working animation
lifecycle.end    →  idle      →  neutral expression, idle animation
```

### Usage

**Option 1: Plugin install (recommended for existing OpenClaw users)**
```bash
openclaw plugins install npm:@openclaw/avatar-overlay
openclaw restart
```

**Option 2: Development (this fork)**
```bash
cd packages/avatar-overlay
pnpm dev    # Build + launch standalone
```

**Commands:**
- `/avatar_show` — Show overlay
- `/avatar_hide` — Hide overlay

**Custom avatars:** Configure a custom VRM model path in your OpenClaw config:
```yaml
# ~/.openclaw/config or openclaw.json
plugins:
  entries:
    avatar-overlay:
      config:
        vrmPath: "/path/to/your/model.vrm"
```

---

## Local LLM Support

Run your assistant entirely offline with auto-discovery of local LLM backends.

| Backend | Default Endpoint | Auto-discovered |
|---------|------------------|-----------------|
| [LM Studio](https://lmstudio.ai/) | `http://localhost:1234` | ✓ |
| [Ollama](https://ollama.com/) | `http://localhost:11434` | ✓ |

### Setup

1. Run `pnpm openclaw onboard`
2. Select **Local LLM** as your provider
3. The wizard scans for running instances
4. Pick your model from the discovered list

Models are referenced as `lmstudio/<model-id>` or `ollama/<model-id>`. You can mix local and cloud providers — failover handles routing automatically.

**Defaults:**
- 128k context window
- 8192 max output tokens
- Zero-cost billing entries

---

## Quick Start

**Prerequisites:** Node ≥ 22, pnpm, Git

```bash
# Clone
git clone https://github.com/RyuuTheChosen/flawed-openclaw.git
cd flawed-openclaw

# Install
pnpm install

# Build
pnpm build

# Onboard
pnpm openclaw onboard
```

The wizard walks through gateway setup, channel connections, model auth, and skills.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flawed OpenClaw                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐          ┌─────────────────────────────┐  │
│  │     Gateway      │          │      Avatar Overlay         │  │
│  │                  │          │      (Electron + Three.js)  │  │
│  │  Channels:       │          │                             │  │
│  │  • WhatsApp      │    WS    │  ┌───────────────────────┐  │  │
│  │  • Telegram      │◄────────►│  │ VRM Model             │  │  │
│  │  • Slack         │          │  │ State Machine (FSM)   │  │  │
│  │  • Discord       │          │  │ Expression Controller │  │  │
│  │  • Signal        │          │  │ Lip Sync Engine       │  │  │
│  │  • iMessage      │          │  │ TTS (Kokoro/Web)      │  │  │
│  │  • Matrix        │          │  └───────────────────────┘  │  │
│  │  • Line          │          │                             │  │
│  │  • + more        │          │  System Tray + Drag/Resize  │  │
│  │                  │          └─────────────────────────────┘  │
│  │  Models:         │                                           │
│  │  • Cloud APIs    │                                           │
│  │  • LM Studio     │                                           │
│  │  • Ollama        │                                           │
│  └──────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── avatar-overlay/     # Electron + Three.js avatar (this fork)
├── clawdbot/           # Bot framework
└── moltbot/            # Alternative bot implementation
```

---

## Tech Stack

### Avatar Overlay

| Component | Technology |
|-----------|------------|
| Runtime | Electron 33 |
| 3D Engine | Three.js 0.170 |
| VRM | @pixiv/three-vrm 3.x |
| TTS | Kokoro-js 1.2 |
| Bundler | Rolldown |

### Core Platform

| Component | Technology |
|-----------|------------|
| Runtime | Node.js ≥ 22 |
| Language | TypeScript 5.9 |
| Package Manager | pnpm 10 |
| Linter | oxlint |
| Formatter | oxfmt |
| Test | Vitest |

---

## Upstream

This fork is built on [**openclaw/openclaw**](https://github.com/openclaw/openclaw).

- **Upstream:** [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Docs:** [docs.openclaw.ai](https://docs.openclaw.ai)
- **Discord:** [discord.gg/clawd](https://discord.gg/clawd)

All upstream features (channels, skills, canvas, voice, gateway) work as documented.

---

## Fork Activity

<a href="https://star-history.com/#RyuuTheChosen/flawed-openclaw&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=RyuuTheChosen/flawed-openclaw&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=RyuuTheChosen/flawed-openclaw&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=RyuuTheChosen/flawed-openclaw&type=Date" width="600" />
  </picture>
</a>

---

## License

MIT — same as upstream. See [LICENSE](LICENSE).
