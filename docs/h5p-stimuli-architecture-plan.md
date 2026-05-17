# H5P Stimuli Architecture Plan

## Goal

Support H5P content as first-class MoFaCTS stimuli while keeping MoFaCTS responsible for scheduling, session progression, assessment history, video checkpoint flow, and adaptive learning behavior.

The intended long-term shape is that H5P can appear in:

- Learning session trials.
- Assessment session questions.
- Video checkpoint overlays.
- Instruction or question overlays where an interactive activity is useful.

H5P should be integrated as an interaction renderer plus event adapter, not as a replacement runtime for MoFaCTS trial/session logic.

## Why This Matters

The powerful part of this architecture is not merely embedding H5P. Many systems can embed H5P and store xAPI statements. The important MoFaCTS contribution is converting interactions from many complex exercise types into ordered learner-evidence rows that can feed cognitive models and knowledge tracing.

That is difficult in practice because rich widgets are usually recorded as activity-level summaries: completed, passed, score, or final response. Those summaries are useful for LMS reporting, but they often discard the step-by-step learner behavior that adaptive models need. Classic intelligent tutoring systems, especially Cognitive Tutor/Carnegie Learning work, show the power of linking problem steps to knowledge components and using those step observations for model tracing and knowledge tracing. This plan stands on that tradition, but aims for a more open content/runtime boundary: authors can use varied H5P-style interactive exercise types while MoFaCTS still recovers model-facing observations from the learner's internal widget actions.

If implemented well, H5P becomes a reusable authoring/runtime layer for complex interactive tasks while MoFaCTS remains the adaptive learning system. Students' meaningful actions inside complex widgets can become model-facing observations instead of being trapped inside an opaque embedded activity. That makes it possible for knowledge tracing systems to use richer learning tasks without hand-building every interaction type as a native MoFaCTS component.

The design goal is therefore stronger than "record H5P results." It is: preserve enough normalized, ordered, part-level H5P evidence that all meaningful student interactions can be translated into history rows, KT observations, and eventually adaptive scheduling inputs when the widget adapter supports that grain.

The closest comparison is the Cognitive Tutor lineage: multi-step problem solving, step-level feedback, and step/KC-linked knowledge tracing. The difference this plan is trying to exploit is flexibility. Instead of one tightly controlled tutor UI or a mostly domain-specific math environment, MoFaCTS can potentially interpret multiple authored widget types into the same history/model interface. That is the source of the power, and also the reason the normalizer/interpreter boundary has to be designed carefully.

CTAT is also an important comparison. CTAT/example-tracing tutors give authors a way to build step-level tutors, record behavior graphs, and attach knowledge components to steps. That is closer to this plan than ordinary H5P analytics. The H5P path should learn from CTAT's step-grain discipline, but it should not assume H5P content types already provide CTAT-like behavior graphs or equation-solving semantics. Where a widget cannot expose reliable step identity, answer interpretation, and KC mapping, MoFaCTS should treat it as display/progress evidence until a widget-specific adapter exists.

## Design Principles

- Keep H5P boxed behind a small client-side renderer and normalized result bridge.
- Do not let H5P-specific event shapes leak through the scheduling engine, card machine, or history writer.
- Fail clearly when H5P content is misconfigured, unavailable, or used in a context that cannot report the required result.
- Avoid compatibility fallback paths unless there is an explicit product requirement for them.
- Preserve the existing text, image, audio, and video stimulus paths.
- Prefer same-origin/self-hosted H5P for scored trials because cross-origin iframe embeds are not reliable for learner result tracking.
- Preserve trial-level and part-level learner evidence for knowledge tracing instead of collapsing H5P interactions to LMS-style activity summaries.
- Treat H5P as a content/runtime layer, not as the canonical learner-data model.
- Never treat an H5P activity as the learning unit unless the activity contains exactly one assessable interaction.
- Keep package import, package metadata extraction, event ingestion, normalization, session interpretation, and history emission as separate layers with narrow contracts.
- Prefer batched metadata reads, event processing, and history inserts over per-event or per-row database round trips.
- Make every lossy transform explicit. If a widget adapter cannot recover part-level evidence, record that limitation rather than fabricating rows.

## Implementation-Ready Decisions

The first implementation slice should be passive external-iframe H5P only. It should prove that a stimulus can carry H5P display metadata all the way from authoring/schema validation through trial preparation and Svelte rendering, without changing response evaluation, card-machine transitions, history semantics, or adaptive scheduling. This is sequencing guidance only; it is not permission to stop after the slice is complete.

## Agent Execution Contract

When this plan is handed to an implementation agent, the default instruction is to complete all phases needed to make the canonical H5P Tester Items package run end to end. Do not stop after Phase 1 or any other intermediate phase merely because that phase is internally coherent. Intermediate phases are implementation milestones, not delivery stopping points.

The agent should continue through the full plan unless it encounters a critical blocking issue. A critical blocker is one of:

- required source code, package files, or repository access is missing and cannot be inferred or recreated safely;
- an architectural decision would irreversibly affect stored learner history, security boundaries, or public TDF format and the plan does not provide enough information to choose safely;
- the implementation would require secrets, deployment infrastructure, production data, Docker/deploy commands, or external services that are unavailable in the local workspace;
- the H5P package/runtime dependency needed for self-hosted playback cannot be installed, inspected, or substituted with a local implementation without changing the architecture;
- continuing would require deleting or overwriting user work outside the intended files.

Non-critical issues must not stop the implementation. For ordinary uncertainty, the agent should make the most conservative choice consistent with this plan, document the assumption in code comments or implementation notes where useful, and keep going. Examples of non-critical issues include exact helper names, minor component placement, test-file organization, adapter file names, UI copy, local refactoring boundaries, and whether an adapter initially produces richer or narrower optional metadata. Open questions in this document are decision prompts for implementation, not exit ramps; resolve them locally unless they meet the critical-blocker definition above.

Do not use testing as a phase boundary. Add or update tests and fixtures as part of implementation when they are needed for maintainability, but do not run test suites, schema audits, or typechecks until all implementation phases required for the canonical tester package are complete. After the full implementation is complete, run the final verification suite once and then fix any failures until the end-to-end tester target is working or a critical blocker is proven.

