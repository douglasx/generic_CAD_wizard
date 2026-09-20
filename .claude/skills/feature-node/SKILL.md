---
name: feature-node
description: Add a parametric feature node (inputs, outputs, evaluate) to the feature graph with determinism, regeneration-stability and parameter-sweep tests. Use for any new modelling operation from M5 on.
---

# Feature node

Read `CLAUDE.md` first; its guardrails override anything here.

1. Define typed inputs (parameters with units and bounds, upstream references) and outputs (named shapes/sub-shapes).
2. `evaluate` must be pure: no clock, random numbers, UI or network (guardrail 13). Name outputs from OCCT shape history, never by face index.
3. Tests, all three required:
   - Determinism: evaluate twice → identical geometry metrics and output names.
   - Stability: downstream references still resolve after regenerating.
   - Sweep: vary each driving parameter ±50% on the corpus models; no failure, metrics change monotonically where expected.
4. Release every kernel handle; assert `liveHandles()` returns to baseline.
