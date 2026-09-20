# ADR 0004 — Part attributes and templates

- Status: Accepted (2026-09-19)
- Requirements: REQ-008, REQ-006, REQ-007

Decision: attributes are typed values (text, number+unit, integer, boolean, enum, date, link) stored in our document model and defined by versioned JSON templates. Users can create templates. Starter templates: hull plating, generic stiffener library (flat bar, bulb flat, angle, tee size tables), compartment, pillar.

Mapping: STEP — user-defined attributes via OCCT metadata (strings → DESCRIPTIVE_REPRESENTATION_ITEM, integers → INTEGER_REPRESENTATION_ITEM, reals → measure items); USD — `cadw:` namespaced prim attributes; DXF — XData; PDF — title blocks and BOM tables; CSV/JSON — sidecar, the guaranteed path.

Target tools for manual STEP checks: NAPA, Smart 3D, Creo, NX, SolidWorks, Rhino, FreeCAD.
