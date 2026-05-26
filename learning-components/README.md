# Learning Components

This directory is the target home for contributor-facing pedagogical extension points.

Current status: contributor-facing source root under active expansion. TypeScript, lint, and CI test bundling include this directory. Unit-engine code now runs here behind behavior-preserving import facades from legacy app paths.

Before adding new executable areas here, make sure Meteor/Rspack, Docker, lint, and tests cover the path deliberately so unresolved imports fail clearly.

Current extension boundaries:

- `runtime/ComponentManifest.ts`: learning component manifests with explicit runtime capabilities.
- `runtime/LearningComponentCatalog.ts`: catalog packaging for unit and trial-display manifest groups.
- `runtime/registerLearningComponents.ts`: shared manifest-list bootstrap and manifest summary helpers.
- `defaultLearningComponentCatalog.ts`: default in-repo component package used by app bootstraps.
- `samples/echo-unit/`: test-only sample component package that demonstrates the manifest, implementation, fixture, and README shape for future component bundles.
- `runtime/TrialDisplayAdapterRegistry.ts`: display-owned trial adapter registry for H5P-style interactions.
- `units/UnitEngineRegistry.ts`: unit engine registration and creation.

Belongs here:

- Unit engines.
- Trial types.
- Adaptive models and model policies.
- TDF, stimulus, display, and response-normalization logic.
- H5P, xAPI, and external-widget adapters.
- Runtime contracts for pedagogical components.

Does not belong here:

- Meteor startup, routing, publications, collections, or app-level persistence.
- Admin, authoring, or learner shell UI.
- Deployment operations.

Dependency direction: `app/` may import `learning-components/`; `learning-components/` should avoid deep dependence on `app/`.
