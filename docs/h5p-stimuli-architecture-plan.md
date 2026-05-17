# H5P Stimuli Architecture Plan

## Goal

Support H5P content as first-class MoFaCTS stimuli while keeping MoFaCTS responsible for scheduling, session progression, assessment history, video checkpoint flow, and adaptive learning behavior.

The intended long-term shape is that H5P can appear in:

- Learning session trials.
- Assessment session questions.
- Video checkpoint overlays.
- Instruction or question overlays where an interactive activity is useful.

H5P should be integrated as an interaction renderer plus event adapter, not as a replacement runtime for MoFaCTS trial/session logic.

## Design Principles

- Keep H5P boxed behind a small client-side renderer and normalized result bridge.
- Do not let H5P-specific event shapes leak through the scheduling engine, card machine, or history writer.
- Fail clearly when H5P content is misconfigured, unavailable, or used in a context that cannot report the required result.
- Avoid compatibility fallback paths unless there is an explicit product requirement for them.
- Preserve the existing text, image, audio, and video stimulus paths.
- Prefer same-origin/self-hosted H5P for scored trials because cross-origin iframe embeds are not reliable for learner result tracking.

## Scope and Non-Goals (Refined)

### In Scope

- Adding `display.h5p` as a first-class display payload on prepared stimuli.
- Rendering H5P inline and in existing overlay surfaces.
- Mapping H5P completion/result events into MoFaCTS trial semantics via a normalized adapter.
- Recording bounded H5P result metadata in trial history.
- Supporting two hosting modes with explicit capability limits: external embed and self-hosted.

### Out of Scope (for initial rollout)

- Replacing MoFaCTS scheduling/session engines with H5P runtime behavior.
- Mirroring full H5P authoring schema inside stimulus JSON.
- Introducing compatibility fallbacks that silently downgrade scored behavior.
- Building a Meteor-local release confidence workflow (Docker Compose remains canonical).

## Proposed Stimulus Contract

Add a shared typed contract, likely in `mofacts/common/types/h5p.ts`, and allow prepared displays to include an optional H5P payload:

```ts
export type H5PSourceType = 'external-embed' | 'self-hosted';
export type H5PCompletionPolicy =
  | 'viewed'
  | 'xapi-completed'
  | 'xapi-passed'
  | 'manual-continue';

export type H5PScorePolicy =
  | 'correct-if-passed'
  | 'correct-if-full-score'
  | 'record-only';

export interface H5PDisplayConfig {
  sourceType: H5PSourceType;
  library?: string;
  contentId?: string;
  embedUrl?: string;
  packageAssetId?: string;
  completionPolicy: H5PCompletionPolicy;
  scorePolicy?: H5PScorePolicy;
  preferredHeight?: number;
}
```

## Proposed Stimulus-File Decision

Use `stims[].display.h5p` to indicate H5P content. Do not add a parallel top-level `h5pStimulus` string beside `imageStimulus`, `audioStimulus`, and `videoStimulus` unless a later compatibility requirement makes that unavoidable.

The current stimulus file already has two display eras:

- Legacy or cluster-level media fields such as `imageStimulus`, `audioStimulus`, and `videoStimulus`.
- The newer display object shape, `stims[].display`, with `text`, `clozeText`, `imgSrc`, `audioSrc`, `videoSrc`, and `attribution`.

H5P should join the newer display-object shape because it is not just another source URL. It needs source metadata, hosting mode, completion policy, scoring policy, sizing, and eventually package/content identifiers. Encoding all of that as another flat `*Src` field would become unclear quickly.

The stimulus file should not declare presentation placement such as "inline", "overlay", or "video checkpoint". Placement is determined by the unit/session context that uses the stimulus. A learning trial, assessment trial, and video checkpoint can reuse the same H5P stimulus without changing the stimulus record.

Recommended simple external-embed example:

```json
{
  "display": {
    "text": "Complete the activity.",
    "h5p": {
      "sourceType": "external-embed",
      "embedUrl": "https://example.org/h5p/embed/123",
      "completionPolicy": "manual-continue",
      "preferredHeight": 560
    }
  },
  "correctResponse": "completed"
}
```

Recommended scored self-hosted example:

```json
{
  "display": {
    "h5p": {
      "sourceType": "self-hosted",
      "packageAssetId": "asset_abc123",
      "contentId": "intro-fractions-sort-001",
      "library": "H5P.MultiChoice 1.16",
      "completionPolicy": "xapi-completed",
      "scorePolicy": "correct-if-passed",
      "preferredHeight": 640
    }
  }
}
```

Recommended video checkpoint example:

```json
{
  "display": {
    "h5p": {
      "sourceType": "self-hosted",
      "contentId": "checkpoint-question-001",
      "library": "H5P.Blanks 1.14",
      "completionPolicy": "xapi-passed",
      "scorePolicy": "correct-if-passed"
    }
  }
}
```

The recommended rule is:

- `display.*` answers "what is shown to the learner?"
- response fields answer "what does MoFaCTS expect or record as the learner response?"
- the unit/session context answers "where is this shown?"
- `display.h5p.completionPolicy` answers when MoFaCTS may advance.
- `display.h5p.scorePolicy` answers how H5P results map to MoFaCTS correctness.

If there are ordinary response fields, such as `correctResponse` or `incorrectResponses`, the existing MoFaCTS response surface can still be used. For example, an H5P activity can be displayed above a normal typed or multiple-choice MoFaCTS response.

If the H5P config has a scoring policy and no ordinary response fields, H5P owns the interaction result. MoFaCTS should not require `correctResponse` unless a fallback or explicit authoring validation rule requires a placeholder. In this case, correctness comes from the configured H5P result mapping.

If a video session or other overlay-capable unit references the stimulus, the session container decides where the activity appears. The H5P config still lives on the stimulus because the stimulus remains the reusable question/activity unit.

This means H5P is not a new response type in the same sense as typed, multiple choice, or speech recognition. It is an interactive display that may optionally provide the response result. That distinction should keep the stimulus file readable as H5P use expands.

## How H5P Specifies Practice Type

H5P practice type is specified inside the H5P content package or hosted H5P content, not primarily inside the MoFaCTS stimulus file.

An `.h5p` file is a zip package. For normal content packages it contains:

- `h5p.json`: package metadata, including `mainLibrary`, such as `H5P.MultiChoice`, `H5P.Blanks`, `H5P.InteractiveVideo`, or `H5P.DragQuestion`.
- `content/content.json`: the start parameters for this specific activity instance, such as question text, alternatives, blanks, feedback, media references, and behavior settings.
- one or more library folders, each with `library.json`; runnable content-type libraries also define accepted content structure through `semantics.json`.
- media files used by the content, usually under the `content/` folder.

So for H5P, "multiple choice", "fill in the blanks", "drag and drop", "interactive video", and similar activity kinds are not MoFaCTS response types. They are H5P content types. The H5P package says which content type it uses through `h5p.json.mainLibrary`, and the activity data is interpreted according to that library's `semantics.json`.

For MoFaCTS, the stimulus file should usually reference an already-created H5P content item, not duplicate its full `content.json`. The MoFaCTS fields should answer:

- Which H5P content should be rendered?
- Is it externally embedded or self-hosted?
- If self-hosted, which stored package/content record should be loaded?
- What completion/scoring signals does MoFaCTS require before advancing?

The H5P package/content record should answer:

- Which H5P content type is this?
- What are the activity-specific prompts, choices, blanks, hotspots, drag targets, videos, or other settings?
- Which H5P libraries and media assets are required to render it?

This keeps MoFaCTS from becoming a second H5P authoring schema.

### Package Storage Implication

Self-hosted H5P requires package/content files to exist in MoFaCTS storage. A future package upload should unpack and validate the `.h5p`, then store at least:

