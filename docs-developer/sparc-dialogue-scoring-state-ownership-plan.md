# SPARC Dialogue Scoring State Ownership Plan

## Status

Implemented in the current working tree. The semantic and state-transition decisions are closed below.

Static verification completed on 2026-07-16:

- `npm run typecheck` passed;
- `npm run lint` passed;
- the native hotfix app rebuilt and served the login route without current browser console errors; and
- focused provider and reducer tests were added but were not executed because the Meteor CI suite requires fresh explicit authorization.

Remaining empirical verification:

- authenticated SPARC runtime smoke testing; and
- the saved five-run live Admin Test evaluation with all robustness requirements and at least four graduations.

## Objective

Make the live AI evaluate the learner's accumulated instructional knowledge across the full dialogue through the latest contribution, and make SPARC code compare that fresh cumulative evaluation with prior learner state.

This addresses three observed failures:

- a complete response can omit a represented expectation because the model is also deciding whether that expectation changed; and
- an unrelated response can acquire weak misconception support because the model is also trying to preserve or revise prior misconception state.
- complementary learner statements distributed across turns can each remain below threshold even though the dialogue as a whole demonstrates the expectation.

The implementation must not change the shared continuous rubric, authored propositions, thresholds, production rules, target selection, scaffold progression, completion criteria, or model configuration. A later approved hardening step may tighten universal tutor receipt ownership and misconception non-endorsement wording without changing move selection or pedagogical content.

## Current Problem

Before this correction, the scoring call received the complete role-preserving dialogue but its prompt restricted instructional evidence to the latest learner contribution. SPARC then retained only the strongest supplied coverage. That preserved prior coverage but could not semantically combine complementary learner statements such as “the entire balance,” “5% on 1050,” and “the starting amount goes up.”

The provider must own semantic integration across learner turns. Application code must continue to own comparison with durable prior state, sparse changed-value output, and persistence. Numeric per-turn addition is not a valid substitute because it cannot distinguish complementary meaning from repetition.

## Final Ownership Boundary

```text
full learner trajectory + latest contribution + authored propositions + tutor context
  -> live AI evaluates cumulative learner evidence through the current turn
  -> provider response is parsed and validated as a complete evidence envelope
  -> SPARC scoring code reduces evidence against prior learner state
  -> existing sparse SparcLearnerResponseScoringResult
  -> existing facts, production-rule chaining, target selection, and persistence
```

The live AI decides what the learner has demonstrated across the dialogue and the learner's resolved misconception stance. SPARC code alone decides how that cumulative evidence changes stored state.

## Provider Evidence Contract

### Inputs

The scoring call receives:

- the problem statement;
- dialogue history for reference and stance resolution;
- the latest learner response;
- every authored expectation; and
- every authored misconception.

The authored proposition objects sent to the model contain only their identifier and text. Remove `priorCoverage` and `priorSupportStrength` from the model input. Prior scores remain available to application code and are never part of the AI task.

Dialogue history is instructional evidence only for learner-authored turns. The model may combine distinct complementary learner statements across turns, use later clarification or self-correction to resolve earlier ambiguity or error, and use tutor turns to resolve pronouns, prompts, and the object under discussion. Tutor-authored hints, assertions, corrections, and summaries never count as learner knowledge unless a learner later adopts, explains, applies, or correctly confirms them. Repetition alone must not increase coverage.

### Output shape

Replace the provider-facing sparse score arrays with complete evidence arrays:

```ts
type SparcEvidenceDirection = 'supports' | 'contradicts' | 'unaddressed';

type SparcLearningTargetEvidence = {
  clusterKC: string;
  evidenceDirection: SparcEvidenceDirection;
  evidenceStrength: number;
};

type SparcMisconceptionEvidence = {
  id: string;
  evidenceDirection: SparcEvidenceDirection;
  evidenceStrength: number;
};

type SparcLearnerResponseEvidenceEnvelope = {
  learningTargetEvaluations: SparcLearningTargetEvidence[];
  diagnosticMisconceptionEvaluations: SparcMisconceptionEvidence[];
  learnerContribution: {
    type: 'answer' | 'question' | 'off-task' | 'other';
    confidence?: number;
    streakCount?: number;
  };
  learnerQuestion?: {
    contentFocused: boolean;
  };
};
```

The response contains exactly one entry for every supplied expectation and exactly one entry for every supplied misconception. Array order is not significant; authored identifiers establish identity. Identifiers must be returned byte-for-byte as supplied. Do not trim, normalize, repair, or silently discard malformed identifiers.

This is a provider-only evaluation contract. The downstream `SparcLearnerResponseScoringResult` remains unchanged.

## Evidence Semantics

### Direction

