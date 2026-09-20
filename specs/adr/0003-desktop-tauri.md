# ADR 0003 — Desktop: Tauri 2, Electron fallback

- Status: Accepted (2026-09-19)
- Requirements: REQ-002, REQ-009

Decision: package the same Vite build with Tauri 2 for Windows (MSI/NSIS), macOS (DMG) and Linux (AppImage/deb). Everything is bundled; no runtime network calls; updates opt-in and installable from a signed file. Electron is the fallback if a platform WebView (WebView2, WKWebView, WebKitGTK) proves unreliable for WebGL/WASM.

Consequences: three WebViews to test; desktop e2e via WebdriverIO's Tauri service; signing certificates needed before M12.
