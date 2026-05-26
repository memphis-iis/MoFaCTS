# Feedback Pipeline Cleanup Plan

## Goal

This is a staged feedback-pipeline refactor with some follow-on removals, not a cosmetic cleanup.

The goal is to make feedback generation, rendering, speech, and history logging flow through one canonical route.

The system should decide feedback content once, display that exact result, speak that exact result, and persist that exact result. It should not reconstruct a second version for logging, and it should not preserve TDF fields that current runtime code does not execute.

The work splits into three linked parts:

1. Canonicalize the feedback text that reaches TTS and history.
2. Separate semantic evaluation from display composition.
3. Remove runtime and schema settings that no longer affect current behavior.

This plan is intentionally incomplete. Its purpose is to make the current branching network explicit, identify low-risk simplifications, and define the rules for follow-up removals.

## Governing Rules

- Silent fallbacks are not allowed.
- If canonical feedback data is required and missing, fail clearly.
- If a feedback field is removed from runtime code, remove it from the field registry and generated TDF schema in the same change.
- Do not keep schema-visible feedback settings that no longer affect current runtime behavior.
- Do not preserve parallel legacy and Svelte feedback routes unless there is an explicit current product need.

## Completed Core Route

For live learner-visible feedback, the implemented canonical route is:

```text
answer evaluation
  -> Answers.answerIsCorrect(...)
  -> { isCorrect, matchText }
  -> card machine context.feedbackMessage
  -> FeedbackDisplay.buildFeedbackContent(...)
  -> { feedbackText, feedbackHtml }
  -> feedbackcontent event
  -> card machine context.feedbackText
  -> TTS + history logging
```

This means the current canonical semantic source is `feedbackMessage`, and the current canonical saved text is `feedbackText` produced directly by the composer and carried through the machine context.

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
  else:
    matchText = "Incorrect."
    isCorrect = false
```

That route determines the main feedback content.

### Display assembly after semantic selection

```text
message = feedbackMessage

if correct-answer image case:
  message = "Incorrect. The correct response is displayed below."

showUserAnswer = displayUserAnswerInFeedback matches outcome
style any Correct./Incorrect. labels already present in message

if timeout and message lacks Incorrect. label:
  prepend Incorrect.

segments = []

if showUserAnswer and user answer text exists and not image case:
  segments.push("Your answer was ...")

if message exists:
  segments.push(message)

if incorrect and displayCorrectAnswerInIncorrectFeedback and correct answer text exists and not image case:
  segments.push("The correct answer is ...")

join segments with:
  " " if feedbackLayout = "inline"
  "<br>" if feedbackLayout = "stacked"

if correct-answer image case:
  append image on a new line
```

### Secondary history path

The secondary history path is now aligned with the canonical route.

```text
explicit feedback content
  -> machine context.feedbackText
  -> history logging
```

There is no remaining `CardStore.feedbackTtsText` bridge in the runtime path.

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

- `Your answer was ...`
- main feedback message
- `The correct answer is ...`
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
  - Text form: `Your answer was {value}.`
  - Used when the runtime wants the learner's entered answer echoed back.
- `userAnswerBlank`
  - Text form: `Your answer was blank.`
  - Better atomic form of the current blank-answer case.

The blank-answer segment should not be encoded indirectly by omitting `userAnswerText` and embedding the blank fact into another sentence.

#### Correct-answer segments

- `correctAnswerText`
  - Text form: `The correct answer is {value}.`
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
  -> separate plain-text and HTML outputs
  -> ui + speech + history
```

The composer should return both outputs separately, with plain text as the canonical saved value and HTML as the display projection.
The display layer should not derive or write the canonical saved text.
The feedback display component should emit the explicit feedback content object upward, and the container should own any transport or handoff write.

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

Recommended current order:

| Order | Segment family | Notes |
| --- | --- | --- |
| 1 | user-response fact | `userAnswerText` or `userAnswerBlank`, when enabled |
| 2 | outcome label and explanation | `correctLabel`, `incorrectLabel`, `closeEnoughExplanation`, `phoneticMatchExplanation`, `timeoutExplanation`, `branchMatchMessage` |
| 4 | correct-answer fact | `correctAnswerText` |
| 5 | media intro | `correctAnswerImageIntro` |
| 6 | media payload | `correctAnswerImage` |
| 7 | trailing custom/authored text | `customBranchMessage` |

