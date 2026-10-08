# TutorScript worksheets

A worksheet presents a fixed set of active TutorScript multiple-choice questions,
then a read-only feedback replica. Each selection or changed answer writes a normal
SPARC model-practice history record. These answers are available to subsequent model
loading, but worksheet delivery does not update the adaptive model or select questions
adaptively. An unanswered question produces no answer record.

## Authoring

Use the existing semantic multiple-choice nodes and their normal `clusterIndex`,
stimulus and answer references. Add this to the page's `display` in
`setspec.sparcPages` in the stimulus file:

```json
"worksheet": {
  "workDurationSeconds": 600,
  "reviewDurationSeconds": 300,
  "randomizeQuestions": true
}
```

All three fields are required when `worksheet` is present; durations must be positive.
The current worksheet contract accepts 1–500 top-level multiple-choice questions.
Randomization shuffles whole questions once; it does not shuffle choices. The existing
semantic compiler owns the correct answers; do not create a separate answer table.
Pages without `worksheet` retain ordinary SPARC behavior.

A standalone unit selects the page through `sparcsession.pageId`. A video unit selects
pages at its checkpoints:

```json
"videosession": {
  "videosource": "lecture.mp4",
  "checkpointBehavior": "worksheet",
  "questiontimes": [0, 150],
  "worksheet": { "pageIds": ["concept-1", "concept-2"] },
  "preventPause": true,
  "preventRewind": true,
  "preventScrubbing": true,
  "rewindOnIncorrect": false
}
```

Supply one page ID per timestamp. Times must be nonnegative and strictly increasing.
Worksheet mode uses page references rather than the ordinary `questions` cluster list.
Timing and randomization belong to each page, not to a second video-level copy.

## Work, feedback and resume

Work withholds visible correctness feedback. **Submit and Continue** or the work
deadline waits for pending answer writes and opens review. It neither grades a batch
nor generates another set of answer records. Review reconstructs the latest recorded
selection for each question in the saved order and overlays its authored correct
answer. Blanks remain blank and are indicated as incorrect visually only.

**Continue** or the review deadline completes review. Video playback then resumes;
when the checkpoint is at the end of the video, completion opens the normal video-end
state instead of restarting playback. Worksheet controls own the active work/review
interval, so the ordinary unit Continue and elapsed-unit auto-advance cannot skip it.

The existing history collection stores lifecycle metadata in `sparc.worksheet`:
attempt identity, checkpoint index (`-1` for standalone), sequence/write identity,
phase transitions, realized question order and absolute deadlines. Start, review,
feedback exposure and completion events are non-answer SPARC records. Answers remain
ordinary model-eligible records with this metadata attached; there is no answer snapshot.

Each mounted feedback appearance is logged after a browser paint, including reloads.
Redraws reuse that appearance, and retries reuse the same server-derived record identity.
Instruction events still record Continue as before. A completed worksheet scope remains
completed on reload. Scope includes learner, lesson, unit, page, checkpoint and course
assignment when present; merely reloading does not create a new attempt. Conflicting
starts/sequences and orphaned histories fail explicitly instead of silently merging.

Worksheet controls and status messages use the learner’s interface language.
Authored prompts, choices, answers and feedback retain their authored text; choosing
an interface language does not translate lesson content.

## Persistence, security and verification

`insertHistory` retains self/course/lesson authorization and adds deterministic worksheet
write identities. An identical retry succeeds without another insert or dashboard update;
a conflicting payload fails. Scoped reads retain authorization, project only required
fields and reject more than 10,000 records rather than truncate reconstruction. The
`worksheet_scoped_history` index supports the query prefix. No old histories are rewritten.

Run `node --test scripts/worksheet.test.cjs` from `mofacts/` for pure lifecycle and
write-identity coverage. `node --test scripts/interfaceI18n.test.cjs` checks interface
translation completeness and answer interpolation; `node --test scripts/analyticsMethods.test.cjs`
checks isolated method contracts with synthetic dependencies. Method authorization, bounded reads and duplicate-insert
coverage live in `server/methods/analyticsMethods.test.ts`; each Meteor integration
invocation requires fresh authorization. Run schema generation, full-app typecheck and
lint when changing this contract. Browser delivery requires the supported hotfix workflow
and a real study/test package; schema or compiler success alone does not verify it.
