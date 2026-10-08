# Authoring Overview

MoFaCTS uses Tutor Definition Files (TDFs) to define adaptive learning content.

## What A TDF Describes

A TDF can define:

- lesson metadata,
- units and practice items,
- stimulus content,
- response type and answer data,
- feedback behavior,
- scheduling and model parameters,
- media references,
- learner-facing display settings.

## Language Metadata

TDF lesson metadata may declare:

- `contentLanguage`: the BCP 47 language tag for authored instructional content.
- `recommendedUiLocales`: optional BCP 47 UI locale tags recommended for platform chrome.
- `translationStatus`: author-declared review status for the authored content language variant.

These fields describe author-provided content. They do not ask MoFaCTS to translate prompts, answers, hints, feedback, rubrics, or KC labels.

## Supported Practice Patterns

MoFaCTS supports multiple stimulus and response formats, including:

- text prompts,
- cloze and fill-in-the-blank prompts,
- image, audio, and video stimuli,
- multiple-choice responses,
- typed responses,
- speech-recognition-based responses.

## Authoring Guidance

Trial type and duration control answer feedback. Drill trials (`d`), including video checkpoint questions, use `deliverySettings.correctprompt` after a correct answer and `deliverySettings.reviewstudy` after an incorrect answer or timeout. Durations are in milliseconds; zero skips that outcome's feedback phase. Test trials (`t` and button tests `h`) show no answer feedback even when those durations are positive. Study trials (`s`) display the answer using `purestudy`. There are no separate correct/incorrect feedback visibility switches. History records omit feedback text and type when the trial does not have an answer-feedback phase.

Assessment schedule entries retain their authored input method on initial display, prepared transitions, and resume. A `b` entry uses buttons even for a single-answer introduction; an `f` entry retains typed input.

- Keep item wording clear and concise.
- Prefer explicit metadata over implicit naming conventions.
- Verify media paths and file names before upload.
- Test TDFs in a staging or local environment before learner use.
- Do not include private learner data, credentials, or institutional secrets in content packages.

## Creation And Import Paths

