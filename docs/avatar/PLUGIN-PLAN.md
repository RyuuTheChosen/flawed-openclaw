# Avatar-Overlay OpenClaw Plugin

Status: **Implemented** (Phases 1-3 complete, Phase 4 ready)

## Goal

Users add a 3D avatar face to any existing OpenClaw installation with one command — no reinstall needed. The avatar reacts to agent activity in real-time (thinking, speaking, working) and supports per-agent VRM models.

## End-User Experience

```bash
openclaw plugins install npm:@openclaw/avatar-overlay
openclaw restart
# → avatar window appears, reacts to agent activity
```

For development/testing:
```yaml
# ~/.openclaw/config
plugins:
  load:
    paths:
      - "C:/Projects/openclaw/packages/avatar-overlay"
```

---

## Architecture

```
OpenClaw Gateway (port 18789)
  │
  ├── Plugin loader (jiti) loads index.ts
  │     └── register(api) called
  │           ├── api.registerService(avatarService)
  │           └── api.registerCommand("avatar-show" / "avatar-hide")
  │
  ├── startPluginServices() calls avatarService.start(ctx)
  │     └── Spawns Electron as child process (stdio: pipe)
  │           │
  │           ├── Electron Main Process
  │           │     ├── main.ts (CLI args + stdin JSON listener)
  │           │     ├── gateway-client.ts (WS → ws://127.0.0.1:18789)
  │           │     │     └── Receives "agent" event frames
  │           │     │           └── Forwards to renderer via IPC
  │           │     ├── stdin-listener.ts (show/hide/shutdown/model-switch)
  │           │     ├── window.ts (transparent overlay, unchanged)
  │           │     └── tray.ts (system tray, unchanged)
  │           │
  │           └── Electron Renderer
  │                 ├── renderer.ts (subscribes to agent state IPC)
  │                 └── animator.ts (maps agent phase → animation)
  │                       ├── idle: breathing + blinking + normal sway
  │                       ├── thinking: expression("surprised") + 2.5x sway
  │                       ├── speaking: expression("happy") + lip-sync + nodding
  │                       └── working: expression("relaxed") + head-down tilt
  │
  └── Gateway shutdown → avatarService.stop(ctx) → kills Electron
```

---

## Phase 1: Plugin Wrapper [DONE]

Makes the existing Electron app launchable as an OpenClaw plugin service.

### Files created

**`packages/avatar-overlay/openclaw.plugin.json`** — Plugin manifest with config schema supporting `autoStart`, `vrmPath`, `gatewayUrl`, and per-agent `agents` map.

**`packages/avatar-overlay/index.ts`** — Plugin entry point following `extensions/diagnostics-otel/index.ts` pattern. Registers the service and two commands (`avatar-show`, `avatar-hide`).

**`packages/avatar-overlay/src/service.ts`** — Implements `OpenClawPluginService` (interface at `src/plugins/types.ts:207-211`):

- `start(ctx)`: checks `autoStart` config, skips on headless Linux (no `DISPLAY`/`WAYLAND_DISPLAY`), resolves the Electron binary and main entry via `electron-launcher.ts`, spawns child process with `stdio: pipe`, wires crash recovery (5s base, 30s max backoff, resets after 60s uptime).
- `stop(ctx)`: sends `{ type: "shutdown" }` via stdin, waits 3s then SIGTERM, waits 5s total then SIGKILL.
- `send(msg)`: writes JSON + newline to child stdin. Used by `avatar-show`/`avatar-hide` commands and model-switch.

**`packages/avatar-overlay/src/electron-launcher.ts`** — Resolves the Electron binary path via `createRequire`, resolves the compiled main entry, and builds CLI args (`--gateway-url`, `--vrm-path`, `--agent-configs`).

**`packages/avatar-overlay/src/main/stdin-listener.ts`** — Readline-based newline-delimited JSON parser for stdin commands.

### Stdin protocol (service → Electron)

```json
{ "type": "show" }
{ "type": "hide" }
{ "type": "shutdown" }
{ "type": "model-switch", "vrmPath": "/path/to/model.vrm" }
```

### Files modified

**`packages/avatar-overlay/src/main/main.ts`** — Rewritten to parse CLI args (`--gateway-url`, `--vrm-path`, `--agent-configs`), set up stdin listener, and initialize the gateway client. VRM path respects CLI override.

**`packages/avatar-overlay/package.json`** — Added `openclaw.extensions` field for plugin discovery, `files` array for npm packaging, `ws` runtime dependency, `openclaw` workspace devDependency, and `@types/ws`.

### Verification

