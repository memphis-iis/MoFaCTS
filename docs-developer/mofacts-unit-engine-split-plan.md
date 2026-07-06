# MoFaCTS `unitEngine.ts` Split Plan

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

This document describes how to split the current `unitEngine.ts` into the proposed `learning-components/` architecture.

The broader directory restructure is covered separately in:

```text
mofacts-directory-restructure-plan.md
```

The goal here is not just smaller files. The goal is to make MoFaCTS unit behavior, adaptive modeling, assessment scheduling, card preparation, and trial flow understandable and extensible.

## Current responsibilities bundled in `unitEngine.ts`

The file currently mixes all of these responsibilities:

- Unit engine factory exports.
- Shared card/question/answer preparation.
- Instruction-only unit behavior.
- Video-session unit behavior.
- Model-based learning-session behavior.
- Assessment/schedule unit behavior.
- TDF cluster-list and assessment-setting parsing.
- Adaptive probability calculation.
- Card/stim/response model-state initialization.
- Card-selection policies.
- Early-lock and prefetch mechanics.
- Practice-time and answer-result updates.
- Resume-state reconstruction.
- Direct Meteor, Session, app runtime state, delivery settings, and server-method calls.

The split should make those responsibilities visible as separate folders and files.

## Target location map

Move toward this target structure:

```text
learning-components/
├── units/
│   ├── UnitEngine.ts
│   ├── UnitEngineRegistry.ts
│   ├── createUnitEngine.ts
│   ├── shared/
│   │   ├── cardPreparation.ts
│   │   ├── cardCommit.ts
│   │   ├── cardStateKeys.ts
│   │   ├── currentCardInfo.ts
│   │   └── unitProgression.ts
│   ├── instruction/
│   │   └── InstructionUnitEngine.ts
│   ├── video-session/
│   │   ├── VideoUnitEngine.ts
│   │   └── videoCheckpointSelection.ts
│   ├── assessment-session/
│   │   ├── AssessmentUnitEngine.ts
│   │   ├── assessmentSettings.ts
│   │   ├── createAssessmentSchedule.ts
│   │   ├── scheduleCursor.ts
│   │   └── schedulePersistence.ts
│   └── learning-session/
│       ├── LearningSessionUnitEngine.ts
│       ├── learningSessionRuntime.ts
│       ├── prefetchAndLocking.ts
│       ├── practiceTime.ts
│       └── learningUnitFinished.ts
│
├── models/
│   └── README.md                # shared model contracts/primitives only after promotion
│
├── content/
│   ├── tdf/
│   │   ├── clusterListParser.ts
│   │   ├── unitSpecParser.ts
│   │   └── multiTdfRules.ts
│   ├── stimuli/
│   │   ├── stimulusAccess.ts
│   │   ├── stimulusClusters.ts
│   │   └── stimulusAnswers.ts
│   └── display/
│       ├── displayFieldSubsets.ts
│       ├── clozeFormatting.ts
│       └── alternateDisplays.ts
│
└── runtime/
    ├── LearningComponentContext.ts
    ├── LearningComponentAdapterContext.ts
    └── learningSessionKeys.ts
```

The existing `unitEngine.ts` can remain temporarily as a compatibility facade while this extraction happens.

## Unit-engine public interface

Before moving substantial code, define the common interface. This is the contract that makes units modular.

A first-pass interface could be:

```ts
export interface UnitEngine {
  unitType: string;

  init(): Promise<void>;
  loadResumeState(): Promise<void>;

  selectNextCard(
    indices?: unknown,
    curExperimentState?: unknown
  ): Promise<UnitSelection | void>;

  findCurrentCardInfo?(): unknown;

  cardAnswered(
    wasCorrect?: boolean,
    practiceTime?: number
  ): Promise<void>;

  updatePracticeTime?(practiceTime: number): void;

  unitFinished(): boolean | Promise<boolean>;

  prefetchNextCard?(
    indices?: unknown,
    curExperimentState?: unknown
  ): Promise<void> | void;

  applyPrefetchedNextCard?(
    curExperimentState?: unknown
  ): Promise<boolean>;

  clearPrefetchedNextCard?(): void;
}
```

This should be tightened over time, but the first goal is to make the implicit current contract explicit.

## Factory and registry

Move the current factory exports into:

```text
learning-components/units/createUnitEngine.ts
learning-components/units/UnitEngineRegistry.ts
```

The old public exports should remain available during migration:

```text
createScheduleUnit
createModelUnit
createEmptyUnit
createVideoUnit
```