Evaluate each proposition independently against the learner's accumulated, resolved position across all learner-authored turns through the latest contribution:

- `supports`: the learner's accumulated account presents some of the proposition's defining meaning, including a tentative account;
- `contradicts`: the learner's resolved account explicitly rejects, corrects, contrasts, or replaces the proposition with its correct opposite; or
- `unaddressed`: the learner's own contributions establish no resolved stance on the proposition.

Quoting, recalling, or asking about a proposition without adopting or rejecting it does not by itself support or contradict it. Requiring an evaluation for every proposition is not evidence that every proposition was addressed; `unaddressed` is the normal result for unrelated propositions.

When the trajectory first supports a misconception and later self-corrects it, use the learner's resolved final/current stance. For example, “I thought X, but now I see Y” contradicts X when Y replaces X. An unresolved comparison that adopts neither alternative is `unaddressed`. If some misconception meaning remains part of the learner's resolved account, it is `supports` with proportional strength. Do not add a fourth `mixed` direction or speculate about private belief.

Keep the existing contribution-classification rule: a confirmation-shaped contribution may be classified as either a question or an answer according to its conversational function, but its instructional meaning is scored the same either way.

### Strength

`evidenceStrength` uses the existing shared continuous rubric and measures how much of the authored proposition's defining meaning the learner explicitly represents across the full learner trajectory in the selected `evidenceDirection`:

- `0`: none;
- `0.25`: a significant portion;
- `0.5`: more than half;
- `0.75`: most; and
- `1`: the entire defining meaning.

These are anchors on a continuous scale. Any value from 0 through 1 is allowed.

Direction carries polarity; strength carries only the cumulative semantic proportion represented in that direction. For `supports`, a larger strength means that more of the proposition is demonstrated. For `contradicts`, a larger strength means that more of the proposition is explicitly rejected or replaced in the resolved account. Strength does not measure confidence or the numeric size of improvement.

Direction and strength must be internally consistent:

- `supports` requires `evidenceStrength > 0`;
- `contradicts` requires `evidenceStrength > 0`; and
- `unaddressed` requires `evidenceStrength = 0`.

The model must evaluate explicit semantic meaning rather than keyword overlap. It must not infer a misconception from topical similarity, shared words or numbers, an unrelated calculation, or speculation about what the learner privately believes. Do not reintroduce necessary-entailment, counterfactual, repetition-based, or minimum-score heuristics.

## Application-Owned State Reduction

After the complete evidence envelope passes validation, a pure SPARC reducer derives the existing sparse `SparcLearnerResponseScoringResult`.

### Expectations

| Evidence | Existing prior coverage | Derived result |
| --- | ---: | --- |
| `supports` with strength greater than prior | any | Emit `{ clusterKC, coverage: evidenceStrength }`. |
| `supports` with strength equal to or below prior | any | Emit no update. |
| `contradicts` | any | Emit no update. |
| `unaddressed` | any | Emit no update. |

Expectation coverage therefore remains cumulative and never decreases.

### Misconceptions

| Evidence | Existing prior support | Derived result |
| --- | ---: | --- |
| `supports` with strength different from prior | any | Emit `{ id, supportStrength: evidenceStrength }`. |
| `supports` with strength equal to prior | any | Emit no update. |
| `contradicts` | greater than 0 | Emit `{ id, supportStrength: 0 }`. |
| `contradicts` | 0 | Emit no update. |
| `unaddressed` | any | Emit no update. |

Misconception support therefore retains its existing reversible behavior while the provider evaluates the learner's latest resolved stance across the whole trajectory. An unaddressed misconception preserves its prior state; application code does not manufacture a replacement score.

### Contribution consistency

Keep contribution classification and learner-question metadata in the same provider call.

Contribution classification describes the latest learner turn, while instructional evidence describes the accumulated learner trajectory. An `off-task` latest contribution contributes no new instructional meaning, but it may coexist with supported or contradicted cumulative evidence established by prior learner turns. Tutor-authored content remains context only.

Preserve the current learner-question boundary exactly:

- `question` requires `learnerQuestion.contentFocused`;
- downstream `learnerQuestion` is emitted only for `question`; and
- if the provider supplies learner-question metadata for a non-question, ignore that metadata as the current parser does.

## Code Ownership and Expected File Scope

### Provider adapter

`mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts` owns:

- the OpenRouter JSON schema;
- the semantic-evaluation prompt;
- removal of prior scores from the model payload;
- parsing primitive envelope values; and
- invoking the SPARC reducer with the parsed complete evidence and current facts.

Split the current `parseScoreEnvelope(...)` responsibility: provider parsing validates primitive field shape, while the SPARC reducer validates target completeness and applies learner-state rules.