```bash
# Add to ~/.openclaw/config:
#   plugins.load.paths: ["C:/Projects/openclaw/packages/avatar-overlay"]
# Then:
openclaw restart
# Expected: avatar window appears
# Expected: openclaw plugins list shows "avatar-overlay" as "loaded"
# Expected: /avatar-hide hides window, /avatar-show brings it back
# Expected: openclaw stop kills avatar cleanly
```

---

## Phase 2: Gateway WebSocket Bridge [DONE]

Connects the Electron process to the gateway WebSocket so agent activity drives avatar animations.

### Files created

**`packages/avatar-overlay/src/main/gateway-client.ts`** — Lightweight WebSocket client in Electron's main process. Implements the minimal protocol v3 handshake without device auth:

1. Opens WebSocket to gateway URL (default `ws://127.0.0.1:18789`)
2. On `open`, queues connect after 750ms
3. Waits for `connect.challenge` event with nonce
4. Sends connect request:
   ```json
   {
     "type": "req",
     "id": "<uuid>",
     "method": "connect",
     "params": {
       "minProtocol": 3,
       "maxProtocol": 3,
       "client": {
         "id": "gateway-client",
         "displayName": "Avatar Overlay",
         "version": "0.1.0",
         "platform": "<process.platform>",
         "mode": "backend"
       },
       "caps": [],
       "role": "operator",
       "scopes": ["operator.admin"],
       "auth": {}
     }
   }
   ```
5. Listens for event frames where `event === "agent"`
6. Reconnects on close/error with exponential backoff (3s base, 30s max)

**Event processing logic:**

| Agent event | Avatar phase | Expression | Motion |
|------------|-------------|------------|--------|
| `lifecycle` + `phase: "start"` | `thinking` | surprised | 2.5x sway amplitude |
| `assistant` + `text` | `speaking` | happy | lip-sync + nodding |
| `tool` | `working` | relaxed | head-down tilt (+0.05 rad) |
| `lifecycle` + `phase: "end"/"error"` | `idle` | neutral | normal sway |

### Files modified

**`packages/avatar-overlay/src/shared/ipc-channels.ts`** — Added `AGENT_STATE: "avatar:agent-state"` (9th channel).

**`packages/avatar-overlay/src/shared/config.ts`** — Added `GATEWAY_URL_DEFAULT`, `GATEWAY_RECONNECT_BASE_MS` (3s), `GATEWAY_RECONNECT_MAX_MS` (30s).

**`packages/avatar-overlay/src/main/preload.cjs`** — Added `AGENT_STATE` to IPC const and `onAgentState(callback)` bridge method (same pattern as `onVrmModelChanged`).

**`packages/avatar-overlay/src/renderer/types/avatar-bridge.d.ts`** — Added `onAgentState()` to the `AvatarBridge` interface with typed phase/text/agentId state.

**`packages/avatar-overlay/src/renderer/renderer.ts`** — Added agent state listener (before the model-swap handler) that calls `animator.setExpression()`, `animator.setPhase()`, `animator.feedLipSyncText()`, and `animator.stopLipSync()` based on phase.

**`packages/avatar-overlay/src/renderer/avatar/animator.ts`** — Added `AgentPhase` type, `currentPhase` state, and `setPhase(phase)` method to the `Animator` interface and implementation. `updateHeadSway()` now modulates amplitude by phase (2.5x for thinking, 1.5x for speaking), adds a downward tilt for working (+0.05 rad), and adds nodding for speaking (sin at 3.0 Hz).

### Verification

```bash
openclaw restart
# Send a message to the agent
# Expected: Avatar transitions idle → thinking → speaking (lips move) → idle
# Expected: Agent tool call → avatar shows working pose (head tilted down)
# Expected: On gateway stop, WS reconnects with backoff
```

---

## Phase 3: Per-Agent Identity [DONE]

Different VRM models per agent, tracked in the gateway client.

### Implementation approach

Agent-tracking lives in the gateway client (simpler than routing through the service). Per-agent VRM configs are serialized as JSON and passed to Electron via CLI arg `--agent-configs=<json>`.

**In `gateway-client.ts`:** When a `sessionKey` changes between agent events, the client checks `agentConfigs[sessionKey].vrmPath` and sends `IPC.VRM_MODEL_CHANGED` to the renderer, triggering the existing VRM hot-swap flow (`unloadVrmModel` → `loadVrmModel` → `animator.setVrm`).

**In `main.ts`:** Parses `--agent-configs` JSON from CLI args and passes it to `createGatewayClient()`. The stdin `model-switch` command also works for manual switches from the service side.

### Configuration