This intentionally preserves the current learner-facing shape where an echoed learner response can precede the outcome message, for example `Your answer was Lyon. Incorrect.` Exceptions should be rare and explicit. If a new requirement needs a different order, that should become a deliberate policy decision, not an inline array-push change in one component.

## Additional Maintainability Opportunities

This design opens up several useful cleanup opportunities beyond the immediate feedback issue.

### 1. Replace string surgery with typed projections

The current code styles and patches strings after the fact, for example adding `Incorrect.` or replacing label text with bold html. Under the segment model, label styling should happen in the renderer projection from semantic segment keys, not by regex against message text.

That removes a fragile class of bugs where authored text accidentally contains words like `Correct.` or `Incorrect.`.

### 2. Make UI, speech, and history true projections of the same source

If `FeedbackSegment[]` is canonical, then:

- the composer can emit plain text and HTML separately from the same segments
- UI can render HTML
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
Incorrect. Your answer was blank. The correct answer is mitochondria.
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
    { key: 'correctAnswerText', text: 'The correct answer is mitochondria.' },
  ],
  text: 'Incorrect. Your answer was blank. The correct answer is mitochondria.'
}
```

So yes: the structured version is the feedback object marked in terms of its parts and meanings, not just the final flattened sentence.

The important differences are:

- plain text is only the final projection for humans
- structured feedback preserves semantic meaning and segment boundaries
- structured feedback can be projected to UI HTML and plain text without reparsing prose
- plain text cannot reliably tell us which parts were intentionally present versus coincidentally phrased into one sentence

For the immediate cleanup, history should remain plain text. The structured form matters only as an internal runtime representation for evaluation and segment selection. It is not a requirement to persist structured feedback now.

## Current Persistence Decision

For this cleanup, persist plain-text feedback only.

That means:

- the runtime may use semantic state and segments internally
- the composer should produce the canonical plain-text feedback directly
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

The full field-by-field policy is now maintained in the next section. It covers the original four feedback UI fields plus related display, timing, evaluation, speech, and history metadata settings that affect feedback behavior.

During implementation, keep that policy table current rather than handling fields ad hoc in PR notes.

## Full-Stack Feedback Settings Policy

This cleanup should treat feedback-related settings as one product surface, even though they currently live in multiple places:

- `setspec.uiSettings`: feedback display composition and visual presentation.
- `deliveryparams`: feedback timing, force-correct flow, evaluation modes that affect feedback semantics, and legacy history metadata.
- `setspec`: speech/audio settings that determine whether the canonical feedback text is spoken and how speech-related feedback behaves.

The policy below is the working decision table for Phase 3. "Remove" means remove runtime references, field registry/schema entries, tests, and docs in the same change.

### UI Settings Policy

| Field | Current role | Policy decision | Implementation action |
| --- | --- | --- | --- |
| `displayCorrectFeedback` | Suppresses rendering for correct feedback. | Keep and fix semantics under canonical content. | Keep the existing name for now. If false, correct feedback means no learner-visible feedback output: no rendered feedback, no feedback TTS, and no required canonical feedback-content handoff for that feedback display. Correctness evaluation and history outcome still happen. |
| `displayIncorrectFeedback` | Suppresses rendering for incorrect feedback. | Keep and fix semantics under canonical content. | Keep the existing name for now. If false, incorrect feedback means no learner-visible feedback output: no rendered feedback, no feedback TTS, and no required canonical feedback-content handoff for that feedback display. Preserve force-correct behavior separately from visual feedback suppression. |
| `correctMessage` | Legacy custom correct text. Currently mostly bypassed because evaluator `matchText` is canonical. | Remove and replace with the fixed concept. | Remove from runtime, types, registry, schema, tester UI, and tests. Use `correctLabelText` for the correct outcome-label segment. Do not alias `correctMessage` at runtime. |
| `incorrectMessage` | Legacy custom incorrect text/timeouts. Currently mostly bypassed by evaluator-generated incorrect text. | Remove and replace with the fixed concept. | Remove from runtime, types, registry, schema, tester UI, and tests. Use `incorrectLabelText` for the incorrect outcome-label segment. Do not alias `incorrectMessage` at runtime. |
| `correctColor` | Visual styling for correct feedback. | Keep as-is. | Keep in runtime/schema. It is presentation-only and does not affect canonical text. |
| `incorrectColor` | Visual styling for incorrect/timeout feedback. | Keep as-is. | Keep in runtime/schema. It is presentation-only and does not affect canonical text. |
| `displayUserAnswerInFeedback` | Controls whether the learner answer segment is included. | Keep but fix/normalize. | Keep the public field name for compatibility. Normalize internally to `FeedbackDisplayPolicy.showUserAnswerOn: 'never' | 'correct' | 'incorrect' | 'always'` instead of passing booleans around. Update docs to describe segment inclusion. |
| `displayCorrectAnswerInIncorrectFeedback` | Adds a separate correct-answer segment after incorrect feedback. | Keep as the single correct-answer-output control. | Keep the public field name for compatibility. Normalize internally to `showCorrectAnswerOnIncorrect`. There should be one policy decision for whether the correct-answer output is included; the composer should own how that output is represented so the answer is not emitted redundantly. |
| `singleLineFeedback` | Chooses inline versus stacked segment layout. | Remove and replace with `feedbackLayout`. | Remove from runtime, types, registry, schema, tester UI, and tests. Use `feedbackLayout: 'inline' | 'stacked'`. Do not alias `singleLineFeedback` at runtime. Layout must not alter canonical plain text. |
| `onlyShowSimpleFeedback` | Replaces full feedback with only `Correct.`/`Incorrect.`. | Remove. | Replace behavior by segment policy: optional explanatory/display segments can be disabled without a separate replacement mode. Remove from runtime, `UiSettings`, field registry, generated schema, tester UI, and tests. Add migration note: use the remaining display controls to suppress user/correct-answer segments; authored evaluator explanations remain canonical unless a future segment policy explicitly disables them. |

### Delivery Parameter Policy

| Field | Current role | Policy decision | Implementation action |
| --- | --- | --- | --- |
| `correctprompt` | Correct-feedback display duration in milliseconds. | Keep as-is. | Keep as feedback timing. Name is legacy but broadly wired; do not rename during this cleanup. |
| `reviewstudy` | Incorrect-review/feedback display duration in milliseconds. | Keep as-is. | Keep as feedback timing. Name is legacy but broadly wired; do not rename during this cleanup. |
| `forceCorrection` | Requires force-correct entry after incorrect feedback. | Keep as-is. | Keep as flow control, not feedback composition. Ensure it remains independent of `displayIncorrectFeedback`. |
| `forcecorrectprompt` | Prompt displayed in force-correct state. | Remove and replace with correctly cased `forceCorrectPrompt`. | Remove the lowercase field name from registry/schema/runtime. Use `forceCorrectPrompt` as the only authored delivery parameter, and preserve authored string casing when displaying it. |
| `forcecorrecttimeout` | Timeout for force-correct state. | Keep as-is. | Keep as flow timing. |
| `branchingEnabled` | Enables branched answer parsing and authored branch messages. | Keep as-is. | Keep as evaluation/semantic-feedback control. Under structured feedback, branch message becomes an additive `branchMatchMessage` segment. |
| `allowPhoneticMatching` | Enables phonetic match, which changes correctness and feedback explanation. | Keep as-is. | Keep as evaluation control. Structured semantic state should represent `reason: 'phonetic'`. |
| `checkOtherAnswers` | Prevents accepting near-matches that equal another item's answer. | Keep as-is. | Keep as evaluation control. It affects correctness and therefore feedback semantics, but is not a display setting. |
| `feedbackType` | Legacy feedback classification copied to history. | Keep as the single future feedback-type field, deprecated for current rendering behavior. | Keep temporarily as deprecated metadata. It must not control rendering in the current cleanup. Future feedback types should be modeled here, with `none`, `basic`, `full`, or custom modes as values of this one policy field. |
| `allowFeedbackTypeSelect` | Legacy resume/display-feedback mode hook. | Remove. | Remove from delivery registry/schema/runtime. It is redundant with the future `feedbackType` model and should not remain as a second feedback-type switch. |
| `drill` | Main answer timeout, can lead to timeout feedback. | Keep as-is. | Not a feedback setting. Keep out of feedback composition removals. |
| `purestudy` | Study-trial duration and study feedback-like display timing. | Keep as-is. | Not part of drill feedback composition. Keep out of this cleanup. |

### Speech And Feedback Audio Policy

These settings are adjacent to feedback, but they do not compose feedback text. They decide whether feedback can be spoken, how speech sounds, or what speech-status message is shown.

| Field | Authored/accessed as | Current role | Policy decision | Implementation action |
| --- | --- | --- | --- | --- |
| `enableAudioPromptAndFeedback` | Authored in `setspec`; copied into `Session` as the lesson TTS capability gate. | Lesson-level TTS capability gate. | Keep for now. | Keep because TTS currently requires both learner/user mode and lesson support. Document as capability gating, not feedback content or display behavior. |
| `audioPromptMode` | Authored in `setspec`, can be overridden by learner config, and also exists in user audio settings/profile. Runtime computes an effective prompt mode from those sources. | Learner TTS mode: `silent`, `question`, `feedback`, or `all`. | Keep as-is. | Keep. It determines whether canonical feedback text is spoken when lesson support allows it; it does not alter the feedback text. |
| `audioPromptFeedbackVoice` | Authored in `setspec` and also stored in user audio settings/profile. Runtime generally uses the effective user/audio setting, with TDF values as lesson defaults or overrides. | Feedback TTS voice. | Keep as-is. | Keep as feedback speech presentation. Not part of feedback composition. |
| `audioPromptFeedbackSpeakingRate` | Authored in `setspec` and also stored in user audio settings/profile. Runtime generally uses the effective user/audio setting, with TDF values as lesson defaults or overrides. | Feedback TTS rate. | Keep as-is. | Keep as feedback speech presentation. Not part of feedback composition. |
| `audioPromptFeedbackVolume` | Authored in `setspec` and also stored in user audio settings/profile. Runtime generally uses the effective user/audio setting, with TDF values as lesson defaults or overrides. | Feedback TTS volume. | Keep as-is. | Keep as feedback speech presentation. Not part of feedback composition. |
| `audioPromptVoice` | Authored in `setspec` and also stored in user audio settings/profile. Runtime uses it for question/default TTS and may use it as a fallback. | Question/default TTS voice. | Keep as-is. | Not feedback-specific except as fallback. Keep out of feedback composition cleanup. |
| `audioPromptSpeakingRate` | Authored in `setspec` and present in audio state as a legacy/shared speech rate. | Legacy overall speaking rate. | Audit/fix. | If feedback-specific and question-specific rates supersede it, mark deprecated or remove in a separate audio-settings cleanup. Do not remove as part of feedback display cleanup without checking fallback behavior. |
| `speechIgnoreOutOfGrammarResponses` | Authored in `setspec`; copied into `Session` for speech-recognition handling. | Controls ignored speech transcripts. | Keep as speech-input behavior. | Not part of feedback composition. Keep. |
| `speechOutOfGrammarFeedback` | Authored in `setspec`; copied into `Session` for speech-recognition handling. | Message shown when ignored speech input is discarded. | Keep but classify as speech-status feedback, not answer feedback composition. | Audit whether this bypasses the canonical feedback composer. If it displays learner-visible feedback, route it as a speech-status message or document it as separate from answer feedback. |

### Immediate Phase 3 Action Order

1. Remove `onlyShowSimpleFeedback` from runtime, types, schema, tester UI, and tests.
2. Normalize `displayUserAnswerInFeedback`, `displayCorrectAnswerInIncorrectFeedback`, and `feedbackLayout` into `FeedbackDisplayPolicy` at the component boundary, with `singleLineFeedback` removed rather than aliased.
3. Replace `correctMessage` and `incorrectMessage` with `correctLabelText` and `incorrectLabelText`, with the old field names removed rather than aliased.
4. Fix `displayCorrectFeedback` and `displayIncorrectFeedback` so hidden feedback means no learner-visible feedback output and no missing-content handoff error.
5. Keep `feedbackType` as deprecated metadata/future policy field, remove `allowFeedbackTypeSelect`, and document the future one-setting feedback-type model.
6. Replace `forcecorrectprompt` with `forceCorrectPrompt` and preserve authored prompt-text casing.

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

- Resolved: preserve the current elegant phrasing by letting the explanation carry the answer value in a logical sentence, rather than always appending a separate correct-answer segment.

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
optional correctAnswerText
```

