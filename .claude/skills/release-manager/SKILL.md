---
name: release-manager
description: Cut a release: semver version, changelog, document-schema migration notes, licence/notice files, desktop artifacts. Use when a milestone is accepted.
---

# Release manager

Read `CLAUDE.md` first; its guardrails override anything here.

1. Version: semver across the monorepo; bump `tauri.conf.json` and `Cargo.toml` too.
2. CHANGELOG entry grouped by REQ id; list schema/format version changes and migrations.
3. Verify `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md` are current (new deps, libcascade version).
4. Tag `vX.Y.Z`; the Desktop workflow builds installers; attach them to the release.
5. Update `specs/milestones.md` status and `Decisions.md` if anything changed.
