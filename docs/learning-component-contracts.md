# Learning Component Contracts

MoFaCTS learning components are in-system extensions. They do not own routing, persistence, authorization, or global runtime state. They declare the app capabilities they need, and the MoFaCTS runtime supplies those capabilities through manifest registration and typed adapters.

For the first-pass ownership map across docs, packages, app-owned services, and current component packages, see `docs/learning-component-boundary-map.md`.

## Manifest Requirements

Every component manifest must declare:

- `id`: stable package/component id.
- `kind`: `unit` or `trial-display`.
- `unitTypes` for unit components, or `displayTypes` for trial-display components.
- `requiredCapabilities`: capability names the runtime must provide before registration.
- `requiredServerMethods`: specific server method names when `server-methods` is required.

Registration fails before partial registration when required capabilities or named server methods are missing.
Manifest lists are normalized by trimming whitespace and must not contain duplicate values after normalization.

## Runtime Capability Rules

Use explicit runtime capability objects instead of reaching into Meteor globals or private app services from component code.

- `session`: app-owned session reads/writes passed through an adapter.
- `history`: component emits canonical history through app-owned writers.
- `server-methods`: component lists named methods; no generic `callMethod` pipe.
- `media`: app-owned media resolution.
- `logging`: app-owned logger.
- `assessment-state`: app-owned assessment persistence/state bridge.

Capability objects must expose the required functions for their capability. Empty or malformed capability objects fail clearly during runtime context creation.

## Server Method Rules

Server methods are allowed only for database access, auth/authorization, secrets, or external APIs that cannot safely run on the client/shared code. Components must not use server methods for pure compute or hidden orchestration.

Current named method dependencies:

- `mofacts.learning-session-unit`: `getLearningHistoryForUnit`, `getResponseKCMapForTdf`
- `mofacts.autotutor-unit`: `getAutoTutorHistoryForUnit`

## History Rules

Components must not call `insertHistory` directly. They must emit canonical history through the app-owned write path described in `docs/history-envelope.md`.

## Extension Checklist

Before adding or changing a component:

- Add or update its manifest.
- Declare only the capabilities it actually needs.
- Name every server method dependency.
- Route history through the canonical history envelope.
- Keep component-specific telemetry bounded.
- Add contract tests for manifest registration, missing capability failure, and any new history/event semantics.
