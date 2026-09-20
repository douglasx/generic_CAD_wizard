# STEP attribute checklist (manual)

File: `corpus/step/plate-attributes.step` (2 parts: `PLT-001` hull plate, `STF-001` flat-bar stiffener).
Expected attributes — PLT-001: template, material, thickness_mm, strake, frame_from, frame_to. STF-001: template, profile, material, length_mm.

| Tool | Version | Geometry OK | Part names | Attributes visible | Where shown / import setting | Checked by | Date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NAPA | | | | | | | |
| Hexagon Smart 3D | | | | | | | |
| PTC Creo | | | | | | | |
| Siemens NX | | | | | | | |
| SolidWorks | | | | | | | |
| Rhino | | | | | | | |
| FreeCAD | | | | | | | |

Known limitation (M0): OCCT writes non-ASCII text as raw UTF-8 rather than ISO 10303-21 `\X2\` escapes. Our reader repairs it; other tools may show garbled non-ASCII values. Fix planned in M8.
