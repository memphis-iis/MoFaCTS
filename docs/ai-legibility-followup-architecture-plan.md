# AI-Legibility Follow-Up Architecture Plan

## Purpose

This plan captures the architectural loose ends left after the first AI-legibility cleanup pass. The completed pass made several high-risk areas easier for future agents to understand:

- card runtime decomposition
- card machine action/context split
- assessment schedule parser extraction
- collection ownership registry
- session cleanup registry
- field registry split
- direct `/auth/login` route support for local inspection

The remaining work should not be folded into that patch. These items are broader architectural projects that need small, behavior-preserving phases.

The goal is to make MoFaCTS easier for future AI coding agents and human maintainers to extend safely by making subsystem boundaries, invariants, and verification paths explicit.

## Non-Goals

- Do not redesign learner-visible behavior as part of these cleanup phases.
- Do not rename public TDF fields without a compatibility and content-repo plan.
- Do not add compatibility fallback paths.
- Do not move files into a new top-level app structure as part of this plan.
- Do not replace Meteor `Session` globally in one patch.
- Do not split the card runtime into a full plugin system until the existing runtime boundaries are documented and tested.

## Global Invariants

- Missing runtime invariants should fail clearly.
- Existing working launch paths must remain regression-sensitive.
- Standard card, video-session, AutoTutor, and H5P behavior must keep their current entry boundaries unless a phase explicitly changes one boundary.
- TDF schema generation must remain deterministic.
- Collection names must remain stable, including historical names such as `dynaminc_settings`.
- Meteor collection construction and global bridge ordering must remain compatible with current startup code.
- Session cleanup must preserve the documented launch/resume boundaries.

## Execution Rule

Implement phases in the recommended order. Within a phase, continue from discovery through the smallest coherent implementation, verification, and documentation updates without pausing for non-blocking preferences. Pause only when a listed stop condition is hit, when an invariant cannot be preserved, or when a required product or repository decision cannot be inferred from existing code and documentation.

## Phase 1: Collection Boundary Split

### Problem

`mofacts/common/Collections.ts` still mixes three concerns:

- Mongo and FilesCollection declarations
- `DynamicAssets` upload policy
- legacy `globalThis` collection bridge

The ownership registry now documents collection purpose and names, but future agents can still treat `Collections.ts` as a place to add unrelated persistence behavior.

### Target Shape

Keep `Collections.ts` as the canonical collection declaration entrypoint, but move adjacent concerns into named modules:

```text
mofacts/common/Collections.ts
mofacts/common/collectionOwnership.ts
mofacts/common/fileUploadPolicy.ts
mofacts/common/collectionGlobals.ts
```

### Steps

1. Extract the `DynamicAssets` FilesCollection upload restrictions into `fileUploadPolicy.ts`.
2. Keep the policy pure where possible: constants and small validation helpers first, wiring second.
3. Extract the `globalThis` assignment into `collectionGlobals.ts`.
4. Keep `Collections.ts` responsible for constructing collections and invoking the bridge.
5. Extend `mofacts/common/collectionOwnership.test.ts` to verify canonical collection names and the intended global bridge keys remain aligned with the extracted bridge.
6. If the extracted bridge needs direct behavioral coverage, add a focused `mofacts/common/collectionGlobals.test.ts` rather than expanding unrelated collection tests.

### Verification

- `npm run typecheck`
- `npm run lint`
- Meteor startup-order coverage in CI or another supported Meteor test environment when collection construction or startup ordering changes. Do not run `npm run test:ci` as routine local Windows verification.
- Confirm `DynamicSettings` still uses `dynaminc_settings`

### Do Not Combine With

- Renaming collections
- Removing globals
- Changing file upload quotas or auth behavior

## Phase 2: Card Runtime Boundary Documentation

### Problem

The card runtime is much more legible after decomposition, but it is still not a true plugin architecture. Feature-specific runtime pieces live under the shared Svelte experiment runtime because MoFaCTS does not yet have a stable unit-component extension boundary.

This is acceptable for now, but future agents need explicit guidance about where new behavior goes.

### Target Shape

Add or update local runtime boundary documentation near the Svelte experiment code:

