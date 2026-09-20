---
name: desktop-packager
description: Build, smoke-test and (from M12) sign Tauri 2 installers for Windows, macOS and Linux with the network blocked. Use when touching packages/desktop or releasing.
---

# Desktop packager

Read `CLAUDE.md` first; its guardrails override anything here.

1. `pnpm desktop:build` builds for the current OS; CI (`.github/workflows/desktop.yml`) builds all three.
2. The CSP in `tauri.conf.json` must keep `connect-src` limited to `'self'` and IPC (guardrail 12). No updater plugin unless opt-in and offline-installable.
3. Smoke test: launch, draw a line, run "Kernel check", confirm the status shows the box volume; on Linux CI use `xvfb-run` + `xdotool`.
4. Capabilities (`src-tauri/capabilities/default.json`) grant only dialog open/save and read/write of user-picked files.
5. Signing (M12): Apple Developer ID + notarisation; Windows code-signing certificate or an open-source signing programme.
