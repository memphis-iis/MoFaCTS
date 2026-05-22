# App Runtime History

Target home for canonical learner history recorder contracts, accepted field definitions, normalization, and reconstruction boundaries.

Current status: architectural target. Executable app history code currently lives under `mofacts/client/lib/history/` and `mofacts/common/history/` during migration.

Learning components should call the recorder through an explicit app/runtime contract. Component-specific details belong in event payload fields, not in alternate recorders or component-owned history schemas.