There are no other exit ramps. Phase boundaries, open questions, risk items, local design uncertainty, partial test failures, and incomplete optional metadata are not reasons to stop unless they prove one of the critical blockers listed above.

The final implementation is not complete until the H5P Tester Items TDF package can be imported/loaded, its five self-hosted H5P package references resolve, the five assessment trials render as H5P trials, H5P events are ingested, normalized, and written as assessment history records, and multi-row widgets such as drag-and-drop can emit ordered per-interaction history rows.

Phase 1 must therefore use these constraints:

- `sourceType` is accepted only as `external-embed`.
- `completionPolicy` is accepted only as `viewed` or `manual-continue`.
- `embedUrl` is required and must be `https://` or same-origin relative. Do not accept `javascript:`, `data:`, untrusted protocol URLs, or empty strings.
- `preferredHeight` is optional, must be a positive finite number when provided, and should be clamped by the renderer to a reasonable range.
- `scorePolicy`, `contentId`, `packageAssetId`, and `library` are not used by Phase 1 runtime behavior. The schema may reserve them later, but the Phase 1 validator should fail clearly if authors configure a scored/self-hosted H5P path before it is supported.
- H5P does not own the learner response in Phase 1. A normal MoFaCTS response path, study/continue path, or unit-level flow must still advance the card.
- Do not use external iframe H5P for required assessment scoring in Phase 1.

The immediate implementation surface is:

- Add shared H5P display types in `mofacts/common/types/h5p.ts` and export them from `mofacts/common/types/index.ts` if other common/client imports use the barrel.
- Add a shared Phase 1 normalizer/validator helper, preferably `mofacts/common/lib/h5pDisplay.ts`, so schema/editor validation, engine preparation, display cloning tests, and the renderer agree on the supported subset.
- Add `h5p` to `STIM_DISPLAY_FIELD_REGISTRY` in `mofacts/common/fieldRegistrySections.ts`; regenerate `mofacts/public/stimSchema.json` with `npm run generate:schemas` from `mofacts/`.
- Add `h5p` to `STIM_DISPLAY_DIRECT_RUNTIME_KEYS` in `fieldRegistrySections.ts` and to `SUPPORTED_DISPLAY_FIELDS` in `mofacts/common/lib/displayFieldSubsets.ts`, so `studyOnlyFields` and `drillFields` can intentionally keep or omit H5P.
- Update the hard-coded display validator in `mofacts/client/lib/validatorRegistry.ts` so `display.h5p` satisfies the "at least one display element" rule.
- Add a custom Phase 1 `h5pDisplayConfig` validator in `validatorRegistry.ts` and attach it to `display.h5p` through the registry. Do not rely on JSON Schema alone for the Phase 1 unsupported-combination checks.
- Preserve and validate `display.h5p` in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts` when building `currentDisplay`.
- Preserve `h5p` in `cloneDisplay()` inside `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`; otherwise the prepared display will be silently dropped before `TrialContent`.
- Add `H5PFrame.svelte` or `H5PStimulus.svelte` under `mofacts/client/views/experiment/svelte/components/` and render it from `StimulusDisplay.svelte`.
- Add focused tests for display preparation, display-field subset preservation/removal, validator acceptance/rejection, card display cloning, and schema generation/audit where existing test patterns allow it.
- Regenerate schemas as needed when registry changes are made, but defer audit/typecheck execution until the final verification pass after all implementation phases are complete.

Use `clientLogger.ts` for client diagnostics. Do not add raw `console.*`.

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

For Phase 1, implement the full type as a future-facing shared contract, but validate the supported runtime subset separately. The validator should reject unsupported combinations rather than accepting them and later ignoring them. The schema should expose the full reserved object shape only where that helps authors see the intended contract; runtime/editor validation must still block unsupported fields in Phase 1. In particular:

- `external-embed` requires `embedUrl`.
- `self-hosted` requires future package/content infrastructure and should fail in Phase 1.
- `xapi-completed`, `xapi-passed`, and any `scorePolicy` require the future event bridge and should fail in Phase 1.
- `contentId`, `packageAssetId`, and `library` should fail in Phase 1 unless the implementation deliberately marks them schema-hidden; accepting them as inert metadata would violate the repo rule against unsupported authorable fields.
- `manual-continue` means MoFaCTS still shows its normal response/continue surface; it does not mean H5P controls progression yet.
- `preferredHeight` is author input, not layout authority. The normalizer should require a positive finite number when present, and the renderer should clamp the applied height to a named range such as 240-900 px.
- `embedUrl` should be normalized with URL APIs. Accept `https://` URLs and same-origin relative paths; reject empty strings, protocol-relative URLs, `http://` external URLs, and dangerous schemes such as `javascript:`, `data:`, `blob:`, and `file:`. Keep the common helper pure by passing an explicit base origin/URL from client code instead of reading `window` inside common code.

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

The import process for the H5P Tester Items package should:

- scan the TDF/stimulus folder for `.h5p` files referenced by `display.h5p.packageAssetId`;
- reject missing, duplicate, or unreferenced package files unless explicitly allowed for an audit-only reason;
- validate that every `.h5p` is a zip with `h5p.json` and `content/content.json`;
- reject unsafe zip paths, absolute paths, path traversal, unexpected executable payloads, or files outside the H5P package layout;
- compute a package hash so unchanged packages are not unpacked or reprocessed repeatedly;
- extract `mainLibrary`, dependency library versions, title, and content parameters once at import time;
- verify that `display.h5p.library` matches the imported package metadata, or fail clearly;
- create or update a stored H5P content record keyed by the stable `contentId`;
- store package assets in a way the runtime can serve same-origin without accessing the config repo.

At runtime, the renderer should load by `contentId` or stored package record, not by reading `.h5p` files directly. Package parsing should be an import/build concern, not a per-trial client concern.

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

For local configuration packages, `packageAssetId` may initially be a package filename beside the stimulus file, such as `multiple-choice-713.h5p`. During import, MoFaCTS should resolve that filename to a stored package/content record, verify the declared `library` against the package's `h5p.json` main library and version, and preserve the stable `contentId` from the stimulus config. After import, runtime should use stored package/content identifiers rather than reparsing package files from the config directory.