Eventually, `createUnitEngine.ts` should select engines through a registry rather than hard-coded factory branches.

Early implementation can be simple:

```ts
registerUnitEngine("instruction", createInstructionUnitEngine);
registerUnitEngine("video-session", createVideoSessionUnitEngine);
registerUnitEngine("learning-session", createLearningSessionUnitEngine);
registerUnitEngine("assessment-session", createAssessmentSessionUnitEngine);
```

## Compatibility facade

Keep the old file path working during the migration.

The old `unitEngine.ts` should gradually become only:

```ts
export {
  createScheduleUnit,
  createModelUnit,
  createEmptyUnit,
  createVideoUnit,
} from "../../../../learning-components/units/createUnitEngine";
```

The exact relative path will depend on the final physical location.

This lets the system keep running while imports are cleaned up later.

## Extraction order for `unitEngine.ts`

### Step 1: Extract pure small helpers

Move low-risk helpers first.

Candidates:

```text
stripSpacesAndLowerCase
buildHiddenItemKeySet
shouldExcludeCurrentCard
getStimAnswer
```

Target locations:

```text
app/runtime/history/
learning-components/content/stimuli/stimulusAnswers.ts
learning-components/units/learning-session/model/selectionPolicy.ts
```

History helpers such as `getHistoryCorrectAnswer` and `getHistoryResponseKey` belong under the app-owned history boundary, not under adaptive model modules.

Goal: reduce file size without changing behavior.

### Step 2: Extract shared card preparation

Move:

```text
buildPreparedCardQuestionAndAnswerGlobals
applyPreparedCardQuestionAndAnswerGlobals
setUpCardQuestionAndAnswerGlobals
```

Target:

```text
learning-components/units/shared/cardPreparation.ts
```

Related supporting files:

```text
learning-components/content/display/clozeFormatting.ts
learning-components/content/display/alternateDisplays.ts
learning-components/content/display/displayFieldSubsets.ts
```

This is one of the highest-value extractions because model, assessment, and video sessions all need to prepare displayable card state.

### Step 3: Extract instruction-only unit

Move the instruction-only engine into:

```text
learning-components/units/instruction/InstructionUnitEngine.ts
```

This should be nearly direct extraction because it has minimal behavior.

Expected responsibilities:

- Identify itself as instruction-only.
- Immediately report unit completion.
- Provide no-op `selectNextCard`, `cardAnswered`, and `findCurrentCardInfo`.

### Step 4: Extract video-session unit

Move the video unit engine into:

```text
learning-components/units/video-session/VideoUnitEngine.ts
```

Supporting file:

```text
learning-components/units/video-session/videoCheckpointSelection.ts
```

Expected responsibilities:

- Accept explicit checkpoint-driven cluster/stim indices.
- Prepare the specified card.
- Avoid probability/model initialization.
- Let the video player own completion.

This should be the next easiest unit after instruction-only.

### Step 5: Extract assessment-session scheduling

Move the schedule unit into:

```text
learning-components/units/assessment-session/AssessmentUnitEngine.ts
```

Split internals into:

```text
assessmentSettings.ts
createAssessmentSchedule.ts
scheduleCursor.ts
schedulePersistence.ts
```

Responsibilities:

- Parse assessment-session settings.
- Interpret group/template definitions.
- Apply random cluster and random condition behavior.
- Apply final shuffle/swap mappings.
- Persist/reuse schedule artifacts.
- Maintain schedule cursor.
- Prepare and commit scheduled cards.

This module should not know about model-based adaptive probability calculation.

### Step 6: Extract TDF/session interpretation

Move TDF parsing and session-structure logic into:

```text
learning-components/content/tdf/
```

Suggested files:

```text
clusterListParser.ts
unitSpecParser.ts
multiTdfRules.ts
```

Responsibilities:

- Parse cluster lists and ranges.
- Resolve learning-session versus assessment-session cluster sets.
- Handle current multi-TDF assumptions explicitly.
- Provide named functions instead of ad hoc inline logic.

This is important because TDF interpretation is a major contributor-facing boundary.

### Step 7: Extract model-state initialization

Move the logistic/LKT model-state initialization into:

```text
learning-components/units/learning-session/model/modelStateFactory.ts
learning-components/units/learning-session/model/ModelState.ts
```

Responsibilities:

- Create card-level state.
- Create stimulus-level state.
- Create response-level state.
- Validate `clusterKC` and `stimulusKC`.
- Load response-KC maps.
- Initialize counts, timestamps, outcome stacks, prior study counts, and prior probabilities.

This should leave the learning-session unit with a model state object instead of a giant closure full of mutable arrays.

