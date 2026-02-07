# Publishing flawed-avatar to npm

## Prerequisites

- npm account with publish access to the `flawed-avatar` package
- Logged in via `npm login`
- Clean working tree (`git status` shows no uncommitted changes)

## Pre-publish checklist

1. **Bump the version** in `package.json` following semver:
   - Patch (`0.2.1` -> `0.2.2`): bug fixes
   - Minor (`0.2.1` -> `0.3.0`): new features, backward-compatible
   - Major (`0.2.1` -> `1.0.0`): breaking changes

   ```bash
   npm version patch   # or minor / major
   ```

2. **Build the project** to regenerate all dist artifacts:

   ```bash
   npm run build
   ```

   This runs `tsc --build`, `rolldown`, and copies renderer HTML/CSS/preload files into `dist/`.

3. **Verify the package contents** with a dry run:

   ```bash
   npm pack --dry-run
   ```

   Confirm the tarball includes:
   - `index.ts` — plugin entry point
   - `src/` — TypeScript source
   - `dist/main/` — compiled Electron main process
   - `dist/preload.cjs`, `dist/chat-preload.cjs`, `dist/settings-preload.cjs` — preload scripts
   - `dist/renderer-bundle/` — bundled avatar renderer (JS + HTML + CSS)
   - `dist/chat-renderer-bundle/` — bundled chat window
   - `dist/settings-renderer-bundle/` — bundled settings panel
   - `assets/` — VRM models, FBX animations, tray icon
   - `openclaw.plugin.json` — plugin manifest
   - `package.json`, `LICENSE`

4. **Check the package size.** The tarball is ~15 MB due to bundled VRM models and FBX animations. This is expected.

## Publish

```bash
npm publish
```

For a pre-release or beta:

```bash
npm publish --tag beta
```

## What gets published

Controlled by the `files` field in `package.json`:

```
index.ts
src/
dist/main/
dist/preload.cjs
dist/chat-preload.cjs
dist/settings-preload.cjs
dist/renderer-bundle/
dist/chat-renderer-bundle/
dist/settings-renderer-bundle/
assets/
openclaw.plugin.json
```

Files **not** published: `node_modules/`, `rolldown.config.mjs`, `tsconfig*.json`, `scripts/`, dev config files.

## Post-publish

1. **Tag the release** (if `npm version` wasn't used):

   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push origin main --tags
   ```

2. **Create a GitHub release** with the tarball attached so Windows users can download directly:

   ```bash
   # Build the tarball
   npm pack

   # Create the release (edit the notes as needed)
   gh release create v<version> ./flawed-avatar-<version>.tgz \
     --repo RyuuTheChosen/flawed-openclaw \
     --title "flawed-avatar v<version>" \
     --notes "$(cat <<NOTES
   ## Changes

   - (list changes here)

   ## Install

   **macOS / Linux:**
   \`\`\`bash
   openclaw plugins install flawed-avatar
   \`\`\`

   **Windows (Node.js v22+):**
   Download \`flawed-avatar-<version>.tgz\` from this release, then:
   \`\`\`bash
   openclaw plugins install ./flawed-avatar-<version>.tgz
   cd %USERPROFILE%\.openclaw\extensions\flawed-avatar
   npm install --omit=dev
   \`\`\`
   NOTES
   )"
   ```

   This gives Windows users a direct download link without needing `npm pack` locally.

3. **Verify** the published package:

   ```bash
   npm info flawed-avatar
   ```

---

## How users install this plugin

### Install via tarball (Windows)

On Windows with Node.js v22+, `openclaw plugins install` fails due to an upstream OpenClaw bug (`spawn EINVAL`). Use the tarball workaround instead:

```bash
npm pack flawed-avatar
openclaw plugins install ./flawed-avatar-0.2.1.tgz
```

The extraction succeeds but the automatic `npm install` step will crash. Finish the install manually:

```bash
cd %USERPROFILE%\.openclaw\extensions\flawed-avatar
npm install --omit=dev
```

Replace `0.2.1` with the actual version number.

### Install via OpenClaw CLI (npm)

On macOS and Linux, direct npm installation works:

```bash
openclaw plugins install flawed-avatar
```

This downloads the package from npm and installs it into the OpenClaw extensions directory (`~/.openclaw/extensions/flawed-avatar/`).

> **Windows note:** This method currently fails on Windows with Node.js v22+ due to an OpenClaw CLI bug
> ([`spawn EINVAL`](https://github.com/nichochar/open-claw/issues) when spawning `npm.cmd` with mixed stdio).
> Use the tarball method above until this is fixed upstream.

### Enable the plugin

After installation, enable it in your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "flawed-avatar": {
        "enabled": true
      }
    }
  }
}
```

Or via CLI:

```bash
openclaw plugins enable flawed-avatar
```

### Configure (optional)

Add plugin-specific settings under the `config` key:

```json
{
  "plugins": {
    "entries": {
      "flawed-avatar": {
        "enabled": true,
        "config": {
          "autoStart": true,
          "vrmPath": "/path/to/your-model.vrm",
          "gatewayUrl": "ws://127.0.0.1:18789",
          "agents": {
            "agent:my-agent:main": {
              "vrmPath": "/path/to/agent-specific-model.vrm"
            }
          }
        }
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoStart` | `boolean` | `true` | Launch the avatar window when OpenClaw starts |
| `vrmPath` | `string` | bundled model | Path to a custom `.vrm` model file |
| `gatewayUrl` | `string` | `ws://127.0.0.1:18789` | OpenClaw gateway WebSocket URL |
| `agents` | `object` | — | Per-agent overrides keyed by session key; each can set `vrmPath` |

### Restart the gateway

Restart OpenClaw for the plugin to load:

```bash
openclaw gateway restart
```

The avatar overlay window will appear automatically.

### Update

On macOS/Linux:

```bash
openclaw plugins update flawed-avatar
```

On Windows (tarball workaround):

```bash
npm pack flawed-avatar
openclaw plugins install ./flawed-avatar-<version>.tgz
cd %USERPROFILE%\.openclaw\extensions\flawed-avatar
npm install --omit=dev
```

### Development install (symlink)

For local development, symlink instead of copying:

```bash
openclaw plugins install -l ./path/to/flawed-avatar
```

## Notes

- `openclaw` is listed as a **peer dependency** (`"openclaw": "*"`), so it won't be installed automatically. Users must have OpenClaw installed.
- `electron` is a regular dependency and will be installed by consumers. This is intentional since the plugin spawns its own Electron process.
- The `.npmrc` sets `allow-build-scripts=electron` to permit Electron's post-install script. This key will be deprecated in a future npm major version — monitor for breakage.
- On headless Linux (no `DISPLAY` or `WAYLAND_DISPLAY`), the plugin skips launching automatically.