Do not add a separate normalization sidecar file to the config package. Expected normalization behavior belongs in this architecture plan and in implementation tests. The stimulus file should remain the authored runtime contract: it references the H5P package/content and policies; code tests assert what normalized rows are produced.

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

In this codebase, that means the source of truth is `mofacts/common/fieldRegistrySections.ts`, not the emitted `mofacts/public/stimSchema.json` alone. After registry changes, regenerate schemas and do not hand-maintain divergent emitted schema files.

The generated schema is also audited by `mofacts/scripts/auditFields.ts`. Phase 1 should update the registry and its direct-runtime-key inventory together and regenerate `mofacts/public/stimSchema.json`. Defer `npm run audit:fields` until the final verification pass so audit results do not become an intermediate stopping point.

## Runtime Architecture

### Stimulus Preparation

Extend `mofacts/client/views/experiment/svelte/services/unitEngineService.ts` so prepared trial displays preserve and validate `stim.display.h5p`.

The resolved trial payload should continue to expose a normal `currentDisplay`. The only H5P-specific addition should be `currentDisplay.h5p`.

The engine should not decide how H5P is rendered. It should only select the trial and provide the prepared display data.

Phase 1 should add a small runtime normalizer, preferably imported from `mofacts/common/lib/h5pDisplay.ts`, that returns a sanitized `H5PDisplayConfig` or throws a clear configuration error. Do not pass arbitrary nested display objects through to the renderer. `unitEngineService.ts` should call that normalizer while building `resolvedDisplay`, using `preparedDisplay.h5p` when present and otherwise `stim.display?.h5p`.

Keep the existing display fields intact while adding H5P. `resolvedDisplay` should continue to preserve `text`, `clozeText`, `clozeStimulus`, `imgSrc`, `audioSrc`, `videoSrc`, and `attribution` behavior. H5P should be added as another optional display member, not as a replacement for those values.

Also update display subset behavior. `applyDisplayFieldSubset()` currently only recognizes text, cloze, image, audio, video, and attribution. Add `h5p` there so authors can use `studyOnlyFields: h5p` or `drillFields: text,h5p`. If a subset omits `h5p`, it should be omitted intentionally just like `imgSrc` or `videoSrc`.

### Rendering Components

Add focused components under `mofacts/client/views/experiment/svelte/components/`:

- `H5PStimulus.svelte`: renders H5P inline as part of a normal trial display.
- `H5POverlay.svelte`: renders H5P inside the shared overlay surface used by video checkpoints and other interruption-style experiences.
- `H5PFrame.svelte`: optional lower-level iframe/player wrapper if both inline and overlay renderers need the same loading/error behavior.

Integrate through:

- `StimulusDisplay.svelte` for inline H5P display.
- `TrialContent.svelte` when H5P owns the response surface.
- `VideoSessionMode.svelte` or a shared overlay child when H5P appears at video checkpoints.

For Phase 1, render only inline H5P from `StimulusDisplay.svelte`. `TrialContent.svelte` should not suppress `ResponseArea` yet, because H5P does not own the response surface in the first slice.

`CardScreen.svelte` must preserve `display.h5p` in `cloneDisplay()` and trial slot construction. That component currently clones only `text`, `clozeText`, `imgSrc`, `videoSrc`, `audioSrc`, and attribution; leaving it unchanged would make the engine change appear to work in tests while failing at runtime. Preserve `clozeStimulus` at the same time if it is still missing from the clone, because it is already a registry-backed display field.

The iframe renderer should:

- use a stable wrapper with explicit min/max height and responsive width;
- show a clear inline error state for invalid or failed embeds;
- treat external H5P iframes as non-blocking in Phase 1 and dispatch a non-blocking ready state from `StimulusDisplay.svelte`; do not stall card transitions on cross-origin iframe load reliability;
- use restrictive iframe attributes, such as `sandbox`, `allowfullscreen`, and `referrerpolicy`, while still allowing H5P to run scripts and same-origin behavior inside its own frame;
- never inject `embedUrl` as HTML.
- render a visible message when the normalized config cannot be rendered, and log diagnostics through `clientLogger.ts` rather than raw `console.*`.

Recommended iframe attributes for Phase 1 are:

```svelte
<iframe
  src={normalizedEmbedUrl}
  title="Interactive H5P activity"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
/>
```

If a particular H5P host requires another permission, add it intentionally with a comment naming the host/runtime requirement.

### Event Ingestion Bridge

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

The bridge should be the only place that knows about H5P xAPI statement structure. The H5P widget/runtime captures the learner interaction and emits its own event data; MoFaCTS ingests that event data, correlates it to the active trial, and converts it into normalized trial result events. The rest of the card flow should receive the normalized shape, not raw H5P statements.

Bridge behavior should include:

- origin checks for `postMessage`-based events;
- session/trial correlation ids to ignore stale or cross-trial events;
- explicit timeout/error events so UI can surface actionable failure states instead of stalling;
- idempotency guards so duplicate xAPI statements do not double-record results.

For knowledge tracing, the bridge should not stop at an LMS-style parent score when child xAPI statements or widget-specific part data are available. It should preserve enough information to create one or more trial-level records from a single H5P activity.

The important event-ingestion rule is to read every relevant H5P xAPI/runtime event produced by the widget, not only the final parent `completed` event. The parent event is useful for activity completion, but trial-level learner modeling depends on child `answered` events and any recoverable subitem detail.

The normalizer output must enable conversion into a sequence of history writes. A normalized H5P result that only says "completed, score 4/6" is not sufficient for learning-session use when the underlying widget produced ordered learner actions. The normalized batch must preserve the event order, event timestamps, part/item identity, target identity where applicable, correctness/evaluation at the recoverable grain, and enough provenance for the history writer to emit one or more conventional MoFaCTS history records without reparsing raw H5P statements.

### Target Learning Event and Batch Schema

H5P needs a converter layer that reports properly for knowledge tracing systems, not just learning management systems. The normalized object should keep a common spine while allowing different widgets to retain their natural response shape.

This section defines the target representation. It does not mean every widget can immediately produce this representation. Full normalization depends on widget-specific normalizers that understand each widget's xAPI statements, response encodings, package parameters, and child/part structure.