```yaml
# ~/.openclaw/config
plugins:
  entries:
    avatar-overlay:
      config:
        agents:
          main:
            vrmPath: "C:/path/to/assistant.vrm"
          research:
            vrmPath: "C:/path/to/researcher.vrm"
```

### Verification

```bash
openclaw restart
# Send message to "main" agent → first VRM loads
# Switch to "research" agent → VRM hot-swaps
# Agent with no custom VRM → uses default model
```

---

## Phase 4: Package & Publish [READY]

### Current package.json

```json
{
  "name": "@openclaw/avatar-overlay",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main/main/main.js",
  "files": ["index.ts", "src/", "dist/main/", "dist/renderer-bundle/", "assets/", "openclaw.plugin.json"],
  "openclaw": { "extensions": ["./index.ts"] },
  "dependencies": {
    "three": "~0.170.0",
    "@pixiv/three-vrm": "~3.3.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*",
    "electron": "~33.0.0",
    "electron-builder": "~25.1.0",
    "rolldown": "1.0.0-rc.2",
    "typescript": "^5.9.3",
    "@types/three": "~0.170.0",
    "@types/ws": "^8.5.0"
  }
}
```

**Build produces:**
- `dist/main/` — compiled Electron main process (tsc from `tsconfig.main.json`)
- `dist/renderer-bundle/` — bundled renderer (rolldown) + copied `index.html` and `preload.cjs`

**Plugin entry (`index.ts`) stays as TypeScript** — jiti transpiles it at runtime (same as diagnostics-otel).

### Publish

```bash
cd packages/avatar-overlay
npm run build
npm publish --access public
```

### User install flow

```bash
openclaw plugins install npm:@openclaw/avatar-overlay
```

Triggers `installPluginFromNpmSpec()` at `src/plugins/install.ts:392`:
1. `npm pack @openclaw/avatar-overlay` → downloads tarball
2. Extracts to temp dir
3. Copies to `~/.openclaw/extensions/avatar-overlay/`
4. `npm install --omit=dev` in target dir → downloads Three.js + ws
5. Returns success

```bash
openclaw restart
# Avatar appears
```

---

## All Files

### New files (6)

| File | Purpose |
|------|---------|
| `packages/avatar-overlay/openclaw.plugin.json` | Plugin manifest + config schema |
| `packages/avatar-overlay/index.ts` | Plugin entry: registerService + registerCommand |
| `packages/avatar-overlay/src/service.ts` | OpenClawPluginService: spawn/kill Electron, stdin protocol, crash recovery |
| `packages/avatar-overlay/src/electron-launcher.ts` | Resolve electron binary path, main entry, build CLI args |
| `packages/avatar-overlay/src/main/gateway-client.ts` | WS client (protocol v3) for Electron main process, agent event mapping |
| `packages/avatar-overlay/src/main/stdin-listener.ts` | Readline newline-delimited JSON parser |

### Modified files (8)

| File | Change |
|------|--------|
| `packages/avatar-overlay/package.json` | `openclaw` field, `files`, `ws` dep, `openclaw` devDep |
| `packages/avatar-overlay/src/main/main.ts` | CLI arg parsing, stdin listener, gateway client init |
| `packages/avatar-overlay/src/shared/ipc-channels.ts` | `AGENT_STATE` channel |
| `packages/avatar-overlay/src/shared/config.ts` | Gateway URL + reconnect constants |
| `packages/avatar-overlay/src/main/preload.cjs` | `AGENT_STATE` IPC const + `onAgentState` bridge method |
| `packages/avatar-overlay/src/renderer/types/avatar-bridge.d.ts` | `onAgentState` in `AvatarBridge` interface |
| `packages/avatar-overlay/src/renderer/renderer.ts` | Agent state listener driving expressions + phase + lip-sync |
| `packages/avatar-overlay/src/renderer/avatar/animator.ts` | `AgentPhase` type, `setPhase()`, phase-modulated head sway |

### Unchanged files (existing, work as-is)

| File | Why unchanged |
|------|--------------|
| `src/main/window.ts` | Already handles VRM_MODEL_CHANGED, position/zoom persistence |
| `src/main/tray.ts` | System tray works as-is |
| `src/renderer/avatar/scene.ts` | Three.js scene setup unchanged |
| `src/renderer/avatar/vrm-loader.ts` | VRM load/unload unchanged |
| `src/renderer/avatar/expressions.ts` | Expression controller already has full API |
| `src/renderer/avatar/lip-sync.ts` | Lip-sync already has feedText/stop/isSpeaking |
| `src/renderer/index.html` | CSP doesn't need changes (WS runs in main process) |

---

## Testing Approaches

### Option A: Config path (development iteration)

