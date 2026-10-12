# SPARC instructional cycle

SPARC AutoTutor displays select one runtime-owned production set through
`instructionalController` (`adapterId: "sparc-autotutor-v1"`, `policyVersion: 1`):

| `policyId` | Selection and stopping |
| --- | --- |
| `progressive-scaffolding-v1` | Existing AutoTutor behavior, including its existing completion rules. |
| `student-selected-v2` | Productions offer Pump, unsupported Prompt, supported Prompt, Hint, Assertion, and next KC. Covered targets remain usable. |
| `agent-selected-v1` | Instructional productions select moves; no unfinished eligible target is a natural stop. |
| `oet-boltzmann-v2` | Existing target progression selects and retains the KC; Pump, both Prompt variants, Hint, and Assertion compete only for that target using expectancy, assistance, OET, and temperature. No unfinished eligible target is a natural stop. |

These remain separate component policies. During the admin rollout described below,
the app retains an authored student-selected policy for admins and resolves other
AutoTutor policies to competitive selection for admins. Non-admins use the deterministic
reference. The new versions retain the opening question and existing navigation.
Authored AutoTutor displays omit `productionRules`; the runtime supplies the selected
set. Upload validation and the runtime share the allowed policy identifiers.

## Ownership

`learning-components/units/sparcsession/sparcInstructionalCycleRules.ts` owns the
selection IFs and the menu's ordered THEN options. Different IFs call the same
primitive implementations in `sparcInstructionalPrimitives.ts` and the existing
AutoTutor generation action. `sparcMoveDefinitions.ts` remains the move lookup.

The current comparison uses the AutoTutor moves: pump (assistance 0),
unsupported prompt (0.66), supported prompt (1.33), hint (2), and assertion (2.4),
all on the logit scale. Each student
button directly selects its named move and offered target. There is no bundled
"AutoTutor response" option. The competitive agent uses the same five move definitions,
generation prompts, and rendering. Existing scoring and feedback are unchanged.

Prompt generation (`autotutor.prompt`, prompt version `v4`) asks for a short answer
identifying a missing, substantive part of the selected target expectation: a
conceptually important entity, property, process step, or technical concept. For a
selected misconception, the relevant correct expectation identifies the missing
content needed to recognize or correct the learner's expressed error. The question
does not supply that content or an explanatory clue. Opening-example details are
used only when needed for understanding; a natural question or brief completion
request is allowed, and fill-in-the-blank wording is optional.

Supported Prompt (`autotutor.prompt-supported`, output schema `autotutor.supported_prompt` v2)
uses two calls. The configured dialogue model returns `tutorMessage`, `imagePrompt`, and
`figureDescription`; a separate image call produces the aligned incomplete figure.
System image settings live in `mofacts/common/lib/sparcPromptImage.ts`: Seedream 5.0 Flash
(`bytedance-seed/seedream-5-0-flash`), 1K, automatic aspect ratio, one image. Routing is pinned to Seed
with provider fallback disabled. The dialogue model and reasoning settings are
unchanged. The brief chooses a visual form appropriate to the subject, including an
illustration, table, spatial arrangement, comparison, or plot. Incompleteness may be a
missing feature or process step; it does not require a word blank. Text, visible labels,
and accessible description must withhold the learner's missing inference.

The figure planner and image call share a compact-composition instruction. Seedream uses
its supported `auto` aspect ratio with the existing 1K resolution setting; the canvas
shape can follow the figure instead of forcing 4:3. Related elements and labels stay close,
outer margins remain modest, and empty space is reserved for instructional meaning.
Spacing that represents a meaningful distance, time, or magnitude is preserved. Automatic
aspect ratio does not guarantee an exact pixel-sized bounding box. No crop or separate
layout field is introduced. Admin selection notes reuse the production-menu labels,
including "Prompt (unsupported)" and "Prompt (supported)"; persisted move and rule IDs remain unchanged.