### Step 8: Extract probability functions and probability calculation

Move probability-function construction into:

```text
learning-components/units/learning-session/model/probabilityFunctions.ts
learning-components/units/learning-session/model/tdfProbabilityFunction.ts
```

Move calculation into:

```text
learning-components/units/learning-session/model/probabilityCalculation.ts
```

Responsibilities:

- Define default probability function.
- Define helper functions such as decay, recency, weighted sums, and error lists.
- Compile custom TDF `calculateProbability` code.
- Calculate a single card/stim probability.
- Calculate probabilities for all usable cards/stims.

Keep this behavior-preserving first. Do not try to redesign the model in the same PR.

### Step 9: Extract selection policies

Move card-selection logic into:

```text
learning-components/units/learning-session/model/selectionPolicy.ts
```

Responsibilities:

- Select card closest to optimal probability.
- Select card below threshold ceiling.
- Respect hidden items.
- Respect force-spacing.
- Avoid repeating the current card when requested.
- Handle constrained selection failure explicitly. Do not add silent or alternate fallback selection paths; if an intentional constraint-relaxing retry is retained, name it as deliberate sequencing behavior and keep it visible at the runtime call site.

This is one of the most important research-facing modules because it controls adaptive sequencing.

### Step 10: Extract learning-session runtime

Move the remaining model-unit session flow into:

```text
learning-components/units/learning-session/LearningSessionUnitEngine.ts
learning-components/units/learning-session/learningSessionRuntime.ts
learning-components/units/learning-session/prefetchAndLocking.ts
learning-components/units/learning-session/practiceTime.ts
learning-components/units/learning-session/learningUnitFinished.ts
```

Responsibilities:

- Initialize learning-session engine.
- Coordinate model state, probability calculation, and selection policy.
- Build/apply/commit next card.
- Manage early-lock and prefetch state.
- Track practice time.
- Decide when the learning unit is finished.

This layer should orchestrate the model. It should not own all model internals.

### Step 11: Extract answer and practice-time updates

Move `cardAnswered` logic into:

```text
learning-components/units/learning-session/model/answerUpdates.ts
learning-components/units/learning-session/model/responseMetrics.ts
learning-components/units/learning-session/model/practiceTimeUpdates.ts
```

Responsibilities:

- Update card-level correct/incorrect counts.
- Update stimulus-level correct/incorrect counts.
- Update response-level counts.
- Update outcome stacks.
- Update total and all-time practice duration.
- Maintain “other practice time” values.
- Respect study trials as non-updating for performance metrics.

This should eventually accept an explicit state object and result object, not pull everything directly from `Session`.

### Step 12: Extract resume-state restoration

Move resume-specific model restoration into:

```text
learning-components/units/learning-session/model/resumeModelState.ts
```

Responsibilities:

- Receive reconstructed learner history.
- Restore cluster, stimulus, and response state into adaptive model state.
- Return model-specific visible-card counts and resume metadata.

Canonical learner history is not a model subsystem and should not live under `learning-components/models/`.
History recording, accepted fields, normalization, persistence, and reconstruction are app/runtime-owned boundaries.
Learning components should emit event data through that stable history contract, using existing fields plus approved component-specific payload fields when needed.
They should not modify the canonical recorder or define alternate history storage.

Keep the universal history boundary under an app-owned runtime/data location such as:

```text
app/runtime/history/
```

or, during migration while executable source still lives under `mofacts/`, an equivalent `mofacts/` app-runtime path.

Learning-session-specific resume code may consume reconstructed history through explicit inputs or adapters. It should stay with the learning-session component unless it becomes a shared model contract. It should not fetch history rows itself unless the app supplies that behavior through a context callback.

During migration, old UI-local imports such as:

```text
mofacts/client/views/experiment/svelte/services/historyReconstruction.ts
```

may remain only as deliberate behavior-preserving import facades. Such facades must re-export the canonical app-owned implementation and must not contain alternate reconstruction logic.

### Step 13: Introduce runtime context

Only after the first extractions are stable, introduce:

```text
learning-components/runtime/LearningComponentContext.ts
learning-components/runtime/LearningComponentAdapterContext.ts
```

Purpose:

- Hide direct Meteor/Session access.
- Make learning components easier to test.
- Make future plugin-like components less dependent on app internals.

Do not start with this. It is too easy to turn the first refactor into a framework abstraction project. Do simple extraction first.

## What should stay in the app?

The following should stay under `app/` rather than `learning-components/`:

```text
app/meteor/
app/ui/
app/data/
app/runtime/
app/routes/
app/startup/
```