```text
mofacts/client/views/experiment/svelte/README.md
mofacts/client/views/experiment/svelte/machine/README.md
mofacts/client/views/experiment/svelte/services/README.md
```

The documentation should describe:

- which files own launch bootstrap
- which files own card display readiness
- which files own machine state, actions, guards, and services
- where video-session bridge behavior belongs today
- where AutoTutor or H5P integration behavior should and should not go
- what must fail clearly instead of being recovered silently

### Verification

- Documentation-only review
- Search for stale references to deleted or renamed files

### Do Not Combine With

- Moving video-session files into `learning-components`
- Introducing a plugin registry
- Replacing the card machine

## Phase 3: Runtime Extension Boundary Design

### Problem

A future contributor cannot yet build a unit and plug it in without adding bridge code to shared runtime files. The current architecture has explicit runtime seams, but not a stable extension contract.

### Target Shape

Create a written design before implementation:

```text
docs/unit-runtime-extension-boundary-plan.md
```

The design should define:

- what a unit runtime adapter is
- how standard card, video-session, H5P, and AutoTutor units declare entry requirements
- how launch readiness is validated
- how unit-specific rendering bridges register with the shared card runtime
- which data remains in TDF/config versus runtime state
- how errors are surfaced

### Candidate Interfaces

These are examples to evaluate, not implementation requirements:

```ts
type UnitRuntimeKind = 'standard-card' | 'video-session' | 'h5p' | 'autotutor';

interface UnitRuntimeAdapter {
  readonly kind: UnitRuntimeKind;
  validateLaunchContext(context: unknown): void;
  prepareRuntime(context: unknown): Promise<unknown>;
}
```

### Verification

- Design review against existing standard card, video-session, H5P, and AutoTutor paths
- No code changes in the first design phase

### Do Not Combine With

- Large file moves
- Unit engine rewrites
- TDF schema changes

## Phase 4: Session State Domain Adapters

### Problem

`sessionCleanupRegistry.ts` documents cleanup boundaries, but much runtime state still lives in global Meteor `Session`. The registry reduces mistakes, but it does not make data ownership fully explicit.

### Target Shape

Introduce small typed adapters for the highest-risk session domains. Start with the card-display/readiness domain already documented by `CARD_RUNTIME_SESSION_DEFAULTS` in `mofacts/client/lib/sessionCleanupRegistry.ts`; use wrappers over existing `Session` keys rather than replacing storage.

Initial adapter files:

```text
mofacts/client/lib/cardRuntimeSession.ts
mofacts/client/lib/launchSessionState.ts
mofacts/client/lib/adminSessionState.ts
```

### Steps

1. Start with the card-display/readiness keys: `displayReady`, `currentDisplay`, `originalQuestion`, `buttonTrial`, `alternateDisplayIndex`, `numVisibleCards`, and `testType`.
2. Move reads/writes for those keys behind named functions in `mofacts/client/lib/cardRuntimeSession.ts`.
3. Keep keys centralized in `sessionCleanupRegistry.ts` or an adjacent key registry.
4. Add tests for cleanup and launch/resume preservation behavior.
5. Repeat only after the first adapter proves useful.

### Verification

- `npm run typecheck`
- `npm run lint`
- Existing session cleanup tests
- Focused tests for each adapter's key behavior

### Do Not Combine With

- Replacing Meteor `Session`
- Changing launch/resume behavior
- Renaming session keys such as `submmissionLock`

## Phase 5: Assessment Golden Fixtures

### Problem

The assessment schedule parser is now pure and fail-clear, but it still lacks golden fixtures that prove representative TDF grouping behavior stays stable.

### Target Shape

Add fixture-based tests around `learning-components/units/assessment-session/assessmentSettings.ts`.

Fixture and test structure:

```text
learning-components/units/assessment-session/__fixtures__/
mofacts/client/views/experiment/assessmentSettings.contracts.test.ts
```

### Fixture Coverage

- one group, one template, one cluster repeat
- multiple groups with matching template and cluster repeat counts
- malformed group/template count mismatch
- malformed group/cluster repeat mismatch
- exhausted cluster list

### Verification

- `npm run typecheck`
- `npm run lint`
- Meteor client contract coverage in CI or another supported Meteor test environment. Do not run `npm run test:ci` as routine local Windows verification; document that this coverage remains CI-only for the patch.

