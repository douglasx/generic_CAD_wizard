---
name: cad-code-reviewer
description: Review a change against CAD Wizard guardrails: layering, units/tolerances, kernel memory, commands/undo, offline, determinism, tests, bundle size. Use before merging any PR.
---

# Cad code reviewer

Read `CLAUDE.md` first; its guardrails override anything here.

Check, citing file:line for each finding:
1. REQ/BUG/SPIKE id present; diff ≤ ~400 lines or justified.
2. `pnpm lint:layers` clean; UI touches OCCT only via `kernel-occt/client`.
3. No raw float equality; units in mm; tolerances from `units.ts`.
4. Every OCCT temporary deleted; long-lived shapes released; contract test covers new kernel calls.
5. Edits are `Command`s with correct inverses; journal replay test still passes.
6. No network calls, CDN URLs or telemetry; offline e2e covers the flow.
7. No tests deleted/loosened, golden files unchanged unless explained.
8. New dependency has an ADR; bundle budget holds (initial JS ≤ 1 MB gzip).
Report findings most-severe first; no style nits unless they hide bugs.
