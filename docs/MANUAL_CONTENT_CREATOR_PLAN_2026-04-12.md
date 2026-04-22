# Manual Content Creator Plan

Date: 2026-04-12

## Implementation Status Checkpoint

Status as of 2026-04-17:

Implemented:

1. `Create New Content` card entry in Content Manager.
2. Auth-protected `/contentCreate` route with lazy-loaded manual creator screen.
3. Shared draft-pipeline support for `manual` source kind.
4. Manual draft builder that maps wizard answers and starter rows into reusable draft lessons.
5. Five-step manual creator wizard shell with persistent in-memory state.
6. Conditional reveal for instruction text, speech settings, timing settings, and pasted seed-table entry.
7. Starter-content table with blank-row, paste-table, add-row, duplicate-row, and delete-row flows.
8. Shared draft editor reuse for `TDF` and `Content` editing before finalization.
9. Shared package generation and ZIP upload handoff through the existing upload contract.
10. Unit coverage for manual draft building, seed parsing helpers, and wizard-step validation helpers.

Still open or intentionally deferred:

1. Resume-draft persistence is still out of scope for the current MVP.
2. Full Meteor `test:ci` is currently blocked by unrelated rspack test-environment failures that pull in third-party package test files.
3. End-to-end manual verification of all recommended lesson variants still needs a focused browser pass.
4. If `Save Draft` / `Resume Draft` is chosen as the immediate next follow-on, the focused browser pass should be run after that persistence work lands so the broader authoring flow is verified once.

Practical interpretation:

1. The MVP flow is now present end to end.
2. The next most coherent follow-on is explicit draft persistence, then a focused browser pass against the fuller authoring workflow.
3. Remaining work is mostly hardening, browser verification, and post-MVP polish rather than missing core architecture.

## Purpose

Define the planned manual content-creation flow for the Content Manager screen.

This is an internal planning document, not end-user documentation. It describes a feature that is not yet in the system and is intended to guide future implementation and iteration.

## Problem

The current Content Manager supports three ways to add content:

1. upload a MoFaCTS package,
2. import from Anki,
3. import from Canvas.

This works well for users who already have source files, but it leaves a gap for users who want to create content directly inside MoFaCTS. Those users currently need to understand MoFaCTS package structure or prepare external files before they can get started.

The proposed feature is a guided manual content creator that:

1. starts from structured questions instead of source-file upload,
2. generates a draft TDF and draft stimulus/content file in memory,
3. allows the user to move into the existing editors to refine that draft,
4. validates the result,
5. finalizes it into a normal MoFaCTS package and uploaded lesson.

## Core Product Direction

The manual creator should be treated as a first-class authoring path in Content Manager, not as a special hidden tool and not as a parallel save format.

Recommended placement on the Content Manager screen:

1. `Uploaded Content` list remains at the top unchanged.
2. A new `Create New Content` card appears immediately below the list.
3. Existing `Upload MoFaCTS Package`, `Import from Anki`, and `Import from Canvas` cards remain below it.

Recommended high-level layout:

```text
[ Uploaded Content list ]

[ Create New Content ]
[ Upload MoFaCTS Package ]
[ Import from Anki ]
[ Import from Canvas ]
```

Recommended new card:

```text
+-------------------------------------------------------------+
|  Create New Content                                         |
|                                                             |
|  Start from prompts.                                        |
|  Build draft lesson.                                        |
|  Edit. Validate. Finalize.                                  |
|                                                             |
|  Basics -> Format -> Content -> Finalize                    |
|                                                             |
|  [ Start Content Creator ]   [ Resume Draft ]               |
+-------------------------------------------------------------+
```

Card action rule:

1. If draft persistence is not in the first implementation, show only `Start Content Creator`.
2. Add `Resume Draft` only when local or server-backed draft recovery actually exists.

## Tightening Decisions

The flow should be tightened around four rules:

1. one decision cluster per step,
2. conditional reveal only,
3. summary-first microcopy,
4. draft generation before deep editing.

Practical meaning:

1. do not mix exposure settings, prompt/response format, and audio settings in one step,
2. do not show advanced fields until a prior answer makes them relevant,
3. do not explain field theory inline when a short label plus one short helper line will do,
4. do not open the full editors until the wizard can generate a structurally valid draft.

## Participant-Facing Presentation Rules

The participant-facing UI should stay lean.

Rules:

1. labels first,
2. short option labels,
3. helper text only where misunderstanding is likely,
4. no paragraphs in normal flow,
5. no duplicated explanation across steps,
6. summary panel always visible,
7. validation phrased as fix prompts, not technical diagnostics.

