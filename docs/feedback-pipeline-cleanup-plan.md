# Feedback Pipeline Cleanup Plan

## Goal

Make feedback generation, rendering, speech, and history logging flow through one canonical route.

The system should decide feedback content once, display that exact result, speak that exact result, and persist that exact result. It should not reconstruct a second version for logging, and it should not preserve TDF fields that current runtime code does not execute.

This plan is intentionally incomplete. Its purpose is to make the current branching network explicit, identify low-risk simplifications, and define the rules for follow-up removals.

## Governing Rules

- Silent fallbacks are not allowed.
- If canonical feedback data is required and missing, fail clearly.
- If a feedback field is removed from runtime code, remove it from the field registry and generated TDF schema in the same change.
- Do not keep schema-visible feedback settings that no longer affect current runtime behavior.
- Do not preserve parallel legacy and Svelte feedback routes unless there is an explicit current product need.

## Current Canonical Route

For live learner-visible feedback, the current canonical route is:

```text
answer evaluation
  -> Answers.answerIsCorrect(...)
  -> { isCorrect, matchText }
  -> card machine context.feedbackMessage
  -> FeedbackDisplay.buildFeedbackHtml(...)
  -> displayed feedback html
  -> stripped displayed feedback text stored as CardStore.feedbackTtsText
```

This means the current canonical semantic source is `feedbackMessage`, and the current canonical displayed text is `feedbackTtsText` after the renderer has applied its final display policy.

## Current Branching Network

The current network is small enough to describe precisely.

### Semantic message selection

```text
if answer is branching-enabled:
  choose first matching branch
  matchText = branch message
  isCorrect = branch index === 0
else:
  compare user answer to expected answer
  if exact match:
    matchText = "Correct."
    isCorrect = true
  else if close enough:
    matchText = "Close enough to the correct answer 'X'."
    isCorrect = true
  else if phonetic match:
    matchText = "That sounds like the answer but you're writing it the wrong way, the correct answer is 'X'."
    isCorrect = true
  else if no response:
    matchText = "The correct answer is X."
    isCorrect = false
  else:
    matchText = "Incorrect. The correct answer is X."
    isCorrect = false
```

That route determines the main feedback content.

### Display assembly after semantic selection

```text
message = feedbackMessage

if correct-answer image case:
  message = "Incorrect. The correct response is displayed below."

showUserAnswer = displayUserAnswerInFeedback matches outcome
showSimpleFeedback = onlyShowSimpleFeedback matches outcome

if showSimpleFeedback:
  message = "Correct." or "Incorrect."
else:
  style any Correct./Incorrect. labels already present in message
  if timeout and message lacks Incorrect. label:
    prepend Incorrect.

segments = []

if showUserAnswer and user answer text exists and not image case:
  segments.push("Your answer: ...")

if message exists:
  segments.push(message)

if incorrect and displayCorrectAnswerInIncorrectFeedback and correct answer text exists and not simple feedback and not image case:
  segments.push("Correct answer: ...")

join segments with:
  " " if singleLineFeedback = true
  "<br>" if singleLineFeedback = false

if correct-answer image case:
  append image on a new line
```

### Secondary history path

Historically, history logging rebuilt feedback text through a second helper. That path should be removed in favor of the canonical displayed feedback text route.

Target direction:

```text
displayed feedback text
  -> CardStore.feedbackTtsText
  -> history logging
```

## Current Sources Of Branching

The main feedback branches are driven by these decisions:

1. Semantic correctness evaluation
2. Branching-answer match behavior
3. Timeout behavior
4. Image-answer behavior
5. `displayUserAnswerInFeedback`
6. `onlyShowSimpleFeedback`
7. `displayCorrectAnswerInIncorrectFeedback`
8. `singleLineFeedback`

These are not all equally important. The first four decide content. The remaining four mostly decide packaging or suppression.

## Segment-Based Direction

The current renderer already behaves like a partial segment composer:

- `Your answer: ...`
- main feedback message
- `Correct answer: ...`
- optional correct-answer image

