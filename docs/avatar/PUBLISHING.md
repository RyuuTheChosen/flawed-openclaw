# Avatar Overlay Plugin Publishing

## Overview

The avatar-overlay plugin is distributed via GitHub Releases as a tarball. Users install it with a single command into any existing OpenClaw installation.

---

## User Install Flow

```bash
openclaw plugins install https://github.com/RyuuTheChosen/flawed-openclaw/releases/download/avatar-overlay-v0.1.1/openclaw-avatar-overlay-0.1.1.tgz
openclaw restart
# → avatar window appears automatically
```

What happens:
1. OpenClaw downloads the tarball
2. Extracts to `~/.openclaw/extensions/avatar-overlay/`
3. Runs `npm install --omit=dev` to fetch dependencies (electron, three.js, etc.)
4. On gateway restart, plugin loads and spawns Electron

---

## Publishing Workflow

### Prerequisites

- Node ≥ 22, pnpm
- GitHub CLI (`gh`) authenticated with `workflow` scope

### Steps

```bash
# 1. Build the plugin
cd packages/avatar-overlay
pnpm build

# 2. Create tarball
npm pack
# → openclaw-avatar-overlay-X.Y.Z.tgz

# 3. Create GitHub Release
gh release create avatar-overlay-vX.Y.Z \
  ./openclaw-avatar-overlay-X.Y.Z.tgz \
  -R RyuuTheChosen/flawed-openclaw \
  --title "Avatar Overlay vX.Y.Z" \
  --notes "Release notes here"

# 4. Update README with new version URL
# 5. Commit and push
git add README.md
git commit -m "Docs: update avatar-overlay install URL to vX.Y.Z"
git push fork main
```

---

## Version Bump Checklist

When releasing a new version:

1. [ ] Update `version` in `packages/avatar-overlay/package.json`
2. [ ] Run `pnpm build` to ensure clean build
3. [ ] Run `npm pack` to create tarball
4. [ ] Create GitHub Release with new tag (e.g., `avatar-overlay-v0.2.0`)
5. [ ] Update install URL in `README.md`
6. [ ] Commit and push changes

---

## Package Structure

The tarball contains:

```
openclaw-avatar-overlay-X.Y.Z.tgz
├── package.json           # Plugin metadata + dependencies
├── openclaw.plugin.json   # Plugin manifest + config schema
├── index.ts               # Plugin entry (jiti transpiles at runtime)
├── src/                   # TypeScript source (for jiti)
│   ├── service.ts         # Spawns Electron child process
│   ├── electron-launcher.ts
│   └── main/              # Electron main process source
├── dist/
│   ├── main/              # Compiled Electron main process
│   └── renderer-bundle/   # Bundled Three.js + VRM renderer
└── assets/
    ├── models/            # Default VRM models
    └── animations/        # Mixamo FBX clips
```

---

## Dependencies

**Runtime (installed by npm):**
- `electron` ~33.0.0 — Electron binary for spawning
- `three` ~0.170.0 — 3D engine (bundled in renderer)
- `@pixiv/three-vrm` ~3.3.0 — VRM loader (bundled)
- `ws` ^8.18.0 — WebSocket client for gateway connection

**Dev only (not installed):**
- `typescript`, `rolldown`, `electron-builder`, etc.

---

## Troubleshooting

### Install fails with "spawn EINVAL"

**Cause:** Node 22 on Windows requires `shell: true` for .cmd files.

**Fix:** Update `src/process/exec.ts` to add shell option (already fixed in main).

### Install fails with "workspace:*" error

**Cause:** pnpm workspace protocol in package.json.

**Fix:** Remove `openclaw: workspace:*` from devDependencies before publishing.

### Electron not found after install

**Cause:** `electron` was in devDependencies.

**Fix:** Move `electron` to regular dependencies (needed at runtime to spawn).

---

## Testing Install Locally

Before publishing, test the full flow:

```bash
# Build and pack
cd packages/avatar-overlay
pnpm build
npm pack

# Clean any existing install
rm -rf ~/.openclaw/extensions/avatar-overlay

# Install from local tarball
cd ../..
openclaw plugins install ./packages/avatar-overlay/openclaw-avatar-overlay-0.1.0.tgz

# Verify
openclaw plugins list  # Should show avatar-overlay as "loaded"

# Test runtime
openclaw gateway --port 18789
# → Avatar window should appear and connect
```

---

## Release History

| Version | Date | Notes |
|---------|------|-------|
| v0.1.1 | 2026-02-06 | Bug fixes, dead code removal, log cleanup, config extraction |
| v0.1.0 | 2026-02-06 | Initial release |