- AI creation starts with author notes, a Learning/Test selector, and Submit. One run uses either text prompts or image prompts; correct responses are always text. Review contains a required editable title and one row for every retrieved, generated, or author-supplied item.
- AI first chooses one content strategy. Pasted tables are formatted directly; requested text-to-text tables may be generated in one strict call; images, explicit sources, and externally grounded canonical lists use Wikipedia. A table run is limited to 250 rows, never falls through to Wikipedia, and is rejected as a whole when its required count, columns, or rows are invalid. Wikipedia search returns at most three real page candidates, and AI may select only one supplied opaque candidate ID. Definition and image runs select one structural table, list, or gallery on that page; source-field-mapping runs consider only table regions exposing at least two fields. On the Wikipedia path AI never supplies an item, page, link, URL, or Wikimedia filename. After one individually validated image agrees with a response-bearing canonical filename found on another authoritative item page, MoFaCTS may predict later `File:` titles and use only those that Wikimedia resolves canonically. Text-pair stimuli are learner-visible. An image-pair stimulus is exactly `image: <response>` and is never learner-visible. MoFaCTS supplies IDs, typed-response settings, lesson structure, defaults, and package contents deterministically.
- Learning uses `Study each item, then type the correct answer.` Test uses `Type the correct answer for each item.`
- Working content is one overwrite-only browser-local IndexedDB record with WebP image bytes. The server authenticates AI calls and accepts the final explicit save, but does not store working records, revisions, or draft media. The local record is cleared after successful Save or explicit Discard.
- Text runs support four strategies. Definition runs make one strict definition request per source entry. Source-field-mapping runs select two retrieved table fields once and map their exact row values deterministically. Generated-table runs construct up to 250 rows in one strict call and display a nonblocking external-verification notice. Provided-table runs accept pasted Markdown, CSV, TSV, or aligned text, require unambiguous prompt and response columns, permit light cleanup, and display a reformatting notice. Duplicate prompts, blank fields, and incorrect exact counts reject a generated or supplied table as a whole; no repair or source fallback is attempted.
- Image runs resolve entries individually until one image succeeds. For each later item, canonical response-bearing filenames are compared with the earlier validated images immediately after hydration and before that item's semantic image evaluation. A mismatching item does not disable later attempts. Once one rule is adopted, the current and later `File:` titles are predicted in one deterministic pass and resolved through Wikimedia without another AI evaluation. Missing or technically invalid predictions, plus any entry that failed while collecting seeds, are queued and processed individually once after that pass. Every path still enforces canonical file identity, allowed license, complete attribution, MIME type, dimensions, source-size, download, and WebP conversion. If no observed filename ever agrees, the ordinary per-entry direct-list/detail-page flow handles the entire run.
- Located and manually replaced images are browser-converted to WebP at a maximum width of 1280 and quality 0.86. Initial uploads no longer create or define pairs; file selection and drag/drop are review-time replacements only.
- Missing text prompts and images remain visible with explicit reasons and block Save until manually completed. One item failure does not erase the authoritative list or successful items, and an image item is never silently changed into a text item.
- Administrators use one **AI Content Prompt Lab** in Admin Tests. Its proven Admin capability lookup and explicit stage caller remain fixed while the Creator runs the same full orchestrator and request semantics through its own scoped adapter. The Lab exposes editable author notes plus all nine stage system instructions, user instructions, reasoning, output budget, and strict schema, including the single table generation/formatting stage. **Reset to code defaults** first checkpoints the current draft, then restores every stage setting from the Creator defaults while preserving author notes and saved checkpoints. Its trace shows effective non-secret model requests, generated-table scope and counts, Wikipedia/Wikimedia URLs and candidate objects, direct/detail branches, decisions, acquisition and conversion results, unresolved reasons, and the final Creator-style review. Retrieved page HTML is represented by metadata rather than embedded repeatedly; the complete run object is rendered only when an administrator requests a snapshot, so a growing run remains scrollable. A stage can be retried from its recorded input while validated upstream AI outputs are reused and downstream objects are rebuilt. Drafts and up to 30 named checkpoints remain in the current browser; provider results are not retained on the server. For Wikipedia routes, the model identifies only the core subject and the application deterministically constructs the list-search query. The Creator derives a concise, space-preserving lesson title from that structured subject and the actual item count, keeps its own authoring/review/save interface, and reports the current shared pipeline stage and item in its green running-status region. Package filenames remain independently sanitized.
- The SPARC compound-interest live evaluation in Admin Tests requires a compatible uploaded SPARC page. The selected page supplies the problem statement, expectations, misconceptions, KC graph facts, production rules, thresholds, and instructional-controller settings recorded in the evaluation log; the fixed learner transcript and robustness checks remain the compound-interest test scenario.
- Direct package upload accepts MoFaCTS `.zip` packages only.
- Top-level `tdfId` is the portable identity of a TDF. A valid unused ID creates that exact record; a manageable existing ID produces an update plan and requires confirmation; an ID owned by someone else is rejected. An ID-less package is an explicit first import: the server assigns cryptographically random IDs, and every current-package download writes those IDs back into the canonical ZIP.
- **Import as copy** deliberately assigns new IDs to every TDF in the ZIP and remaps the root's `conditionTdfIds`; it never updates the source records. A copied package must remove or change an `experimentTarget` that is already owned by another available root.
- Filenames are display/export names and references inside one ZIP. They are compared case-insensitively within that ZIP, but the same TDF, stimulus, or media filename may be reused by unrelated packages. Runtime, resume, reporting, and participant workflows use TDF IDs, not filenames.
- Condition experiments are package-owned families. A condition root contains ordered, unique `condition` and `conditionTdfIds` arrays and omits `tutor.unit`; each condition child is an ordinary runnable TDF with at least one unit. The JSON editor does not edit either relationship array. Reupload a complete downloaded package to add or reorder conditions; established condition members cannot be removed individually.
- Package updates use one expiring server preflight plan and one inline confirmation. A stale, changed, expired, or cross-account plan is rejected before content writes. If an older condition root is marked repair-required, it remains unavailable until the server migration or an administrator's dry-run-first repair resolves its exact child IDs.
- The Anki wizard reads `.apkg` locally and uploads only the converted MoFaCTS `.zip` package.
- The Canvas/Common Cartridge wizard reads `.imscc` locally and uploads only the converted MoFaCTS `.zip` package.
- Lesson media uploads are separate from package imports and must target a specific TDF and stimulus set.