```ts
interface StoredH5PContent {
  id: string;
  title: string;
  mainLibrary: string;
  libraryVersion: string;
  packageAssetId: string;
  contentPath: string;
  contentJsonPath: string;
  dependencyLibraries: Array<{
    machineName: string;
    majorVersion: number;
    minorVersion: number;
  }>;
}
```

The stimulus can then reference `contentId` or `packageAssetId`. It should not need to inline the package's `content/content.json`.

### More Realistic Stimulus Examples

Self-hosted H5P Multiple Choice, where H5P owns the response:

```json
{
  "display": {
    "text": "Answer the embedded H5P question.",
    "h5p": {
      "sourceType": "self-hosted",
      "contentId": "h5p_multichoice_42",
      "library": "H5P.MultiChoice 1.16",
      "completionPolicy": "xapi-completed",
      "scorePolicy": "correct-if-passed",
      "preferredHeight": 520
    }
  }
}
```

Self-hosted H5P Fill in the Blanks, displayed as the prompt while MoFaCTS still owns a typed response:

```json
{
  "display": {
    "h5p": {
      "sourceType": "self-hosted",
      "contentId": "h5p_blanks_review_17",
      "library": "H5P.Blanks 1.14",
      "completionPolicy": "viewed",
      "preferredHeight": 480
    }
  },
  "correctResponse": "photosynthesis"
}
```

Externally hosted H5P activity used as non-scored interactive context:

```json
{
  "display": {
    "h5p": {
      "sourceType": "external-embed",
      "embedUrl": "https://h5p.org/h5p/embed/712",
      "completionPolicy": "manual-continue",
      "preferredHeight": 600
    }
  },
  "correctResponse": "cell membrane"
}
```

For external embeds, `library` is optional because MoFaCTS may not be able to inspect the remote package. For self-hosted content, `library` should be treated as derived metadata from the stored H5P package, not manually typed by authors whenever possible.

Stimulus display objects would then support:

```ts
display: {
  text?: string;
  clozeText?: string;
  imgSrc?: string;
  audioSrc?: string;
  videoSrc?: string;
  h5p?: H5PDisplayConfig;
}
```

For TDF/schema work, add fields through the existing field registry path rather than ad hoc consumers. The minimal authoring surface can start with `display.h5p.embedUrl` and `display.h5p.completionPolicy`; self-hosted package fields can follow once package storage is implemented.

## Runtime Architecture

### Stimulus Preparation

Extend `mofacts/client/views/experiment/svelte/services/unitEngineService.ts` so prepared trial displays preserve and validate `stim.display.h5p`.

The resolved trial payload should continue to expose a normal `currentDisplay`. The only H5P-specific addition should be `currentDisplay.h5p`.

The engine should not decide how H5P is rendered. It should only select the trial and provide the prepared display data.

### Validation Rules (Refined)

Validate `display.h5p` during preparation and fail fast with explicit authoring errors:

- `sourceType: 'external-embed'` requires `embedUrl`, forbids `packageAssetId`.
- `sourceType: 'self-hosted'` requires `contentId` or `packageAssetId`; `embedUrl` is optional only if it resolves from stored metadata.
- `completionPolicy: 'xapi-passed'` requires a result-capable source (self-hosted/same-origin integration).
- `scorePolicy` may be set only when completion policy/result path can produce score/pass data.
- `preferredHeight`, when provided, must be a sane positive integer within UI constraints.

### Rendering Components

Add focused components under `mofacts/client/views/experiment/svelte/components/`:

- `H5PStimulus.svelte`: renders H5P inline as part of a normal trial display.
- `H5POverlay.svelte`: renders H5P inside the shared overlay surface used by video checkpoints and other interruption-style experiences.
- `H5PFrame.svelte`: optional lower-level iframe/player wrapper if both inline and overlay renderers need the same loading/error behavior.

Integrate through:

