# CAD Wizard

A lightweight, parametric CAD tool that runs in the browser, embeds in other web apps, and installs as a fully offline desktop app.
Open source under Apache-2.0.

**Status:** M0 — walking skeleton. See `specs/milestones.md`.

## What it will do

- 2D drafting (lines, arcs, splines) and NURBS surface modelling, driven by a parametric feature graph
- Vector PDF printing from paper-space layouts
- STEP (AP203/214/242) import/export with user-defined attributes
- OpenUSD and DXF import/export
- Typed part attributes with templates (hull plating, stiffeners, compartments, pillars)
- Headless `evaluate(parameters) → metrics` API for Python optimisers
- Same features online, offline (PWA) and as Tauri desktop installers

## Quick start

```bash
corepack enable
pnpm install
pnpm dev            # http://localhost:5173
pnpm check          # typecheck + layer rules + unit tests
pnpm build && pnpm e2e
```

Desktop (needs Rust and the Tauri prerequisites for your OS):

```bash
pnpm desktop:dev
pnpm desktop:build  # installers in packages/desktop/src-tauri/target/release/bundle
```

## Architecture

Headless TypeScript packages; the OpenCascade kernel (libcascade, WebAssembly) runs in a dedicated worker behind `KernelAdapter`; the React UI is a thin shell; web and desktop differ only in the `PlatformAdapter`. Details: `specs/architecture.md`.

## Contributing

Read `CLAUDE.md` first — it holds the guardrails every change follows, for humans and AI agents alike.
