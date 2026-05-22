# MoFaCTS Directory Restructure Plan

## Agent workflow requirements

Before beginning this plan, an AI coding agent or human contributor should first read the repository's agent/instruction file, especially:

```text
AGENTS.md
```

If there are additional agent instruction files in subdirectories, read the most specific one that applies to the files being changed.

The agent should then work the plan to completion rather than pausing after each small step. Pause only when there is a critical blocking question, such as:

- A required architectural choice is genuinely ambiguous.
- A change would delete or rewrite important behavior without enough evidence.
- The repo instructions conflict with this plan.
- Tests or build output reveal a failure that cannot be safely diagnosed from the available evidence.

For normal uncertainty, make the safest local decision, document the assumption in the commit or implementation notes, and continue.


## Purpose

This document sketches a clearer target directory structure for MoFaCTS as it moves toward an NSF-supported open-source consortium model.

The goal is not just tidier folders. The goal is contributor orientation:

> A new developer should be able to open the repository and immediately know where to go if they want to work on unit engines, trial types, adaptive models, content interpretation, deployment, tests, or documentation.

The proposed structure distinguishes between the relatively stable MoFaCTS application shell and the more contributor-facing pedagogical components.

For the detailed follow-on plan for splitting `unitEngine.ts`, see:

```text
mofacts-unit-engine-split-plan.md
```

## Recommended high-level structure

```text
MoFaCTS/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── CHANGELOG.md
├── Dockerfile
├── docker-compose.yml
│
├── app/
│   ├── meteor/
│   │   ├── .meteor/
│   │   ├── client/
│   │   ├── server/
│   │   ├── public/
│   │   └── imports/
│   │
│   ├── ui/
│   │   ├── learner/
│   │   ├── authoring/
│   │   ├── admin/
│   │   └── shared/
│   │
│   ├── data/
│   │   ├── collections/
│   │   ├── methods/
│   │   ├── schemas/
│   │   ├── publications/
│   │   ├── logging/
│   │   ├── userHistory/
│   │   └── migrations/
│   │
│   ├── runtime/
│   │   ├── MeteorRuntimeContext.ts
│   │   ├── sessionKeys.ts
│   │   ├── runtimeEvents.ts
│   │   └── appConfig.ts
│   │
│   ├── routes/
│   ├── startup/
│   └── shell/
│
├── learning-components/
│   ├── units/
│   │   ├── UnitEngine.ts
│   │   ├── UnitEngineRegistry.ts
│   │   ├── createUnitEngine.ts
│   │   ├── instruction/
│   │   ├── learning-session/
│   │   ├── assessment-session/
│   │   └── video-session/
│   │
│   ├── trials/
│   │   ├── TrialType.ts
│   │   ├── TrialTypeRegistry.ts
│   │   ├── standard-drill/
│   │   ├── study/
│   │   ├── test/
│   │   ├── multiple-choice/
│   │   ├── h5p/
│   │   ├── video-prompt/
│   │   └── simulations/
│   │
│   ├── models/
│   │   ├── ModelPolicy.ts
│   │   ├── ModelState.ts
│   │   ├── probability/
│   │   ├── selection/
│   │   ├── history/
│   │   ├── answer-updates/
│   │   └── policies/
│   │
│   ├── content/
│   │   ├── tdf/
│   │   ├── stimuli/
│   │   ├── media/
│   │   ├── display/
│   │   └── response-normalization/
│   │
│   ├── adapters/
│   │   ├── h5p/
│   │   ├── xapi/
│   │   └── external-widgets/
│   │
│   └── runtime/
│       ├── LearningComponentContext.ts
│       ├── LearningComponentManifest.ts
│       └── componentEvents.ts
│
├── packages/
│   ├── unit-engine-api/
│   ├── trial-type-api/
│   ├── model-policy-api/
│   └── content-adapter-api/
│
├── examples/
│   ├── minimal-unit-type/
│   ├── minimal-trial-type/
│   ├── h5p-trial/
│   ├── model-policy/
│   └── content-adapter/
│
├── deploy/
│   ├── README.md
│   ├── docker/
│   ├── settings/
│   ├── environments/
│   ├── scripts/
│   └── healthchecks/
│
├── docs/
│   ├── architecture/
│   ├── contributors/
│   ├── deployment/
│   ├── research/
│   └── release/
│
├── tests/
│   ├── app/
│   ├── learning-components/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── scripts/
│   ├── dev/
│   ├── audit/
│   ├── migration/
│   └── release/
│
└── tools/
    ├── mcp-sidecar/
    ├── validators/
    └── diagnostics/
```

## Conceptual split

### `app/`

The stable MoFaCTS application shell.

This includes the Meteor application, routing, startup, server methods, publications, UI surfaces, data collections, schemas, persistence, logging, and application runtime glue.

Most consortium contributors should not need to start here unless they are working on application infrastructure, administration, deployment behavior, or app-level persistence.

### `learning-components/`

The contributor-facing pedagogical layer.

This is where MoFaCTS should expose its main extension surfaces:

- Unit engines.
- Trial types.
- Adaptive models.
- Content interpretation.
- H5P and external-widget adapters.
- Runtime contracts for pedagogical components.

