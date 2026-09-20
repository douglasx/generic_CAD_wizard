# F-00 — Walking skeleton (M0)

Requirements: REQ-002.1, REQ-003.1, REQ-009.1, REQ-010.1, REQ-007.1

## Scope

1. Draw a 2D line with two clicks in a three.js viewport; undo/redo.
2. Save and open `.cadw` through `PlatformAdapter` (web: File System Access or download/input fallback; desktop: Tauri dialogs).
3. Autosave the document to local storage; restore on reload, including offline.
4. Install as a PWA; reload offline works (kernel WASM precached).
5. "Kernel check" button: CAD worker lazily loads libcascade, makes a box, returns volume and mesh, renders it.
6. Tauri 2 shell wraps the same build.

## Out of scope

Snaps, other entities, layers UI, attributes UI, parametric graph (M1+).

## Acceptance tests

| Test | Proves |
| --- | --- |
| `packages/core/test/*.test.ts` | Commands, undo/redo, journal replay, schema version |
| `packages/io-native/test/cadw.test.ts` | `.cadw` round trip, bad version rejected |
| `packages/kernel-occt/test/kernel.contract.test.ts` | Box volume, mesh, handle release, STEP attribute round trip |
| `e2e/walking-skeleton.spec.ts` | Draw, undo/redo, save, offline reload restore, kernel box in the worker |

## Result (2026-09-19)

| Check | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint:layers` | Pass (layer rules verified to catch violations) |
| Unit + kernel contract (`pnpm test:coverage`) | 28/28 pass; 93% line coverage on core, geom2d, io-native |
| e2e Chromium (`pnpm e2e`) | 4/4 pass: draw/undo/redo, save/open `.cadw`, kernel in worker, offline reload + offline kernel |
| Web bundle | Initial JS 214 KB gzip; kernel WASM 42.7 MB raw / 12.4 MB gzip, lazy in the CAD worker, precached |
| Desktop (Linux, Tauri 2) | `.deb` 12.6 MB and AppImage built; smoke test: draws, autosaves, kernel box 1,000,000 mm³ in 2.7 s — see `docs/images/m0-desktop-linux.png` |
| Desktop (macOS, Windows) | Build via `pnpm desktop:build` on each OS or the Desktop CI workflow — not yet run |
| STEP attributes | Round trip passes (text, real, integer, non-ASCII); reference file `corpus/step/plate-attributes.step` |

Known limitation: native dialogs cannot be automated, so desktop save/open (REQ-009.1) needs one manual check on your Mac.