The universal event should preserve:

- learner and session identity;
- H5P source identity, including library, container id, `subContentId`, and parent path;
- item identity and item type, such as choice, text, cloze, drag/drop, sequence, spatial, speech, essay, survey, media, or composite;
- raw and normalized response values;
- optional response parts for blanks, drop zones, ordered elements, hotspots, words, or other subunits;
- evaluation fields including `evaluable`, `correct`, `scoreRaw`, `scoreMax`, `scoreScaled`, `success`, `completion`, `partialCredit`, and `gradingMethod`;
- optional part-level evaluations so one H5P event can become multiple KT trials;
- timing fields including start time, response time, latency, inter-event latency, duration, and media time;
- context fields such as mode, device/browser/language, slide/page/video position, and sequence position;
- provenance fields showing whether the data came from xAPI, H5P state, the H5P package, the LMS, manual scoring, or custom parsing.

A compact target shape is:

```ts
interface H5PLearningEvent {
  schemaVersion: string;
  eventId: string;
  eventType:
    | 'started'
    | 'answered'
    | 'hinted'
    | 'revealed'
    | 'submitted'
    | 'completed'
    | 'abandoned';

  learner: {
    learnerId: string;
    sessionId?: string;
    groupId?: string;
  };

  source: {
    system: 'h5p';
    activityId: string;
    library?: string;
    libraryVersion?: string;
    containerId?: string;
    subContentId?: string;
    parentPath?: string[];
  };

  item: {
    itemId: string;
    itemType:
      | 'choice'
      | 'multi_choice'
      | 'text'
      | 'cloze'
      | 'drag_drop'
      | 'matching'
      | 'sequence'
      | 'spatial'
      | 'speech'
      | 'essay'
      | 'survey'
      | 'media'
      | 'composite';
    prompt?: string;
    stimulusRefs?: Array<{ stimulusId: string; kind: string; url?: string }>;
    responseUnits?: Array<{ unitId: string; kind: string }>;
    knowledgeComponents?: Array<{ kcId: string; source?: string }>;
    tags?: string[];
  };

  response: {
    attemptNumber: number;
    raw?: unknown;
    normalized?: unknown;
    parts?: Array<{
      partId: string;
      kind: string;
      response: unknown;
    }>;
  };

  evaluation: {
    evaluable: boolean;
    correct?: boolean;
    scoreRaw?: number;
    scoreMax?: number;
    scoreScaled?: number;
    success?: boolean;
    completion?: boolean;
    partialCredit?: number;
    gradingMethod?:
      | 'exact_match'
      | 'regex'
      | 'choice_key'
      | 'placement_key'
      | 'sequence_key'
      | 'spatial_region'
      | 'speech_recognition'
      | 'keyword'
      | 'human'
      | 'none'
      | 'unknown'
      | string;
    partEvaluations?: Array<{
      partId: string;
      correct?: boolean;
      scoreRaw?: number;
      scoreMax?: number;
    }>;
  };

  timing: {
    timestampStart?: string;
    timestampResponse?: string;
    latencyMs?: number;
    latencySincePreviousEventMs?: number;
    durationMs?: number;
    mediaTimeMs?: number;
  };

  context?: {
    mode?: 'practice' | 'quiz' | 'test' | 'survey' | 'review';
    device?: string;
    browser?: string;
    language?: string;
    presentationPosition?: {
      slide?: number;
      page?: number;
      videoTimeMs?: number;
      sequenceIndex?: number;
    };
  };

  provenance: {
    capturedFrom:
      | 'xapi'
      | 'h5p_state'
      | 'h5p_package'
      | 'lms'
      | 'manual'
      | 'custom';
    originalStatement?: unknown;
    originalParamsRef?: string;
    transformNotes?: string[];
  };
}
```

Some H5P widgets emit one meaningful learner event. Others emit an ordered group of child and part events for a single MoFaCTS trial. Reporting should therefore use a batch/envelope shape when moving events across history, analytics, or KT boundaries:

```ts
interface H5PLearningEventBatch {
  schemaVersion: string;
  batchId: string;
  trialId?: string;
  learnerId: string;
  sessionId?: string;
  h5pContentId: string;
  sourceEventCount: number;
  events: H5PLearningEvent[];
  historyWriteCandidates?: H5PHistoryWriteCandidate[];
  derivedKtRows?: KTLearningObservation[];
}
```

`historyWriteCandidates` is optional in the target schema because some phases may derive row drafts later from `events`, but the normalized data must always contain enough information to construct those candidates deterministically. The implementation should prefer deriving history rows from normalized events, not from raw xAPI statements.

The learner model should then flatten this event according to the chosen grain:

```ts
type KTGrain = 'activity' | 'item' | 'part' | 'kc';
```

Recommended defaults:

- Multiple Choice and True/False: item-level trial.
- Fill in the Blanks: part-level trials when blank-level response and evaluation can be recovered.
- Drag and Drop: part-level trials when placement-level response and evaluation can be recovered.
- Mark the Words, Dictation, Crossword, Sort the Paragraphs, Image Sequencing, and Find the Hotspot: item-level or part-level depending on recoverable widget detail.
- Interactive Video, Course Presentation, Question Set, Column, and Interactive Book: child item trials, preserving parent context.
- Essay: item-level only if evaluated.
- Survey, note-taking, media, reveal, or display widgets: observation/progress events, not correctness trials.

The rule for MoFaCTS should be: preserve the ordered H5P learning event batch first, then explicitly flatten it into one or more trial records for knowledge tracing and adaptive scheduling.

A concrete target example is drag-and-drop matching with multiple draggable items. The H5P activity is the container, but each learner drop/placement can be the meaningful history grain. If the event stream and package data allow it, each drag-and-drop placement should become its own ordered history row:

- one row for each dropped item;
- the dragged item id/label and target/drop-zone id/label;
- whether that specific placement was correct;
- the timestamp of the drop;
- latency from activity start for the first drop;
- latency from the previous H5P learner event for subsequent drops;
- the parent H5P activity/content id and `batchId` so rows can be regrouped.