Specifically:

- Meteor startup.
- Server methods and publications.
- Collections and schemas.
- App-wide logging.
- User/session persistence.
- Learner/admin/authoring UI shells.
- Routing.
- Deployment/runtime configuration hooks.

Learning components may call into these through a context or adapter, but should not treat app internals as their natural home.

## What belongs in `learning-components/`?

The following belong in `learning-components/`:

```text
units/
trials/
models/
content/
adapters/
runtime/
```

Specifically:

- Anything a pedagogical contributor might extend.
- Anything that defines learning-session behavior.
- Anything that defines trial interaction behavior.
- Anything that defines adaptive sequencing.
- Anything that interprets TDF/stimulus/display semantics.
- Anything that adapts external learning widgets like H5P.

Prefer component-owned folders for code that contributors will edit together. The current learning-session LKT/logistic implementation should live under `learning-components/units/learning-session/`, including its local model state, probability, selection, answer-update, and resume helpers. Promote a file to `learning-components/models/`, `learning-components/content/`, or another top-level category only when it is intentionally shared across components or becomes a stable public contract.

## Efficient implementation strategy

### Best order

The best order is:

```text
1. Add scaffold.
2. Add interfaces and wrappers.
3. Extract shared card preparation.
4. Extract simple engines.
5. Extract assessment scheduler.
6. Extract learning-session-owned model state, probability, and selection into the learning-session component folder.
7. Extract learning-session runtime.
8. Extract answer updates and resume logic.
9. Add trial-type interfaces.
10. Clean old paths.
```

### Why not split `unitEngine.ts` first in place?

Splitting it in place would reduce file size, but it would not fix the contributor-orientation problem. You would likely end up with a cleaner but still obscure structure under the old `client/views/experiment` path.

### Why not move the whole tree first?

A giant directory migration before behavior is decomposed creates a noisy, fragile PR. It also makes it harder to tell whether bugs came from path changes, import changes, or real logic changes.

### Why scaffold first?

The scaffold makes the intended architecture concrete. Then each extraction has an obvious destination.

This is especially useful when working with AI coding agents because the directory structure itself becomes part of the prompt.

## PR sequence for the unit-engine breakup

A good PR sequence would be:

1. `docs: add directory structure and unit engine refactor plan`
2. `chore: add learning-components scaffold`
3. `refactor: add unit engine interface and compatibility facade`
4. `refactor: extract card preparation helpers`
5. `refactor: extract instruction and video unit engines`
6. `refactor: extract assessment schedule engine`
7. `refactor: extract learning-session model state factory`
8. `refactor: extract learning-session probability calculation`
9. `refactor: extract learning-session selection policies`
10. `refactor: extract learning-session runtime`
11. `refactor: extract answer update and resume logic`
12. `test: add unit engine boundary fixtures`
13. `docs: add contributor guide for adding unit engines`

Each PR should build and pass smoke tests.

## Minimal tests to add during extraction

Add tests around boundaries, not just implementation details:

```text
tests/learning-components/units/instruction/
tests/learning-components/units/video-session/
tests/learning-components/units/assessment-session/
tests/learning-components/units/learning-session/model/
tests/learning-components/content/tdf/
```

Useful fixtures:

```text
tests/fixtures/tdfs/basic-learning-session.json
tests/fixtures/tdfs/basic-assessment-session.json
tests/fixtures/tdfs/video-session.json
tests/fixtures/model/basic-model-state.json
```

Minimum smoke checks:

- Instruction unit initializes and finishes.
- Video unit prepares an explicit checkpoint card.
- Assessment unit creates a non-empty schedule from fixture TDF.
- Model state initializes cards/stims/responses from fixture stimuli.
- Probability calculation returns finite values.
- Selection policy returns a valid non-hidden card.
- Learning-session unit can select and commit one card.
- Answer update changes card/stim/response counts correctly.

## Final recommendation

Create the new architecture scaffold first, then break up `unitEngine.ts` into it.

The target is not just smaller files. The target is a codebase where a contributor can immediately say:

```text
I want to add a unit type. Go to learning-components/units.
I want to add an H5P interaction. Go to learning-components/trials/h5p.
I want to change learning-session adaptive selection. Go to learning-components/units/learning-session/model.
I want to change learning-session probability calculation. Go to learning-components/units/learning-session/model.
I want to change TDF interpretation. Go to learning-components/content/tdf.
I want to work on Meteor data or server methods. Go to app/data or app/meteor/server.
I want to deploy it. Go to deploy.
```

That is the main consortium payoff.
