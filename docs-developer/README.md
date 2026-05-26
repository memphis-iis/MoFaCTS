# MoFaCTS Developer Docs

This directory is for developer-facing planning, architecture work, audits, decomposition notes, and implementation plans that are useful to maintainers but not part of the public user/operator documentation set.

Use `docs-developer/` for:

- Active implementation plans.
- Architecture exploration and decomposition plans.
- Audit notes and cleanup plans.
- Internal developer operating notes.
- Modularity and extension-boundary planning.

Keep `docs/` focused on software consortium, repository, user, author, operator, release, and compliance docs.

## Migrated Developer Docs

- `modularity-extension-boundary-plan.md`: extension-boundary starter plan for AutoTutor/H5P-style component drop-ins.

## Initial Migration Map

These existing `docs/` files are developer-facing candidates for migration:

- `ai-legibility-followup-architecture-plan.md`
- `autotutor-dialogue-planner-plan.md`
- `autotutor-implementation-questions.md`
- `autotutor-unit-plan.md`
- `card-runtime-decomposition-plan.md`
- `delivery-settings-consolidation-plan.md`
- `delivery-settings-final-cutover-plan.md`
- `feedback-pipeline-cleanup-plan.md`
- `h5p-assessment-session-playback-audit.md`
- `h5p-assessment-session-race-condition-cleanup-plan.md`
- `h5p-no-scroll-container-policy.md`
- `h5p-stimuli-architecture-plan.md`
- `learner-tdf-configuration-plan.md`
- `learning-session-progress-panel-plan.md`
- `lesson-launch-resume-cleanup-plan.md`
- `mofacts-directory-restructure-plan.md`
- `mofacts-unit-engine-split-plan.md`
- `playwright-mcp-operations.md`
- `production-smoke-load-test.md`
- `study-display-subsets-plan.md`
- `tdf-schema-source-of-truth-plan.md`
- `video-session-state-machine-audit-plan.md`

Migration should happen in small batches with link updates. Do not move deployment operator docs, release/license docs, or user-facing authoring docs into this directory.