### Do Not Combine With

- Changing schedule output semantics
- Supporting malformed legacy authoring input

## Phase 6: Field Registry Governance

### Problem

The registry is split into domain files, but future fields still need to update schema, docs, runtime, and tests together. The architecture is now capable of safe edits; the process needs to be explicit.

### Target Shape

Add contributor guidance near the registry:

```text
mofacts/common/fieldRegistryREADME.md
```

or extend an existing README if one is created for `mofacts/common`.

The guidance should say:

- which file owns each field family
- when to use lifecycle statuses
- how aliases and migrations should be documented
- when runtime validation is required
- which commands regenerate schemas
- what tests must be updated when adding a field

### Verification

- Documentation-only review
- `npm run generate:schemas` after registry edits
- Confirm generated schemas have no unintended diffs

### Do Not Combine With

- Adding new TDF fields
- Removing deprecated fields
- Changing schema generation logic

## Phase 7: Fallback Vocabulary And Failure Boundary Audit

### Problem

The touched runtime paths now avoid misleading fallback terminology, and `AGENTS.md` says silent fallbacks are not allowed. Older code still contains many `fallback` names and comments. Some are intentional defaults; others may hide real invariant failures.

### Target Shape

Do a domain-by-domain audit. Do not globally rename `fallback`.

Recommended order:

1. theme initialization
2. auth token storage
3. dashboard progress signals
4. media resolution
5. audio settings
6. package import/export

For each area, classify each fallback as:

- intentional default
- explicit alternate path
- compatibility behavior
- silent invariant masking

### Verification

- For intentional defaults, rename to `default`, `initial`, or domain-specific terms where accurate.
- For invariant masking, add fail-clear checks and tests.
- Keep each domain in its own patch.

### Do Not Combine With

- Broad search-and-replace
- Behavior changes across multiple domains
- Removing compatibility behavior without product review

## Phase 8: Verification Strategy Cleanup

### Problem

Local Windows development does not reliably run the full Meteor test harness. Future agents need a clear, honest verification ladder so they do not overclaim confidence.

### Target Shape

Update `AGENTS.md` for agent-facing operating rules and `docs/contributors/README.md` or a new file under `docs/contributors/` for human contributor guidance with a verification matrix:

- TypeScript changes: `npm run typecheck`
- Lintable changes: `npm run lint`
- Schema registry changes: `npm run generate:schemas`
- UI changes: hotfix dev server plus browser smoke
- Meteor integration/client contract tests: CI or another supported Meteor test environment; do not run `npm run test:ci` as routine local Windows verification
- Docker/deploy verification: only when explicitly requested

### Verification

- Documentation-only review
- Confirm commands match `mofacts/package.json`

### Do Not Combine With

- Changing CI
- Docker workflow edits
- Test runner migration

## Recommended Patch Order

1. Phase 8: verification documentation, because it improves every later phase.
2. Phase 2: card runtime boundary docs, because it protects the newly decomposed runtime.
3. Phase 6: field registry governance, because the split is already complete.
4. Phase 5: assessment golden fixtures, because parser behavior is now isolated.
5. Phase 1: collection boundary split, because it is useful but load-order sensitive.
6. Phase 4: session state domain adapters, one domain at a time.
7. Phase 7: fallback vocabulary audit, one domain at a time.
8. Phase 3: runtime extension boundary design, then implementation only after review.

## Stop Conditions

Pause and re-plan if:

- a phase requires changing learner-visible behavior
- collection construction or Meteor startup order becomes ambiguous
- a proposed adapter changes launch/resume behavior
- schema generation output changes unexpectedly
- an older fallback appears to be product-required compatibility behavior

## Completion Criteria

This follow-up plan is complete when:

- collection declarations, upload policy, and global bridge have separate named homes
- future agents can tell where to put card runtime launch, readiness, machine, and bridge behavior
- session cleanup and session access use documented domain boundaries
- assessment parser behavior has golden fixtures
- field registry edits have local contributor guidance
- fallback-like behavior is classified by domain rather than hidden in generic names
- documentation clearly states which verification commands are meaningful on Windows and which require CI or another supported environment