Preferred copy style:

1. `Lesson name`
2. `Structure`
3. `Visibility`
4. `Experiment link`
5. `Prompt type`
6. `Response type`
7. `Cards`
8. `Shuffle`

Avoid:

1. long explanatory sentences above every field,
2. repeated reminders about what a TDF is,
3. exposing raw field names in the guided steps,
4. showing irrelevant options in disabled form if they can simply stay hidden.

Good helper-text cases:

1. `Tags`
   - `Optional labels for finding lessons later`
2. `Max practice time`
   - `Large value = effectively unlimited`
3. `Experiment link`
   - live preview of final route
4. `Speech recognition`
   - show only if enabled

## Step Output Contract

Each step should produce a small, clear state payload for the next step.

Step 1 output:

1. lesson name,
2. lesson structure,
3. visibility choice,
4. experiment-link choice,
5. experiment target slug if enabled.

Step 2 output:

1. prompt type,
2. response type,
3. starter card count,
4. shuffle choice,
5. button order if multiple choice.

Step 3 output:

1. speech-recognition settings,
2. text-to-speech mode,
3. top-bar display choice,
4. practice timing values,
5. tags.

Step 4 output:

1. starter card rows,
2. initial prompt/response content,
3. generated draft lesson object,
4. generated baseline ready for reset.

Step 5 output:

1. edited working copy,
2. validation result,
3. final package blob,
4. uploaded lesson.

## Main Reuse Findings

The manual content creator should reuse the same middle and end stages already shared by the Anki and Canvas flows.

Reusable pieces already present:

1. Shared draft editor workspace
   - `svelte-app/mofacts/client/views/experimentSetup/draftEditorWorkspace.ts`
   - `svelte-app/mofacts/client/views/experimentSetup/draftEditorWorkspace.html`
2. Shared draft lesson shape and composition helpers
   - `svelte-app/mofacts/client/lib/importCompositionBuilder.ts`
   - `svelte-app/mofacts/client/lib/normalizedImportTypes.ts`
3. Shared package builder
   - `svelte-app/mofacts/client/lib/importPackageBuilder.ts`
4. Existing TDF editor
   - `svelte-app/mofacts/client/views/experimentSetup/tdfEdit.ts`
   - `svelte-app/mofacts/client/views/experimentSetup/tdfEdit.html`
5. Existing content editor
   - `svelte-app/mofacts/client/views/experimentSetup/contentEdit.ts`
   - `svelte-app/mofacts/client/views/experimentSetup/contentEdit.html`

What is already generalized:

1. Both APKG and IMSCC flows converge on the same draft-editor workspace.
2. Both APKG and IMSCC flows package edited draft lessons through the same package-builder path.
3. The existing draft model already supports:
   - generated baseline data,
   - editable working copies,
   - media files,
   - packaging into the same ZIP upload contract used by Content Manager.

What is not yet generalized:

1. The outer wizard shell is still split between APKG and IMSCC implementations.
2. The source-kind typing currently assumes import sources, not manual creation.
3. There is no current manual draft generator that starts from blank rows, pasted rows, or guided question answers.
4. There does not appear to be a separate true WYSIWYG editor in the Svelte app today; the reusable editing surface is the existing draft workspace with `TDF` and `Content` tabs.

## Key Implementation Principle

The manual creator should be implemented as a third source feeding the same draft pipeline, not as a separate save system.

That means:

1. generate one or more `ImportDraftLesson`-style draft objects,
2. load those drafts into the shared draft-editor workspace,
3. package the edited drafts through the same package-builder path,
4. upload the resulting ZIP through the same upload contract used by the existing import wizards.

This avoids inventing:

1. a second package format,
2. a second editing model,
3. a second finalization path,
4. a second set of validation semantics.

## Proposed Wizard Flow

Recommended manual creator flow:

1. `Lesson Basics`
2. `Card Format`
3. `Audio And Display Options`
4. `Seed Content`
5. `Edit Draft And Finalize`

This is intentionally similar to the current import-wizard structure:

1. collect source-specific setup,
2. open a shared draft editor,
3. package and finalize.

Tightened state progression:

1. Step 1 answers define lesson shell,
2. Step 2 answers define card schema,
3. Step 3 answers define optional runtime behavior,
4. Step 4 creates the first valid draft,
5. Step 5 edits and packages that exact draft.

This ordering matters:

1. users decide what the lesson is before deciding advanced behavior,
2. the system knows prompt/response structure before asking for starter content,
3. the editors only open after the generated draft is structurally coherent.

## Lean Wizard Shell

Recommended shell:

1. top title,
2. compact stepper,
3. main form pane,
4. persistent right-side summary on desktop,
5. sticky bottom actions.

Summary panel content:

1. lesson name,
2. structure,
3. prompt type,
4. response type,
5. card count,
6. visibility,
7. experiment link state,
8. validation state in Step 5.

Bottom actions:

1. `Back`
2. `Next`
3. `Cancel`
4. `Validate and Finalize` on final step

Shell rules:

1. one primary action per step,
2. no duplicate action rows,
3. no large intro text after Step 1,
4. preserve entered values when moving backward,
5. preserve summary visibility at all times.

## Step Details

### Step 1: Lesson Basics

Purpose:

1. establish the lesson identity,
2. choose the high-level unit structure,
3. decide how it is exposed to users.

MVP questions:

1. `What should this lesson be called?`
2. `Which structure do you want?`
   - `Learning only`
   - `Instructions + Learning`
   - `Assessment only`
   - `Instructions + Assessment`
3. `Should this be public on the Learning Dashboard or private?`
4. `Do you want a direct experiment link without a password?`
5. If yes: `What experiment target name should be used?`

UX guidance:

1. Show only exposure decisions here.
2. The experiment-target input should show the generated route preview live while the user types.
3. The visibility and experiment-link questions should sit together.
4. Keep helper copy minimal.
5. The model should support:
   - public + dashboard visible,
   - private + experiment link only,
   - public + experiment link,
   - private without experiment link.

Suggested labels:

1. `Lesson name`
2. `Structure`
3. `Visibility`
4. `Experiment link`
5. `Link name`

### Step 2: Card Format

Purpose:

1. define what learners see,
2. define how learners respond,
3. define the starting lesson size and ordering.

MVP questions:

1. `What will students see as the prompt?`
   - `Text`
   - `Image`
   - `Audio`
   - `Video`
   - `Text + Image`
2. `How should students respond?`
   - `Typed response`
   - `Multiple choice`
3. `How many cards do you want to start with?`
4. `Should card order be shuffled before the learner begins?`
5. If multiple choice: `Should answer buttons stay fixed or be randomized?`

Assessment handling decision:

If the user chooses a structure that includes an assessment, the creator should generate the simplest possible assessment session by default:

1. one group,
2. no condition complexity,
3. no advanced templates,
4. no randomized multi-condition assessment logic.

This should match the simple baseline assessment concept the user described rather than exposing the full assessment feature surface in the MVP.

Suggested labels:

1. `Prompt`
2. `Response`
3. `Cards`
4. `Shuffle`
5. `Button order`

### Step 3: Audio And Display Options

Purpose:

Collect the optional runtime features that are important enough to ask up front, without dumping the full TDF surface on the user.

MVP questions:

1. `Do you want speech recognition placeholders enabled?`
2. If yes: `What speech recognition language should be used?`
3. If yes: `Should out-of-grammar spoken responses be ignored?`
4. `Do you want text-to-speech for prompts, feedback, both, or neither?`
5. `What should appear at the top during practice?`
   - `Time`
   - `Score`
   - `Time + Score`
   - `Neither`
6. `Do you want practice timing limits?`
7. If yes:
   - `Minimum practice time`
   - `Maximum practice time`
8. `Do you want tags?`

Required explanatory copy:

1. `Tags` need a short explanation in the UI:
   - "Tags are optional labels that help organize and find lessons later."
2. Practice timing needs plain guidance that a very large maximum behaves like effectively unlimited time.

Step-visibility rule:

1. hide all speech fields until SR is enabled,
2. hide timing inputs until timing is enabled,
3. hide tags help text after first display if the design supports dismissible hints.

Hints decision:

`hintsEnabled` is not in the MVP question set.

Reason:

1. it introduces more explanation cost,
2. it is not obvious to novice authors,
3. the user explicitly did not want it included without first explaining it.

Force-correction decision:

`forceCorrection` is also out of the MVP question set.

### Step 4: Seed Content

Purpose:

Let the user create the initial card rows before moving into the draft editors.

MVP questions:

1. `How do you want to start entering cards?`
   - `Blank rows`
   - `Paste a prompt/response table`
   - `Start with one example row and duplicate`

Generated draft behavior:

1. This step should create the initial draft lesson object in memory.
2. The generated draft should include the TDF structure implied by Steps 1-3.
3. The generated draft should include a stimulus/content file with the requested number of starter cards.

Recommended presentation:

1. table-first,
2. minimal headers,
3. inline cell editing,
4. add-row and duplicate-row controls,
5. no full editor chrome yet.

Starter table columns should be generated from prompt/response choices.

Examples:

