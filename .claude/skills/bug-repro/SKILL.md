---
name: bug-repro
description: Reproduce a bug as a minimal file or command journal plus a failing test before fixing it. Use for every reported defect.
---

# Bug repro

Read `CLAUDE.md` first; its guardrails override anything here.

1. Capture the smallest input: a `.cadw`, STEP/DXF file, or a `History.journal` (commands replay with `replay()` from `@cadw/core`).
2. Put it in `corpus/bugs/BUG-<id>/` and write a failing test that references it.
3. Commit the failing test first (`test: reproduce BUG-<id>`), then fix with tdd-implementer.
4. The repro stays in the corpus forever as a regression test.
