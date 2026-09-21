# @cadw/desktop

Tauri 2 shell around the `@cadw/app` build (ADR 0003). Fully offline: every asset, including the OCCT WASM, is inside the installer; the CSP blocks all network access.

| Task | Command (from repo root) |
| --- | --- |
| Dev window with hot reload | `pnpm desktop:dev` |
| Installers for this OS | `pnpm desktop:build` |

Output: `src-tauri/target/release/bundle/` (Windows MSI/NSIS, macOS .app/.dmg, Linux AppImage/.deb/.rpm).
Prerequisites: Rust stable and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. On macOS: Xcode Command Line Tools.
Signing is added in M12.

## Troubleshooting

**macOS: `failed to run bundle_dmg.sh`.** The `.app` is already built; only the DMG step failed. That script tells Finder, through AppleScript, to lay out the disk-image window, which fails when the terminal is not allowed to control Finder (common in the VS Code terminal and over SSH).

| Fix | Command |
| --- | --- |
| Build just the app (enough for development) | `pnpm desktop:build:app` |
| Build a plain DMG, skipping the Finder step | `pnpm desktop:build:dmg` |
| Keep the styled DMG | Run `pnpm desktop:build` from Terminal.app and allow the "control Finder" prompt (System Settings → Privacy & Security → Automation) |

Before retrying, clear leftovers from the failed run: delete `src-tauri/target/release/bundle/macos/rw.*.dmg`, and if a volume is still mounted run `hdiutil detach "/Volumes/CAD Wizard"`.

CI sets `CI=true`, so the Desktop workflow is unaffected.

**macOS refuses to open the app** ("damaged" or "unidentified developer"): builds are unsigned until M12. Right-click the app → Open, or `xattr -dr com.apple.quarantine "CAD Wizard.app"`.