## Reviewing Structural Updates

Package updates (ZIP, Anki, IMSCC and manual creation) retain the inline **Update Content** review. Lesson, question and SPARC editor saves also require inline review when either criterion is met:

- **Questions removed:** fewer clusters, fewer total questions (`stims`), or fewer questions at an existing cluster position.
- **Unit sequence changed:** the exact ordered authored `unitname` list changes, including additions, removals, reordering or renaming. Generated adaptive units are excluded.

The warning explains that existing attempts may be disrupted. The content owner can cancel without saving or proceed. Other package updates retain their ordinary overwrite confirmation. Wording, answers, video URLs and adaptive-rule edits alone do not trigger these structural warnings. Startup imports assume prior review and are unchanged.

The lesson editor preserves canonical unit properties in conditional schema validation, including unit names and session exclusions.

The warning is a count/name comparison, not a compatibility guarantee: replacing a question at the same count is not detected, and movement between identical or unnamed unit names cannot be distinguished. Owners are responsible for deciding whether to apply an update.

Editor review returns `status: 'confirmation-required'`, lesson identification, `expectedRevision` and `structuralWarnings`. The client resubmits the same proposal with `updateConfirmation: { expectedRevision, confirmed: true }`. Authorization is rechecked and the write compares `tdfRevision` atomically; a stale review returns `tdf-revision-conflict` and must be reviewed again. Package confirmations retain their archive hash, plan binding, expiry, cancellation and rollback contract.

Learner execution does not compare content signatures. Existing signature fields remain stored and unused. Saved positions and mappings remain intact; a valid permutation is reused regardless of current shuffle/swap settings. Frozen generated adaptive sequences continue to restore their saved units and questions. Missing units, missing or invalid mappings, missing questions and missing/invalid/wrong-lesson adaptive sequences fail with the concrete reason, without resetting progress, regenerating progressed mappings or selecting another unit.

Fresh lessons that enter instructions directly save their initial question mapping before opening those instructions. The mapping uses the loaded lesson's canonical clusters and configured shuffle/swap ranges. A failed save prevents entry; valid saved mappings are reused on reload. This prevents introductory instruction completion from creating saved progress without a mapping. Existing affected attempts remain subject to the same strict resume checks and require separate review; this initialization repair does not reset them.

## Video participant controls

Video units accept optional `videosession.preventPause` and `videosession.preventRewind`
flags, both defaulting to `false`. They use the same Boolean authoring conventions as
`preventScrubbing` and appear in the generated lesson editor.

- `preventPause` removes participant pause controls and pause shortcuts. Initial Play
  remains available. Instructions and questions still pause playback automatically.
- `preventRewind` rejects backward participant seeks (with a 0.1-second rounding
  tolerance). Configured `rewindOnIncorrect` and saved-position restoration remain allowed.
- `preventScrubbing` retains its existing disabled seek bar/shortcuts and restriction
  on forward jumps into unwatched material. Enable all three flags to restrict
  participant pausing and seeking in both directions. Volume and fullscreen remain available.

Unexpected pauses during expected playback receive one automatic resume attempt;
browser rejection leaves Play available when no instruction or question is blocking it.
These are player interaction controls, not guarantees against browser closure or OS
interruptions. They do not change section timers or playback-speed settings.

