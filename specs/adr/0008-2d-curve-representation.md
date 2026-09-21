# ADR 0008 — 2D curve representation and flattening

- Status: Accepted (2026-09-20)
- Requirements: REQ-003.1, REQ-003.2, REQ-011 (DXF), REQ-006/007 (STEP)

## Context

M1 adds arcs, circles, ellipses, polylines and splines. Their stored form has to survive round trips to DXF and STEP, be cheap to draw, and be easy to edit with grips.

## Decision

| Entity | Stored as | Why |
| --- | --- | --- |
| line | start, end | — |
| polyline | point list + closed flag | Matches DXF LWPOLYLINE |
| arc | centre, radius, start/end angle (radians, CCW, XY plane) | Matches DXF/STEP; exact |
| circle | centre, radius | Exact |
| ellipse | centre, major-axis vector, minor/major ratio | Matches DXF ELLIPSE and STEP; no angle ambiguity |
| spline | fit points + closed flag, degree 3 | The user draws through points; interpolation is reproducible |

Splines are interpolated with **centripetal Catmull-Rom** (α = 0.5), which never loops or cusps between fit points. Export converts each segment to an exact cubic Bézier, and from there to NURBS for STEP and DXF — no information is lost, because the fit points fully define the curve.

Display and hit-testing use `flattenEntity(entity, tolerance)`: the curve is sampled so the chord deviation stays within the given tolerance (the viewport passes a quarter of a pixel in model units).

Layer rule change: `geom2d` may now import `@cadw/core` (types and tolerances only) so that `flattenEntity` lives with the maths rather than being duplicated in render, print and the exporters. `geom2d` still has no third-party dependencies.

## Consequences

- Control-point (NURBS) spline editing is a later addition; M1 edits fit points.
- Elliptical arcs (partial ellipses) are not in M1; the field layout already allows adding start/end angles without a schema break.
- Flattening tolerance is a display concern, never stored; geometry stays exact in the document.