The server stores bounded PNG/JPEG/WebP bytes as a private DynamicAsset. History stores
the validated tutor text and `{assetId, description, displayWidth}` on one dialogue node. The admin-only
asset reader additionally enforces ownership; both the public asset route and the generic FilesCollection download route deny these figures. Resume loads
the saved image without regeneration. Later scoring and utterance calls receive the
actual image as tutor context through the existing multimodal OpenRouter interface.
Dialogue models used for this condition must accept image input. The generated image
is not itself learner evidence. Malformed/provider-failed output fails explicitly;
there is no text-only or application-drawn substitute.

Generation identity uses account, TDF, session, and selected production event. Completed
assets preserve their original text/image pairing on retry; in-process concurrent calls
share one generation. Interrupted S3 transfers can resume from the saved local asset.
This is not a cross-process provider-call transaction. No historical records are rewritten,
new TDF fields introduced, or dependencies installed. Both comparison packages obtain
these productions at runtime without re-upload. The deterministic reference keeps its
existing sequence and does not automatically introduce the supported Prompt.

Composite generation/rendering primitives remain implemented for later work and for
the separate fixed-agent component policy; neither package in this comparison offers
or selects them. Supported Prompt keeps its generated image within the dialogue utterance.

The app owns external calls, rendering, history acceptance, and resume. Menu buttons
are selection events, never scored answers. The selected option must belong to the
pending menu and retain its target binding. Next target uses ranked existing target
identities and wraps across expectations without a mastery gate. Student AutoTutor
choices directly name the move and retain the offered target; automatic interruption and
target progression belong to the agent set.

## History and resume

The student and fixed-agent cycles save accepted evaluation and its logit vector in the response
transition. When generation is needed, its existing decision is saved before the
external call. Menu state and accepted output use existing facts and transitions.
Next target and instruction contend on the same menu decision identity.

The app-owned history writer derives a deterministic Mongo `_id` from learner,
lesson, unit, original attempt, page, and transition identity. Identical writes are
idempotent; conflicting payloads fail. Reopening a pending cycle retains its original
attempt. Accepted assessments are not repeated on replay, accepted decisions can
retry generation, and accepted output is replayed without regeneration. A failed or
uncertain write remains an explicit error; reload hydrates durable accepted history.
No new collection, index, migration, or alternate data store is required.

For the student and fixed-agent policies, the optional `sparc.expectationLogitChanges` response field contains
`{ clusterKC, delta }` entries. `delta` is the new natural logit minus the prior
natural logit, bounding only those calculations to .0001 through .9999. The original
AI scores are unchanged. The existing app history projection supplies these vectors
to `calculateExpectationProbabilities`; the result is `logistic(sum(deltas))`, or .5
for empty history. It is computed on live acceptance and hydration, is not persisted,
and is not consumed by instructional or scheduling decisions.

Canonical histories predating this optional observation remain readable without
fabricated deltas. Pre-canonical instructional-focus/scaffold replay is unsupported
and fails explicitly. No learner history is rewritten or removed.

## Reference content and verification

The config repository contains separate `AutoTutor Confidence Interval Student Selected`
and `AutoTutor Confidence Interval Agent Selected` packages. Their lesson/page
identities are distinct; targets and source content are shared with the preserved
`AutoTutor Confidence Interval` reference. Deploy compatible application code before
uploading the new packages. The Agent Selected package selects `oet-boltzmann-v2`;
the Student Selected package selects `student-selected-v2` in its referenced stimulus
page. Both retain their existing TDF/page identities, so reimport updates those lessons.
The student's next-target option moves between expectations in the same problem,
without requiring mastery; it does not advance to a different case or unit.

Use the `AutoTutor Confidence Interval Agent Selected-AutoTutorMoves-v2.zip` and
`AutoTutor Confidence Interval Student Selected-AutoTutorMoves-v2.zip` archives.
Reimport them before testing. The former `student-selected-v1` and `oet-boltzmann-v1`
policies included composites and are no longer supported as authored runtime policies.
The existing policy-aware history partition starts a separate attempt for v2; old
records are preserved, not migrated or reused as current decisions. The controller
interface's `policyVersion: 1` remains unchanged; the production-set identity changes.

