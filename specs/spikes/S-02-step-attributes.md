# SPIKE S-02 — STEP user-defined attributes round trip

Date: 2026-09-19. Script: `tools/spikes/step-attributes.mjs`. Test: `packages/kernel-occt/test/kernel.contract.test.ts`.

## Method

Create a 2000 × 1000 × 12 mm plate, name it `PLT-001`, attach `material = "AH36"` (string), `thickness_mm = 12.0` (real), `frame_from = 42` (integer) via `XCAFDoc_ShapeTool.GetNamedProperties`; write with `STEPCAFControl_Writer` (`SetMetadataMode(true)`); read with `STEPCAFControl_Reader` (`SetMetaMode(true)`).

## Result

| Library | Write | Read back |
| --- | --- | --- |
| libcascade 3.0.2 | Pass — emits `PROPERTY_DEFINITION` + `DESCRIPTIVE_REPRESENTATION_ITEM('material','AH36')`, `INTEGER_REPRESENTATION_ITEM('frame_from',42)`, measure item for the real | Pass — all three values identical |
| occt-wasm 5.3.2 | Not possible — XCAF API exposes names, colours, assemblies only | Not possible |

Decision impact: kernel switched to libcascade (ADR 0001). External-tool checks (NAPA, Smart 3D, Creo, NX, SolidWorks, Rhino, FreeCAD) remain manual using `corpus/step/plate-attributes.step`.