Decision:

- Keep the incorrect outcome and correct-answer output as separate composed parts. Blank incorrect responses should not automatically say the correct answer. The correct answer is shown only when `displayCorrectAnswerInIncorrectFeedback` enables the `correctAnswerText` segment.

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

- Resolved: keep the current behavior. Start with the ordinary composed feedback pieces and append the authored branching message at the end. Branching feedback is an additive authored message, not an alternative replacement pipeline.

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
- `onlyShowSimpleFeedback` is likely unnecessary after the policy model exists; simple feedback can be represented by turning off optional explanatory/display segments instead of keeping a separate replacement mode.
- `singleLineFeedback` becomes a pure layout join mode over selected segments.

Incorrect evaluator output should not embed the correct answer by default. The correct answer belongs to the optional `correctAnswerText` segment so the setting has one clear responsibility and cannot duplicate content.

Image-answer behavior is not part of the immediate next implementation slice. Preserve the current image-answer behavior while refactoring non-image text feedback.

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
- `onlyShowSimpleFeedback` is the clearest example because it duplicates behavior that should be represented by segment policy.

Target:

- Remove settings whose current runtime behavior is negligible or misleading.
- Replace unclear legacy names with explicit policy fields where behavior remains useful.

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

These are roughly ordered from lowest product risk to higher product risk. They are not the implementation sequence; the phased plan below is the dependency order.

