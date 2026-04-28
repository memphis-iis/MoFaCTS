# Study/Drill Display Subsets Plan

## Context

The AdaptiveKeyword Prolific configuration currently uses separate stimulus cluster ranges for general and keyword conditions:

- General training: clusters `0-29`.
- Keyword training: clusters `30-59`.
- Posttest: clusters `0-29`.

The keyword training condition currently repeats the keyword-supported cue during first-session practice, then removes that support during the second-session posttest. This creates a transfer-appropriate processing problem: learners can stay dependent on the keyword cue and are not gradually asked to retrieve from the leaner posttest cue.

The requested app capability is a delivery-param-controlled way to select which fields from a stimulus `display` object are shown for study-only trials versus drill/test trials. Example stimulus:

```json
{
  "display": {
    "imgSrc": "12.jpg",
    "text": "глаз - ",
    "audioSrc": "eye_audio.mp3"
  },
  "response": {
    "correctResponse": "eye"
  }
}
```

For this case, study-only trials could show `imgSrc` and `audioSrc`, while drill trials could show `text` and `audioSrc`.

## Proposed Behavior

Add supported delivery params that whitelist display fields by trial kind:

```json
"deliveryparams": {
  "studyOnlyFields": "imgSrc,audioSrc",
  "drillFields": "text,audioSrc"
}
```

Rules:

- `studyOnlyFields` applies only when the selected card is a study trial (`testType === "s"`).
- `drillFields` applies to response trials (`testType === "d"` or `"t"`) and the review/feedback view that follows those trials.
- Empty or missing params preserve current behavior and show the full resolved display object.
- Field names must match supported display keys: `text`, `clozeText`, `clozeStimulus`, `imgSrc`, `audioSrc`, `videoSrc`, and `attribution`.
- Invalid field names should fail clearly during validation or runtime preparation. No silent fallback.
- Media URL resolution should still happen before rendering, so selected `imgSrc`, `audioSrc`, and `videoSrc` keep the same canonical asset behavior as today.
- Attribution should only remain visible when an image/video field that needs it is also selected, unless explicitly requested otherwise.
- In the AdaptiveKeyword keyword condition, study-only trials should show only image and audio because the image itself contains the keyword/text cue.

## App Implementation Plan

1. Add delivery param registry entries in `mofacts/common/fieldRegistry.ts`.
   - Add string params `studyOnlyFields` and `drillFields`.
   - Add tooltip text and validation guidance for comma-delimited display keys.
   - Include the new keys in the delivery param runtime inventory if required by current normalization.

2. Add display-field parsing and filtering in the experiment runtime.
   - The lowest-risk insertion point is `mofacts/client/views/experiment/unitEngine.ts`, inside `buildPreparedCardQuestionAndAnswerGlobals`, after `currentDisplay` is constructed and after alternate display selection.
   - Also apply the same helper in `mofacts/client/views/experiment/svelte/services/unitEngineService.ts` when it rebuilds card data from a prepared selection, so seamless prepared-advance and resume paths do not re-expand the display.
   - The helper should accept `currentDisplay`, `deliveryParams`, and `testType`, then return a filtered display copy.

3. Preserve answer and feedback behavior.
   - Do not change `correctResponse`, scoring, history logging, or feedback answer generation.
   - Only filter the prompt-side `currentDisplay`.
   - Verify study feedback still shows the answer text as currently designed.

4. Update schema output if generated from registry.
   - Regenerate or update `mofacts/public/tdfSchema.json` through the repo’s existing schema workflow if one is present.

5. Add focused tests.
   - Unit test the parser/filter helper for missing params, valid comma lists, whitespace, invalid keys, study trials, and drill/test trials.
   - Add an integration-style test around prepared card data if the existing Svelte service tests can cover it without heavy fixture work.

6. Run verification.
   - From `mofacts/`, run `npm run typecheck` after TypeScript-bearing app changes.

## AdaptiveKeyword Config Plan

After the app capability exists, update the OneDrive config directory:

`C:\Users\ppavl\OneDrive\Active projects\mofacts_config\AdaptiveKeyword_Prolific 1\AdaptiveKeyword`

Planned edits:

- Add `imgSrc` to keyword-condition stimulus displays in `Allflashcardstims1.json`, probably clusters `30-59`.
- Add first-session delivery params to `Keywordflashcard1.json` through `Keywordflashcard4.json`:

```json
  "studyOnlyFields": "imgSrc,audioSrc",
  "drillFields": "text,audioSrc"
```

- Leave general-condition files unchanged unless the general condition should also use explicit display subsets.
- Confirm posttest cueing is intended to remain `text,audioSrc` and not image-based.

## Open Questions

1. Should the same `drillFields` apply to second-session posttest assessment trials, or should assessment have its own display subset param?
2. Are the image filenames already mapped to clusters `30-59`, or do we need a source table that maps each keyword item to its intended image?
