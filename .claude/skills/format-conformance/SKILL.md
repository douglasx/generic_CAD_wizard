---
name: format-conformance
description: Run and extend STEP, USD and DXF round-trip conformance on the fixed corpus, including attributes. Use when touching any importer or exporter.
---

# Format conformance

Read `CLAUDE.md` first; its guardrails override anything here.

1. Round trip: export → import → compare geometry (geometry-oracle) and names/attributes (deep equal).
2. STEP: reference files live in `corpus/step/`; regenerate with `pnpm spike:step-attributes` and check `git diff corpus/` is empty in CI.
3. USD: validate every exported file with `usdchecker` (Python `usd-core` in CI).
4. External tools (NAPA, Smart 3D, Creo, NX, SolidWorks, Rhino, FreeCAD) are manual: update `specs/features/step-attribute-checklist.md`.
