# F-01 — 2D drafting core (M1)

Status: Draft, awaiting sign-off. Requirements: REQ-003 (sub-ids below).
Decisions taken with Douglas on 2026-09-20: AutoCAD-style command line plus toolbar; full draw + edit set in one milestone, delivered in slices.

## Requirements

| ID | Requirement |
| --- | --- |
| REQ-003.1 | The user shall draw line, polyline, arc (3-point and start-centre-end), circle (centre-radius and 2-point), ellipse (centre-axes) and spline (through points, NURBS degree 3). |
| REQ-003.2 | While a drawing tool is active, the app shall accept points by click or by typed coordinate: `100,50` (absolute), `@100,50` (relative), `@100<45` (polar, degrees CCW from +X), and a bare number as a distance along the current direction. |
| REQ-003.3 | The app shall provide object snaps — endpoint, midpoint, centre, quadrant, intersection, perpendicular, nearest — with a visible marker, and the user shall be able to turn each on or off. |
| REQ-003.4 | The app shall provide ortho mode (F8) and a snap grid, both toggleable. |
| REQ-003.5 | The user shall select entities by click, window (left-to-right, fully enclosed) and crossing (right-to-left, touching), and shall add to or remove from the selection with Shift. |
| REQ-003.6 | The user shall edit with move, copy, rotate, scale, mirror, trim, extend, offset and delete, each usable on any selection. |
| REQ-003.7 | Selected entities shall show grips; dragging a grip shall edit the entity through a command, so undo works. |
| REQ-003.8 | The app shall manage layers: create, rename, set colour, lineweight and linetype, toggle visibility and lock, set the current layer, and move entities between layers. |
| REQ-003.9 | The command line shall accept AutoCAD-style aliases (L, PL, A, C, EL, SPL, M, CO, RO, SC, MI, TR, EX, O, E), Enter or Space to repeat the last command, and Esc to cancel; it shall prompt for each expected input. |
| REQ-003.10 | Every drawing and editing operation shall be a Command with an exact inverse; undo/redo shall cover at least 100 steps. |

## Scope

- Entity model in `@cadw/core`: `polyline`, `arc`, `circle`, `ellipse`, `spline`, alongside `line`; each with layer, and optional per-entity colour, lineweight and linetype overrides.
- 2D maths in `@cadw/geom2d`: arc/circle/ellipse/NURBS evaluation, curve-curve intersection, closest point, offset, trim/extend parameters, bounding boxes, point-in-window tests. Pure TypeScript, property-tested, no kernel.
- New package `@cadw/commands`? No — drawing and editing commands live in `@cadw/core`; the interactive tool state machines live in `@cadw/app`.
- Rendering: entity display with layer colour and lineweight, selection highlight, grips, snap markers, rubber-band preview.
- Command line: parser, prompt sequencing, aliases, coordinate grammar, history (up-arrow).
- Layers panel; current-layer control; entity properties panel (read-only in M1 except layer and colour).

## Out of scope (later milestones)

Text, dimensions and hatch (M3); DXF (M4); parametric features and constraints (M5, backlog); blocks; arrays; fillet/chamfer in 2D (candidate for M1b if cheap, otherwise M5); paper space (M3).

## Design notes

- **Tool state machines**: each tool is a small reducer (`idle → awaiting point → …`) that consumes pointer, keyboard and command-line input identically, so a command typed in full behaves exactly like the same command driven by mouse. One test suite drives both paths.
- **Snap engine** lives in `geom2d` as pure functions over entity geometry plus a pixel-to-model radius; the app supplies the radius from the viewport.
- **Trim/extend/offset** need robust curve-curve intersection; this is the main technical risk. Intersections are computed analytically for line/arc/circle/ellipse pairs and by subdivision for splines, with tolerances from `units.ts`.
- **Lineweight display** uses three.js fat lines (Line2) so millimetre weights show at any zoom.
- **Performance budget**: 10,000 entities pan and zoom at 60 fps; selection of 1,000 entities under 100 ms.

## Slice plan

| # | Slice | Delivers | Tests first |
| --- | --- | --- | --- |
| 1 | Entity model + rendering | polyline, arc, circle, ellipse, spline in core, geom2d evaluation, viewport display | core model/migration tests, geom2d evaluation property tests |
| 2 | Command line + coordinate grammar | parser, prompts, aliases, history; line and polyline driven by typing | parser unit tests, e2e drawing by typing |
| 3 | Drawing tools | arc, circle, ellipse, spline tools with rubber-band preview | tool reducer tests, e2e per tool |
| 4 | Snaps, ortho, grid | snap engine and markers, F8, grid toggle | geom2d snap tests, e2e snap to endpoint/intersection |
| 5 | Selection + grips | click/window/crossing, Shift add/remove, grip drag as command | selection unit tests, e2e grip edit + undo |
| 6 | Transform edits | move, copy, rotate, scale, mirror, delete | command inverse tests, journal replay, e2e |
| 7 | Curve edits | trim, extend, offset with intersection engine | intersection property tests, golden cases, e2e |
| 8 | Layers | layers panel, properties, visibility/lock, move to layer | core layer command tests, e2e |

Each slice is one PR under ~400 changed lines, with `pnpm check` and the e2e suite green.

## Acceptance tests

| Test | Proves |
| --- | --- |
| `packages/core/test/entities.test.ts` | New entity kinds, migration from schema 1, command inverses |
| `packages/geom2d/test/curves.test.ts` | Evaluation, intersections, offsets, trims within tolerance; property-based |
| `packages/geom2d/test/snap.test.ts` | Every snap kind, priority and radius behaviour |
| `packages/app/test/tools.test.ts` | Tool reducers: mouse path and typed path produce identical documents |
| `e2e/drafting.spec.ts` | Draw each entity by mouse and by command line; snap; select; each edit; layers; undo/redo; all offline |
| Performance check in e2e | 10,000 entities render and pan within budget |

## Open questions

1. Lineweight display default: true millimetre width on screen, or a fixed thin display until printing (AutoCAD's LWDISPLAY off)? Proposal: fixed thin on screen, true width in print preview and PDF.
2. Spline type for M1: interpolating through picked points (proposal) or control-point NURBS editing?

## Progress

| Slice | Status | Commit notes |
| --- | --- | --- |
| 1 Entity model + rendering | Done 2026-09-20 | 6 entity kinds, schema v2 + v1 migration, curve flattening (ADR 0008) |
| 2 Command line + coordinates | Done 2026-09-21 | Parser (`100,50`, `@dx,dy`, `@d<a`, `d<a`, bare distance), `CommandSession`, LINE/PLINE with Close/Undo, aliases, Enter repeats, U/REDO, Up-arrow recall; typed and mouse paths proven identical |
| 3 Drawing tools | Done 2026-09-21 | ARC (3-point, start-centre-end, centre-first), CIRCLE (centre-radius, 2P), ELLIPSE (centre-axes, auto axis swap), SPLINE (fit points, Close/Undo); 4 separate commits; toolbar generated from the tool list |
| 4 Snaps, ortho, grid | Done 2026-09-21 | Exact primitives + intersections (reused by slice 7); 7 object snaps with AutoCAD priority and markers; OSNAP/ORTHO/GRID toggles (F3/F8/F9) with per-snap menu, saved per device; 3 commits |
