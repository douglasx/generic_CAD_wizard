# CAD Wizard — rules for AI agents and humans

Read this file, `Decisions.md`, and the relevant spec in `specs/` before changing anything.
Skills for each SDLC phase live in `.claude/skills/`; use the one that matches the job.

## The loop

Spec (REQ id + acceptance) → ADR / contract → slice plan → failing tests → smallest implementation → CI gates → release.
Human approval: spec sign-off, ADR sign-off, milestone demo.

## Guardrails (never break these)

1. **Spec first.** Every commit and PR names a `REQ-`, `BUG-` or `SPIKE-` id. No id, no change.
2. **Layer rules are enforced by tooling.** `pnpm lint:layers` (dependency-cruiser) must pass. The UI never imports the kernel implementation; `core` imports nothing from other packages.
3. **One document model is the source of truth.** It is versioned (`schemaVersion`); every schema change ships a migration and a test.
4. **Units and tolerances live in `packages/core/src/units.ts`.** Internal unit is millimetres. No raw float equality (`===` on computed numbers) anywhere.
5. **Every kernel object is released.** `KernelAdapter.liveHandles()` must return to its baseline after each command; tests assert it.
6. **All edits are commands.** Every command is undoable and replayable from the journal.
7. **Offline parity.** No feature may call the network. e2e runs with the network off.
8. **Agents may not weaken tests.** Deleting a test, loosening a tolerance or updating a golden file needs an ADR or explicit human approval in the PR.
9. **No new dependency without an ADR** covering size, licence and maintenance.
10. **Small diffs.** PRs over ~400 changed lines (excluding generated files and lockfiles) are split.
11. **Verify APIs, don't guess.** Check OCCT/libcascade calls against `node_modules/libcascade/dist/types.d.ts` and prove them with a spike or test before use.
12. **The desktop build is self-contained.** No CDN, font, telemetry or update call at runtime; updates are opt-in.
13. **Regeneration is deterministic.** Same parameters → same geometry, IDs and metrics. Features never read the clock, random numbers or the UI.

## Commands

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| All gates (fast) | `pnpm check` (typecheck + layers + unit tests) |
| e2e (online + offline) | `pnpm build && pnpm e2e` |
| Desktop dev / build | `pnpm desktop:dev` / `pnpm desktop:build` |
| Spikes | `pnpm spike:kernel-size`, `pnpm spike:step-attributes` |

## Repo map

- `specs/` — vision, requirements (REQ ids), milestones, ADRs, feature specs, spike reports
- `packages/core` — document, entities, units, commands, history (no deps)
- `packages/geom2d` — pure 2D math and snaps (no deps)
- `packages/kernel` — `KernelAdapter` interface + contract test suite
- `packages/kernel-occt` — libcascade implementation, runs in the CAD worker
- `packages/platform` — `PlatformAdapter` interface + web implementation
- `packages/io-native` — `.cadw` read/write
- `packages/render` — three.js viewport
- `packages/app` — React PWA shell
- `packages/desktop` — Tauri 2 shell and desktop `PlatformAdapter`
- `corpus/` — test models; `tools/spikes/` — spike scripts; `e2e/` — Playwright

## Conventions

- TypeScript strict, ESM, no default exports in library packages.
- Packages export source (`src/index.ts`); Vite and Vitest compile it.
- Tests sit in `packages/*/test/` and are named `*.test.ts`.
- Commit message: `<type>(<package>): <summary> [REQ-xxx]`.
