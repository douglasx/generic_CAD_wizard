---
name: attribute-schema
description: Add or change part-attribute templates (hull plating, stiffener, compartment, pillar, user templates) and their mapping to STEP, USD, DXF, PDF and CSV. Use for any attribute or template change.
---

# Attribute schema

Read `CLAUDE.md` first; its guardrails override anything here.

1. Templates are versioned JSON: key, type (text | real+unit | integer | boolean | enum | date | link), default, required, allowed values, description.
2. Mapping table per template: STEP (text → DESCRIPTIVE_REPRESENTATION_ITEM, integer → INTEGER_REPRESENTATION_ITEM, real → measure item), USD (`cadw:<key>`), DXF XData, PDF title block/BOM column, CSV column.
3. Changing a key or type = schema migration in `packages/core/src/migrate.ts` + a migration test with an old file.
4. Add a round-trip test for every format the template touches; STEP uses the kernel contract helpers.
5. Regenerate `corpus/step/*.step` with its script if the reference changes, and note it in the PR.
