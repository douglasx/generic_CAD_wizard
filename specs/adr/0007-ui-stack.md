# ADR 0007 — UI stack

- Status: Accepted (2026-09-19)

Decision: React 19 + Vite + three.js, TypeScript strict, pnpm workspaces, Vitest, Playwright, dependency-cruiser. The UI is a thin shell over headless packages. PWA via vite-plugin-pwa (Workbox), with the kernel WASM precached.
