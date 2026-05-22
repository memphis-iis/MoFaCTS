# MoFaCTS Directory Restructure Plan

## Agent workflow requirements

Before beginning this plan, an AI coding agent or human contributor should first read the repository's agent/instruction file, especially:

```text
AGENTS.md
```

If there are additional agent instruction files in subdirectories, read the most specific one that applies to the files being changed.

The agent should then work the plan forward until it reaches a real question rather than pausing after each small step. This plan is intentionally large; "completion" means continuing through the planned sequence while the invariants still hold, not forcing a single giant unreviewable change. Pause only when there is a critical blocking question, such as:

- A required architectural choice is genuinely ambiguous.
- A change would delete or rewrite important behavior without enough evidence.
- The repo instructions conflict with this plan.
- Tests or build output reveal a failure that cannot be safely diagnosed from the available evidence.

For normal uncertainty, make the safest local decision, document the assumption in the commit or implementation notes, and continue.

When a phase is naturally reviewable as a pull request, keep the commit or PR boundary coherent, but do not stop merely because that boundary has been reached. Continue into the next phase unless the next phase would interfere with verifying the previous one or expose a real architectural conflict.


## Purpose

This document sketches a clearer target directory structure for MoFaCTS as it moves toward an NSF-supported open-source consortium model.

The goal is not just tidier folders. The goal is contributor orientation and institutional credibility:

> A new developer should be able to open the repository and immediately know where to go if they want to work on unit engines, trial types, adaptive models, content interpretation, deployment, tests, or documentation.

The proposed structure distinguishes between the relatively stable MoFaCTS application shell and the more contributor-facing pedagogical components. The current `mofacts/` tree works, but it hides too many important choices from first-time professional contributors. A top-level, plainly named architecture is a product requirement for consortium adoption, not cosmetic cleanup.

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

This end state intentionally conflicts with the current Meteor-centered source layout. The migration must therefore include explicit build-system bridgework rather than assuming root-level TypeScript will be discovered automatically.

Required bridgework:

- Decide when root-level `app/` and `learning-components/` become executable source rather than scaffold/documentation.
- Update `mofacts/tsconfig.json` or introduce a root TypeScript project structure that includes the new source roots.
- Update Meteor and Rspack resolution so imports from the new roots are first-class and fail clearly when unresolved.
- Update Docker build context and copy rules so production builds include the new source roots.
- Update lint, test, and typecheck commands so they cover the new roots.
- Document the import boundary so new code does not reach through legacy paths by habit.

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

Learner history is an app-owned runtime/data boundary, not a model-owned learning component. Components should emit history event data through one canonical recorder contract. They may pass existing fields and approved component-specific payload fields, but they should not redefine, replace, or directly modify the recorder. Model code may consume reconstructed history as input, while app/runtime code owns history field acceptance, normalization, persistence, reconstruction, and server/database access.

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

This gives contributors and AI coding agents a target map. At this phase, these folders may be architectural signposts rather than executable source roots. If they are not executable yet, their README files should say so plainly and point to the bridgework required before code is moved there.

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

This should be done early because deployment discoverability is a high-value improvement. It is not conceptually risky, but it is operationally broad because the pre-migration Dockerfile, hotfix scripts, public docs, and agent instructions all named `mofacts/.deploy/` as canonical.

Deployment move invariants:

- `deploy/` becomes the single canonical deployment and runtime-operations directory.
- `mofacts/.deploy/` must not remain as a second supported workflow.
- Any temporary path shim must be a short-lived migration aid that fails clearly and points to `deploy/`; it must not run an alternate hidden workflow.
- Dockerfile copy paths, settings paths, hotfix dev scripts, hotfix local scripts, Compose files, public docs, and agent instructions are updated in the same coherent phase or in a sequence where each intermediate state is explicitly verified.
- Local ignored state currently under `mofacts/.deploy/local-dev/` and local data currently under `mofacts/.deploy/local-data/` get a deliberate new home, with `.gitignore` rules updated before generated state is produced.

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

Wrappers reduce risk and let old imports keep working. In this plan, a wrapper has one narrow meaning:

> A wrapper is a deliberate, behavior-preserving import facade from an old module path to a new single source-of-truth module path.

Wrappers are allowed only to preserve import compatibility while code is being moved. They must not preserve old behavior separately. They must not provide recovery behavior. They must not become a second implementation.

Example:

```ts
// old path
export * from '../../../learning-components/units/createUnitEngine';
```

Wrapper invariants:

- The wrapper contains no business logic.
- The wrapper contains no state.
- The wrapper contains no conditional path selection.
- The wrapper contains no duplicated constants, types, helper functions, or default values from the new module.
- The wrapper does not catch errors, retry old code, or silently recover from missing new code.
- The wrapper points in one direction: old import path to new implementation.
- The wrapper fails exactly as the new implementation fails.
- The wrapper exists only to keep behavior-preserving extraction reviewable while imports are cleaned up.
- Each wrapper should have an owner phase for removal after consumers move to the new path.

Bad wrappers are explicitly out of scope:

```ts
// Do not do this.
export function createUnitEngine(...args: unknown[]) {
  try {
    return createNewUnitEngine(...args);
  } catch {
    return createLegacyUnitEngine(...args);
  }
}
```

```ts
// Do not do this.
export function normalizeTrialType(type: string) {
  return type || "standard-drill";
}
```

Those examples are fallbacks or duplicated behavior, not wrappers. If an old import path needs to keep working, it should re-export the new implementation and nothing else.

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