### Candidate A: Remove history-time feedback reconstruction

Change:

- Delete the secondary feedback-text builder path used for history reconstruction.
- Use canonical displayed feedback text for history records.

Status:

- Completed.

Expected effect:

- No intended learner-visible change.
- History becomes aligned with the displayed result.
- Missing canonical feedback becomes an explicit error instead of a silent fallback.

### Candidate B: Replace `singleLineFeedback`

Change:

- Replace `singleLineFeedback` with `feedbackLayout: 'inline' | 'stacked'`.
- Remove `singleLineFeedback` from runtime and generated schema; use `feedbackLayout` as the only layout setting.

Expected effect:

- No intended visible change for authored content that used the old boolean.
- The policy name now describes layout rather than implying text mutation.

Status:

- Completed.

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

Status:

- Completed. The field is deprecated/removed from schema-visible UI settings and no longer participates in runtime feedback composition.

## Proposed Phased Plan

### Phase 1: Canonicalize persistence

1. Make history logging consume canonical displayed feedback text only.
2. Remove reconstruction fallbacks from the logging path.
3. Add invariant checks for missing canonical feedback text before history write.

Status: completed.

### Phase 2: Refactor feedback message creation

1. Make the evaluator-to-display boundary explicit.
2. Compose feedback from semantic state plus segment selection instead of opaque sentence surgery.
3. Keep display policy as a separate layer that only decides inclusion and layout.

