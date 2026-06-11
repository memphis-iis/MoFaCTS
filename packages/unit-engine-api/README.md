# Unit Engine API

Target package for the stable unit engine public contract.

Current status: architectural scaffold. Do not start production unit-engine work here yet.

The active contributor path is:

- `../../learning-components/units/` for unit packages.
- `../../learning-components/units/*/manifest.ts` for unit type registration metadata.
- `../../learning-components/defaultLearningComponentCatalog.ts` for the default in-repo catalog.
- `../../learning-components/units/createUnitEngine.ts` for the app-facing unit-engine creation facade.
- `../../mofacts/client/views/experiment/unitEngine.ts` as a legacy behavior-preserving facade.

See `../../learning-components/README.md`, `../../docs/learning-component-contracts.md`, and `../../docs/development.md#modify-or-add-a-unit-type` before changing or adding a unit type.

The first concrete public API should be extracted from the active `learning-components/` boundary only after that contract has stabilized.
