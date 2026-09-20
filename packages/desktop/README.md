# @cadw/desktop

Tauri 2 shell around the `@cadw/app` build (ADR 0003). Fully offline: every asset, including the OCCT WASM, is inside the installer; the CSP blocks all network access.

| Task | Command (from repo root) |
| --- | --- |
| Dev window with hot reload | `pnpm desktop:dev` |
| Installers for this OS | `pnpm desktop:build` |

Output: `src-tauri/target/release/bundle/` (Windows MSI/NSIS, macOS .app/.dmg, Linux AppImage/.deb/.rpm).
Prerequisites: Rust stable and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. On macOS: Xcode Command Line Tools.
Signing is added in M12.