Point the gateway directly at the source directory. jiti transpiles TypeScript on the fly — no build step needed for the plugin entry, but the Electron code must be built.

```bash
cd packages/avatar-overlay
pnpm build
```

```yaml
# ~/.openclaw/config
plugins:
  load:
    paths:
      - "C:/Projects/openclaw/packages/avatar-overlay"
```

```bash
openclaw restart
# Avatar window appears
# Edit code → restart gateway → changes take effect immediately
```

This hits `discoverFromPath()` at `src/plugins/discovery.ts:203`. The gateway reads `package.json`, finds the `openclaw.extensions` field, resolves `index.ts`, and loads it via jiti. Fast iteration — just restart the gateway after changes.

### Option C: Install command (simulates real user flow)

**Local testing (before publishing):**

```bash
openclaw plugins install path:./packages/avatar-overlay
```

What happens (`installPluginFromPath()` at `install.ts:446`):
1. Resolves the path, sees it's a directory
2. Reads `package.json`, extracts package name, derives plugin ID `avatar-overlay`
3. Copies the entire directory to `~/.openclaw/extensions/avatar-overlay/`
4. Runs `npm install --omit=dev` inside the target — downloads Electron, Three.js, ws
5. Returns success

```bash
openclaw restart
# Avatar window appears from the installed copy
```

Every code change requires re-installing (it copies the directory). Use Option A for active development, Option C for final integration testing.

**Production testing (after publishing):**

```bash
cd packages/avatar-overlay
pnpm build
npm publish --access public
```

```bash
# On any machine:
openclaw plugins install npm:@openclaw/avatar-overlay
openclaw restart
```

What happens (`installPluginFromNpmSpec()` at `install.ts:392`):
1. `npm pack @openclaw/avatar-overlay` — downloads tarball from npm
2. Extracts to temp dir, finds the `package/` root
3. Copies to `~/.openclaw/extensions/avatar-overlay/`
4. `npm install --omit=dev` — downloads Electron (~180MB), Three.js, ws
5. Gateway discovers plugin on next restart

Resulting directory on the user's machine:
```
~/.openclaw/extensions/avatar-overlay/
  ├── package.json              ← has "openclaw.extensions"
  ├── openclaw.plugin.json      ← has "id": "avatar-overlay"
  ├── index.ts                  ← plugin entry (jiti loads this)
  ├── src/service.ts            ← spawns Electron
  ├── src/electron-launcher.ts
  ├── dist/main/                ← pre-compiled Electron main
  ├── dist/renderer-bundle/     ← pre-bundled Three.js + VRM
  ├── assets/default-avatar.vrm
  └── node_modules/             ← npm installed
        ├── electron/
        ├── three/
        ├── @pixiv/three-vrm/
        └── ws/
```

### Testing flow summary

| Stage | Method | Command |
|-------|--------|---------|
| Active development | Option A (config path) | Edit → `pnpm build` → `openclaw restart` |
| Integration test | Option C (local install) | `openclaw plugins install path:./packages/avatar-overlay` |
| Release test | Option C (npm install) | `npm publish` → `openclaw plugins install npm:@openclaw/avatar-overlay` |

---

## Verification Checklist

### Phase 1 (plugin wrapper)
- [ ] `openclaw plugins list` shows `avatar-overlay` as `loaded`
- [ ] `openclaw restart` spawns avatar window
- [ ] `/avatar-hide` hides, `/avatar-show` shows
- [ ] `openclaw stop` kills avatar cleanly (no orphan process)
- [ ] Crash recovery: kill Electron manually, verify it respawns
- [ ] Headless: set `DISPLAY=""` on Linux, verify service skips without crash

### Phase 2 (gateway bridge)
- [ ] WS connects to gateway on startup (check Electron logs)
- [ ] Send message to agent → avatar goes thinking → speaking (lips move) → idle
- [ ] Agent tool call → avatar shows working pose
- [ ] Kill gateway → WS reconnects with backoff after restart
- [ ] Multiple rapid messages → animations queue/transition smoothly

### Phase 3 (per-agent identity)
- [ ] Configure two agents with different VRM paths
- [ ] First agent message → correct VRM loads
- [ ] Switch agent → VRM hot-swaps to second model
- [ ] Agent with no custom VRM → uses default model

### Phase 4 (publish)
- [ ] `npm run build` produces `dist/main/` and `dist/renderer-bundle/`
- [ ] `npm pack` produces clean tarball with correct `files`
- [ ] Fresh machine: `openclaw plugins install npm:@openclaw/avatar-overlay` succeeds
- [ ] Fresh machine: `openclaw restart` shows avatar with no extra config