For example, one H5P drag-and-drop matching activity with six draggable items may emit six MoFaCTS history rows. A learner who places four items correctly and two incorrectly should produce four correct placement rows and two incorrect placement rows, each with its own event index and latency. The parent activity completion/score can still be recorded as summary metadata, but it should not erase the placement-level evidence.

### Response and Correctness Extraction

The H5P-to-KT adapter should distinguish the following cases:

- Atomic question widgets, such as True/False and Multiple Choice, usually map to one scored item event.
- Multi-part question widgets, such as Fill in the Blanks or Drag and Drop, may emit one scored event whose subparts must be reconstructed from response values and H5P package parameters.
- Container widgets, such as Interactive Video, Course Presentation, Question Set, Column, and Interactive Book, often produce parent-level summaries plus child xAPI events. The child events should be primary for KT.
- Survey, display, note-taking, audio recording, reveal, and media widgets may produce observations or artifacts but should not be treated as correctness trials unless a scoring adapter exists.

The converter should avoid assuming that H5P returns a binary vector such as `[true, false, true]`. When such vectors are needed, they should be reconstructed from `response`, score fields, `correctResponsesPattern`, content parameters, or widget-specific state. The reconstruction method should be recorded in `provenance.transformNotes`.

### Session-Specific Interpretation

H5P event ingestion, normalization, learning-session interpretation, assessment-session recording, and history-row emission are separate responsibilities.

The event bridge should produce normalized H5P event batches. It should not decide how those batches affect the adaptive model, and it should not write history directly. The output of bridge/widget normalization is still H5P-shaped learner evidence, even when it uses the common `H5PLearningEventBatch` schema.

Learning sessions need an interpreter after normalization. That interpreter consumes `H5PLearningEventBatch` plus the active stimulus/session context and produces the values MoFaCTS needs for model-facing behavior:

- one or more model observations at the chosen grain, such as activity, item, part, or KC;
- correctness or score values only when the configured H5P widget adapter can support them;
- response values suitable for MoFaCTS/DataShop-style history rows;
- timing values mapped onto the existing trial timing concepts where possible;
- enough provenance to explain how raw H5P data became model evidence.

Assessment sessions are different. They still need reliable history and reporting, but they usually should not interpret the H5P response into adaptive model inputs. For assessment H5P, MoFaCTS should record what happened, which widget/content produced it, and the normalized result payload needed for later reporting. It should avoid fuzzy response evaluation unless an explicit assessment scoring policy is configured and supported by a self-hosted/same-origin integration.

This means there should be two downstream consumers of normalized H5P batches:

```ts
interface H5PLearningSessionInterpretation {
  mode: 'learning';
  canAdvance: boolean;
  cardFlowResult?: {
    isCorrect?: boolean;
    responseTime?: number;
    responseValue?: unknown;
  };
  modelObservations: KTLearningObservation[];
  historyRows: H5PHistoryRowDraft[];
  notes?: string[];
}

interface H5PAssessmentSessionRecording {
  mode: 'assessment';
  canAdvance: boolean;
  historyRows: H5PHistoryRowDraft[];
  reportingSummary: {
    contentId?: string;
    library?: string;
    widgetType?: string;
    eventCount: number;
    completed?: boolean;
    passed?: boolean;
    scoreRaw?: number;
    scoreMax?: number;
    scoreScaled?: number;
  };
}
```

The exact TypeScript names can change, but the boundary should remain: learning interpretation can affect model-facing observations; assessment recording is primarily evidence ingestion and reporting.

### History Row Emission

H5P history logging should be a separate process from normal answer history logging. A single H5P activity can emit multiple meaningful child or part events, and therefore one H5P event batch may become multiple history records.

The history-emission layer should consume `H5PHistoryRowDraft[]` produced by the learning interpreter or assessment recorder. It should then insert bounded, conventional history records using the existing history wire path where possible, with H5P-specific fields added as custom/nested metadata rather than broad changes to every core history column.

The history-emission layer should not need to understand H5P widget internals. By the time data reaches this layer, the normalized batch and session interpreter should have already identified the ordered row candidates. The history writer's job is to map those candidates into MoFaCTS history fields, preserve ordering, write rows idempotently, and attach compact H5P metadata.

Recommended minimal H5P reporting fields on each emitted history row:

- `CFH5PContentId`
- `CFH5PLibrary`
- `CFH5PWidgetType`
- `CFH5PEventType`
- `CFH5PSubContentId`
- `CFH5PParentPath`
- `CFH5PEventIndex`
- `CFH5PBatchId`
- `CFH5PPartId`
- `CFH5PPartLabel`
- `CFH5PTargetId`
- `CFH5PTargetLabel`
- `CFH5PLatencySincePreviousEventMs`
- optional compact `h5p` nested summary for score/completion/response provenance

For learning sessions, emitted rows should align with the interpreter's selected grain. For example, a Fill in the Blanks H5P activity may emit one history row per blank if blank-level evidence can be recovered. For assessment sessions, emitted rows can be closer to event-level evidence because the app is recording rather than feeding the response into adaptive scheduling.

For drag-and-drop matching, the row draft should represent a placement event when possible: `partId`/`partLabel` identify the dragged item, `targetId`/`targetLabel` identify the drop target, `isCorrect` records whether that placement matched the answer key, and `latencySincePreviousEventMs` records the time since the learner's previous H5P event in the same batch. This lets the history stream preserve ordered problem-solving behavior instead of only the final activity score.

Do not make the normal `historyLoggingService` directly parse H5P raw statements. It can share low-level record insertion helpers, but H5P-specific batch-to-row conversion should live in a dedicated H5P history module.

### Result Mapping

Add `h5pResultMapper.ts` to map `H5PTrialResult` plus the configured policies into MoFaCTS card-flow semantics:

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
- `scorePolicy: 'correct-if-full-score'`: set `isCorrect` from full credit when `scoreRaw === scoreMax`.

For KT-oriented H5P, this mapper should output both the MoFaCTS card-flow result and the richer `H5PLearningEvent` or derived KT trial rows.

The result mapper is not the full learning interpreter. Its job is narrow: decide whether the current card can advance and, when H5P owns the response, expose the immediate card-flow values. The learning-session interpreter is responsible for turning normalized H5P batches into model observations and history-row drafts.

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

## Assessment Template Model

