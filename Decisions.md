# CAD Wizard — Decisions

Updated 2026-09-19. Full plan: https://claude.ai/code/artifact/de632c97-929c-407b-8ae8-617e77e29f1b
Each decision has an ADR under `specs/adr/`.

| # | Topic | Decision | ADR |
| --- | --- | --- | --- |
| 1 | Kernel | **libcascade 3.0.2 (OCCT 8.0.1, single-threaded build)**, always in a dedicated CAD worker, behind `KernelAdapter`. Changed from occt-wasm after the M0 spike: libcascade round-trips STEP user-defined attributes; occt-wasm has no attribute API. Measured download 8.6 MB brotli (occt-wasm 4.9 MB). occt-wasm stays the documented fallback. | 0001 |
| 2 | Modelling style | Parametric feature graph for optimisation, nTop-block style; implicit kernel in backlog | 0002 |
| 3 | 2D constraints | Backlog (planegcs) | 0002 |
| 4 | Desktop | Tauri 2; Electron fallback; fully offline installers | 0003 |
| 5 | Attribute templates | Hull plating, stiffener library, compartment, pillar; users define their own | 0004 |
| 6 | STEP attribute targets | NAPA, Smart 3D, Creo, NX, SolidWorks, Rhino, FreeCAD; checked manually from exported reference STEPs for now | 0004 |
| 7 | Licence | Open source, Apache-2.0 for our code; OCCT stays LGPL-2.1 as a separate WASM file | 0005 |
| 8 | Extra formats | DXF import/export (M4) | 0006 |
| 9 | UI | React + Vite + three.js | 0007 |
| 10 | Stiffener library | Generic flat bar, bulb flat, angle and tee size tables | 0004 |
| 11 | Optimisation consumer | Python and other external tools via CLI/JSON; no in-app optimiser for now | 0002 |