### SPARC scoring domain

`learning-components/units/sparcsession/sparcLearnerResponseScoring.ts` owns:

- evidence-direction and complete-evaluation types;
- exact identifier-set validation against authored expectation and misconception facts;
- direction/strength consistency validation;
- independence of latest-turn contribution classification from cumulative instructional evidence;
- comparison with prior score facts; and
- reduction to the existing sparse `SparcLearnerResponseScoringResult`.

Keep `createSparcLearnerResponseScoreFacts(...)`, fact names, stable state-write identities, and downstream controller inputs unchanged. Do not leave a second cumulative/reversible comparison in the provider adapter.

Use current `runtimeFacts` built from the authored document and replay state as the reducer's prior-state source. Do not read prior state from display summaries and do not create another cache or score representation.

Preserve the exact downstream sparse shape produced by the current provider:

- `learningTargetScores` is present and may be an empty array;
- `diagnosticMisconceptionScores` is omitted when no misconception value changed;
- `learnerContribution` is present; and
- `learnerQuestion` is present only when contribution type is `question`.

### Tests

Update:

- `mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.test.ts`; and
- `learning-components/units/sparcsession/sparcLearnerResponseScoring.test.ts`.

The live compound-interest evaluator consumes the unchanged downstream score result. The approved live-evaluation hardening below extends its saved per-turn diagnostics and robustness gates while preserving its transcript, graduation synthesis, pass threshold, and live scoring/generation behavior.

No config-repository, TDF, package ZIP, wiki, persistence, migration, or analytics change is expected. The public authoring/runtime contract is unchanged; this document is the developer-facing record of the internal ownership correction.

## Approved Live-Evaluation Hardening

The post-implementation live review authorized seven narrow follow-up changes:

- expose each validated complete provider evidence envelope to the live-evaluation harness and save it with the corresponding turn;
- save the complete effective post-reducer scoring state derived from the controller's score facts, alongside the existing sparse downstream score;
- require M1 to be inactive after exact-transcript turn 6 (or at a valid earlier completion), require accumulated E2 coverage to reach the authored completion threshold by corrective turn 4, and require an added graduation synthesis to support E4 at the authored completion threshold; and
- clarify in the scoring prompt that a whole relation must be represented with the correct roles and direction, that an unambiguous correct calculation can contradict a misconception, and that tutor receipts must attribute learner claims without praising or adopting misconceptions;
- retain the attempted learner turn, raw parsed provider payload, and parsed evidence envelope when a provider response is rejected or a rate limit interrupts the turn;
- report scoring or harness errors as evaluation errors with student and robustness outcomes marked not evaluated, calculate the displayed graduation rate only from evaluated runs, make an unavailable rate explicit, record the absolute required graduation-run count, and require every planned run to be evaluated; and
- reject any E4 support assigned before the explicit compounding-frequency response on exact-transcript turn 7.

These changes add observability and semantic prompt constraints. The cumulative correction also removes the obsolete validation that treated latest-turn `off-task` classification as incompatible with prior cumulative evidence. It does not change the reducer's state-update tables, add scoring heuristics, change the rubric or thresholds, change production-rule chaining, or create a deterministic live route.

## Implementation Sequence

### 1. Add the complete evidence types and reducer

- Define the three directions and complete evidence-envelope types in `sparcLearnerResponseScoring.ts`.
- Validate exact identifier-set equality: no missing, unknown, or duplicate target identifiers.
- Validate every strength as finite and within 0 through 1.
- Validate direction/strength consistency while allowing cumulative instructional evidence alongside latest-turn contribution classification.
- Derive the existing sparse score arrays using the state tables above.
- Preserve contribution and learner-question fields without renaming them downstream.

### 2. Replace the provider-facing schema and parser

- Require `learningTargetEvaluations` and `diagnosticMisconceptionEvaluations`.
- Require identifier, `evidenceDirection`, and `evidenceStrength` on every entry.
- Keep `learnerContribution` and conditional `learnerQuestion`.
- Parse the provider response without comparing it with prior scores and without silently filtering malformed entries.
- Pass the parsed envelope and current working-memory facts to the SPARC reducer.
- Remove provider-local prior-score maps and filtering that become unused.
- Preserve the existing schema name, request intent, temperature, response-token budget, model selection, and telemetry fields.

### 3. Make the scoring prompt cumulative