The problem is that the middle segment is usually still a precomposed sentence from the evaluator, so we cannot reason cleanly about which subparts are present. A segment-based design should make each displayable unit explicit and let layout settings operate on those units rather than on opaque prose.

The intended architecture should be stated more directly:

```text
1. determine semantic feedback state
2. compose segments from that state using configuration
3. join selected segments for display, speech, and history
```

That means configuration should not decide whether the learner was correct, blank, close-enough, phonetic-match, timed-out, or image-based. Configuration should only decide which segments are emitted from an already-determined semantic state and how those selected segments are packaged.

## Semantic State Before Segment Composition

The evaluator boundary should eventually produce a structured semantic state instead of a mostly finished message string.

This is the decision layer. It answers what happened.

Then the segment composer answers what to show:

```text
semantic state + config
  -> selected segments
  -> display order
  -> inline or stacked layout
```

That separation is the main design goal. Without it, the code keeps mixing factual state, authored prose, and layout policy in one string-building path.

### Recommended semantic-state contract

The loose sketch above is enough for discussion, but the implementation plan should target a stricter discriminated union so invalid combinations become unrepresentable.

```ts
type FeedbackSemanticState =
  | {
      outcome: 'correct';
      reason: 'exact';
      userResponse: { kind: 'text'; value: string };
    }
  | {
      outcome: 'correct';
      reason: 'closeEnough';
      userResponse: { kind: 'text'; value: string };
      correctAnswerText: string;
    }
  | {
      outcome: 'correct';
      reason: 'phonetic';
      userResponse: { kind: 'text'; value: string };
      correctAnswerText: string;
    }
  | {
      outcome: 'incorrect';
      reason: 'blank' | 'timeout' | 'genericIncorrect';
      userResponse: { kind: 'blank' } | { kind: 'text'; value: string };
      correctAnswer: { kind: 'text'; value: string } | { kind: 'image'; src: string; alt: string };
    }
  | {
      outcome: 'correct' | 'incorrect';
      reason: 'branchMatch';
      userResponse: { kind: 'blank' } | { kind: 'text'; value: string };
      branchMessage: string;
      correctAnswer?: { kind: 'text'; value: string } | { kind: 'image'; src: string; alt: string };
    };
```

This is intentionally tighter than the current runtime. The maintainability goal is to model the actual semantic cases directly instead of passing around optional string fields and reconstructing meaning later.

### Segment Design Rules

- Segments should be atomic display units, not multi-clause paragraphs.
- Segments should describe facts, outcomes, or labels that can be independently included or omitted.
- Layout settings such as `singleLineFeedback` should only decide how selected segments are joined.
- Evaluator output should prefer structured facts over prewritten combined sentences.
- A segment may carry text payload, rich-html payload, or media payload, but its meaning should still be explicit.

### Probable Core Segments

These are the most likely reusable segments, starting from the basis you described and extending only as far as the current branches appear to need.

#### Outcome segments

- `correctLabel`
  - Text: `Correct.`
  - Present on correct outcomes when not suppressed.
- `incorrectLabel`
  - Text: `Incorrect.`
  - Present on incorrect outcomes when not suppressed.

These should remain separate from all explanation segments.

#### User-response segments

- `userAnswerText`
  - Text form: `Your answer: {value}.`
  - Used when the runtime wants the learner's entered answer echoed back.
- `userAnswerBlank`
  - Text form: `Your answer was blank.`
  - Better atomic form of the current blank-answer case.

The blank-answer segment should not be encoded indirectly by omitting `userAnswerText` and embedding the blank fact into another sentence.

#### Correct-answer segments

- `correctAnswerText`
  - Text form: `Correct answer: {value}.`
- `correctAnswerImageIntro`
  - Text form: `The correct response is displayed below.`
- `correctAnswerImage`
  - Media payload for the correct-answer image.

The intro and the image should be separate segments so text-only history and speech can omit media while preserving the fact that an image answer exists.

#### Explanation or qualifier segments

- `closeEnoughExplanation`
  - Text form: `Close enough to the correct answer.`