Status: completed for the current non-image text-feedback slice.

Completed so far:

1. Feedback content is composed once into explicit plain-text and HTML outputs.
2. The canonical plain-text output is produced by the composer and excludes HTML tags.
3. `FeedbackDisplay` emits explicit feedback content upward instead of writing canonical text itself.
4. `CardScreen` forwards that content to the machine as `FEEDBACK_CONTENT`.
5. The machine stores canonical `feedbackText` in context and uses it for TTS.
6. History logging reads the same canonical `feedbackText` from the machine flow.
7. The old `CardStore.feedbackTtsText` transport bridge was removed.
8. The composer now has explicit `FeedbackDisplayPolicy`, `FeedbackSemanticState`, ordered segment composition, and separate text/HTML projections.
9. The feedback state waits for both feedback reveal and canonical feedback content before entering TTS or feedback waiting.

Remaining follow-up after this slice:

1. Move semantic-state creation upstream into the evaluator so it no longer has to be inferred from today's `matchText` strings.
2. Represent authored branching feedback explicitly as an additive branch-message segment.
3. Extend the same typed path to image-answer behavior after the non-image path is stable.
4. Expand tests around evaluator output and branch-message ordering once the evaluator returns structured semantic data.

### Phase 3: Audit weak feedback settings

1. Inventory all runtime references for:
   - `singleLineFeedback`
   - `displayUserAnswerInFeedback`
   - `displayCorrectAnswerInIncorrectFeedback`
   - `onlyShowSimpleFeedback`
2. Use the explicit message-composition boundary to decide whether each field still has meaningful product behavior.
3. Remove fields that do not.
4. Remove registry and schema entries in the same change.

Status: in progress.

The non-image text-feedback path is now explicit enough to start this audit. If a field is removed, remove its runtime references, `mofacts/common/fieldRegistrySections.ts` entry, generated `mofacts/public/tdfSchema.json` entry, tests, and docs in the same change.

Completed in this phase:

