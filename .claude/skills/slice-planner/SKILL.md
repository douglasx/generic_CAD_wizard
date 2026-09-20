---
name: slice-planner
description: Break an approved spec into vertical slices of at most ~400 changed lines, each with its tests listed first. Use after spec sign-off and before implementation.
---

# Slice planner

Read `CLAUDE.md` first; its guardrails override anything here.

1. Each slice delivers something runnable end to end (model → command → UI or API → test).
2. For each slice list: REQ ids, failing tests to write first, files expected to change, layer rules touched, risk.
3. Order slices so the riskiest assumption is tested first (spike if unknown — see SPIKE reports in `specs/spikes/`).
4. Output as a checklist in the feature spec under "Plan"; one PR per slice.
