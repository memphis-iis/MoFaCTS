# Minimal Unit Type

Copyable template for a new unit engine.

Current status: typed template covered by the repository typecheck through the migration bridge.

Start with `MinimalFlashcardUnit.ts`. It imports the current `UnitEngine` contract from `learning-components/units/UnitEngine`; once `packages/unit-engine-api/` becomes the stable public package, update the import to that package.

Use this when a contributor wants to add a new unit-level learning flow.
