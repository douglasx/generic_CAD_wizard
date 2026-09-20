---
name: geometry-oracle
description: Write tolerance-based geometry assertions (volume, area, bounding box, topology counts, validity) and golden JSON baselines for corpus models. Use when testing any geometry-producing code.
---

# Geometry oracle

Read `CLAUDE.md` first; its guardrails override anything here.

1. Compare with `relativelyEqual`/`nearlyEqual` from `@cadw/core`; linear tolerance 1e-6 mm, relative 1e-9 unless an ADR says otherwise.
2. Golden files: `corpus/golden/<model>.json` with volume, area, bbox, counts of solids/faces/edges/vertices, validity flag.
3. Update a golden file only with a PR note explaining why the geometry legitimately changed (guardrail 8).
