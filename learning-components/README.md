# Learning Components

This directory is the target home for contributor-facing pedagogical extension points.

Current status: contributor-facing source root under active expansion. TypeScript, lint, and CI test bundling include this directory. Unit-engine code now runs here behind behavior-preserving import facades from legacy app paths.

Before adding new executable areas here, make sure Meteor/Rspack, Docker, lint, and tests cover the path deliberately so unresolved imports fail clearly.

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