1. Removed `onlyShowSimpleFeedback` from runtime composition and generated schema.
2. Added `feedbackLayout: 'inline' | 'stacked'` and removed `singleLineFeedback` from runtime/types/registry/schema/tester UI.
3. Added `correctLabelText` and `incorrectLabelText` and removed `correctMessage` / `incorrectMessage` from runtime/types/registry/schema/tester UI.
4. Changed hidden feedback handoff so suppressed feedback does not require non-empty canonical feedback content.
5. Kept `feedbackType` as an inert deprecated placeholder/future policy field and removed `allowFeedbackTypeSelect`.
6. Replaced `forcecorrectprompt` with `forceCorrectPrompt` and preserved authored prompt-text casing.

Remaining in this phase:

1. Decide whether the inert `feedbackType` placeholder should continue to be emitted to history/export records or be left empty until a real product meaning exists.

## Practical Completion Status

The core feedback-text transport cleanup is implemented for ordinary drill feedback:

- feedback content is composed once into explicit text and HTML
- the machine stores the canonical plain-text feedback
- TTS and history read that same machine-context text
- removed feedback settings are out of the runtime/schema path
- `feedbackLayout`, `correctLabelText`, `incorrectLabelText`, and `forceCorrectPrompt` are the current supported names
- force-correct now waits until ordinary feedback has been revealed, canonical feedback content has reached the machine, and feedback display/TTS handling has completed before showing the correction prompt

Known loose ends before calling the broader cleanup fully complete:

1. Semantic state is still inferred from evaluator `matchText` in the composer. This is acceptable for the current slice, but the next cleanup should move structured semantic-state creation into answer evaluation.
2. Branching feedback is still an opaque evaluator message rather than an explicit additive `branchMatchMessage` segment.
3. Image-answer feedback works through the composer, but it has not received the same semantic-state/test coverage as the non-image text path.
4. The broader `deliverySettings` consolidation is a separate compatibility track. Keep it coordinated with this plan, but do not treat it as part of the feedback pipeline itself.

### Phase 4: Collapse duplicate content assembly

1. Move the remaining semantic-state construction upstream into the evaluator.
2. Represent close-enough, phonetic, timeout, generic incorrect, branching, and image-answer cases as structured semantic states instead of inferring them from `matchText`.
3. Keep correct-answer output owned by the composer for generic incorrect text feedback, while preserving current close-enough/phonetic wording that already embeds the answer in the explanation.
4. Keep one canonical incorrect-feedback structure.

Status: follow-up, only if phase 3 leaves meaningful duplication to remove.

This order matters: the settings audit should happen after message creation is explicit, because that is when the remaining TDF fields become transparent rather than inferred.

## Evaluation Questions For Follow-Up

- Should incorrect feedback remain evaluator-owned text, or should it be decomposed into structured parts before rendering?
- Is `displayCorrectAnswerInIncorrectFeedback` still a product requirement, given that incorrect evaluator messages already often include the correct answer?
- Which optional segment controls should replace `onlyShowSimpleFeedback` when that setting is removed?
- Do any remaining supported lessons still depend on `singleLineFeedback` or `onlyShowSimpleFeedback`?

## Completed Work

The following pieces are done in code and should stay documented as completed:

1. Feedback content is composed once into explicit plain-text and HTML outputs.
2. Canonical feedback text strips HTML tags before it can reach TTS or history.
3. `FeedbackDisplay` emits explicit feedback content upward instead of writing canonical text itself.
4. `CardScreen` forwards that content to the machine as `FEEDBACK_CONTENT`.
5. The machine stores canonical `feedbackText` in context and uses it for TTS.
6. History logging reads the same canonical `feedbackText` from the machine flow.
7. The old `CardStore.feedbackTtsText` transport bridge was removed.
8. History display-order and alternate-display-index sourcing remain on their existing CardStore-backed path; this cleanup only changes feedback-text transport.
9. Non-image feedback composition now flows through display policy, semantic state, ordered segments, and separate plain-text/HTML projections.
10. Feedback TTS/waiting transitions are gated on canonical feedback content arrival.

## Expected End State

The feedback pipeline should end up with one semantic source, one display route, one speech route, and one persistence route.

```text
semantic feedback selection
  -> canonical displayed feedback
  -> canonical displayed feedback text
  -> speech + history
```

At that point, feedback-related TDF fields should exactly match the settings that still affect that runtime. Unsupported or negligible fields should be removed from both runtime code and schema.
