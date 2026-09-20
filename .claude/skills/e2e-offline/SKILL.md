---
name: e2e-offline
description: Write and run Playwright end-to-end tests online and with the network off. Use for any user-facing flow.
---

# E2e offline

Read `CLAUDE.md` first; its guardrails override anything here.

1. Tests live in `e2e/`; wait on app state, not timeouts: `.app[data-ready=true]`, `[data-testid=autosave][data-state=saved]`, `[data-testid=kernel-status]`.
2. Every flow that must work offline gets an offline variant: visit once, wait for `navigator.serviceWorker.ready` + controller, `context.setOffline(true)`, reload, assert.
3. Locally: `pnpm build && PW_CHROMIUM_PATH=<chrome> pnpm e2e` if Playwright's own browser is not installed.
4. Desktop builds: WebdriverIO Tauri service (embedded driver works on macOS, Windows, Linux).
