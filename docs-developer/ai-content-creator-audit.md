# AI Content Creator Audit

Scope note: this audit covers the AI Content Creator authoring flow, including its optional generation of an AutoTutor script artifact. It does not review the AutoTutor runtime dialogue system, which serves authored content using AI but is not itself the content generator under review.

## Findings

No open AI Content Creator audit findings remain in this report. The earlier prompt, bug, efficiency, server-load, maintainability, and testing findings have been addressed or removed after review.

## Overall Assessment

The system is more maintainable and testable than at the start of the audit. Prompt assembly, JSON extraction, validation, draft mapping, OpenRouter calls, OpenRouter profile behavior, and upload retry/cleanup behavior now live in focused modules with tests. The main residual risk is UI-level smoke coverage, which would verify rendered disabled states, result rendering, debug visibility, and the browser prompt flow end to end.

## Fix Priority Roadmap

### Must Fix Before Release

- No remaining must-fix items from this audit.

### Should Fix Soon

- Add UI smoke coverage for the rendered AI Content Creator flow.

### Nice To Improve Later

- Persist richer creation history beyond browser localStorage.
- Add a UI review/edit step before upload.

## LLM Prompt Inventory

### Item Authoring System Prompt

**Location:** `mofacts/client/lib/aiContentOpenRouterClient.ts:27`

```text
You create compact import-ready MoFaCTS authoring JSON. Return JSON only.
```

### Item Authoring User Prompt

**Location:** `mofacts/client/lib/aiContentPrompts.ts:5-52`

These fragments are joined with newlines:

```text
Return compact normalized import-ready JSON, not raw TDF.
Create a shared item pool usable for the selected MoFaCTS modules.
Selected modules: ${selectedModules.join(', ')}
If the user specifies what should be stimulus and response, follow that instruction.
If the user asks for a specific number of items, use that number when the source can support it.
If no item count is specified, aim for about 50 flash-card/practice items for learning sessions and about 20 quiz items for assessment sessions. Use fewer when the source has fewer atomic facts, and more only when the source clearly supports more.
Split the material into atomic knowledge components: each item should practice one discrete fact, concept, distinction, procedure step, vocabulary mapping, or application.
Prefer short typed responses for terms, labels, numbers, and short phrases.
Prefer multiple choice when the correct response is long, ambiguous to type, conceptual, or has plausible misconceptions.
For multiple choice, make incorrect responses plausible student errors or common misconceptions, not jokes or arbitrary wrong answers.
Avoid paragraph free-response answers.
Treat the source content as the user request plus any pasted material. If the user names a coherent educational topic without details, build from ordinary domain knowledge for that topic rather than treating the missing details as empty source.
When pasted source material is specific, prefer that material and do not add unsupported claims that conflict with it.
Do not duplicate items or create near-duplicate prompts that practice the same atomic knowledge component in the same way.
Do not refuse sparse but coherent educational requests; expand from ordinary domain knowledge when the request is a general topic such as the Krebs cycle, multiplication tables, or common vocabulary.
If the source is abusive, sexual, incoherent, or not an educational topic, return an empty items array and explain the issue in creationSummary.
Set visibility to "public" only for general knowledge, original generated wording, public-domain/openly licensed material, or user-provided material that is clearly shareable. Set visibility to "private" when copied source wording, images, audio, or other media may be copyrighted or the license is unclear.
When attribution is warranted for copied or closely adapted licensed/public-domain source material, put attribution on prompt.attribution using creatorName, sourceName, sourceUrl, licenseName, and licenseUrl. Do not add attribution for ordinary general knowledge, arithmetic facts, or dictionary-like facts.
Return JSON only with this shape:
```

Then a JSON example object with lesson metadata, `visibility`, item prompt/response, optional `prompt.attribution`, distractors, and `creationSummary`.

```text
Source content:
```

Then the user-provided source text.

### AutoTutor Artifact Creation System Prompt

**Location:** `mofacts/client/lib/aiContentOpenRouterClient.ts:58`

```text
You create compact import-ready MoFaCTS AutoTutor JSON. Return JSON only.
```

### AutoTutor Artifact Creation User Prompt

**Location:** `mofacts/client/lib/aiContentPrompts.ts:59-113`

These fragments are joined with newlines:

```text
Return compact normalized AutoTutor creation JSON, not raw TDF.
Create one MoFaCTS AutoTutor script from the source content.
Treat the source content as the user request plus any pasted material. If the user names a coherent educational topic without details, build from ordinary domain knowledge for that topic rather than treating the missing details as empty source.
When pasted source material is specific, prefer that material and do not add unsupported claims that conflict with it.
If the user asks for a specific number of expectations, use that number when the source can support it. If no count is specified, aim for about 5 expectations.
Expectations should be atomic teachable propositions: each one should represent one discrete knowledge component the learner should articulate.
Misconceptions should be common student misconceptions or likely confusions for this topic, not arbitrary wrong statements.
Keep IDs simple, stable, and unique, such as E1, E2, M1, M2.
Do not duplicate expectations or create near-duplicate misconceptions.
Do not refuse sparse but coherent educational requests; expand from ordinary domain knowledge when the request is a general educational topic such as the Krebs cycle.
If the source is abusive, sexual, incoherent, or not an educational topic, return an empty expectations array and explain the issue in creationSummary.
Set visibility to "public" only for general knowledge, original generated wording, public-domain/openly licensed material, or user-provided material that is clearly shareable. Set visibility to "private" when copied source wording or media may be copyrighted or the license is unclear.
When attribution is warranted for copied or closely adapted licensed/public-domain source material, put it in attribution using creatorName, sourceName, sourceUrl, licenseName, and licenseUrl. Do not add attribution for ordinary general knowledge, arithmetic facts, or dictionary-like facts.
Return JSON only with this shape:
```

Then a JSON example object with lesson name, opening prompt, topic, learning goal, ideal answer, expectations, misconceptions, limits, `visibility`, optional attribution, summary, and `creationSummary`.

```text
Source content:
```

Then the user-provided source text.

### OpenRouter Profile Test Prompt

**Location:** `mofacts/client/lib/openRouterClientProfile.ts:60`

```text
Reply with exactly: OK
```

## Test And Verification Gaps

Existing relevant tests:

- `mofacts/client/lib/aiContentPrompts.test.ts`
- `mofacts/client/lib/aiContentValidation.test.ts`
- `mofacts/client/lib/aiContentDraftBuilder.test.ts`
- `mofacts/client/lib/aiContentOpenRouterClient.test.ts`
- `mofacts/client/lib/aiContentPackageSave.test.ts`
- `mofacts/client/lib/openRouterClientProfile.test.ts`

Covered behavior:

- Prompt assembly.
- Malformed LLM output.
- Markdown-wrapped JSON.
- Validation rejection.
- Duplicate/unsupported fields.
- Mixed module output mapping.
- Failed upload cleanup.
- Retry/duplicate semantics.
- OpenRouter error handling.
- OpenRouter profile key storage and config-test error classification.

Remaining test gap:

- UI smoke test for disabled states, warnings, successful result rendering, debug copy, retry, and delete from the rendered Blaze template.