1. text prompt + typed response
   - `Prompt`
   - `Answer`
2. image prompt + typed response
   - `Image file`
   - `Answer`
3. text prompt + multiple choice
   - `Prompt`
   - `Correct answer`
   - `Choice 2`
   - `Choice 3`
   - `Choice 4`

Step goal:

Move the user from abstract setup into visible lesson content before the full draft editors appear.

Placeholder clarification:

In this context, `placeholders` means generating blank media-related fields in the draft when the selected prompt type depends on them.

Examples:

1. image prompt type generates blank `imgSrc` fields,
2. audio prompt type generates blank `audioSrc` fields,
3. video prompt type generates blank `videoSrc` fields.

This does not mean uploading dummy files. It means the draft has empty media slots ready for the author to fill later.

Alternate-display decision:

Alternate display variants and cloze variants are out of the MVP question flow. They can still be edited later in the content editor if needed.

### Step 5: Edit Draft And Finalize

Purpose:

Reuse the shared editing model and keep the user working against the actual draft that will be saved.

Recommended workspace:

1. `Lesson Settings` or `TDF` tab
2. `Cards` or `Content` tab

Recommended actions:

1. `Back`
2. `Reset to generated defaults`
3. `Validate and Finalize`

Recommended layout:

1. compact summary header,
2. two tabs only,
3. validation summary above active editor,
4. one primary finalize action.

Important product behavior:

1. Validation should happen continuously while editing where possible.
2. The final button should still be called `Validate and Finalize` for clarity.
3. Finalization should package exactly the edited working copy, not regenerate from earlier answers and overwrite edits.

Editing principle:

The guided steps should collect only enough information to create a good draft. Fine-grained structural editing belongs here, not earlier.

## Exact MVP Question Set

### Required

1. Lesson name
2. Lesson structure template
3. Public or private
4. Direct experiment link enabled or not
5. Experiment target slug, if enabled
6. Prompt type
7. Response type
8. Number of starter cards
9. Shuffle card order yes or no
10. Content seeding method

### Conditional

1. Instruction text, if instructions are included
2. Button order fixed or random, if multiple choice is chosen
3. Speech recognition enabled yes or no
4. Speech recognition language, if speech recognition is enabled
5. Ignore out-of-grammar speech yes or no, if speech recognition is enabled
6. Text-to-speech mode
7. Practice timing min and max, if timing limits are enabled

### Optional But Included In MVP

1. Top-bar display choice:
   - time,
   - score,
   - time + score,
   - neither
2. Tags, with a short explanation

### Explicitly Out Of MVP

1. Hints
2. Force correction before advancing
3. Continue button text
4. Alternate display variants
5. Cloze-specific authoring questions
6. Advanced assessment randomization
7. Separate advanced internal short-name authoring

## Suggested Data-Model Extension

The easiest path is to extend the current import-draft types rather than create a second draft model.

Recommended change:

1. extend `SourceKind` to include `manual`,
2. allow the manual creator to build the same lesson-draft shape used by APKG and IMSCC,
3. keep `generatedBaseline`, `workingCopy`, and `stats` semantics the same.

This keeps the packaging and editing pipeline shared.

Suggested manual-specific state additions:

1. wizard answers object,
2. seed-content table state,
3. draft-generation status,
4. optional persisted local draft metadata if resume is later added.

## Suggested Implementation Breakdown

### Reuse With Minimal Change

1. shared draft-editor workspace,
2. shared draft lesson shape,
3. shared package builder,
4. existing TDF/content validation model,
5. existing final ZIP upload contract.

### New Work Required

1. add a new `Create New Content` card to Content Manager,
2. add a new route and manual-creator wizard template,
3. create a manual lesson-draft generator from guided answers,
4. extend source-kind typing to include `manual`,
5. connect the manual creator to the shared draft workspace,
6. finalize through the shared package-builder and upload path.

### Infrastructure Needs

The implementation needs more than a new wizard template.

Required infrastructure:

1. route entry for manual creator,
2. manual wizard state container,
3. manual draft builder,
4. source-kind extension for `manual`,
5. mapping from wizard answers to TDF defaults,
6. mapping from wizard answers to starter content rows,
7. validation gate per step,
8. final draft packaging through existing ZIP flow,
9. upload completion handoff back to Content Manager.

Recommended new modules:

1. `manualContentCreator.ts` or equivalent route/controller,
2. `manualContentCreator.html` template,
3. `manualDraftBuilder.ts`,
4. `manualContentCreatorState.ts` if step state becomes large,
5. shared helpers for transforming seed-table rows into normalized draft items.

Validation infrastructure:

1. step validation for wizard inputs,
2. draft validation in shared editors,
3. final validation pass before package upload,
4. user-facing validation text in summary form,
5. developer-facing logs through existing client logging utilities only.

Resume infrastructure:

1. not required for first pass,
2. if implemented later, save:
   - wizard answers,
   - seed table rows,
   - working copy draft,
   - timestamp,
   - owner context.

## Recommended Resume-Draft Direction

The preferred follow-on design is an explicit `Save Draft` and `Resume Draft` flow, not silent persistence on every change and not a partial `TDF`-only save path.

Recommended product rule:

1. treat the saved object as an in-progress manual-content draft,
2. keep it separate from published or uploaded content,
3. save only when the user explicitly chooses to save progress,
4. resume the full creator state, not just a generated `TDF`.

Reason:

1. the manual creator owns more than a `TDF`,
2. earlier steps may not yet have generated a draft lesson at all,
3. Step 5 can include edited `TDF` and `Content` working copies,
4. rebuilding from wizard answers alone would overwrite fine-grained draft edits.

Recommended persisted draft payload:

1. draft id,
2. owner id,
3. display name,
4. current wizard step,
5. wizard answers,
6. seed-table rows,
7. generated baseline draft lesson data,
8. current edited working-copy lesson data,
9. lightweight summary metadata for listing and resume UI,
10. updated timestamp,
11. optional published/completed status.

Recommended storage direction:

1. use a server-backed draft record,
2. do not autosave on every field change in the initial persistence pass,
3. optionally add local crash-recovery later, but keep the server record as the authoritative draft.

Recommended user-facing entry points:

1. Content Manager card shows:
   - `Start Content Creator`
   - `Resume Draft`
2. manual creator page shows:
   - `Save Draft`
   - `Delete Draft` once a saved draft exists
3. `Resume Draft` opens a compact current-user draft list with:
   - name,
   - updated time,
   - step,
   - short status.

Important lifecycle rule:

1. in-progress manual drafts stay in the manual-creator path,
2. published lessons continue to use the normal Content Manager editing path,
3. after successful upload, either delete the saved draft or mark it `published` and hide it from the default resume list.

Recommended implementation follow-on:

1. add a draft collection or equivalent server-backed storage,
2. add methods for:
   - save,
   - list,
   - load,
   - delete
3. add route support for loading a saved draft into `/contentCreate`,
4. restore the exact saved working copy when resuming from Step 5,
5. never regenerate from earlier wizard answers during resume if an edited working copy exists.

Recommended ordering relative to browser verification:

1. implement explicit `Save Draft` / `Resume Draft` first if that is the accepted next scope,
2. then run the focused browser pass against:
   - fresh-start creation,
   - saved-draft resume,
   - finalize/upload after resume
3. prefer one broader browser pass over doing a narrower pre-persistence pass and then repeating most of it again after persistence lands.

## Participant-Facing Copy Inventory

The first pass should define copy deliberately rather than letting it emerge ad hoc in templates.

Recommended top-level labels:

1. `Create New Content`
2. `Lesson Basics`
3. `Card Format`
4. `Audio And Display`
5. `Starter Content`
6. `Edit Draft`
7. `Validate and Finalize`

Recommended button labels:

1. `Start Content Creator`
2. `Back`
3. `Next`
4. `Open Draft`
5. `Reset to defaults`
6. `Validate and Finalize`

Recommended summary labels:

1. `Name`
2. `Structure`
3. `Prompt`
4. `Response`
5. `Cards`
6. `Visibility`
7. `Link`
8. `Status`

Copy rule:

Prefer field labels, chips, counts, and short helper fragments over prose blocks.

## Concrete Implementation Sequence

This section turns the plan into a build sequence by file and component.

Recommended execution order:

1. route and entry point,
2. shared type and draft-builder support,
3. wizard shell and step state,
4. starter-content table,
5. draft-editor handoff,
6. package finalization,
7. validation and polish.

### Phase 1: Add Entry Point In Content Manager

Goal:

Expose the new creator from the existing Content Manager without changing upload behavior.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.html`
2. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.ts`
3. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.css`

Implementation:

1. add `Create New Content` card above the current package/import cards,
2. add a primary button:
   - `Start Content Creator`
3. do not show `Resume Draft` in first pass unless persistence ships,
4. wire the button to route navigation.

Expected output:

1. Content Manager shows the new card,
2. the new card visually matches the current card system,
3. clicking the button opens the manual creator route.

### Phase 2: Add Route And Lazy-Loaded Screen

Goal:

Create a dedicated page for manual creation rather than embedding a long workflow inside the upload screen.

Primary files:

1. `svelte-app/mofacts/client/lib/router.ts`
2. new `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
3. new `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
4. optional new `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.css`

Implementation:

1. add a lazy import entry for the manual creator view,
2. add a protected authenticated route, for example:
   - `/contentCreate`
3. render the new template through the existing route-rendering pattern,
4. keep page-level navigation consistent with `contentUpload`, `contentEdit`, and `tdfEdit`.

Expected output:

1. route exists,
2. route is auth-protected,
3. route renders a placeholder wizard shell before deeper logic is added.

### Phase 3: Extend Shared Draft Types For Manual Creation

Goal:

Allow the manual creator to use the same draft pipeline as APKG and IMSCC.

Primary files:

1. `svelte-app/mofacts/client/lib/normalizedImportTypes.ts`
2. `svelte-app/mofacts/client/lib/importCompositionBuilder.ts`
3. `svelte-app/mofacts/client/lib/importPackageBuilder.ts`

Implementation:

1. extend `SourceKind` to include `manual`,
2. ensure `ImportDraftLesson` remains valid for manual drafts,
3. confirm package-building remains source-agnostic,
4. avoid creating a second draft model unless a hard blocker appears.

Likely result:

1. `importPackageBuilder.ts` needs little or no logic change,
2. type-level support is enough for the first pass,
3. manual drafts can use existing `generatedBaseline` and `workingCopy` semantics unchanged.

Expected output:

1. type system accepts manual drafts,
2. shared package builder still works,
3. no behavior regression in APKG or IMSCC flows.

### Phase 4: Build Manual Draft Generator

Goal:

Convert wizard answers plus starter rows into the same lesson draft shape used by the import flows.

Primary files:

1. new `svelte-app/mofacts/client/lib/manualDraftBuilder.ts`
2. `svelte-app/mofacts/client/lib/importCompositionBuilder.ts`
3. optional new `svelte-app/mofacts/client/lib/manualContentCreatorTypes.ts`

Implementation:

1. define a compact answer model for the wizard,
2. define a starter-row model for Step 4,
3. map wizard answers into:
   - TDF shell,
   - unit structure,
   - runtime options,
   - starter content rows,
   - `ImportDraftLesson`
4. reuse existing composition helpers where possible:
   - `buildStimuliFromNormalizedItems(...)`
   - `buildTutorFromNormalizedItems(...)`
5. add manual-specific wrapping only where the shared builders are too import-specific.

Recommended helper split:

1. `buildManualNormalizedItems(...)`
2. `buildManualTutorDraft(...)`
3. `buildManualLessonDraft(...)`

Important design choice:

Prefer small adapter helpers around the existing import composition path before changing the APKG/IMSCC builders.

Expected output:

1. one function can turn wizard state into a valid draft lesson,
2. the result can be opened in `draftEditorWorkspace`,
3. package building works from that draft without a second conversion pass.

### Phase 5: Implement Wizard State And Step Shell

Goal:

Make the manual creator page functional as a multi-step workflow with persistent in-memory state.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
2. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
3. optional new `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.css`
4. optional new `svelte-app/mofacts/client/lib/manualContentCreatorState.ts`

Implementation:

1. add reactive step state,
2. add answer state for Steps 1-3,
3. add starter-content state for Step 4,
4. add draft lesson state for Step 5,
5. add compact persistent summary panel,
6. implement:
   - `Back`
   - `Next`
   - `Cancel`
   - `Open Draft`
   - `Validate and Finalize`

Step responsibilities:

1. Step 1 stores identity and exposure settings,
2. Step 2 stores prompt/response format and card count,
3. Step 3 stores audio/display/timing/tag settings,
4. Step 4 stores starter rows and generates the draft,
5. Step 5 hosts the draft-editor workspace and finalization actions.

Expected output:

1. full wizard navigation works,
2. moving backward preserves values,
3. the summary panel updates live,
4. the draft is only generated after Step 4 has sufficient data.

### Phase 6: Implement Step Validation

Goal:

Prevent invalid or incomplete state from reaching draft generation or final upload.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
2. optional new `svelte-app/mofacts/client/lib/manualContentCreatorValidation.ts`

Implementation:

1. validate required fields per step,
2. block `Next` when required inputs are missing,
3. show summary-style validation prompts only,
4. keep wording participant-friendly,
5. validate experiment slug format before route preview is accepted,
6. validate starter row completeness before opening the draft workspace.

Validation examples:

1. missing lesson name,
2. missing experiment target when experiment link is enabled,
3. invalid card count,
4. missing correct answer,
5. missing media filename for media-based prompt rows when the row is otherwise populated.

Expected output:

1. users cannot advance with structurally incomplete input,
2. validation text remains concise,
3. the generated draft enters Step 5 in a coherent state.

### Phase 7: Build Starter-Content Table

Goal:

Give users a lean, concrete content-entry surface before the full editors open.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
2. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
3. optional new `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.css`

Implementation:

1. render columns from the selected prompt/response format,
2. support blank-row generation from requested card count,
3. support duplicate-row behavior,
4. support paste-friendly text/table entry if included in first pass,
5. keep controls minimal and inline.

Suggested first-pass scope:

1. blank rows,
2. duplicate row,
3. add row,
4. delete row,
5. inline edit,
6. no spreadsheet-grade advanced interactions.

Expected output:

1. users can enter visible starter content quickly,
2. row shape matches the selected format,
3. this state can be transformed into draft stimuli cleanly.

### Phase 8: Reuse Shared Draft Editor Workspace

Goal:

Open the generated manual draft in the same editor workspace already used by APKG and IMSCC.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
2. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
3. existing `svelte-app/mofacts/client/views/experimentSetup/draftEditorWorkspace.ts`
4. existing `svelte-app/mofacts/client/views/experimentSetup/draftEditorWorkspace.html`

Implementation:

1. mount `draftEditorWorkspace` in Step 5,
2. pass `lessons`,
3. pass `onLessonsUpdate`,
4. pass `onBack`,
5. provide manual-creator specific finalize behavior instead of import-specific package-step copy where needed.

Potential refinement:

If the current workspace button labels are too import-oriented, make them configurable through template data rather than forking the workspace.

Expected output:

1. manual drafts edit in the same TDF/content tabs,
2. reset-to-baseline still works,
3. manual flow does not require a second editor implementation.

### Phase 9: Finalize Through Shared Package Flow

Goal:

Package and upload manual drafts exactly like imported drafts.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
2. `svelte-app/mofacts/client/lib/importPackageBuilder.ts`
3. existing upload pattern references in:
   - `svelte-app/mofacts/client/views/experimentSetup/apkgWizard.ts`
   - `svelte-app/mofacts/client/views/experimentSetup/imsccWizard.ts`

Implementation:

1. call `buildImportPackageFromDraftLessons(...)` on the edited draft lessons,
2. upload the generated ZIP via the same `DynamicAssets.insert()` path,
3. call `processPackageUpload`,
4. show compact upload status,
5. return the user to Content Manager on success.

Important rule:

Do not regenerate from wizard answers at finalize time. Finalize from the current edited working copy only.

Expected output:

1. uploaded manual lessons appear in Content Manager like any other uploaded lesson,
2. no manual-only save format exists,
3. upload behavior stays aligned with existing infrastructure.

### Phase 10: Presentation And Copy Polish

Goal:

Ensure the interface matches the lean presentation rules rather than drifting into verbose form design.

Primary files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
2. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.css`
3. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.html`

Implementation:

1. replace long helper text with short fragments,
2. keep headings compact,
3. ensure mobile layout remains readable,
4. keep summary panel concise,
5. make validation copy scannable.

Expected output:

1. clean wizard on desktop and mobile,
2. no accidental documentation-style paragraphs,
3. summary-first presentation throughout.

## File-Level Change Map

Likely touched existing files:

1. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.html`
2. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.ts`
3. `svelte-app/mofacts/client/views/experimentSetup/contentUpload.css`
4. `svelte-app/mofacts/client/lib/router.ts`
5. `svelte-app/mofacts/client/lib/normalizedImportTypes.ts`
6. `svelte-app/mofacts/client/lib/importCompositionBuilder.ts`
7. `svelte-app/mofacts/client/lib/importPackageBuilder.ts`

Likely new files:

1. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.ts`
2. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.html`
3. `svelte-app/mofacts/client/views/experimentSetup/manualContentCreator.css`
4. `svelte-app/mofacts/client/lib/manualDraftBuilder.ts`
5. optional `svelte-app/mofacts/client/lib/manualContentCreatorValidation.ts`
6. optional `svelte-app/mofacts/client/lib/manualContentCreatorTypes.ts`

Files that should ideally remain unchanged in first pass:

1. `svelte-app/mofacts/client/views/experimentSetup/tdfEdit.ts`
2. `svelte-app/mofacts/client/views/experimentSetup/contentEdit.ts`
3. `svelte-app/mofacts/server/methods.ts`

Reason:

The first pass should fit the existing client-side packaging and server-side upload contract rather than requiring new server methods.

## Recommended Verification Sequence

After implementation, verify in this order:

1. route loads,
2. Content Manager card opens the route,
3. each step preserves state when moving backward,
4. conditional fields appear only when relevant,
5. starter-content table shape changes correctly with prompt/response format,
6. draft opens in shared workspace,
7. reset-to-defaults returns to generated baseline,
8. finalize uploads successfully,
9. resulting lesson appears in Content Manager,
10. resulting lesson opens and functions as expected.

## Focused Browser Validation Pass

The browser pass is not a vague "click around" check. It is a targeted confirmation that the end-to-end authoring path behaves correctly from Content Manager entry through learner runtime.

What this pass needs to prove:

1. the creator can be started from the Content Manager entry point,
2. the wizard enforces the expected step gating and conditional reveal behavior,
3. starter-row state turns into the expected draft structure,
4. edits made in Step 5 are the same edits that are packaged and uploaded,
5. the uploaded lesson can actually be launched and behaves as authored.

Recommended browser scenarios:

1. typed-response learning lesson
   - create a simple text prompt / typed response lesson,
   - use blank rows,
   - edit at least one field in Step 5,
   - finalize and upload,
   - launch it and confirm the learner sees the expected prompt and answer flow.
2. multiple-choice learning lesson
   - use text prompt / multiple choice,
   - confirm distractors survive seed entry,
   - confirm button-order setting is reflected in the resulting draft data and runtime behavior.
3. simple assessment lesson
   - choose an assessment structure,
   - confirm the generated draft includes the simple assessment unit rather than a learning session,
   - upload and launch to verify the assessment route works end to end.
4. experiment-link case
   - enable experiment link,
   - confirm slug validation and route preview,
   - upload and verify the resulting lesson is reachable through the expected experiment path.
5. private lesson case
   - create a private lesson without dashboard visibility,
   - confirm it does not appear where a public dashboard-visible lesson would.

Per-scenario browser checklist:

1. Step 1 values persist when moving forward and backward.
2. Conditional fields appear only when triggered.
3. Step 4 table columns match the selected prompt and response format.
4. `Open Draft` produces the expected `TDF` and `Content` structure.
5. `Reset to generated defaults` restores the generated baseline.
6. `Validate and Finalize` packages the currently edited working copy.
7. Upload completes without unexpected overwrite or versioning confusion.
8. Resulting lesson appears in Content Manager with the expected name and visibility.
9. Launching the resulting lesson shows the authored content rather than stale generated defaults.

Failure conditions this pass should specifically watch for:

1. edits made in Step 5 disappearing during packaging,
2. prompt/response column mismatches in seeded content,
3. experiment-link slug preview not matching the actual reachable route,
4. private/public visibility not matching the authored choice,
5. assessment structures accidentally packaging as learning structures,
6. reset-to-defaults restoring the wrong baseline,
7. uploaded content appearing correctly in Content Manager but failing at learner launch time.

Minimum test targets:

1. manual draft builder unit coverage,
2. step-validation unit coverage,
3. route smoke coverage if test harness exists,
4. full app typecheck,
5. manual end-to-end exercise of:
   - typed-response learning lesson,
   - multiple-choice learning lesson,
   - simple assessment lesson,
   - experiment-link case,
   - private lesson case.

### Good Candidate For Near-Term Refactor

The outer wizard shell for APKG, IMSCC, and manual creation should eventually be made more shared.

Not required for the first pass:

1. fully unify the stepper implementation,
2. fully unify all wizard templates,
3. merge all three source-specific setup steps into one component.

Required for the first pass:

1. manual creation must reuse the shared draft and package stages.

## Open Questions For Future Refinement

1. Should server-backed draft persistence ship as the next follow-on after the MVP hardening pass, or stay deferred behind browser validation?
2. If server-backed persistence ships, should successful upload delete the draft record immediately or mark it `published` for short-term recovery/history?
3. Should `Text + Image` be the only mixed prompt in the MVP, or should `Text + Audio` also be offered immediately?
4. Should the top-bar display question map directly to existing runtime fields, or should it be represented as a simpler creator-level setting that later expands into TDF fields?
5. Should the manual creator generate one default instruction block when an instructions unit is selected, or should that field start empty?

## Recommended First Implementation Scope

If the feature needs to be staged, the first implementation should include:

1. one new `Create New Content` card,
2. one manual-creator route,
3. the five-step flow described here,
4. manual source kind support,
5. shared draft-editor reuse,
6. shared package finalization,
7. no extra WYSIWYG surface beyond the existing editors.

That provides a usable authoring path for people who do not have Anki or Canvas files, while keeping the implementation grounded in existing architecture.