- `phoneticMatchExplanation`
  - Text form: `That sounds like the answer but you're writing it the wrong way.`
- `branchMatchMessage`
  - Text payload from authored branching feedback.
- `timeoutExplanation`
  - Text form for timeout-specific explanations if timeout remains distinct from generic incorrect.

These are explanation segments. They should not implicitly carry the outcome label.

#### Optional authored-message segments

- `customBranchMessage`

This should exist only for the real authored branching-message case. It should not be used as a generic escape hatch for non-branching correct or incorrect feedback.

## Recommended Inclusion Model

Instead of storing one final message string, the evaluator and renderer boundary should eventually produce something closer to:

```ts
type FeedbackSegmentKey =
  | 'correctLabel'
  | 'incorrectLabel'
  | 'userAnswerText'
  | 'userAnswerBlank'
  | 'correctAnswerText'
  | 'correctAnswerImageIntro'
  | 'correctAnswerImage'
  | 'closeEnoughExplanation'
  | 'phoneticMatchExplanation'
  | 'branchMatchMessage'
  | 'timeoutExplanation'
  | 'customBranchMessage';

type FeedbackSegment = {
  key: FeedbackSegmentKey;
  text?: string;
  html?: string;
  media?: {
    kind: 'image';
    src: string;
    alt: string;
  };
};
```

The configuration input should also be normalized before composition:

```ts
type FeedbackDisplayPolicy = {
  showUserAnswerOn: 'never' | 'correct' | 'incorrect' | 'always';
  showCorrectAnswerOnIncorrect: boolean;
  mode: 'full' | 'labelOnly';
  layout: 'inline' | 'stacked';
};
```

This should be derived once from raw TDF/runtime settings. The segment composer should consume `FeedbackDisplayPolicy`, not raw booleans and mixed string-or-boolean values.

In practice the pipeline should be:

```text
answer evaluation
  -> FeedbackSemanticState
  -> FeedbackDisplayPolicy
  -> segment composer applies configuration
  -> ordered FeedbackSegment[]
  -> html/plain-text projections
  -> ui + speech + history
```

Then runtime settings become inclusion rules over segments:

```text
always include outcome label

if answer blank:
  include userAnswerBlank
else if show user answer:
  include userAnswerText

if close-enough match:
  include correctLabel
  include closeEnoughExplanation

if phonetic match:
  include correctLabel
  include phoneticMatchExplanation
  optionally include correctAnswerText

if incorrect and show correct answer:
  include correctAnswerText

if incorrect and correct answer is image:
  include incorrectLabel
  include correctAnswerImageIntro
  include correctAnswerImage

if branching response supplies authored message:
  include branchMatchMessage
```

At that point, `singleLineFeedback` becomes a pure join strategy:

```text
selected segments
  -> inline join or stacked join
  -> final display
```

## Canonical Segment Ordering

The segment model should define one default output order. Without this, each callsite will reintroduce local ordering decisions and the design will drift.

Recommended order:

| Order | Segment family | Notes |
| --- | --- | --- |
| 1 | outcome label | `correctLabel` or `incorrectLabel` |
| 2 | user-response fact | `userAnswerText` or `userAnswerBlank` |
| 3 | explanation | `closeEnoughExplanation`, `phoneticMatchExplanation`, `timeoutExplanation`, `branchMatchMessage` |
| 4 | correct-answer fact | `correctAnswerText` |
| 5 | media intro | `correctAnswerImageIntro` |
| 6 | media payload | `correctAnswerImage` |
| 7 | trailing custom/authored text | `customBranchMessage` |

Exceptions should be rare and explicit. If a new requirement needs a different order, that should become a deliberate policy decision, not an inline array-push change in one component.

## Additional Maintainability Opportunities

This design opens up several useful cleanup opportunities beyond the immediate feedback issue.

### 1. Replace string surgery with typed projections

The current code styles and patches strings after the fact, for example adding `Incorrect.` or replacing label text with bold html. Under the segment model, label styling should happen in the renderer projection from semantic segment keys, not by regex against message text.

