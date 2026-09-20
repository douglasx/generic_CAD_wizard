---
name: adr-writer
description: Record an architecture decision (context, options with evidence, decision, consequences) as specs/adr/NNNN-*.md. Use for any new dependency, format, layer change or reversal of a past decision.
---

# Adr writer

Read `CLAUDE.md` first; its guardrails override anything here.

1. Number = next free `NNNN` in `specs/adr/`.
2. Sections: Status (Proposed/Accepted/Superseded + date), Requirements, Context, Options (table with measured evidence, not opinions), Decision, Consequences (costs included).
3. New dependency: include licence (must fit ADR 0005), install size, maintenance signal (last release, contributors), and what it replaces.
4. Superseding: set the old ADR's status to "Superseded by NNNN" and update `Decisions.md`.
5. Ask for human sign-off; ADRs are not self-approved.