From `mofacts/`, use `npm run typecheck`, `npm run lint`,
`node scripts/sparcAutoTutorRules.test.cjs --include-client-contracts`,
`node scripts/analyticsMethods.test.cjs`, and `npm run check:sparc-rich-html`.
The isolated client tests inject provider/writer dependencies; method tests simulate
the unique-key database boundary. They do not establish live Meteor, Mongo, or
rendered learner behavior. `--include-general-rules` includes the broader existing
rule/bridge and semantic/progressive-node regression suites. Each `npm run test:ci` invocation still requires
fresh explicit authorization under AGENTS.md.

Detailed specification, acceptance results, and outstanding verification are in the
[wiki specification](https://github.com/memphis-iis/mofacts/wiki/SPARC-Instructional-Cycle-Specification).

## Admin competition rollout

AutoTutor delivery honors an authored `student-selected-v2` for authenticated admins;
all other supported AutoTutor policies resolve to `oet-boltzmann-v2` for admins.
Every non-admin account retains `progressive-scaffolding-v1`. This preserves the
existing admin behavior for ordinary AutoTutor packages while enabling the separate
student-choice package. Other SPARC unit types are unaffected. Delivery and submission
share the same account/policy resolution. No adaptive switching between authorities is added.

The competitive selector uses `-abs(theta + assistance - OET)` and stable Boltzmann probabilities. `SPARC_COMPETITIVE_DEFAULTS` in `learning-components/units/sparcsession/sparcCompetitiveSelection.ts` owns the initial expectancy/OET (0.2), maximum OET (0.8), and selection temperature (0.1). Lower positive temperature concentrates selection on the closest match; exact ties remain equiprobable. This is separate from provider generation temperature.

Target progression and move competition are separate. Both agent policies share the same target conditions: continue the active unfinished KC, choose the next ranked eligible target only when the current cycle cannot continue, and retain the existing detected-misconception interruption. Competitive continuation preserves cycle identity and increments its turn count. Only five move activations for one target enter Boltzmann selection; a mixed-target activation set is an error. Competitive misconception eligibility is calculated before target ranking and cycle status, using the existing reversed-expectancy completion threshold. Student-selected next-KC behavior is unchanged.

Each instructional production advances its target OET by 0.2 probability points, capped at 0.8 and converted back to a logit. Selection uses the old OET. Unfinished targets retain OET; completion resets it. Existing move definitions own assistance logits. The deterministic reference retains its condition-driven ordering and does not sample.

Seed each target's history once with logit(0.2); append evaluated logit differences and sum on read. The initial expectancy is also the model's minimum: selection uses `max(logit(0.2), historySum)`. Compute subsequent assessment differences against the raw history sum, not the floored selection value, so repeated low assessments do not delay later improvement. This read-time bound also applies to existing histories without rewriting their observations. Clamp probability conversions to [0.0001, 0.9999]. Expectations use coverage; detected misconceptions use one minus support. Existing expectation coverage remains nondecreasing, and misconception support retains its existing bidirectional scoring. Current policy, selected rule/target, diagnostics, and OET effects are saved before generation. Retry/reload reuses that decision. A changed policy starts a separate attempt; historical scores are not migrated.

Server history and provider boundaries require admin authority for competitive and
student-selected requests. Existing admin tutor diagnostics show expectancy, assistance,
OET, utility, temperature, and selection probability for competitive decisions.
The student policy renders its existing production-defined menu; no mode selector or
server computation service is introduced.

Cycle output records retain their event and durable writes, without copying the generic execution trace (which includes transient assertions and preceding dialogue). Assessment and decision records already own those facts. This keeps long conversations within the existing history-size contract.

Supported-Prompt image verification, October 11, 2026: 137 isolated contracts passed, including generation planning, asset ownership, image-byte validation, durable text/image pairing, and actual image context in later dialogue. The live student-selected trial reached OpenRouter's image API, which returned HTTP 429 with a Google quota message. A diagnostic call using the same model, key, provider and 1K resolution through OpenRouter's chat-completions API also returned HTTP 429 and identified Google AI Studio as the upstream provider. OpenRouter's current-key endpoint separately returned HTTP 200, confirming an accepted OpenRouter key, a paid account and available key budget. Runtime credential resolution selected the same user key source used by dialogue calls. The account uses OpenRouter provider keys, not Google BYOK; the upstream error does not establish that the user's own quota or balance is exhausted. A subsequent diagnostic with OpenRouter metadata identified `upstream_provider_shared_pool` as the limit source and confirmed `is_byok: false`. Google AI Studio was the sole provider for that model; no image was generated in that AutoTutor trial. No Meteor integration invocation or release check is claimed.

Seedream selection, October 11, 2026: the user selected Seedream 5.0 Flash after successful isolated OpenRouter generations of a water-cycle diagram and a repeated-sampling confidence-interval figure. Both used 1K, 4:3 and one image, returned JPEG, cost USD 0.018 each, and took about 13–14 seconds. These figures were visually reviewed; they were separate provider trials, not saved AutoTutor dialogue turns. The supported Prompt primitive now uses that model and provider. Full-app typecheck and lint passed (lint retained 28 warnings in the existing ostrio-files package); all 137 isolated SPARC contracts passed, including JPEG format acceptance and the selected provider request. Live AutoTutor image display, persistence/resume, and image-assisted scoring with Seedream remain to be verified.

Live Seedream walkthrough, October 11, 2026: the saved student-selected supported Prompt decision completed and displayed paired text and a loaded 1110-by-832 JPEG. The question asked how each sample must be selected across repeated studies; the figure showed three sample-to-interval-method runs, withholding the sampling method. Labels were readable and aligned with the question, although the visual support was a simple schematic. Reload restored the same tutor text and byte-identical figure. A synthetic correct answer was submitted, but repeated Chrome control disconnections prevented observation of its scoring result and the agent-selected walkthrough. The local hotfix manager continued to report a healthy app, client bundle, HMR endpoint, and MongoDB Change Streams. Figure display and reload are verified for this student-selected turn; image-assisted scoring and agent-selected live generation remain unverified. No Meteor integration or release check was run.

October 11 final live follow-up: a seven-turn agent-selected dialogue used weak, partially correct answers rather than repeated empty refusals. It selected Pump, Prompt (unsupported), Pump after partial progress, and Prompt (supported) at assistance 1.33, all on the same active expectation. Supported generation completed through Seedream. Automatic aspect ratio first returned a 1424-by-800 figure whose remaining whitespace was judged excessive; a stronger compact-panel instruction then returned 1440-by-720, with a smaller gap, larger readable labels, and correctly aligned endpoint labels. The final figure is more compact, but the model does not guarantee an exact pixel-tight bounding box. The prior generated figures remained in saved history; they were not replaced. The corrected selection labels were observed live. A complete answer reached 3/3 expectations, left only Continue, and Continue returned to the authenticated practice menu without an initialization error. Relevant screens, URLs, and DOM observations are retained locally; no production data was used. Full-app typecheck and lint passed, all 137 SPARC contracts passed, and all 14 focused launch/lifecycle contracts passed. No new Meteor integration invocation, release check, commit, or push was performed.

Information-based figure display sizing: the supported Prompt planner returns a required integer `displayWidth` from 240 to 640 CSS pixels, estimating the smallest comfortable space from the required visual elements, label lengths, and relationships. It estimates space, not detailed positions, and requests readable labels at that width. The image model still composes a compact figure at 1K with automatic aspect ratio. The estimate is saved with the private asset and dialogue reference; retries and resume retain the original pairing and size. The conversation clamps the estimated width to its available space while retaining the image aspect ratio. Existing canonical figures without a width keep their previous 640-pixel maximum; no records are rewritten or regenerated. Supported Prompt policy is v3 and generated brief schema is v2. No formula, TDF field, package change, or new dependency is introduced.

Live display-size verification, October 11, 2026: in the agent-selected Compound Interest lesson, a partially correct synthetic answer produced a supported Prompt with a 360-pixel width estimate. The browser rendered the two-panel figure at exactly 360 pixels, preserving its aspect ratio. Reload restored the same tutor text, byte-identical image source, and 360-pixel width. The earlier widthless canonical figure retained its previous maximum-width behavior. The new figure was compact and readable at the tested desktop viewport; some smaller labels were below the requested 14-pixel aim, so the prompt instruction does not guarantee a minimum raster font size. This verifies generation, rendering, and reload for this case, not all subjects or screen sizes.