This is intentionally more verbose than `core` or `learning`. The name should communicate that this is where modifiable learning-system parts live.

### `packages/`

Stable public APIs or future independently versioned modules.

This folder does not need to be heavily populated immediately. It can begin as a place for interface definitions and later become true package boundaries.

Candidate packages:

- `unit-engine-api`
- `trial-type-api`
- `model-policy-api`
- `content-adapter-api`

### `examples/`

Copyable examples for contributors.

This is important for ecosystem building. A new contributor should be able to copy a minimal unit type, trial type, H5P adapter, or model policy and modify it.

### `deploy/`

Top-level deployment and runtime operations.

Deployment should not be hidden under a dot-folder inside the app. People naturally look for deployment at the root. Use `deploy/`, not `.deploy/`, for Docker scripts, settings templates, environment-specific files, and health checks.

### `docs/`

Human-facing architecture and contributor documentation.

The docs should mirror the code architecture. A contributor should be able to move from `docs/contributors/adding-a-unit-type.md` to `learning-components/units/` without guessing.

### `tests/`

Tests organized by conceptual area.

The test tree should reinforce the architecture:

- `tests/app/`
- `tests/learning-components/`
- `tests/integration/`
- `tests/e2e/`
- `tests/fixtures/`

## Top-level rule

The desired dependency direction is:

```text
app/ imports learning-components/
learning-components/ avoids deep dependence on app/
```

Some Meteor coupling will remain during migration. The key is to avoid making new learning components depend directly on Meteor `Session`, app globals, or random app-level helpers.

Use a runtime context boundary to manage the transition:

```ts
interface LearningComponentContext {
  getSessionValue(key: string): unknown;
  setSessionValue(key: string, value: unknown): void;
  getDeliverySettings(): Record<string, unknown>;
  getCurrentUserId(): string | null;
  callServerMethod<T>(name: string, ...args: unknown[]): Promise<T>;
}
```

At first, this can be backed by Meteor. Later, it gives MoFaCTS a cleaner pedagogical layer.

## Recommended migration sequence

### Phase 1: Add the visible scaffold

Create these folders first, with placeholder README files explaining their purpose:

```text
learning-components/units/
learning-components/trials/
learning-components/models/
learning-components/content/
learning-components/adapters/
learning-components/runtime/
app/data/
app/runtime/
deploy/
docs/architecture/
docs/contributors/
examples/
tests/learning-components/
```

Do not move major code yet.

This gives contributors and AI coding agents a target map.

### Phase 2: Move deployment to root

Move:

```text
mofacts/.deploy/
```

toward:

```text
deploy/
```

Update Dockerfile and related scripts accordingly.

This should be done early because deployment discoverability is a high-value, low-conceptual-risk improvement. It also helps future contributors run the system.

### Phase 3: Add README files as architectural signs

Every major folder should have a short `README.md` explaining:

- What belongs here.
- What does not belong here.
- How this folder relates to extension points.
- The most important files.

This is especially helpful for AI coding agents and first-time contributors.

### Phase 4: Add contributor-facing examples

Minimum examples:

```text
examples/minimal-unit-type/
examples/minimal-trial-type/
examples/model-policy/
examples/h5p-trial/
examples/content-adapter/
```

Examples should compile or be copy-pasteable. They are part of the architecture, not an afterthought.

### Phase 5: Start moving code into the scaffold

Use the unit-engine split as the first major proof case. See:

```text
mofacts-unit-engine-split-plan.md
```

## Practical advice for implementation

### Do behavior-preserving extraction first

Avoid redesigning logic while moving files. The first pass should mostly be:

- Move function.
- Export function.
- Import function from new location.
- Preserve behavior.
- Add test or smoke check.
- Commit.

### Use wrappers liberally

Wrappers reduce risk and let old imports keep working. They also make review easier.

Example:

```ts
// old path
export * from '../../../learning-components/units/createUnitEngine';
```

### Avoid junk-drawer folder names

Avoid `utils`, `helpers`, `services`, and `managers` unless there is no better domain name.

Prefer domain names:

- `selection`
- `probability`
- `history`
- `schedule`
- `tdf`
- `stimuli`
- `display`
- `runtime`

### Commit sequence matters

Use many small commits. Avoid a mega-PR titled “refactor architecture.”

Recommended PR order:

1. Add directory scaffold and README files.
2. Move deployment folder to root and update paths.
3. Add docs for the new directory structure.
4. Add examples for unit/trial/model/content extension points.
5. Begin the `unitEngine.ts` split described in the companion plan.
6. Add tests around new boundaries.
7. Clean old paths only after wrappers and tests are stable.

## Final recommendation

Create the new architecture scaffold before splitting `unitEngine.ts`, but do not move everything at once.

The best order is:

```text
1. Establish the architecture map.
2. Add compatibility wrappers.
3. Split `unitEngine.ts` into the new unit/model/schedule/card-prep locations.
4. Extract trial types and content interpretation.
5. Clean up legacy paths.
```

This should produce better final results than either splitting `unitEngine.ts` in place or doing a huge folder migration first.
