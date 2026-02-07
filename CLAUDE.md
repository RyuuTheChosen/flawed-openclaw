# flawed-avatar

Standalone OpenClaw plugin — VRM avatar overlay with TTS, expressions, and lip-sync.

## Structure

- `index.ts` / `src/service.ts` — plugin entry (registers commands with OpenClaw)
- `src/main/` — Electron main process (window, tray, IPC, persistence)
- `src/renderer/` — Three.js renderer (avatar, audio, UI)
- `src/shared/` — shared types and IPC channel definitions
- `assets/` — VRM models, animations, icon
- `openclaw.plugin.json` — plugin manifest

## Build

```
npm install
npm run build   # tsc + rolldown + copy-renderer-html
npm run dev     # build + launch electron
```