`rewindOnIncorrect` resets the checkpoint pointer when replaying an interval; scheduled
questions in that interval can recur. There is no separate selective-repeat setting.
On refresh, committed correct and incorrect checkpoint answers both count toward
video resume progress. Playback resumes just after the last completed checkpoint;
an unanswered checkpoint is presented again.
The content list hides generated TDF record IDs; authored SPARC page, node, and rule
identifiers remain available because authors use them to connect their content.

Video activity is recorded with `eventType = "video"`, `levelUnitType = "video"`, and
the playing media source as `displayedStimulus`. It does not depend on a checkpoint
question being active. The ordinary TSV export includes these events and their video
position, seek, speed, volume, and playback fields. Pure wire/export regression coverage
runs with `node --test scripts/videoHistory.test.cjs`; saved-history integration uses CI.

Run the player-policy regressions from `mofacts/` with
`node --experimental-strip-types --test scripts/videoParticipantControls.test.cjs`.

## Condition assignment

Root TDFs may set `setspec.loadbalancing` to `"not-max"` in addition to the existing
`"max"` and `"min"` modes. `not-max` excludes conditions tied at the highest count,
or includes all conditions when every count ties. The server shuffles one block
containing each eligible condition once and consumes it in order. It replenishes
an exhausted block and rebuilds when the maximum count or eligible condition IDs change.

The block and participant assignment commit in one MongoDB transaction. Retries and
returning participants reuse the saved assignment. `countcompletion` still determines
when counts increase; `"beginning"` counts commit with assignment, while later milestones
retain their existing timing. Thus later completion counts need not equal assignment
counts. Explicit owner previews do not consume the block or increment beginning counts.

No existing study package is converted. The generated editor exposes the new enum
value; omitted mode, `max`, and `min` retain their existing behavior. The server-owned
block is runtime state, not authored TDF content. Resetting/replacing counts clears it.
The supported Mongo replica-set runtime and the existing `unique_user_tdf` state index
are required; no separate allocation collection, dependency or data migration is added.

Run pure allocation regressions from `mofacts/` with
`node --test scripts/conditionAllocation.test.cjs`. Real transaction/concurrency and
authorization coverage is in `serverComposition.test.ts` and requires the supported
Meteor test environment and fresh authorization for each `npm run test:ci` invocation.

## Retired Mechanical Turk fields

Mechanical Turk operations, credentials, bonuses, and reminders have been removed. Old `turkemail`, `turkemailsubject`, and `turkbonus` fields are ignored in units and unit templates: any JSON value is accepted silently, has no effect, and is preserved during editor saves. The editor exposes no controls or tooltips for them and supplies no defaults. Other unsupported fields still fail validation. Existing content files do not need changes.

Experiment login defaults to the localized Participant ID label; an authored `experimentLoginText` still overrides it. Existing Prolific participant/study entry and completion navigation are unchanged. Run the field/editor and entry/Continue regressions from `mofacts/` with `node --test scripts/ignoredTdfFields.test.cjs`.

## Where Detailed Examples Belong

Detailed course examples, content packages, sync workflows, and internal authoring notes belong in the configuration/content repository or the GitHub wiki, not in the public application README.

The pure warning, adaptive-artifact and question-reference regressions run from `mofacts/` with `node --test scripts/contentUpdateWarnings.test.cjs`. Editor/server-method and package integration regressions use the supported Meteor CI test environment. Full application `npm run typecheck` and `npm run lint` remain required.

### Assessment answer history

Assessment and adaptive-practice answers are each saved once with their existing origin fields. Original assessment answers are available to later model loading; fixed assessment delivery is unchanged. Historical assessment copies are excluded from operational counts and ordinary exports. Existing deployments require the read-only preflight in [the history contract](history.md) before rollout.

### Timed TutorScript worksheets

TutorScript pages can opt into fixed-question work and read-only review with
`display.worksheet`. Each answer is saved normally and is model-eligible for later
loading; the worksheet does not update the live adaptive model. Video checkpoints
select these same pages with `checkpointBehavior: "worksheet"` and aligned `pageIds`.
See [worksheet authoring and history](worksheets.md) for fields, timing, resume,
feedback exposure, bounds and verification.
