# Requirements

EARS style. Each requirement has an id used in commits, tests and PRs.

| ID | Requirement | Milestone |
| --- | --- | --- |
| REQ-001 | The app shall run in current Chromium, Firefox and Safari without plugins, and shall be embeddable as a `<cad-wizard>` Web Component with a typed host API. | M0, M11 |
| REQ-002 | When the network is unavailable, the app shall provide every feature available online (PWA). | M0 |
| REQ-003 | The app shall create and edit points, lines, polylines, arcs, circles, ellipses, splines, and NURBS surfaces. | M1, M5, M6 |
| REQ-004 | When the user prints a layout, the app shall write a vector PDF at the stated scale with error ≤ 0.1 mm per 100 mm. | M3, M10 |
| REQ-005 | The app shall import USDA/USDC/USDZ and export USDA/USDZ that passes `usdchecker`. | M9 |
| REQ-006 | The app shall import STEP AP203/AP214/AP242 with names, colours, assemblies and user-defined attributes. | M8 |
| REQ-007 | The app shall export STEP AP214/AP242 with names, colours, assemblies and user-defined attributes. | M8 |
| REQ-008 | Every part shall carry typed attributes defined by templates; users can create templates; starter templates: hull plating, stiffener library, compartment, pillar. | M2 |
| REQ-009 | The app shall ship as signed, fully offline desktop installers for Windows, macOS and Linux (Tauri 2). | M0, M12 |
| REQ-010 | Geometry shall be the output of a parametric feature graph; a headless `evaluate(parameters) → metrics` API with CLI/JSON shall serve external optimisers. | M5–M7 |
| REQ-011 | The app shall import and export DXF (2D entities, layers, blocks; attributes as XData). | M4 |

## M0 acceptance (walking skeleton)

| ID | Acceptance criterion |
| --- | --- |
| REQ-002.1 | After one online visit, reloading with the network off loads the app and restores the last drawing. |
| REQ-003.1 | The user can draw a line with two clicks; undo and redo work. |
| REQ-009.1 | The same build runs inside a Tauri 2 shell (unsigned) and saves/opens `.cadw` through native dialogs. |
| REQ-010.1 | The CAD worker loads the kernel lazily and returns a box's volume and mesh without blocking the UI. |
| REQ-007.1 | A STEP export of a part with attributes re-imports with every attribute intact (spike S-02). |
