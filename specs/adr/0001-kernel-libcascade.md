# ADR 0001 — Geometry kernel: libcascade in a dedicated CAD worker

- Status: Accepted (2026-09-19), supersedes the earlier choice of occt-wasm
- Requirements: REQ-003, REQ-006, REQ-007, REQ-008, REQ-010

## Context

We need an exact B-rep kernel in WebAssembly with NURBS surfaces, booleans, hidden-line removal and STEP read/write including user-defined attributes (UDA). Candidates: occt-wasm 5.3.2 and libcascade 3.0.2, both OCCT 8.0.1.

## Evidence (spikes S-01, S-02)

| | occt-wasm 5.3.2 | libcascade 3.0.2 (single) |
| --- | --- | --- |
| WASM raw / gzip / brotli | 22.3 / 7.0 / 4.9 MB | 42.7 / 12.2 / 8.6 MB |
| STEP UDA write | No API | Yes (`STEPCAFControl_Writer.SetMetadataMode`) |
| STEP UDA read | No API | Yes (`SetMetaMode` + `XCAFDoc_ShapeTool.GetNamedProperties`) |
| API style | Curated TS, arena handles | Full OCCT C++ API, `Symbol.dispose` |
| Threads | Single | Single or multi (multi needs COOP/COEP) |

## Decision

Use libcascade's single-threaded build, loaded lazily inside a dedicated Web Worker (the "CAD worker"). Nothing outside `packages/kernel-occt` touches OCCT; everything goes through `KernelAdapter`.

## Consequences

- +3.7 MB brotli download versus occt-wasm; cached by the service worker and bundled in desktop installers. A trimmed custom build (`@libcascade/toolchain`) is the planned size fix.
- Attribute round trip is native, no STEP post-processor needed.
- The adapter keeps occt-wasm (or a later kernel) as a drop-in fallback; the kernel contract tests must pass for any implementation.