Do not represent H5P assessment trials as ordinary button tests. The current assessment template grammar uses entries shaped like:

```text
offset,inputMethod,trialType,location
```

Existing native examples use `0,b,t,0`, where `b` means a button/multiple-choice input surface and `t` means a MoFaCTS test trial. That is not the right canonical representation for H5P, because each H5P widget defines its own interaction surface and result structure.

H5P assessment trials should get explicit template markers. The proposed canonical target is:

```text
0,h,h,0
```

Recommended meanings:

- `offset`: same as existing templates; usually `0` for the first stim in the selected cluster.
- `inputMethod: h`: H5P owns the learner interaction surface.
- `trialType: h`: H5P-defined assessment event/result. The card flow should use the H5P config and event/result mapper rather than assuming a native MoFaCTS `t` response.
- `location`: same schedule placement offset as existing templates.

The runtime parser must fail clearly if it sees `h` before H5P assessment-template support is implemented. It should not silently downgrade `h,h` to `b,t`, `f,t`, or another native response mode. During Phase 1 passive-display work, a scratch local smoke file may use a native response mode if needed, but the committed H5P tester should remain the forward contract.

For an `h,h` assessment trial, the schedule builder should preserve the normal cluster/stimulus addressing behavior but mark the prepared trial as H5P-owned. That prepared trial should carry at least:

- `inputMethod: 'h5p'`;
- `trialType: 'h5p'`;
- selected `clusterIndex` and `whichStim`;
- normalized `currentDisplay.h5p`;
- stable trial/session correlation ids for event ingestion;
- a policy saying native response controls are suppressed and H5P completion/result events drive advancement.

The existing assessment template parser should remain small. It should parse the letters, create an explicit H5P trial descriptor, and leave H5P-specific rendering/result logic to the card/runtime services. Do not spread H5P widget logic into the schedule builder.

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

Self-hosted scored mode is also the right place to implement the H5P-to-KT adapter, because same-origin runtime access is needed to reliably ingest H5P xAPI/runtime events and because package parsing is needed to recover item text, answer keys, `subContentId` mappings, and widget-specific response units.

### Efficiency And Maintainability

Self-hosted H5P can become expensive if every trial reparses packages, reloads libraries independently, or writes one database row per event synchronously. The implementation should keep the hot path lean:

- Import and validate packages once; cache package metadata and content parameters by package hash/content id.
- Serve reusable H5P libraries/assets with stable same-origin URLs and browser caching headers.
- Lazy-load H5P runtime/player code only when the current display contains `h5p`.
- Prefetch only the next H5P content item when the card engine has already selected or locked it; do not preload the whole lesson's H5P packages by default.
- Batch H5P event ingestion per trial attempt and batch history inserts for multi-row widgets.
- Use deterministic event ids/idempotency keys based on trial id, H5P content id, source statement id or event index, and part id so retries do not duplicate history rows.
- Store bounded raw event provenance only when needed for debugging/audit; keep the normalized event and history-row draft as the operational data.
- Keep widget-specific code in a registry of adapters keyed by H5P main library, not in the card machine, generic history writer, or assessment scheduler.
- Add fixture-driven tests using the H5P Tester Items package so adapter behavior is checked against real `.h5p` package metadata.

Maintainability boundary:

```text
TDF/stimulus package
  -> package import/storage
  -> same-origin H5P renderer/player
  -> H5P runtime event ingestion
  -> widget normalizer
  -> session interpreter/assessment recorder
  -> H5P history emitter
  -> existing compressed history insert
```

Each layer should accept and return structured objects. Avoid passing raw H5P statements or package internals across multiple layers.

## History and Analytics

MoFaCTS history should remain the canonical learner activity record.

Add H5P-specific metadata as custom fields and/or a nested field rather than changing core response columns broadly:

```ts
h5p: {
  contentId: string;
  library?: string;
  widgetType?: string;
  eventType?: string;
  subContentId?: string;
  parentPath?: string[];
  batchId?: string;
  eventIndex?: number;
  completed: boolean;
  passed?: boolean;
  score?: number;
  maxScore?: number;
  scaledScore?: number;
  response?: unknown;
}
```

Raw xAPI statements should be stored only if there is a clear analytics/debugging requirement. If stored, keep them bounded and separate from the core trial result summary.

For KT-oriented H5P trials, prefer storing normalized `H5PLearningEvent` records, H5P-derived history rows, or derived KT trial rows over relying on raw parent xAPI summaries. Raw xAPI can be kept as provenance, but should not be the only data model.

Learning-session H5P history and assessment-session H5P history should share the same insertion plumbing where practical, but they should not share the same interpretation policy. Learning rows are model-facing observations selected by the interpreter. Assessment rows are evidence/reporting records and should not require adaptive correctness conversion.

A useful analytics stack would have three layers:

- Raw H5P/xAPI event ingestion for debugging and audit.
- Normalized `H5PLearningEvent` records for research-grade learning telemetry.
- H5P-emitted history rows plus flattened KT trial rows for reporting, learner modeling, and adaptive scheduling where applicable.

## Phased Implementation

### Phase 1: Passive H5P Stimulus

- Add shared `H5PDisplayConfig` types and barrel exports where needed.
- Add shared `normalizeH5PDisplayConfig` / `validateH5PDisplayConfigPhase1` helpers for the Phase 1 subset.
- Add field registry/schema support for minimal `display.h5p` config through `fieldRegistrySections.ts`, then regenerate committed schemas.
- Add validator support so `display.h5p` counts as display content and unsupported Phase 1 combinations fail clearly.
- Add `h5p` to display-field subset support.
- Preserve `display.h5p` through `unitEngineService.ts` and `CardScreen.svelte`.
- Render external iframe H5P inline in `StimulusDisplay.svelte`.
- Support `completionPolicy: 'viewed'` or `manual-continue` as passive metadata only; normal MoFaCTS controls still advance the trial.
- Add explicit parser recognition for H5P assessment template markers (`inputMethod: h`, `trialType: h`) that fails clearly until H5P-owned assessment flow is implemented; do not treat H5P templates as `b,t` button trials.
- Add focused tests for schema/validator coverage, display preparation, display subset behavior, and display cloning.
- Regenerate schemas when registry changes are made. Defer `npm run audit:fields` and `npm run typecheck` until the final verification pass after all implementation phases required by the canonical tester package are complete.