- Describe the call as a fresh cumulative semantic evaluation of all learner-authored turns through the latest response, not as numeric per-turn score addition.
- Require complementary learner meaning across turns to be combined without rewarding repetition.
- Treat tutor turns only as context and let later learner clarification or self-correction determine the resolved stance.
- Require one independent evaluation for every supplied proposition.
- Define the three directions and their strength consistency.
- Retain the current contribution and question-classification policy.
- Retain the shared continuous rubric and conservative misconception-evidence language.
- Retain the bare-calculation restriction.
- Remove prior-state, changed-value, and omission instructions; keep cumulative semantic evaluation separate from application-owned durable-state comparison.
- Do not add overlap-allocation, necessary-entailment, counterfactual, repetition, or score-floor language.

### 4. Add deterministic contract tests

Provider tests must prove:

- prior scores are absent from the model payload;
- every authored proposition is present in the payload;
- the prompt requires complete independent evaluations;
- the prompt does not ask the model to compare or omit changed values;
- the JSON schema requires both complete arrays and evidence fields;
- a valid provider response reaches the reducer and returns the existing downstream shape; and
- contribution/question parsing remains unchanged.

Reducer tests must prove:

- one response can fully update several overlapping expectations, including E1 through E4;
- lower or equal expectation evidence cannot reduce or repeat cumulative coverage;
- supported misconception evidence can increase or decrease prior support;
- contradicted misconception evidence clears nonzero prior support;
- unaddressed misconception evidence preserves prior support;
- `52.50 ending balance 1102.50` can leave the compounding-frequency misconception unaddressed without an update;
- unchanged derived values are omitted from the sparse result;
- missing, unknown, and duplicate identifiers fail clearly;
- invalid directions, strengths, and direction/strength combinations fail clearly;
- cumulative instructional evidence remains valid when the latest contribution is off-task; and
- learner-question metadata remains required exactly when contribution type is `question`.

Do not make these deterministic reducer tests call the AI. The existing five-run admin evaluation remains the live scoring and tutor-generation regression.

### 5. Verify end to end

From `mofacts/`, run:

```text
npm run typecheck
npm run lint
```

Every invocation of the Meteor CI suite requires fresh, single-use authorization. Do not run `npm run test:ci` without that authorization.

Because this changes learner-facing runtime scoring, use the native hotfix app and MoFaCTS Playwright sidecar for an authenticated SPARC smoke test when those tools and session state are available. Confirm that a learner turn reaches scoring, produces a tutor move, renders normally, and reports no relevant console or network error.

Then run the existing five-run **SPARC Compound Interest Live AI Evaluation** from Admin Tests and save its full JSON result. Both scoring and tutor generation remain live. The existing gate remains authoritative: all robustness requirements and at least four of five graduations must pass. A stochastic failure should be diagnosed from the saved complete log rather than hidden by retry or deterministic substitution.

## Explicit Non-Goals

Do not change or add:

- rubric anchors or graduation/activation thresholds;
- minimum-score heuristics;
- repetition-based misconception levels;
- production rules, salience, chaining, or scaffold stages;
- expectation or misconception target priority;
- completion or turn-budget logic;
- model, temperature, response-token budget, or provider routing;
- tutor move policies or pedagogical move content beyond the approved universal receipt boundaries;
- TDF fields, authored content, package ZIPs, or config sync;
- stored facts, history metadata, migrations, or analytics fields;
- retries, compatibility paths, alternate scoring paths, or deterministic live-test substitutes; or
- a fourth evidence direction.

## Acceptance Criteria

- The provider receives no prior instructional scores.
- The provider returns exactly one independently evaluated cumulative entry for every authored expectation and one resolved-stance entry for every authored misconception.
- `evidenceStrength` retains the agreed continuous rubric; `evidenceDirection` alone determines whether that represented meaning supports or contradicts the proposition.
- The provider performs cumulative semantic integration; SPARC code alone compares that evaluation with durable expectation and reversible misconception state.
- The downstream score, fact, controller, and persistence contracts remain unchanged; the live-evaluation artifact adds the complete evidence envelope, canonical effective scoring state, attempted-turn diagnostics for rejected or interrupted scoring responses, and the approved robustness checks.
- A scoring or harness failure is labeled as an evaluation error rather than student non-graduation, is excluded from the graduation-rate denominator, and independently prevents the overall evaluation from passing.
- Exact-transcript turns before the explicit frequency response cannot receive supporting E4 evidence.
- The corrective Compound Interest trajectory reaches at least `0.8` accumulated E2 coverage by turn 4.
- The complete compound-interest synthesis can update all represented expectations, including E4.
- The compounding-frequency misconception remains unaddressed by the unrelated `52.50 ending balance 1102.50` calculation.
- Existing production-rule chaining and target selection are unchanged.
- Typecheck and lint pass.
- Authorized deterministic tests pass when the Meteor CI suite is run.
- The saved five-run live evaluation satisfies its updated robustness checks and existing graduation gate.
- No mechanics listed under Explicit Non-Goals are introduced.