That removes a fragile class of bugs where authored text accidentally contains words like `Correct.` or `Incorrect.`.

### 2. Make UI, speech, and history true projections of the same source

If `FeedbackSegment[]` is canonical, then:

- UI can render html
- speech can render plain text
- history can store the canonical plain-text projection

That is a major maintainability improvement because new feedback cases no longer need three separate implementations.

### 3. Add targeted tests at the right seams

The new architecture suggests a much better test shape:

- evaluator tests: input answer -> `FeedbackSemanticState`
- composer tests: semantic state + policy -> ordered segment keys
- renderer tests: segment keys -> html/plain text

That is cleaner than snapshotting long combined strings from end to end.

### 4. Make unsupported settings easier to delete

Once segment composition is explicit, it becomes much easier to prove whether a TDF field still changes behavior. If a field does not affect semantic-state creation, policy normalization, segment selection, or projection, it can be removed confidently from runtime and schema.

### 5. Store structured feedback in history if needed later

The immediate plan should keep persisted history feedback plain-text only. The segment model does not require changing history storage format right now.

If the runtime later needs richer analytics or replay, this architecture would make a future structured history format possible:

```ts
type LoggedFeedback = {
  text: string;
  segments: FeedbackSegmentKey[];
  semanticStateReason: FeedbackSemanticState['reason'];
};
```

That would help later auditing, analytics, or replay features without reparsing user-facing text.

## Structured Feedback Versus Plain Text

Plain text feedback is only the final rendered sentence sequence, for example:

```text
Incorrect. Your answer was blank. Correct answer: mitochondria.
```

Structured feedback keeps the parts and their meaning, for example:

```ts
{
  semanticState: {
    outcome: 'incorrect',
    reason: 'blank',
    userResponse: { kind: 'blank' },
    correctAnswer: { kind: 'text', value: 'mitochondria' },
  },
  policy: {
    showUserAnswerOn: 'incorrect',
    showCorrectAnswerOnIncorrect: true,
    mode: 'full',
    layout: 'inline',
  },
  segments: [
    { key: 'incorrectLabel', text: 'Incorrect.' },
    { key: 'userAnswerBlank', text: 'Your answer was blank.' },
    { key: 'correctAnswerText', text: 'Correct answer: mitochondria.' },
  ],
  text: 'Incorrect. Your answer was blank. Correct answer: mitochondria.'
}
```

So yes: the structured version is the feedback object marked in terms of its parts and meanings, not just the final flattened sentence.

The important differences are:

- plain text is only the final projection for humans
- structured feedback preserves semantic meaning and segment boundaries
- structured feedback can be re-rendered for UI, speech, history, analytics, or replay without reparsing prose
- plain text cannot reliably tell us which parts were intentionally present versus coincidentally phrased into one sentence

For the immediate cleanup, history should remain plain text. The structured form matters only as an internal runtime representation for evaluation and segment selection. It is not a requirement to persist structured feedback now.

## Current Persistence Decision

For this cleanup, persist plain-text feedback only.

That means:

- the runtime may use semantic state and segments internally
- the final history value should remain the canonical plain-text projection
- this plan does not require storing segment arrays or semantic-state objects in history
- any future structured persistence should be treated as a separate follow-up decision, not part of the current cleanup

## Implementation Readiness

This plan is ready to implement as a staged refactor, not as a one-shot rewrite.

What is now sufficiently specified:

- the semantic-state-first architecture
- the normalized display-policy boundary
- the first-pass segment inventory
- the canonical segment order
- the plain-text-only persistence decision
- the rule that runtime and schema removals must happen together

What should be documented during implementation:

- which current feedback-related TDF fields remain supported
- which fields change meaning under the segment model
- which fields are removed entirely
- which runtime callsites still consume legacy `matchText` strings during transition

The implementation should proceed in narrow slices with schema and docs updates included in the same changeset when behavior or supported fields change.

## TDF Schema Change Documentation

Yes. Feedback-related TDF changes should be documented explicitly as part of this work.

The rule for this cleanup should be:

1. If a runtime behavior changes but the field remains supported, document the new behavior in this plan and in any user-facing or developer-facing docs that describe the field.
2. If a field is removed from runtime code, remove it from the field registry and generated TDF schema in the same change.
3. When a field is removed or redefined, add a short migration note describing what authors should use instead, if anything.
4. Do not leave schema-visible feedback fields undocumented after their runtime meaning changes.

For implementation tracking, this plan should serve as the working design doc, but each field-level change should also be reflected in the actual schema-owning surfaces:

- `mofacts/common/fieldRegistrySections.ts`
- `mofacts/public/tdfSchema.json`
- any wiki or repo docs that describe feedback settings

## Feedback Field Change Inventory

Before or during implementation, keep a small field-by-field inventory in this plan or the implementation PR notes.

Recommended columns:

| Field | Current role | Future role | Action | Doc update needed |
| --- | --- | --- | --- | --- |
| `displayUserAnswerInFeedback` | segment eligibility control | likely retained | keep or normalize | yes |
| `displayCorrectAnswerInIncorrectFeedback` | segment eligibility control | likely retained | keep or normalize | yes |
| `onlyShowSimpleFeedback` | suppresses non-label content | may collapse into `mode: 'labelOnly'` | review/remove | yes |
| `singleLineFeedback` | join mode over visible parts | pure layout join mode | keep or remove | yes |

If more feedback-related fields turn up during implementation, add them to the same inventory rather than handling them ad hoc.

## Mapping Current Behavior To Segments

This is the likely mapping from current cases to the proposed segment model.

### Exact correct answer

```text
correctLabel
```

### Close-enough correct answer

```text
correctLabel
closeEnoughExplanation
correctAnswerText
```

Open question:

- Whether `correctAnswerText` should be mandatory here or whether the explanation segment should carry the answer value itself.

### Phonetic-match correct answer

```text
correctLabel
phoneticMatchExplanation
correctAnswerText
```

### Incorrect with entered response

```text
incorrectLabel
optional userAnswerText
optional correctAnswerText
```

### Incorrect with blank response

```text
incorrectLabel
userAnswerBlank
correctAnswerText
```

This is more explicit than the current sentence `The correct answer is X.` and preserves the fact that the learner gave no response.

### Incorrect with correct-answer image

```text
incorrectLabel
correctAnswerImageIntro
correctAnswerImage
```

### Branching answer match

```text
correctLabel or incorrectLabel
branchMatchMessage
optional correctAnswerText
```

Open question:

- Whether authored branch messages should be treated as one opaque custom segment or gradually decomposed into standard segment types.

## Likely Setting Simplification Under A Segment Model

A segment model suggests that several current settings may collapse into simpler policy knobs.

Current settings:

- `displayUserAnswerInFeedback`
- `displayCorrectAnswerInIncorrectFeedback`
- `onlyShowSimpleFeedback`
- `singleLineFeedback`

Possible future interpretation:

- `displayUserAnswerInFeedback` controls whether `userAnswerText` is eligible.
- `displayCorrectAnswerInIncorrectFeedback` controls whether `correctAnswerText` is eligible on incorrect outcomes.
- `onlyShowSimpleFeedback` may become unnecessary if it just means `outcome-label-only`.
- `singleLineFeedback` becomes a pure layout join mode over selected segments.

## Immediate Design Recommendation

Treat these as the minimum recommended first-class segments for implementation:

1. `correctLabel`
2. `incorrectLabel`
3. `userAnswerText`
4. `userAnswerBlank`
5. `correctAnswerText`
6. `correctAnswerImageIntro`
7. `correctAnswerImage`
8. `closeEnoughExplanation`
9. `phoneticMatchExplanation`
10. `branchMatchMessage`
11. `customBranchMessage`

That set is probably enough to replace the current mixed model without prematurely over-designing the segment taxonomy.

## Redundancy To Remove

### 1. Reconstructed logging feedback

Problem:

- The system can display one feedback result and log a separately reconstructed result.
- That can hide missing canonical feedback and create UI/history drift.