- `StimulusDisplay.svelte` for inline H5P display.
- `TrialContent.svelte` when H5P owns the response surface.
- `VideoSessionMode.svelte` or a shared overlay child when H5P appears at video checkpoints.

### Event Bridge

Add a small client service, likely `mofacts/client/views/experiment/svelte/services/h5pEventBridge.ts`, that converts H5P/xAPI events into a stable MoFaCTS event shape:

```ts
export interface H5PTrialResult {
  completed: boolean;
  passed?: boolean;
  score?: number;
  maxScore?: number;
  scaledScore?: number;
  response?: unknown;
  durationMs?: number;
  rawStatement?: unknown;
}
```

The bridge should be the only place that knows about H5P xAPI statement structure. The rest of the card flow should receive normalized trial result events.

Bridge behavior should include:

- Origin checks for `postMessage`-based events.
- Session-trial correlation IDs to ignore stale or cross-trial events.
- Explicit timeout/error events so UI can surface actionable failure states instead of stalling.
- Idempotency guards so duplicate xAPI statements do not double-record results.

### Result Mapping

Add `h5pResultMapper.ts` to map `H5PTrialResult` plus the configured policies into MoFaCTS trial semantics:

- `isCorrect`
- `responseTime`
- `responseValue`
- optional score metadata for history
- whether the trial is allowed to advance

Examples:

- `completionPolicy: 'viewed'`: mark complete after successful render or explicit continue.
- `completionPolicy: 'xapi-completed'`: advance only after a completed xAPI event.
- `completionPolicy: 'xapi-passed'`: advance only after a passed xAPI event.
- `scorePolicy: 'record-only'`: record H5P score, but let MoFaCTS correctness come from another configured response path.
- `scorePolicy: 'correct-if-passed'`: set `isCorrect` from H5P passed/failed.

## Video Overlay Model

The current video session already has checkpoint timing, pause/resume behavior, and an overlay surface. H5P should use that existing concept rather than creating a separate video-specific H5P mode.

Recommended checkpoint payload shape:

```ts
videosession: {
  checkpoints: [30, 75],
  checkpointQuestions: [0, 1],
  checkpointPayloads: [
    { type: 'h5p', clusterIndex: 0 },
    { type: 'mofacts-question', clusterIndex: 1 }
  ]
}
```

The payload can resolve to a normal stimulus cluster. If that stimulus has `display.h5p`, the overlay renders H5P. If not, it renders the existing MoFaCTS question flow.

This keeps video overlays, assessment questions, and learning trials aligned around the same prepared trial data model.

## Hosting Modes

### External Embed MVP

External H5P iframe embeds are the fastest way to prove display value.

Use this mode for:

- passive stimulus presentation,
- demonstrations,
- manual-continue interactions,
- content where MoFaCTS does not need reliable H5P scoring.

Do not use this mode for required assessment correctness unless the H5P host and MoFaCTS runtime can provide same-origin or otherwise trustworthy result events.

### Self-Hosted Scored Mode

Self-hosted/same-origin H5P is the right long-term path for scored H5P trials.

Likely server-side responsibilities:

- Accept `.h5p` package upload.
- Validate package structure.
- Store package metadata and assets.
- Serve H5P content through same-origin URLs.
- Expose the required H5P integration settings for the client player.

This can live in dedicated server helpers rather than expanding `methods.ts` with large H5P-specific logic.

## History and Analytics

MoFaCTS history should remain the canonical learner activity record.

Add H5P-specific metadata as a nested field rather than changing core response columns broadly:

```ts
h5p: {
  contentId: string;
  completed: boolean;
  passed?: boolean;
  score?: number;
  maxScore?: number;
  scaledScore?: number;
  response?: unknown;
}
```

Raw xAPI statements should be stored only if there is a clear analytics/debugging requirement. If stored, keep them bounded and separate from the core trial result summary.

Recommended additional history metadata:

