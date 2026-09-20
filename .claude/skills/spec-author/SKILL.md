---
name: spec-author
description: Turn a feature request into EARS-style requirements with REQ ids and testable acceptance criteria. Use before any new feature or behaviour change.
---

# Spec author

Read `CLAUDE.md` first; its guardrails override anything here.

1. Read `specs/vision.md`, `specs/requirements.md`, `Decisions.md` and the milestone in `specs/milestones.md`.
2. Write `specs/features/F-NN-<slug>.md` with: Requirements (reuse REQ ids or add `REQ-0xx.y` sub-ids), Scope, Out of scope, Acceptance tests table (test file → what it proves).
3. Phrase each requirement in EARS form ("When <trigger>, the app shall <response>"). Every acceptance criterion must be checkable by an automated test or a named manual checklist.
4. Add new REQ ids to `specs/requirements.md`. Do not change existing REQ meaning without an ADR.
5. Stop and ask the human to sign off the spec before any code.
