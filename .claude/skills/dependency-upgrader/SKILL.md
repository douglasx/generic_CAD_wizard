---
name: dependency-upgrader
description: Upgrade libcascade/OCCT, Tauri, three.js or other dependencies safely by running the full corpus and comparing results. Use for any version bump.
---

# Dependency upgrader

Read `CLAUDE.md` first; its guardrails override anything here.

1. One dependency per PR. Read its changelog/breaking changes; note licence changes.
2. Run `pnpm check`, `pnpm build && pnpm e2e`, `pnpm spike:step-attributes` (corpus must be unchanged or the diff explained), and `pnpm spike:kernel-size` for kernel bumps.
3. For libcascade: re-run the kernel contract suite; check the quirks list in the kernel-adapter skill still holds.
4. Record size/performance deltas in the PR description.