- `sourceType` and `completionPolicy` used at runtime (for later auditability).
- `resultSource` enum such as `h5p`, `mofacts-native`, or `mixed`.
- `integrationErrorCode` when a trial fails due to H5P integration/runtime issues.

## Phased Implementation

### Phase 1: Passive H5P Stimulus

- Add shared `H5PDisplayConfig` types.
- Add field registry/schema support for minimal `display.h5p` config.
- Preserve `display.h5p` through `unitEngineService.ts`.
- Render external iframe H5P in `StimulusDisplay.svelte`.
- Support `completionPolicy: 'viewed'` or `manual-continue`.
- Add focused tests for display preparation and config validation.

Phase 1 exit criteria:

- External embed renders in learning trials without regressing existing media stimuli.
- Misconfigured `display.h5p` fails with explicit, user-visible authoring errors.
- Typecheck and targeted test coverage pass in CI for touched modules.

### Phase 2: H5P Owned Response Surface

- Add `H5PStimulus.svelte` events for loaded, failed, completed, and result.
- Add `h5pResultMapper.ts`.
- Let `TrialContent.svelte` suppress native text/buttons/SR response controls when the prepared trial determines that H5P owns the response result.
- Record normalized H5P result metadata in trial history.

Phase 2 exit criteria:

- H5P-owned trials can complete/advance strictly via configured completion policy.
- Duplicate or late events do not create duplicate history writes.
- Failure states are surfaced inline (not modal) and block silent progression.

### Phase 3: Video and Session Overlays

- Generalize checkpoint overlay payloads.
- Render H5P stimuli inside video checkpoint overlays.
- Reuse the same overlay component for assessment and learning interruptions where appropriate.
- Verify pause/resume, rewind-on-incorrect, and prevent-scrubbing behavior with H5P overlays.

### Phase 4: Self-Hosted H5P Packages

- Add package upload/storage.
- Serve same-origin H5P content.
- Wire H5P xAPI events into `h5pEventBridge.ts`.
- Require self-hosted mode for scored H5P assessment trials.

Phase 4 exit criteria:

- Package validation rejects malformed `.h5p` artifacts with clear diagnostics.
- Same-origin scored trials produce deterministic pass/score mapping.
- Public/unauthenticated upload or fetch methods are authorization-checked and rate-limited.

### Phase 5: Authoring and Documentation

- Add authoring UI support for H5P display fields.
- Document when to use external embed vs self-hosted scored mode.
- Document result policies and examples for learning, assessment, and video checkpoint use.

## Open Questions

- Should H5P package assets live in the existing dynamic asset system or a dedicated H5P collection/store?
- Which H5P content types are highest priority for scored trials?
- Should incorrect H5P results trigger force-correct behavior, ordinary feedback, video rewind, or a content-type-specific retry?
- How much raw xAPI data should be retained for research use?
- Should an H5P activity be allowed to contribute partial credit to adaptive scheduling, or should scheduling initially consume only correct/incorrect?

## Risks and Mitigations (Refined)

- Cross-origin event reliability risk (external embeds): keep external mode non-authoritative for scored correctness.
- Event duplication/out-of-order risk: enforce correlation IDs and idempotent history writes.
- Package security risk: validate zip structure, whitelist expected file paths, and reject executable/unexpected payloads.
- UX dead-end risk when H5P fails to load: always provide explicit inline error plus a deterministic continue/block policy.
- Schema drift risk across repos: update field-registry docs and validate compatibility with configuration/content repositories when field names evolve.

## Suggested First Slice

Implement external iframe H5P as a passive stimulus first. That gives authors a visible capability quickly while preserving a clean path to same-origin xAPI scoring later.

The first slice should touch only:

- shared H5P display types,
- field registry/schema validation,
- display preparation,
- `StimulusDisplay.svelte`,
- focused tests.

Scored trials, package hosting, and adaptive score mapping should follow only after the passive display path is stable.
