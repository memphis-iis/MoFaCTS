# Architecture Overview

MoFaCTS, the Mobile Fact and Concept Training System, is a Meteor/Svelte web application for adaptive learning practice, assessment, and research.

## Main Application Areas

- `mofacts/client/`: browser application, including learner-facing practice flows, administration screens, content upload, and Svelte components.
- `mofacts/common/`: shared types, helpers, and logic used by client and server code.
- `mofacts/server/`: server startup, publications, methods, authentication, imports, exports, and persistence logic.
- `mofacts/packages/`: local Meteor packages used by the application.
- `mofacts/public/`: static client assets and theme resources.
- `deploy/`: Docker Compose build and deployment workflow.

## Learning Content

MoFaCTS lessons are driven by Tutor Definition Files (TDFs). A TDF defines lesson structure, stimulus and response behavior, scheduling parameters, and supporting metadata. TDFs may reference text, images, audio, video, cloze prompts, multiple-choice options, typed responses, and speech-recognition-based responses.

## Adaptive Practice

The learner-facing flow combines content from TDFs with adaptive scheduling logic based on cognitive memory models. The application records learner interactions and uses those interactions to select and present later practice opportunities.

## Client Runtime

The active learner card experience uses Svelte components and state-machine-oriented runtime logic. Existing Meteor client code still provides routing, data subscriptions, account context, administrative workflows, and integration points.

## Learning Component Modularity

Reusable unit behavior lives under `learning-components/`. The next modularity pass should harden component registration, explicit runtime capabilities, and unit/trial boundaries so new component families such as AutoTutor or H5P can be added without editing central app switchboards. See `../docs-developer/modularity-extension-boundary-plan.md`.

For current contributor work, treat `learning-components/` as the source root for unit behavior:

- Unit packages live under `learning-components/units/`.
- Unit manifests live in `learning-components/units/*/manifest.ts`.
- The default in-repo component catalog is `learning-components/defaultLearningComponentCatalog.ts`.
- The app-facing unit creation facade is `learning-components/units/createUnitEngine.ts`.
- The legacy app path `mofacts/client/views/experiment/unitEngine.ts` should stay a behavior-preserving dependency facade.

The public package at `packages/unit-engine-api` is not the implementation entry point yet; it is a scaffold for a future stable contract. See [development.md](development.md#modify-or-add-a-unit-type) and [learning-component-contracts.md](learning-component-contracts.md) before adding or changing a unit type.

## Server Runtime

Server code handles persistence, authentication and authorization checks, content upload, external integrations, import/export workflows, and data access that cannot safely run on the client.

New server methods should be added only when the task requires database access, authentication enforcement, secret handling, or external service access. Pure computation should live in `common/` or client-side code.

## Deployment

The canonical deployment workflow is Docker Compose under `deploy/`. Public documentation should point to that workflow for release-confidence build and deployment validation.