### Phase 2: H5P Owned Response Surface

- Add `H5PStimulus.svelte` events for loaded, failed, completed, and result.
- Add `h5pResultMapper.ts`.
- Let `TrialContent.svelte` suppress native text/buttons/SR response controls when the prepared trial determines that H5P owns the response result.
- Add a dedicated H5P history-emission module that can turn one normalized H5P batch into zero, one, or many history row drafts and insert them through the existing history wire path where possible.
- Record normalized H5P result metadata in trial history without making the normal answer history logger parse raw H5P statements.
- Verify that H5P parent summary events are not mistaken for child-item trial data.

### Phase 3: Video and Session Overlays

- Generalize checkpoint overlay payloads.
- Render H5P stimuli inside video checkpoint overlays.
- Reuse the same overlay component for assessment and learning interruptions where appropriate.
- Verify pause/resume, rewind-on-incorrect, and prevent-scrubbing behavior with H5P overlays.
- Preserve video timestamp context in normalized H5P learning events.

### Phase 4: Self-Hosted H5P Packages

- Add package upload/storage and config-package import support for `.h5p` files referenced by `display.h5p.packageAssetId`.
- Resolve tester package filenames such as `multiple-choice-713.h5p` into stored package/content records keyed by stable `contentId`.
- Validate package structure, safe zip paths, package hash, library metadata, dependency libraries, and `content/content.json`.
- Serve same-origin H5P content.
- Wire H5P xAPI events into `h5pEventBridge.ts`.
- Ingest ordered raw xAPI/runtime events with trial/session correlation.
- Parse and expose package/content metadata needed by later widget normalizers, including `subContentId`, item text, answer keys, response units, and H5P library versions.
- Require self-hosted mode for scored H5P assessment trials.

### Phase 5: Widget-Specific Event Normalizers

- Add first-class normalizers that translate raw xAPI/runtime events plus package params into the target `H5PLearningEvent` shape.
- Start with the five H5P Tester Items package types: Multiple Choice, Fill in the Blanks, Drag and Drop, Drag the Words, and True/False.
- Then expand to Mark the Words, Dictation, Find the Hotspot, Question Set, Course Presentation, and Interactive Video.
- For each normalizer, document whether it can produce one event, an ordered event batch, part-level events, or only aggregate activity/progress events.
- Include tests that compare raw xAPI statements and package params to normalized `H5PLearningEventBatch` output.

### Phase 6: Session Interpreters, KT Flattening, and Reporting

- Add a learning-session H5P interpreter that consumes normalized batches and emits model observations plus history row drafts.
- Add an assessment-session H5P recorder that consumes normalized batches and emits reporting summaries plus history row drafts without adaptive correctness conversion by default.
- Flatten normalized `H5PLearningEventBatch` objects into KT observations by activity, item, part, or KC grain.
- Use drag-and-drop matching as an early multi-part proof case: verify that each placement can become a distinct ordered history row with correctness and latency since the previous H5P learner event.
- Keep KT flattening generic; it should consume the semantic batch schema, not widget-specific raw H5P structures.
- Add history/reporting paths for normalized batches and derived KT rows.
- Verify that widgets with arrays of child/part events produce multiple ordered observations where appropriate.

### Phase 7: Authoring and Documentation

- Add authoring UI support for H5P display fields.
- Document when to use external embed vs self-hosted scored mode.
- Document result policies and examples for learning, assessment, video checkpoint use, and KT-oriented trial extraction.
- Document which H5P content types are approved for adaptive scheduling and which are display/progress-only.

## Risks and Mitigations

- Cross-origin event reliability: keep external embeds passive/non-authoritative for scored correctness.
- Event duplication or out-of-order delivery: require correlation ids and idempotent result/history writes before Phase 2 scoring.
- Package security: validate `.h5p` zip structure, reject unsafe paths, and serve only expected assets before self-hosted mode ships.
- Package/runtime performance: import packages once, cache package metadata by hash/content id, lazy-load H5P runtime code, and batch event/history writes.
- Adapter sprawl: keep widget-specific parsing in a main-library adapter registry with fixture tests; do not let H5P-specific structures leak into scheduling or generic history code.
- Config-package drift: validate that every `packageAssetId` filename in the stimulus file exists in the config package and that the declared `library` matches the package metadata.
- UX dead ends: render explicit inline errors and define whether the current context can continue or must block.
- Schema drift: route field additions through `fieldRegistrySections.ts`, regenerate schemas, and verify compatibility with content/config repositories when field names or required structures change.
- Learner-model over-aggregation: preserve child and part-level H5P evidence before flattening to KT rows.

## Open Questions

These questions are implementation decision prompts, not stopping points. The agent should resolve them with conservative local choices while continuing through the full plan. Ask the user only if the question meets the critical-blocker definition in the Agent Execution Contract.

- Should H5P package assets live in the existing dynamic asset system or a dedicated H5P collection/store?
- Which H5P content types are highest priority for scored trials?
- Which H5P content types need first-class widget-specific adapters for part-level KT extraction?
- Should incorrect H5P results trigger force-correct behavior, ordinary feedback, video rewind, or a content-type-specific retry?
- How much raw xAPI data should be retained for research use?
- Should an H5P activity be allowed to contribute partial credit to adaptive scheduling, or should scheduling initially consume only correct/incorrect?
- Should H5P part-level trials be modeled as independent KT observations, composite item observations, or both?
- Which H5P custom/reporting fields are the minimal stable set for assessment exports beyond content id, library, widget type, event type, sub-content id, batch id, and event index?
- Should assessment sessions ever apply an H5P scoring interpreter, or should H5P assessment scoring remain record-only until a separate assessment scoring policy is explicitly designed?
- Where should KC mappings live for imported H5P packages: inside the H5P package when available, in MoFaCTS content metadata, or in a dedicated MoFaCTS KC-mapping record?
- How should MoFaCTS handle H5P widgets that emit useful score data but insufficient response detail?
- Should the H5P-to-KT adapter export a public interchange format so other learning systems can consume the same event object?

## Canonical End-to-End Test Package