Target:

- History logging should use the canonical displayed feedback text already stored for TTS.

### 2. Runtime settings with weak or nearly inert effect

Problem:

- Some settings are still wired through the runtime but have little meaningful effect in the current flow.
- `singleLineFeedback` is the clearest example.

Target:

- Remove settings whose current runtime behavior is negligible or misleading.

### 3. Schema/runtime drift

Problem:

- A field can remain in the registry and generated schema even after the runtime meaning is removed or effectively lost.

Target:

- Remove field registry entries and regenerate schema in the same change as any runtime removal.

## Removal Rule For TDF Fields

If a feedback-related field is removed from runtime code, the same change must also:

1. Remove it from `mofacts/common/fieldRegistrySections.ts`.
2. Regenerate `mofacts/public/tdfSchema.json`.
3. Remove any dependent type or UI references.
4. Remove or update docs that still describe the field.

There should not be a period where a field remains authorable in the TDF schema but no longer affects the current runtime.

## Candidate Simplifications

These are ordered from lowest product risk to higher product risk.

### Candidate A: Remove history-time feedback reconstruction

Change:

- Delete the secondary feedback-text builder path used for history reconstruction.
- Use canonical displayed feedback text for history records.

Expected effect:

- No intended learner-visible change.
- History becomes aligned with the displayed result.
- Missing canonical feedback becomes an explicit error instead of a silent fallback.

### Candidate B: Remove `singleLineFeedback`

Change:

- Remove the field from runtime code, field registry, and generated schema.

Expected effect:

- Only rare multi-segment feedback layouts change.
- Most current lessons should show no visible difference.

Open question:

- Is there any authored content that intentionally depends on inline versus stacked user-answer/correct-answer packaging?

### Candidate C: Collapse duplicate correct-answer display decisions

Change:

- Choose exactly one source of correct-answer display for incorrect outcomes:
  - either embed it in the evaluator message
  - or append it in the renderer

Expected effect:

- Simpler reasoning about incorrect feedback.
- Potential product-visible change depending on which source becomes canonical.

### Candidate D: Remove simple-feedback replacement mode

Change:

- Remove `onlyShowSimpleFeedback` if it is no longer needed.

Expected effect:

- Real learner-visible behavior change where that option is currently used.

## Proposed Phased Plan

### Phase 1: Canonicalize persistence

1. Make history logging consume canonical displayed feedback text only.
2. Remove reconstruction fallbacks from the logging path.
3. Add invariant checks for missing canonical feedback text before history write.

### Phase 2: Audit weak feedback settings

1. Inventory all runtime references for:
   - `singleLineFeedback`
   - `displayUserAnswerInFeedback`
   - `displayCorrectAnswerInIncorrectFeedback`
   - `onlyShowSimpleFeedback`
2. For each field, decide whether it still has meaningful product behavior.
3. Remove fields that do not.
4. Remove registry and schema entries in the same change.

### Phase 3: Collapse duplicate content assembly

1. Decide whether the evaluator or renderer owns correct-answer wording.
2. Reduce the renderer to packaging-only logic when possible.
3. Keep one canonical incorrect-feedback structure.

## Evaluation Questions For Follow-Up

- Should incorrect feedback remain evaluator-owned text, or should it be decomposed into structured parts before rendering?
- Is `displayCorrectAnswerInIncorrectFeedback` still a product requirement, given that incorrect evaluator messages already often include the correct answer?
- Is `onlyShowSimpleFeedback` actively used in supported authored content?
- Is there any real content that depends on `singleLineFeedback` today?
- Do history consumers need plain text specifically, or can they store canonical displayed html plus a derived plain-text projection?

## Expected End State

The feedback pipeline should end up with one semantic source, one display route, one speech route, and one persistence route.

```text
semantic feedback selection
  -> canonical displayed feedback
  -> canonical displayed feedback text
  -> speech + history
```

At that point, feedback-related TDF fields should exactly match the settings that still affect that runtime. Unsupported or negligible fields should be removed from both runtime code and schema.