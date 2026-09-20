---
name: tdd-implementer
description: Implement one planned slice red-green-refactor: failing test first, smallest change to pass, then clean up. Use for all production code.
---

# Tdd implementer

Read `CLAUDE.md` first; its guardrails override anything here.

1. Write the failing test(s) from the acceptance criteria; run `pnpm vitest run <path>` and confirm they fail for the right reason. Commit: `test(<pkg>): ... [REQ-xxx]`.
2. Make the smallest change that passes. Touch only the packages the slice names.
3. Refactor with tests green. No `===` on computed floats (use `packages/core/src/units.ts`). All edits go through `Command`s.
4. Run `pnpm check`; for UI changes also `pnpm build && pnpm e2e`.
5. Never delete or loosen an existing test to get green (guardrail 8) — stop and ask instead.
