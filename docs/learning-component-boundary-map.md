# Learning Component Boundary Map

Use this map as the first orientation point for humans or AI agents changing MoFaCTS learning components. MoFaCTS components are in-system extensions: they plug into one app runtime, one history pipeline, and one scheduling/progression model.

## Start Here

When adding or changing a component, keep these documents together:

- `docs/ai-modularity-efficiency-prompt.md`: review criteria for modularity, integration, efficiency, and telemetry size.
- `docs/learning-component-contracts.md`: manifest, capability, server-method, and extension checklist.
- `docs/history-envelope.md`: canonical history schema, event types, extension fields, and compression rules.
- `learning-components/README.md`: source-tree ownership and package checklist.

## Ownership Rule

Component-owned code belongs under `learning-components/` when it is pedagogical behavior, authored-content interpretation, model policy, display/result normalization, or unit/trial-display lifecycle logic.

App-owned code stays under `mofacts/` when it is Meteor routing, startup, publications, collections, persistence, authorization enforcement, server methods, upload/storage, shell UI, or deployment/runtime wiring.

The dependency direction is one-way: app code may import component code, but component code must not reach into app internals, Meteor globals, or private services.

## Runtime Contract

Each component declares a `LearningComponentManifest`.

Required manifest fields:

- `id`
- `kind`
- `unitTypes` or `displayTypes`
- `requiredCapabilities`
- `requiredServerMethods` when the component needs `server-methods`

Registration validates all required capabilities and named server methods before partial registration. Missing or malformed capabilities fail clearly; they are not inferred from globals.

## Capability Boundary

Use explicit capability adapters instead of direct app access.

- `session`: app-owned session reads and writes.
- `history`: app-owned canonical history writer.
- `server-methods`: named DB/auth/secrets/external-API methods only.
- `media`: app-owned asset resolution.
- `logging`: app-owned logger.
- `assessment-state`: app-owned assessment persistence/state bridge.
- `authz` and `ui-alerts`: app-owned authorization and user alert surfaces.

Unit-engine components receive session state only through the typed key contract in
`learning-components/units/UnitEngineSessionKeys.ts`. The app-owned compatibility
facade in `mofacts/client/views/experiment/unitEngine.ts` must stay thin; raw
Meteor `Session`, `Tdfs`, browser globals, app runtime state owners, and user alerts are wired
only by `mofacts/client/views/experiment/unitEngineRuntimeContext.ts`. If a unit
requires a new app-state key, add it to the typed read/write list with a clear owner
instead of passing arbitrary Session keys through the component adapter.

The adapter boundary should also be an efficiency boundary: move pure interpretation, normalization, scheduling, and scoring logic into component/shared code so the app stops duplicating parsing or calling the server for pure compute.

## History Boundary

Components do not call `insertHistory` or persistence methods directly.

The component emits compact canonical history records through the app-owned history capability/helper. The app stamps `historySchemaVersion`, validates the common core, enforces extension and wire-size budgets, compresses stable fields, authorizes the write, and persists the row.

Component-specific data belongs only in bounded extension fields such as `CFNote` or `h5p`. Per-trial rows must not include full runtime snapshots, global session state, full experiment state, or unbounded dialogue/history dumps.

## Server Boundary

Server methods are allowed only for database access, authorization, secrets, or external APIs that cannot safely run on the client/shared runtime. Components must not use server methods as hidden orchestration or pure-compute helpers.

Current named method dependencies:

- `mofacts.learning-session-unit`: `getLearningHistoryForUnit`, `getResponseKCMapForTdf`
- `mofacts.autotutor-unit`: `getAutoTutorHistoryForUnit`

## Current Component Packages

- `learning-components/units/learning-session/`: model learning-session unit engine, runtime-config interpretation, card selection, prefetch/lock, and model preparation.
- `learning-components/units/assessment-session/`: assessment schedule unit engine and authored schedule construction.
- `learning-components/units/autotutor/`: AutoTutor unit manifest, runtime capability contracts, end-state semantics, saved state/history validation, generation config, and planning helpers.
- `learning-components/units/instruction/`: instruction-only unit-engine boundary for authored instruction units.
- `learning-components/units/video-session/`: minimal video-session unit engine and adaptive video question helpers.
- `learning-components/trial-displays/h5p/`: H5P display ownership, display config normalization, result normalization, and adapter manifest.
- `learning-components/samples/echo-unit/`: test-only sample package showing the manifest and package shape.

## Contributor Checklist

Before a component change is ready:

- The package README names component-owned and app-owned responsibilities.
- The manifest declares only the capabilities the component actually uses.
- Any server dependency is named in `requiredServerMethods`.
- History goes through the canonical envelope and uses bounded extension fields.
- Pure interpretation/normalization/scoring logic lives outside Meteor-specific app code when safe.
- Tests cover registration, missing capability failure, named server-method failure, and any new history/event semantics.
- `npm run typecheck` and `npm run lint` pass from `mofacts/`.