The H5P Tester Items package intentionally answers implementation questions for the self-hosted final-test path. It is the concrete target the later phases must make runnable, and the plan should explain every field and behavior used by this package.

- Package references are local `.h5p` filenames in `display.h5p.packageAssetId`.
- Stable runtime identity is `display.h5p.contentId`.
- Assessment template entries use `0,h,h,0`.
- Scoring policy is `record-only` for the assessment target.
- Expected normalization targets are documented in this plan, not in a sidecar stimulus artifact.

Package files:

- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\H5P_Tester_Items_TDF.json`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\H5P_Tester_Items_stims.json`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\multiple-choice-713.h5p`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\fill-in-the-blanks-837.h5p`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\drag-and-drop-712.h5p`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\drag-the-words-1399.h5p`
- `C:\Users\ppavl\OneDrive\Active projects\mofacts_config\H5P Tester Items\true-false-question-34806.h5p`

That system is the canonical final-test target, not the Phase 1 external-embed smoke file. It is a five-trial assessment session with self-hosted H5P package files and `h,h` assessment template entries. It covers Multiple Choice, Fill in the Blanks, Drag and Drop Matching, Drag the Words, and True/False Question. It should become runnable once self-hosted H5P package import/playback, event ingestion, explicit H5P assessment-template handling, normalizers, and H5P history emission land.

Expected normalization/history-write targets for the five tester items:

- Multiple Choice, `H5P.MultiChoice 1.16`, `multiple-choice-713.h5p`: one item-level answer row with selected choice id/label, correctness, score, timestamp, and response latency.
- Fill in the Blanks, `H5P.Blanks 1.14`, `fill-in-the-blanks-837.h5p`: one row per blank when blank-level evidence is recoverable, with blank id/label, learner text, correctness, event index, timestamp, and latency since the previous H5P event.
- Drag and Drop Matching, `H5P.DragQuestion 1.14`, `drag-and-drop-712.h5p`: one row per learner drop/placement, with dragged item id/label, target id/label, correctness, event index, timestamp, and latency since the previous H5P event.
- Drag the Words, `H5P.DragText 1.10`, `drag-the-words-1399.h5p`: one row per token placement when placement-level evidence is recoverable, with token id/label, target blank id/label, correctness, event index, timestamp, and latency since the previous H5P event.
- True/False Question, `H5P.TrueFalse 1.8`, `true-false-question-34806.h5p`: one item-level binary answer row with selected value, correctness, score, timestamp, and response latency.

If Phase 1 needs a passive display-only fixture before self-hosted H5P exists, create a separate scratch or explicitly named external-embed fixture. Do not weaken the canonical final tester by converting it back to external embeds or native `b,t` response templates.

## Suggested First Slice

Implement external iframe H5P as a passive stimulus first. That gives authors a visible capability quickly while preserving a clean path to same-origin package import, event ingestion, and KT-oriented normalization later.

This first slice is deliberately not expected to run the H5P Tester Items package. It should establish the display/schema/rendering plumbing that later phases reuse, while rejecting self-hosted/package/scored fields clearly until those phases are implemented. Continue immediately into the later phases after this slice; do not report the first slice as final completion.

The first slice should touch only:

- `mofacts/common/types/h5p.ts`,
- `mofacts/common/types/index.ts` if the new type is consumed through the common types barrel,
- `mofacts/common/lib/h5pDisplay.ts`,
- `mofacts/common/fieldRegistrySections.ts`,
- generated `mofacts/public/stimSchema.json`,
- `mofacts/client/lib/validatorRegistry.ts`,
- `mofacts/common/lib/displayFieldSubsets.ts`,
- `mofacts/client/views/experiment/svelte/services/unitEngineService.ts`,
- `mofacts/client/views/experiment/svelte/components/CardScreen.svelte`,
- `mofacts/client/views/experiment/svelte/components/StimulusDisplay.svelte`,
- one small H5P iframe component if shared loading/error behavior would otherwise clutter `StimulusDisplay.svelte`,
- focused tests.

After the passive display path is stable enough to support the next implementation layer, continue directly into scored trials, package hosting, widget-specific event normalizers, KT flattening, and adaptive score mapping. Do not stop at passive display unless a critical blocker is proven.

A second targeted slice should then prove the KT direction using one self-hosted atomic H5P question type, preferably Multiple Choice or True/False, and one multi-part type, preferably Fill in the Blanks or Drag and Drop. That proof should demonstrate raw child xAPI/runtime event ingestion, widget-specific normalization into `H5PLearningEventBatch`, and generic flattening into KT trial rows, then continue through the remaining tester-package requirements.

The full implementation is ready for final verification when the following acceptance criteria are met:

- A stimulus with `display.h5p.sourceType: "external-embed"` and a valid `embedUrl` passes schema/editor validation.
- A stimulus whose only display content is `display.h5p` satisfies the display-content validator.
- Unsupported Phase 1 configurations, such as `sourceType: "self-hosted"` or `scorePolicy: "correct-if-passed"`, fail with clear validation/runtime errors.
- `currentDisplay.h5p` survives engine preparation, display subsets when included, `CardScreen` cloning, and `StimulusDisplay` rendering.
- `studyOnlyFields` and `drillFields` can include `h5p`, and omitting `h5p` removes it intentionally without affecting other display fields.
- Existing `clozeStimulus` handling is not regressed while touching display clone/subset paths.
- Existing text, cloze, image, audio, video, attribution, response, feedback, and video-session behavior remain unchanged when no H5P config is present.
- The H5P Tester Items TDF package resolves all five local `.h5p` package files by `packageAssetId`.
- The imported package metadata verifies each declared `display.h5p.library` against the package's `h5p.json`.
- Assessment template entries using `0,h,h,0` prepare H5P-owned assessment trials rather than falling back to native button trials.
- Each tester item emits at least one normalized H5P event batch and corresponding assessment history write.
- The drag-and-drop tester item can emit multiple ordered history row candidates from one H5P activity attempt, with event index and latency between learner interactions.
- Re-running event ingestion for the same trial attempt does not duplicate history rows.
- `npm run audit:fields` passes from `mofacts/`.
- `npm run typecheck` passes from `mofacts/`.
