# SPARC instructional cycle
SPARC AutoTutor displays select one runtime-owned production set through
`instructionalController` (`adapterId: "sparc-autotutor-v1"`, `policyVersion: 1`):

| `policyId` | Role |
| --- | --- |
| `progressive-scaffolding-v1` | Conditional Pump, Prompt, Hint, Assertion scaffolding with meaningful progress, expectation coverage, misconception interruption/repair, and completion; no category-specific compositions. |
| `dynamic-instruction-agent-v2` | Category-aware compositions and text/MC formats with Boltzmann selection and fixed OET. |
| `dynamic-instruction-student-v2` | The same category-aware instructional alternatives with learner move selection. |

Each session uses one effective policy. Legacy lessons retain their authored progressive
policy for admins and non-admins. Categorized policies remain admin-only. Display
resolution and submission share the same access check without substituting a policy.
Retired and unknown identifiers fail explicitly. Upload and runtime use the same
supported-policy contract and `sparc-autotutor-v1` adapter, at policy version 1.

Assessment infers the authored requirements elicited by the actual question and credits
the meaning demonstrated by a correct contextual answer, respecting response format.
It does not demand an unrequested justification or infer untested parts of the KC.
Retained unresolved evidence identifies specific remaining authored meaning a follow-up
could elicit; this uses the existing evidence fields and whole-KC coverage rubric.
The prompt groups this work into five responsibilities: contextual interpretation,
cumulative evidence, separation of student evidence from supplied information, direction
and coverage, and citations with remaining requirements. Coverage uses the minimum
distinct substantive authored requirements, weighted equally; relations retain their
participants, roles, and direction together. An unresolved defining connection earns
no partial credit for merely naming a participant. Strength 0 means none, 0.5 half,
and 1 all; intermediate fractions remain available. Examples and repeated explanations
do not create requirements. Format-specific instructions appear only for formats in
the current response or retained dialogue. These are model-inferred judgments, not
an empirically calibrated proficiency measure.

## Dynamic instruction

For units without a configured `sparcsession.startingKC`, target ranking derives its anchor from the saved current expectation cycle,
including when that KC has just reached coverage and selection advances. During
a misconception cycle, the most recent saved tutor instruction on a KC retains
the anchor. Learner text, feedback, and misconception identifiers do not become
graph nodes. The shared projection applies the configured frontier/coherence/
centrality weights and remaining-need penalty; fresh lessons with no prior KC
retain centrality-based startup. Resume reconstructs the same anchor from existing
cycle and dialogue history, with no new persisted fields or migration. Accepted
decisions still resume unchanged. Explicit caller-supplied anchor options remain
supported for existing callers.

### Instructional formatting and theme

Generated instructional text uses Markdown with GFM tables. The client parses and
sanitizes it on display, including when restoring saved conversations; learner text
and multiple-choice option labels remain plain text. Whole-document `md` or
`markdown` fences are accepted as Markdown envelopes, while other code fences retain
their code-block meaning. Text cannot embed executable HTML, remote media, or form
controls; generated figures retain their separate saved-asset path. Existing semantic
HTML in rich instructional history is sanitized by the same renderer.

Conversation content shares the theme-based rich-text styles for tables, headings,
lists, and code, without adding a control border around each paragraph. SPARC buttons
use the theme's button height, line height, action border/hover colors, and disabled
colors. Submit uses the primary action colors. Focus has a visible accent ring and
selected answers retain a separate accent outline. Rendering does not rewrite history
or recalculate learner scores.

Tutor outputs can use the conversation width for comparisons and tables; prose and
answer lists retain a 70-character reading measure. Tables keep a 36rem minimum
width inside their own horizontal scroll container on small screens. Answer options
use normal-weight, start-aligned text with 1.5 line spacing. Subtle support surfaces
and spacing replace nested conversation/support borders.

Administrator production and selection metadata is visible only after opening the
Details disclosure below the corresponding output. Each output has its own closed-by-
default panel; the existing administrator gate controls whether it is rendered at all.
The panel slides down when opened, respects reduced-motion settings, and supports
native keyboard toggling and Escape from its toggle. Disclosure state is presentation
state only and does not enter learner history.

### Assessment change records and full resume

Instructional-cycle assessments persist one history row for each KC coverage or
misconception-support value that changes from its previous value. An absent score
has the existing zero baseline; unchanged zero or carried scores create no score
row. A misconception returning to zero is a real change and is saved. A separate
`:assessment` row retains the learner utterance and derived turn/controller facts.

The client sends these bounded rows together through `insertHistory`. The server
accepts only admin SPARC assessment batches sharing one user, lesson, attempt,
response, course context, and policy. Batches are capped at 256 records and 1 MiB;
each record still satisfies the existing 16 KiB extension and 32 KiB wire limits.
One snapshot/majority Mongo transaction accepts the changes and completion row,
so a failed transaction exposes no partial assessment. Stable transition IDs
deduplicate retries; conflicting content fails explicitly. This requires the
existing Mongo replica-set setup, with no sequential-write substitute.

History loading retains the existing scope and chronological ordering. Replay
reconstructs current target values from the change rows and combines them with
the completion row's metadata. Existing saved bundled assessments remain readable;
they are not rewritten. Interrupted later model updates, feedback, or instruction
reuse the accepted assessment without another evaluation or duplicate score rows.
Ordinary non-SPARC history continues to use its existing single-record writer.

### Maximum-relationship KC progression

Set `unit.sparcsession.startingKC` to the exact expectation `clusterKC` identity.
Canonical upload embeds expectation text using the existing model, generates the
complete relationship graph, and computes a maximum-weight Hamiltonian path with
that KC fixed as its first endpoint. There is no relationship cutoff. HiGHS solves
integer weights at the graph's existing six-decimal precision and adds subtour
cuts until it proves one optimal path. Solving runs in a disposable server worker.
A failed or unproved solve stops upload; there is no heuristic substitute.

The server saves `kcGraph.chain` facts keyed by starting KC beside the graph. Distinct
unit starts on the same page receive separate generated paths. Packages cannot
supply any `kcGraph.*` facts, and exports omit them. The TDF parameter is the sole
authored start; page resolution carries it into the runtime selection policy.
An absent, incomplete, or mismatched generated chain fails explicitly.

Practice selects the first KC in that path whose coverage is below the existing
criterion (normally 0.8). Incidental credit skips already covered KCs. An active
unfinished cycle stays active; misconception repair retains its priority. The
centrality/frontier/coherence formula does not rank targets in these units. Move
and assistance competition, assessment, and stopping criteria are unchanged.
Student next-KC navigation follows chain order. Resume restores coverage from
existing history and scans the same saved chain; accepted decisions are replayed
unchanged, with no additional progression counter or history rewrite.

### KC-led startup

For categorized v2 policies, `document-loaded` lets the existing expectation-start
productions select the first uncovered KC in the generated chain when
`sparcsession.startingKC` is set. Units without that parameter select by centrality
at startup, with the stable target-ID tie break. Only
moves for that target compete. Agent selection realizes its chosen move; student
selection first offers the existing move menu. No learner answer, assessment, feedback,
or model update is fabricated at startup; the learner turn count remains zero.

Exactly one authored `dialogue.source` fact with a nonempty `topic` supplies lesson
context. Categorized packages omit the fixed opening node and focal-question heading.
The progress widget starts collapsed at the upper right of the instructional surface.
Opening it overlays the conversation without reserving a header row or resizing the
conversation. It stays open until toggled closed while the lesson view remains mounted;
responses and move selections do not dismiss it. The native disclosure supports keyboard
activation, Escape from its toggle, visible focus, and reduced motion. Each question supplies its
own givens. An expectation-start explanation briefly establishes the concept's basis
or purpose in the topic; continuation explanations address the current need.
Startup decisions and completed primitives use canonical history, so an interrupted
startup resumes its saved decision/components and a completed or established attempt
reloads without another generation. Existing v1/reference units retain their authored
opening behavior.

### Category-aware instruction and response formats

The v2 dynamic policies require `category` on every entry in
`display.autoTutorTargets.expectations` and `.misconceptions`. Allowed complete combinations
are `fact`, `model`, `rule`, `fact-model`, `fact-rule`, `model-rule`, and `fact-model-rule`.
`model-rule` represents a principle. Misconception categories describe the corrective
understanding. App upload validation and runtime target construction reject missing or
invalid categories for these policies; they do not infer a category. Other policies do
not acquire a new required field. The generated stimulus schema describes this field.

`sparcDynamicInstructionRules.ts` builds 560 automatic instructional productions
(five target transitions × four compositions × four response formats × seven categories),
plus evaluation, feedback, and stop. Student instruction selections explicitly match
the same category. `sparcCategoryInstructions.ts` maintains the fact/model/rule, move,
response-format, and synthesis blocks once. The KC text identifies the knowledge;
the assigned category supplies the learning-process focuses. Generation does not infer
a separate recall-only, recognition-only, application-only, or explanation-only
classification from KC wording. These can be overlapping demonstrations of the same KC.

| Category | Learning-process focuses used to construct the move |
| --- | --- |
| Fact | Memory and fluency through retrieval and recall |
| Rule | Induction and refinement through varied cases, generalization, discrimination, and application |
| Model | Understanding and sense-making through relationships, interpretation, self-explanation, prediction, or reconstruction |
| Fact–rule | Retrieval and recall combined with induction and refinement |
| Fact–model | Retrieval and recall combined with understanding and sense-making |
| Model–rule (principle) | Induction and refinement combined with understanding the model-based rationale |
| Fact–model–rule | All three focuses integrated around the same knowledge |

This is the approved MoFaCTS adaptation of the learning-process relationships in
[KLI Table 4 and its discussion](https://pact.cs.cmu.edu/pubs/KLI-KoedingerCorbettPerfetti2012-pre.pdf),
not a claim that our seven combinations reproduce the paper's Table 3 taxonomy.
The three instructional compositions supply support for those focuses; response
formats constrain their expression and the resulting evidence. Combined categories
receive every selected focus, integrated into one coherent move rather than unrelated
tasks or every possible method on every turn. Model naming alone does not establish
relational understanding; rule recitation alone does not establish generalization;
a single correct response does not establish fluency. These generation instructions
do not add scoring dimensions, category-specific assistance, or automatic credit.
No extra synthesis provider call or generation engine is introduced.
The review workbook in `docs/sparc-primitive-instructions-proposal.xlsx`
contains the earlier 42 text/MC specifications and ten initial target assignments;
the runtime now composes 112 specifications across all four response formats.

Complete-move assistance logits are:

| Composition | Text | Cloze | Multiple choice | True/false |
| --- | ---: | ---: | ---: | ---: |
| Question | 0.5 | 0.75 | 1 | 1.25 |
| Explanation → Question | 1.5 | 1.75 | 2 | 2.25 |
| Explanation → Written example/comparison → Question | 2.5 | 2.75 | 3 | 3.25 |
| Explanation → Visual support → Question | 2.5 | 2.75 | 3 | 3.25 |

Selection temperature is 0.2.
The expectation floor remains 0.2, OET is fixed at 0.8, and the current-target boundary is unchanged.
The registered move IDs append `.text`, `.cloze`, `.multiple-choice`, or `.true-false`
to the dynamic base action. Student menus offer sixteen instructional options plus next-KC navigation.

Cloze uses the existing response box and one uniform `_____` blank for a meaningful
word or short phrase, without a word bank or exact-match answer key. Completing it must
require understanding the statement rather than grammar or word shape alone. The scorer
can credit understanding of the entire statement and its relationships, without treating
supplied wording as an independently produced explanation. Equivalent wording and ordinary
typos are accepted semantically; no fixed cloze ceiling or multiplier is imposed.

True/false reuses the choice controls with exactly two stable options, `true`/True then
`false`/False. Their order stays fixed. The generator supplies one clear proposition and
one correct flag, avoiding compound claims, double negatives, ambiguity, and wording tricks.
Choosing False rejects the displayed statement; it does not endorse that statement or
establish all alternative claims. Answer-key correctness remains distinct from KC coverage.
Both typed and selected answers retain the saved question identity and actual format for scoring.

The original format instructions draw on [Waterloo's item-writing guidance](https://uwaterloo.ca/centre-for-teaching-excellence/catalogs/tip-sheets/exam-questions-types-characteristics-and-suggestions)
and the [Kansas Curriculum Center guide](https://www.vet.k-state.edu/academics/clinical-sciences/docs/writing-test-questions.pdf),
especially its true/false and completion sections. Cloze prompts omit meaningful content,
avoid grammatical/length clues, and specify numerical units or precision when needed.
True/false prompts request varied truth values without predictable patterns or an extra
explanation task. These are prompt-quality requirements; structural validators enforce
one blank or the exact binary choices rather than claiming to certify semantic quality.

Generated MC questions have three or four distinct options with stable IDs and exactly
one correct answer. The library service randomizes their order separately for each
assignment using stable hash ranks of the assignment identity and option IDs. Generated
and retrieved questions follow the same assignment path; retrying an interrupted save
reproduces the order. The ordered choices are retained in learner history and exposure
records, while the shared catalog keeps its original list. Reloads render the saved
order, and existing saved questions retain their order. `sparcMultipleChoiceQuestion.ts` reuses TutorScript's semantic MC
expansion and standard buttons. Menu clicks remain `choice-selected`; MC answers become
`response-submitted`, bound to a saved `questionId` and `choiceId`. The selected option's
actual label is the learner contribution to the existing semantic evaluator; the saved
answer key records correctness without directly inventing KC coverage. Choosing a supplied
explanation does not establish that the learner independently produced it. Free-text
submission is disabled while an MC question is active. Stale/tampered options reject,
accepted responses score once, and reload retains option order and the selected answer.

Rich support realizes before dependent explanation/question generation. Images are framed
without a displayed caption or heading and retain their accessible description and saved
provider context. Nonimage support is framed with a compact form heading: Worked Example,
Comparison, or a short table/form label. Ordinary explanation remains unframed. Figure-library
retrieval, authorization, immutable asset versions, and saved decisions retain their owners.
Generated references use the support's actual visible heading (for example, "the comparison").
"Below" is optional; references follow the learner's reading order: explanation, support, question.

Ordinary authenticated OpenRouter requests are limited by the existing DDP rule to
600 requests per hour. A rich instructional turn can use separate calls for scoring,
feedback, support, explanation, and question; this limit accommodates those calls
and author testing. Method authorization and public-demo AI quotas still apply.

Initial packages live in `C:\dev\mofacts_config\SPARC Confidence Interval`.
They have fresh TDF/page identities, preserve the seven expectation and three misconception
texts, and select the two v2 policies. Source packages and learner history are
not rewritten. Upload them only after the category-aware application runtime is available.

KC graphs are server-derived data. SPARC AutoTutor package upload embeds each selected
expectation's text with `google/gemini-embedding-001`, then uses the shared normalized
cosine calculation to generate all non-self relationships and mean outgoing centrality.
Upload always generates these values; a supplied complete graph cannot bypass generation.
An embedding failure fails the upload rather than switching models or using supplied values.
Package preflight rejects `kcGraph.*` facts anywhere in the JSON, as well as
`expectationRelationships` and `expectationRelationshipProvenance`. These fields are not
authoring inputs. Current-package downloads omit generated graph data so that re-upload
regenerates it from the expectation content. Runtime persistence and resume may retain
generated graph values; this does not permit a package to supply them.

The older dynamic behavior described below applies to v1. Its historical acceptance
evidence does not verify the v2 extension. Current verification results are recorded
in the wiki specification.

`sparcDynamicInstructionRules.ts` provides the new student and agent rule family.
The existing response-evaluation production runs once; a separate feedback production
uses its assessment and saves a tutor node before selection or completion proceeds.
The app publishes that saved node to the existing surface immediately, awaiting its
render update before the production engine continues; feedback does not wait for the
next problem's generation to finish.
Feedback is bound to the intended target recorded on the answered question. Its
lookup and generation request contains that target's authored content and assessment
evidence, the answered instructional move, and the current learner response. Other
KCs, misconceptions, and their assessment evidence are excluded. The question's
saved target remains authoritative after resume or a later selection; an unbound
question is rejected rather than expanded to chapter-wide feedback. Authored opening
questions used with separate feedback must likewise have an explicit target in their
dialogue fact. This does not change the scope of response assessment or the embedding
matching cutoffs.

The feedback action identifies correct content and corrects the specific error or omission,
with enough explanation to understand the correction. It does not ask a new question.

The four compositions are question; explanation then question; explanation with
written example/comparison then question; and explanation with visual support then
question. They apply to expectation and misconception targets. The production chooses
written versus visual support before realization. Visual retrieval selects video,
image reuse, or image generation through the ordered resolver.
Question-only generation reuses the substantive focused-prompt instructions.

The agent uses the existing distance utility and Boltzmann temperature 0.2, with fixed
`logit(0.8)` and a 0.2 initial expectancy/floor. It does not advance OET or add forgetting.
The student chooses the same moves and can navigate to the next KC. Automatic target
selection excludes covered expectations and advances once the current goal is met;
explicit next-KC navigation retains the authored cycle. Final-answer feedback precedes
terminal handling in both conditions. Completion uses the existing admin cycle's
policy-specific eligibility calculation, not the general AutoTutor maximum-turn cutoff.

The generation service selects or generates rich support before explaining it. Display order
remains explanation, support, question. Both explanation and question receive the actual
saved figure pixels and description. Complete teaching figures use the shared situation
library described below. Worked examples
may include formulas and complete reasoning. Generated component text is plain text;
the obsolete all-components-in-one-HTML generation branch has been replaced. Retained
component-policy callers use the shared primitive path, preserving their move identities
and assistance values. Existing historical output remains replayable.

Accepted assessment, feedback, decision, and each generated component are persisted
through existing canonical transitions/nodes. Retry reuses saved support and the same
decision rather than re-evaluating, reselecting, or regenerating a saved figure.
Generation failures remain explicit and do not change the requested rich form.

Competitive cycles checkpoint response evidence in the assessment transition, then save
each KC's derived model observations as an atomic canonical transition. This keeps
seven-KC records within the existing history-extension budget. Retry reuses the accepted
assessment and target updates; evaluation publishes the combined facts after all writes
succeed. Existing bundled assessment records remain readable without migration.

Persisted primitive nodes for one move are projected into one tutor bubble, in component
order, with a single diagnostic. Only the question primitive asks a learner question;
figure descriptions and image briefs contain the teaching case only. Student selections
are projected from saved decisions as disabled selected buttons between the preceding
feedback and ensuing instruction, including navigation selections. They survive reload.

## Current ownership and source inventory

`sparcProgressiveScaffoldingRules.ts` owns the legacy sequence.
`sparcDynamicInstructionRules.ts` owns categorized productions, while
`sparcInstructionalCycle.ts` shares assessment, feedback, navigation, generation,
canonical persistence, and replay. `sparcCompetitiveSelection.ts` retains the
expectancy and Boltzmann helpers used by the categorized agent. The retired
five-move competitive rule factory, escalating OET action, fixed-agent rule family,
and old student scaffold menu are removed. Categorized move templates do not expose
the unsuffixed v1 moves as executable registry entries.

The retained family in `C:\dev\mofacts_config` is 14 packages in 12 directories:

- AutoTutor Compound Interest
- AutoTutor Confidence Interval
- AutoTutor Correlation Causation
- AutoTutor Natural Selection
- AutoTutor Nonviolent Communication
- AutoTutor Reinforcement Punishment
- AutoTutor Special Relativity
- AutoTutor Statistical Power
- AutoTutor Stock Shorting
- AutoTutor Working Memory Long Term Memory
- SPARC Confidence Interval (agent and student)
- SPARC Species and Speciation (agent and student)

The ten AutoTutor packages use `sparcsession` and `progressive-scaffolding-v1` for
both account roles. Each categorized directory contains one agent-v2 package and
one student-v2 package. Approved source content, identities, starting KC, categories,
misconceptions, thresholds, and server-owned graph generation remain unchanged.
Other SPARC lesson families are outside this retirement.

Intermediate student-selected, fixed-agent, competitive-scaffold, and v1 dynamic
policies are retired together with their seven source packages in six variant
directories and identified upload archives. Admin redirection to the competitive
policy is removed. The categorized agent still uses `-abs(theta + assistance - OET)`,
stable Boltzmann probabilities, temperature 0.2, expectancy floor 0.2, and fixed OET
0.8. Its twelve assistance values and category-specific options remain as specified above.
The categorized student retains the offered option and its target.

## History, installed lessons, and verification

Source retirement does not update installed lessons or delete learner records,
assignments, model state, scores, saved figures, or resume records. Historical
identifiers retain their original meaning for analytics and export. Retired authored
policies fail runtime construction. Installed retired packages require a separately
authorized administrator update/retirement operation. No such database change is
implied by source cleanup. Continuing a saved retired-policy attempt after an installed
lesson is changed requires an explicit decision; no migration or compatibility runtime
is authorized here.

Retained categorized assessment, feedback, model updates, decisions, and accepted
components keep their canonical history checkpoints. Replay reuses accepted evidence
and output without rescoring or regenerating accepted work. The legacy sequence
retains its existing history and resume contract.

Use `npm run typecheck`, `npm run lint`, and
`node scripts/sparcAutoTutorRules.test.cjs --include-client-contracts --include-history-contracts`
from `mofacts/`. Isolated contracts do not establish live Meteor/Mongo or browser
verification. Every `npm run test:ci` invocation requires fresh authorization.

Useful prior designs and acceptance accounts remain in the
[historical wiki record](https://github.com/memphis-iis/mofacts/wiki/SPARC-Instructional-Cycle-Historical-Record).
They do not establish current support for retired conditions.

## Optional YouTube video catalog

Video is an additional support form inside the existing rich-support primitive. It
adds no production families, assistance values, learner menu choices, or unit types.
The production selects the target and move; the rich primitive can select a catalog
passage or an existing support form. Questions retain the selected text/MC format.

**Preparation is explicit.** On Content, an administrator selects the desired package
(or condition) and clicks **Build video catalog** in its row. The build action and
KC-limit control appear only when the selected package or condition has a SPARC
session referencing an authored AutoTutor page. Other lesson types do not offer these
controls, and the server rejects their catalog requests before provider or storage work.
**First KCs (blank = all)** optionally limits a run to the first N authored targets, before any video search or
caption request. Targets follow package page order, expectations before misconceptions
within each page; failed targets count toward the limit. Upload, package updates,
and learner startup never launch catalog preparation. Keep the Content view open;
leaving it stops client orchestration at the next saved checkpoint. Clicking the action
again resumes selected sources, caption jobs, transcripts, and passage selections.
The package must already declare `tutor.setspec.contentLanguage`; the builder never
infers authored language from the interface, responses, speech settings, or account.

For every authored expectation and misconception, the first version searches the
complete authored KC text unchanged and takes only the top captioned, embeddable
YouTube result. Package titles and condition labels are not search terms, and no
model summarizes or screens the KC. Duplicate video/language pairs share one saved
transcript. Supadata is called with `mode=native`, `text=false` and small caption
chunks. No search result, missing captions, or no useful passages are reported as
failures for that build, not saved exclusions. The next explicit build may try again;
successful video selections and transcripts remain reusable preparation checkpoints.
The builder does not try a second video. Authentication, quota, partial-response,
and provider failures stop preparation visibly, without automatic retries,
transcription, or provider switching. Existing-caption mode does not purchase AI
transcription. Account subscription/recharge settings remain the account owner's
responsibility; this action never changes them.

The account's existing resolved dialogue model selects caption-ID ranges in bounded,
overlapping transcript windows. Code derives actual timestamps and rejects invalid,
duplicate, or greater-than-30-second intervals. Selected ranges are saved before
embedding. Embeddings are requested in batches of at most 32; reruns skip saved
segments. `SparcVideoTranscripts` and `SparcVideoCatalogTargets` own preparation artifacts;
all completed instructional passages live in the existing `SparcInstructionalLibrary`.
Origins retain package, page, target identity/type, and authored target text. A source
can yield multiple passages or none, and its originating KC does not restrict reuse.
Library listings, topic/subgroup membership, and pagination share the supported
component-type definition; video passages appear alongside the other component types.
Video thumbnails load YouTube's standard poster image from the saved video ID.

**Server-only setup:** place these keys in the effective ignored Meteor settings file,
then restart localhost using the canonical hotfix workflow. Never put them in a TDF,
`settings.public`, tracked settings, or a client environment variable.

```json
{
  "private": {
    "sparcVideoCatalog": {
      "youtubeApiKey": "YOUR_YOUTUBE_DATA_API_KEY",
      "supadataApiKey": "YOUR_SUPADATA_KEY"
    }
  }
}
```

Enable YouTube Data API v3 for the search key. Supadata's free tier can be used; each
uncached selected video's caption retrieval consumes its applicable service credit.
Search, dialogue-model and embedding costs are separate. Reruns reuse completed
transcripts; interrupted external requests are not a guarantee of exactly-once billing.
No provider SDK or other dependency is added.

**Instruction and durability:** the production selects written support or visual
support before requesting content. Written moves generate or retrieve a worked example,
comparison, or table. The visual move requests only a reusable visual brief, description,
and image display width from the dialogue model; its response contains no catalog IDs.
The visual resolver embeds the canonical instructional need including that brief once,
then searches eligible same-language video passages, searches images only after a video
miss, and generates an image only after both searches miss. As before, a video is eligible
only with an explicitly authored matching contentLanguage. Packages omitting that optional
metadata have no eligible videos and continue to image search; no language is inferred.
A missing package, malformed language, or failed catalog read remains an error. Each search uses the existing
configured cosine cutoff (currently 0.992). A miss means a successful search with no
eligible match at or above that cutoff. Embedding, catalog, validation, storage, and
provider errors propagate; none are converted into a miss. Both searches use the same
query vector and existing embedding model. Video candidates retain transcript-passage
embeddings; images retain canonical instructional-need embeddings. No index rewrite or
historical data migration is required.

New visual requests do not reuse an entire cached rich primitive ahead of this ordering.
Accepted primitive requests and visual decisions resume their original resource without
another search. The existing per-user decision ledger stores either the image identity
or a validated video snapshot (its segment ID occupies the existing assetId decision
key). Interrupted image generation retains its original pending brief and vector. Private
incomplete supported prompts continue using their separate image-only behavior.
`resolveSparcVisualSupport` is admin-only and shares the bounded authenticated OpenRouter
rate limit. Live YouTube search, caption retrieval, segmentation, and visual analysis
remain explicit catalog preparation work and never run during instruction.

The actual transcript grounds the explanation and question; unseen visual details are
not assumed. Typed video descriptors are validated at persistence and rendering boundaries,
not inserted as generated iframe markup. New reuse checks catalog availability in one
indexed batch per candidate page. Accepted learner snapshots retain their exact video,
interval and transcript; after administrative deletion, readers display **Administrative
removal** instead of playing the deleted passage. The player uses YouTube's start/end API
plus an independent playback-bound guard because seeking can clear YouTube's end setting.
It preserves native controls, captions, attribution, localized accessible labels and
inline errors. There is no automatic response submission or mastery credit for viewing.
Videos remain on YouTube: no download, editing, or local media hosting is performed.
Playback boundaries are not promised to be frame accurate.
The initial YouTube request includes the saved interval, and the ready player cues
its exact fractional start/end times. A pending start/seek is issued once rather than
repeated every polling interval; the independent end guard remains active after seeking.

Credential-free contracts can be run from `mofacts/` with
`node scripts/sparcVideoCatalog.test.cjs`. They cover provider requests, catalog caching,
resume, duration validation, access checks, actual-support grounding in text/MC moves,
and administrative removal of accepted content on reload. They do not replace a Meteor/Mongo
integration run or a real YouTube playback walkthrough. A localhost build of the first
five Species and Speciation KCs saved 18 passages across two KCs; one candidate had
no selected passages and two searches returned no result. Browser playback acceptance
remains separate from this catalog-building evidence. Each `npm run test:ci` invocation still requires
fresh explicit authorization.

## Shared Sunburst teaching-figure library — October 12, 2026

The user selected GPT Image 2.5 Sunburst. The initial default is Medium quality, one image, automatic aspect ratio, pinned OpenAI routing with provider fallback disabled. High, Xhigh, Max, Low and Auto are available provider quality settings; they are not a separate reasoning-effort control. Sunburst requests use quality and do not send Seedream's resolution parameter. Dialogue-model settings remain account-controlled.

For complete teaching figures, the first sufficiently novel instructional situation generates an image for the current learner and immediately adds it to the shared library. Subsequent situations reuse the nearest figure whose cosine similarity reaches the cutoff. There is no per-retrieval AI critic, suitability-reranking call, or advance human-approval gate. Human review is subsequent library maintenance. Incomplete supported-Prompt figures remain private and outside this teaching-figure index.

The situation embedding includes the selected target type and authored target texts, current target value when available, move assistance, and the planned illustration brief. The shared representation excludes account/session IDs, raw responses, and dialogue history. The existing primary embedding model, google/gemini-embedding-001, is used without switching to another model on failure. An embedding failure fails the selected move clearly.

The initial image experiment used 0.90. Images and text now share the 0.992 reuse cutoff in `SPARC_LIBRARY_SIMILARITY`; these values are experimental operating cutoffs, not correctness probabilities. The separate Meteor settings overrides were removed. The shared input contract and representation identity are in `learning-components/runtime/sparcInstructionalNeed.ts`. Match scores and source (generated versus semantic reuse) are retained in the private decision ledger. Reuse incurs an embedding request, but no image-generation request; resuming the same decision incurs neither.

The server-only sparc_figure_library collection stores originating situation embeddings and stable image IDs. sparc_figure_requests stores each account/TDF/session/production-event decision and temporary generation leases. DynamicAssets owns canonical image bytes and descriptions. No new TDF fields, learner controls, package changes, dependencies, or historical migration are required. Current SPARC admin-only access remains in force; generic asset routes still deny these images. Existing private assets retain their ownership and original pairing.

Nearest-neighbor search is exact cosine comparison across matching representation/image-model/embedding-model/dimension records, paged internally in batches of 100 with an index and bounded memory. Only candidate vector fields are read during search; the full library is never published to the client. Lookup cost grows with library size; this is not an approximate vector index or a capacity certification. Warm retrievals run concurrently. On a miss, a Mongo lease serializes discovery plus first generation across replicas and repeats the search before generating, so simultaneous close encounters can reuse the newly populated entry. Lease wait is bounded at 180 seconds; the lease expires after 15 minutes to recover from a stopped process and is released only by its owner.

A durable pending entry preserves the original brief and embedding across provider/storage failures. Once the canonical asset is ready, the transient generation payload is removed and the per-learner decision points to that asset. Restart/retry retains the saved decision identity. Administrative deletion removes its catalog content and image files; a content-free deletion receipt makes a later reload display **Administrative removal** in the affected field. Learner histories and model values are not rewritten.

Administrators can open **Content → Inspect instructional content library** at `/sparcImageLibrary` to inspect shared components across lessons. **Topics** opens a compact grid with representative thumbnails, generated labels and counts. Select a topic and subgroup to browse components sorted by type (Explanation, Feedback, Image, Question, Support, Video passage), then from the subgroup's center outward within each type. Text breadcrumbs return to either grouping level; there is no all-components view. Selecting a thumbnail opens its inspection panel above the grid, with revision and deletion controls. **Show more components** appends another bounded page and retains the selection. Image inspection shows the saved description, creation date and image model, with full-size access. Deleted entries and incomplete generations are absent from the catalog.

The gallery uses the active Theme tool's existing typography, density and semantic surface settings. Its main heading uses the same `1.5 * app_font_size_base` sizing as the shared app header, with `app_heading_font_family` and `app_page_header_text_color`; smaller headings and captions also scale from the base font size. Thumbnail heights and grid widths scale with `app_density_scale`. Image cards use the configured card/stimulus surfaces, large corner radius, text and border colors; the upload form uses the existing themed `form-control` styles and small corner radius. Buttons and focus styles continue through the shared theme rules. No new theme properties or server theme changes are required. The scoped gallery heading avoids inheriting the viewport-sized global hero heading rule.

Header comparison covered Content, Courses, Assignments, Data, Admin Control Panel, Backups, Security Audits and Theme templates. These use the shared app header and compact `h5`/`h6` section headings; Theme's `h3` is part of the intentional landing-page preview. No common management-header correction was warranted by this review.


The admin-only `listSparcInstructionalComponents` reader returns at most 24 entries per page within a validated current subgroup. It uses batched, field-limited membership, library metadata and canonical-asset reads. The browser fetches image pixels as cards enter view through `getSparcPromptImage`. Embeddings, learner identifiers, session records and credentials are not returned. Unknown missing canonical assets cause an explicit error; deliberate administrative removals display the removal marker. Inspection does not generate content.

Automatic grouping uses two levels of deterministic spherical k-means with cosine silhouette selection. First, a sample of at most 128 instructional-need embeddings per compatible representation-version/model/dimension space determines broad topics. A second streaming pass takes a separate bounded sample of at most 128 records within each topic, and the same algorithm selects its subgroups. A third pass assigns every completed catalog component to exactly one subgroup. Each level considers 2 through min(12, sample size minus one) groups, uses two deterministic initializations and at most 16 iterations, allows singletons with zero silhouette contribution, and selects the smallest candidate within 0.02 of the best score when that score reaches 0.20. Otherwise that topic has one subgroup; one- and two-item topics also retain one subgroup. The hierarchy stops after these two grouping levels. Counts and representative previews are cached for both levels; only leaf membership is stored. The `spherical-kmeans-silhouette-v3:two-level-v1` snapshot version invalidates flat browsing snapshots without changing content, retrieval embeddings, or learner decisions. Group counts are automatic browsing heuristics, not a claim of uniquely correct pedagogical topics. [Silhouette-based cluster selection reference](https://scikit-learn.org/stable/auto_examples/cluster/plot_kmeans_silhouette_analysis.html).

The grouping owner reads vectors internally in pages of 100, retains only the bounded samples and centers, yields between analysis steps and records stage/count progress. It stores derived snapshots and indexed membership documents in the server-only `sparc_figure_browse` collection. Catalog additions, revisions and deletions invalidate the browsing snapshot. A separate browsing lease serializes rebuilds without holding the image-generation lease. Publication checks the source revision so incomplete or obsolete builds are not accepted. Current snapshots remain cached, superseded snapshots expire after 30 minutes, and abandoned staging members expire after 24 hours. A stale group page asks the administrator to reopen Topics.

Small-library grouping verification, October 14, 2026: 276 isolated SPARC contracts, full-app typecheck and lint passed (28 existing vendor warnings, no errors). Added regressions cover a three-figure pair plus singleton, a five-figure 2/2/1 split with finite scores, singleton browse membership, and automatic replacement of an older algorithm snapshot. Signed-in localhost Chrome rebuilt the actual five-image library into Confidence Intervals and Coverage (2), Evolution and Population Change (2), and Homeostasis and Internal Stability (1); each group contained its expected figures. No retrieval embeddings, reuse flags, image versions or saved learner decisions were changed. The full Meteor integration suite was not run for this correction.

Broad English labels come from the three nearest representative figures' saved descriptions and authored target texts, in batches of at most four groups. Label generation uses the configured administrator OpenRouter key, model and reasoning level, with strict validated JSON and provider fallback disabled. No vectors, accounts, sessions, answers or learning histories are included in the label request. Cached group browsing and image inspection make no provider calls; a rebuild labels the new groups. Missing model/key configuration and provider or label-validation errors fail clearly rather than supplying invented replacement labels. Grouping changes neither instructional similarity retrieval nor saved figure decisions.

Semantic-browsing verification, October 13, 2026: all 237 isolated SPARC contracts passed, along with full-app typecheck and lint (28 existing vendor warnings, no errors). Fixtures covered automatic separation, small/identical collections, bounded sampling, full membership across multiple source pages, compatible-space isolation, cached labels, concurrent builds, invalid labels, revision races, authorization and paged member ordering. A synthetic 128-vector, 3,072-dimension fit selected four separated groups in 296 ms; this is not a production capacity benchmark. Chrome at localhost displayed the generated Confidence Interval Coverage group with two images, opened its center-ordered members and verified deprecation across the group and All images views. The tested flag was restored. Mongo snapshot/index regressions were added but the full Meteor integration suite was not rerun. These are local checks, not deployment or publication.

Image revision uses the existing generation lease to serialize writes across replicas. An administrator supplies a PNG, JPEG or WebP file of at most 8 MB and a plain-text description for the same instructional need. Storage replaces the current asset in place and refreshes its metadata under the same ID; no old image copies or version records are retained. Generic file downloads retain the existing private-image restrictions. The current deletion and revision contract is detailed below; the dated verification paragraphs that follow record earlier behavior, not support for retired version or exclusion controls.

Replacement verification (October 13): 240 isolated SPARC contracts passed, including current-version semantic selection, original decision/byte/caption preservation, multi-version paging, cached-cluster hydration, concurrent stale editor rejection and interrupted S3-storage retries. Full-app typecheck passed; lint and security-surface checks passed with 28 existing vendor warnings and no errors. Signed-in Chrome exercised the actual administrator file upload, durable save and Mongo transaction, and rendered the preserved original beneath the current replacement through Old versions. The temporary deprecated QA entry, both version records and both raster files were removed afterward; the two pre-existing teaching entries were retained. A Mongo concurrency/transaction regression was added for the supported isolated Meteor suite; that full suite was not run. These are local checks, not production deployment.



Deprecation-control verification, October 13, 2026: all 231 isolated SPARC contracts, full-app typecheck and lint passed. The localhost Chrome test checked the first figure's Deprecated box, reloaded and confirmed its saved checked state, then unchecked it and reloaded to confirm restoration. The test left both existing figures eligible for reuse. Injected method contracts also verified rejection of unauthorized users and invalid inputs, new-generation behavior after exclusion, and unchanged saved decisions and image access. The Mongo regression covers field-only updates and rejection of pending records but was not run in the full Meteor suite.

Repository-inspection verification, October 13, 2026: 229 isolated SPARC contracts and three route-policy checks passed, along with full-app typecheck and lint (28 existing vendor warnings, no errors). In signed-in Chrome at localhost, the Content link opened the gallery and both existing canonical figures rendered with descriptions and reuse status. The full-size link opened an image tab whose title reported the saved raster dimensions. Paging across 25 figures, inclusion of excluded/older-version figures, omission of private state and authorization failures were checked with injected fixtures. The Mongo-specific inspection regression was added but not run in the full Meteor integration suite. This records local verification, not production deployment.

The rich primitive selects or generates its actual support first. Both explanation and isomorphic-question generation then receive the selected figure's pixels and saved description, so they can use its actual case and values. The displayed composite remains one box in explanation/support/question order. The existing worked-example and no-rich paths retain their requested compositions.

Provider comparison: one 16:9 confidence-interval figure per quality level, with the same prompt and streaming off, produced Low $0.00517 / 10.7 seconds; Medium $0.00997 / 13.2 seconds; High $0.03391 / 23.4 seconds; Xhigh $0.05908 / 30.8 seconds; Max $0.13090 / 54.8 seconds; Auto $0.03391 / 24.1 seconds. All six preserved the central long-run-coverage concept. Numeric placement was approximate; no general reliability rate is established by this one case. Recraft V4.1 Pro cost $0.21 / 9.6 seconds and produced substantial counting, geometry, dot-placement, and text errors. Local comparison images, screenshots, prompt, and the HTML gallery are saved under the SPARC working browser-acceptance folder.

Verification, October 12, 2026: all 227 isolated SPARC/rule/client/library contracts passed. Full-app typecheck passed. Lint passed with 28 existing ostrio-files warnings and no errors; the server dependency boundary, Meteor dependency manifest, and 312-surface security contract checks passed. The localhost admin student-selected lesson generated a new Medium Sunburst teaching figure, then reused its byte-identical image for a distinct E2 move after an intervening E3 move. The reused move generated a fresh explanation and isomorphic question from the saved figure. The new E3 question correctly tested definite containment of a fixed mean after an observed E2-target drift was repaired in the question prompt. Previous selected-choice markers remained visible. Cross-account authorization and reuse were verified by injected contracts, not a two-account browser walkthrough. Mongo-specific integration tests have been added but were not run; each full Meteor CI invocation requires fresh explicit authorization under AGENTS.md. No release, commit, or push is claimed.

Asset lifecycle: the existing explicit admin asset-deletion path removes the matching library entry and per-learner decision metadata. Account deletion removes only that account's private figure decisions and preserves shared assets. These teardown callbacks are wired into the existing admin methods; no deletion was performed during this verification.

## Authorized Meteor integration verification — October 12, 2026

The user authorized the full Meteor suite and up to three further runs after failures. The first invocation passed 16 harness checks and 795 server tests (15 pending), then exited with Windows process status 0xC0000409 as Chromium client testing started. It reported no failing assertion or completed client result; no source defect was identified from that exit. The second invocation, using the same pinned runner and settings with a fresh disposable CI Mongo replica set, completed successfully: 16 harness checks, 795 server tests (15 pending), and 1,104 client tests (7 pending), with SERVER FAILURES: 0 and CLIENT FAILURES: 0. This includes the new real-Mongo figure-library lease and decision contracts. No further integration retries were used. Test-driver resolutions were cleaned by the supported runner; the disposable test database was removed and the existing localhost watcher was restored. This establishes integration coverage, not deployment or release-image qualification.


## Shared move library and retained evidence (October 15, 2026)

The categorized agent and student policies now route each instructional primitive
through the same retrieval-or-generation boundary. Production selection, assistance,
assessment of each learner response, and numeric model updates retain their owners.
Feedback, explanation, rich support, and questions have independent library entries;
complete instruction manifests reference their accepted immutable entry versions.
The canonical lesson session identifies decisions. The separate opaque OpenRouter
cache-session ID is not a persistence identity.

`learning-components/runtime/sparcMoveLibraryContract.ts` owns the transport contract;
`units/sparcsession/sparcMoveLibrary.ts` builds the pedagogical request context.
The client `sparcPrimitiveRealization.ts` owns the branch. Server storage, authorization,
validation, and matching live in `sparcMoveLibraryService.ts`,
`sparcMoveLibraryStorage.ts`, and `sparcMoveLibraryMethods.ts`.

- Candidates share the requested primitive type and, for questions, response format.
  Instructional relevance is decided only by cosine similarity of embeddings, starting
  at the configured cutoff (currently 0.99). There is no exact-context filter,
  exact-text shortcut, or AI review of matches.
  Selected KC meaning and category, assistance, selected evidence, and actual case
  form the shared embedding input. Feedback adds the preceding question and learner
  answer; images add the illustration brief. Operational IDs and full prompt
  specifications are excluded.
- The highest-similarity eligible candidate is reused. If that support already appeared
  in this conversation, it becomes an accessible link and highlight of the original
  support, with the prescribed move's unchanged assistance value. Saved decisions,
  content validation, embedding-model consistency, and library exclusions remain enforced.
- Written rich support uses primitive retrieval before generation and cannot reuse a
  video or image. New visual moves request a visual brief and resolve video, image,
  then generated image in that order, rather than reusing a complete cached rich
  primitive ahead of the video search. Accepted requests resume without reselection.
  Existing image assets and historical decisions remain readable, and figures saved
  before the primitive library remain available through the image search.
- Question repetition is checked using embeddings of the actual question text,
  against this learner's accepted/presented questions in the lesson, including earlier
  attempts. Its separate cutoff is currently 0.88. No generated descriptor,
  question decomposition, or separate evidence/judgment rules are used. A learner
  question lease serializes acceptance across tabs. Generated questions get at most three
  attempts; exhaustion leaves an explicit resumable error.
- Retrieval hits make no instructional-generation call. Assessment still runs.
  Immutable image reads are coalesced within the turn, stable prompt instructions
  precede variable move instructions, and existing provider session correlation is
  retained. Model, reasoning effort, provider routing, and streaming are unchanged.

The assessment can now retain brief demonstrated/incorrect/unresolved descriptions
within existing authored targets. `summary: null` carries forward an unchanged or
unaddressed summary. Changed summaries are separate `instructional.evidence` rows
in the same atomic batch as score changes and the assessment completion marker.
Citations contain stable learner-response IDs and exact character spans into the
canonical learner text, rather than copying quotations into every evidence row.
Per-target byte bounds and existing history/batch bounds remain enforced.

Instructional generation uses the selected target, its retained descriptive evidence,
and the current move's components. It does not include the full transcript, global
planner state, unrelated targets, or historical figures. Misconception moves contain
only the selected misconception and its evidence, without the full correct-KC list.
Earlier questions remain available for question novelty. Embedding lookup uses the
same focused context; feedback additionally includes the answered question and learner
answer. Assessment scope and production selection are unchanged.

Citation mismatches are warnings: assessment scores and descriptive summaries still
save, while only exact spans verified against learner responses become retained
citations. Tutor quotations and invalid history references are omitted. Stable response
identity remains required for a verified citation.

Shared entries contain reusable instructional content and context embeddings.
Private requests and exposure records are server-only and learner-scoped. Raw
learner response context is confined to the private request; it is not returned by
library inspection. Account removal clears private move requests, exposures, and
migration checkpoints alongside the existing figure-decision cleanup. Generation
prompts must keep personal information out of reusable instructional content.
All six library methods retain the categorized feature's administrator restriction;
provider-bearing methods join the existing OpenRouter rate limit.

Tutor output and its exposure projection commit in one Mongo transaction. This
closes the crash window before the presentation acknowledgement. Complete manifests
are assembled from the projected component references. Old canonical histories are
projected once in restartable pages of 100, indexed by user, lesson, event type, and
record ID. Backfill accepts components in any record-ID order and assembles each
manifest when all of its presentations have arrived. New question writes require
the complete manifest immediately. Historical rows and image IDs are not rewritten. New writes project
atomically while that migration runs. Subsequent lookup reads the exposure index,
not every conversation row. The serving application must be upgraded as one writer
cohort before relying on completed migration checkpoints; an older concurrent server
would not populate the new exposure index.

The existing `/sparcImageLibrary` route is titled **Instructional content library**.
It opens with embedding-based topics spanning all instructional components, including
images and video passages. Navigation follows Topics → topic → subgroup using a
single-line breadcrumb of parent links and the current location. There is no flat
all-components view. Sanitized
Markdown inspection, revision, and deletion apply to text components. Revision
updates the current item in place without retaining an older catalog copy. Image
components provide raster inspection, revision and deletion within the same grouped browser. There are no separate image/content libraries or tabs.

`SparcInstructionalLibrary` owns the single server-only `sparc_instructional_library`
collection. The figure and primitive storage modules are typed adapters to this one
collection; their request, exposure, version, and derived browsing collections hold
metadata rather than a second content repository. Startup transfers the two former
content collections in batches of at most 100 inside snapshot/majority transactions.
Each destination record is checked for exact equality before its source is removed.
Image entries gain `kind: image`; IDs, existing vectors, versions, exclusions, and
asset references remain unchanged. An identity conflict aborts the batch and startup;
completed batches are idempotent on restart. Old collections are not runtime read
paths. Before reversing a transfer, stop the application and explicitly restore the
appropriate records by component kind; no automatic fallback or rollback rewrites
accepted content. This consolidation does not alter instructional retrieval cutoffs.

The existing spherical k-means/silhouette grouping operates across component types
and storage schema versions sharing an embedding model and dimension. Incompatible
embedding spaces remain separate. The two-level snapshot version invalidates flat browsing snapshots;
new components and revisions invalidate the shared derived grouping. Browse Topics,
then a subgroup, then its component thumbnails. Breadcrumbs return to either level.
Subgroup pages retain type-first ordering, center-outward ordering within each type,
bounded cursors, and current representative previews. No new embeddings are needed;
labels for both levels use the existing administrator model and are cached.


### Shared instructional-need representation (October 15, 2026)

Images and text now call the same `instructionalNeed` projection and
`buildSparcInstructionalNeed` / `sparcInstructionalNeedText` contract in
`learning-components/runtime/sparcInstructionalNeed.ts`. The embedding describes
only the selected authored target (its meaning and category), available
selected-target evidence, assistance, and actual realized case. Feedback adds the
answered question and learner answer; images add their illustration brief. Missing
historical evidence/category is not invented. Operational IDs, prompt/schema
versions, full generation policies, unrelated targets, and whole transcripts are
excluded from the embedded text. Generation and selection contracts are unchanged.

The primary vector serves both retrieval and grouping. `embeddingVersion` identifies
its representation separately from content versions and the embedding model.
Question repetition retains its separate, identified vector of actual question text.
Raw feedback answers remain in private requests, never in public library summaries
or a shared need-source field. Image source needs retain their existing server-only
storage boundary. Storage-specific authored source fields are used for group labels,
not for another embedding.

An offline operator stages replacements and verifies source fingerprints before
calling `replaceInstructionalEmbeddingBatch` inside a snapshot transaction. The
helper limits batches to 100, verifies vector dimensions/normalization and readback,
rejects changed sources, and makes retries idempotent. All batches and pending
request updates belong to the same activation transaction while localhost is
paused. This is an explicitly invoked job, not paid work at startup. Preserve
accepted decisions; replace unfinished requests' private need inputs and vectors.
Retrieval rejects an unconverted primary vector instead of mixing representations.
Invalidate group snapshots after activation. Reindexing preserves content, IDs,
current assets, exposures, and administrative removal receipts.

The real Gemini Embedding 001 evaluation used cached Luna 6 medium feedback and
saved lesson content (including Astra 6 medium), with no new instructional generation.
At 0.99, one corrected answer incorrectly retrieved prior error-correcting feedback
(similarity 0.99180791). Tightening reuse to 0.992 rejected every observed negative
comparison and retained one of four approved feedback paraphrases (0.99250575),
compared with three of four in the earlier representation. The production matcher
confirmed zero wrong reuses across 40 negative feedback comparisons. Six minor image-brief
wording variations retrieved their intended image; none of 15 pairs of different
reusable images crossed the cutoff. These small development cases establish neither
a held-out error rate nor broad image-paraphrase robustness.

The unchanged grouping algorithm placed 104 text components with three biology
images (107 items) and four remaining images in a second broad group. The former
104-text-versus-7-image division disappeared, but the four-image group still combines
several topics. Linked support/image similarities increased from 0.8452/0.8415 to
0.9061/0.8919. Grouping is approximate navigation, not a retrieval correctness test.
The actual-question paraphrases remain 0.8863/0.8890 and are rejected at 0.88.

The explicitly authorized local replacement converted 111 components and four
unfinished requests. A real Mongo rollback check restored all sources, commit
readback preserved content metadata, and an idempotent retry made zero changes.

Post-reindex verification passed 351 isolated tests, full app typecheck, and lint
(0 errors; 28 existing vendor warnings). Authenticated Chrome verified mixed-content
groups, paging, image inspection, and rendered Markdown tables. A real authenticated
DDP check verified retrieval without generation, prior-explanation linking, accepted
request restoration after reconnect, and one Astra 6 medium feedback miss that
generated, saved, and restored without another generation call. Its client checkpoint
was an isolated test writer; this was not a new complete browser lesson/journal run.
The generated feedback was retained, bringing the library to 112 components.
Regrouping that library produced a 106-component group (105 text components and one
image) and a six-image group. Thus the original strict separation is gone, but a
strong image/text tendency and coarse topic grouping remain. This is not evidence
that instructional-need vectors alone guarantee fine semantic browsing groups.
The clustering algorithm was deliberately unchanged.

### Similarity cutoff and verification boundary

The user specified embedding-only instructional matching on October 15, 2026, retaining
primitive type and question response format. Testing started at 0.90 without a
calibration gate. After inspecting errors, the user approved separate reuse and
repetition cutoffs and required feedback to recognize correct answers. Reuse now defaults
to 0.992 for both text and images; question repetition remains 0.88. Both values
are owned by `SPARC_LIBRARY_SIMILARITY` in the shared instructional-need contract.
The separate image/text settings overrides have been removed. Cutoffs are
experimental operating values, not correctness probabilities. Additional matching rules
or evaluation criteria require the user's approval.

Existing accepted requests and content IDs are preserved. Old exact-compatibility
hashes are no longer read or written; candidate search uses the existing kind and
embedding-model fields with a supporting index. The shared-representation reindex
below replaces primary vectors without changing content or accepted decisions. Question-vector caches identify their input text and embedding model.
Unidentified older descriptor vectors are recomputed from actual question text on
use and the derived cache is replaced; failures propagate and a later request retries.
Accepted content and resume identities are not rewritten.

Library timing logs report embedding latency, generation-lease wait, candidate count,
and search latency without transcripts or vectors. Candidate search uses exact cosine
in indexed pages of 100; its cost grows with the eligible library size. The production
matcher was not replaced. Real-provider matching, browser acceptance, and Mongo
integration checks are separate from injected contract tests.

Local verification after the cutoff revision on October 15: 335 isolated tests passed, including complete
primitive retrieval without generation, canonical session identity, concurrent
question reservations, immutable revisions, change-only evidence/resume, and
history/projection transaction failure behavior. Full application typecheck passed;
lint passed with 28 existing vendored-package warnings and no errors. These checks
do not establish real Mongo transaction behavior, semantic threshold quality, or
an observed provider-latency improvement. Authenticated Chrome verification found
and fixed the DDP all-types filter contract (explicit null rather than an undefined
positional argument). The library now loads its empty state and all five filter
choices without errors in the active theme.

Bounded real-provider verification used Luna 6 medium (`openai/gpt-6-luna`) for
generation and `google/gemini-embedding-001` for embeddings. A localhost run at 0.90
generated an explanation once and reused it for paraphrased input at 0.9796. Three
different instructional targets did not reuse it. Threshold testing then used the
production matcher with injected storage, real vectors, and four synthetic feedback
cases. It tested four acceptable paraphrases, four corrected answers, and 24
cross-case comparisons representing incomplete libraries. At 0.90 there were 15
inappropriate reuses; at 0.99 there were zero among the 28 negative comparisons and
three of four acceptable paraphrases were retained. The user specified that feedback
which merely repeats an old correction without recognizing a correct answer counts
as inappropriate reuse. These are reviewed synthetic examples, not a held-out
reliability estimate. The stricter cutoff also misses the earlier 0.9796 explanation
paraphrase.

Two actual-question paraphrases scored 0.8863 and 0.8890, motivating the separately
approved repetition cutoff of 0.88. A final localhost service run verified a feedback
paraphrase hit at 0.99047, fresh-feedback selection after a corrected answer, rejection
of a paraphrased question, acceptance of a different question, and identical saved
content on resume. Synthetic entries created by these runs were excluded afterward.
This covers real DDP/library/provider paths and saved service decisions; it does not
claim a complete browser lesson, production deployment, or new full Meteor integration
run. The five-prompt Luna/Astra comparison was separate; Astra was not the generator
for these threshold tests.

After the focused-context and citation revision, 339 isolated tests, full application
typecheck, and lint passed (28 existing warnings, no errors). Chrome verification with
response-confirmed Astra 6 medium completed the previously blocked misconception move,
then correct and partially correct answer feedback. Its explanation lookup fell from
31,621 to 4,416 characters. Reload restored the new feedback and student choices once;
the existing agent-selected question also resumed. Five new library entries were saved.
This pass did not encounter a retrieval hit, so it does not establish browser highlighting
acceptance. Assessment remained broad and was still the largest latency source.

Further Astra browser testing reached a malformed multiple-choice item: two provider
labels ended mid-word and were nearly identical. The UI matched the raw response.
Generation instructions now require complete, concise, conceptually distinct options
within the existing 240-character limit, placing shared wording in the stem. One real
Astra retest of that target produced four complete distinct choices. The defective
shared entry was excluded through library curation; the saved unanswered learner item
was preserved pending the user's recovery decision. This is one successful retest,
not a guarantee of model output quality or full lesson acceptance.

The user subsequently authorized replacing the unanswered test question while keeping
its history. A correction appends a canonical `value-changed` transition and an
`append-node` operation using the existing question node ID and original move identity.
Revisions update the current catalog entry; already-recorded history and exposures remain unchanged.
Prior journal rows and learner scores are not rewritten. Answer binding and dialogue
facts resolve the active version by stable node ID, matching display replay. A correction
must verify that the item is still unanswered before writing. Local verification passed
340 isolated tests, full typecheck, and lint; the new test verifies preserved original
rows, a single current question, and answer binding to the corrected option meaning.

Further figure QA found a generated scatterplot whose separate trait ranges did not
overlap as its brief and description required. The original figure and shared support
were excluded from reuse. Regeneration with explicit coordinate geometry produced
overlap on both axes; visual inspection preceded an append-only correction of the
unanswered move's support node. The existing question, 570 prior history rows, and
scores remained unchanged. Image-output compliance remains a generation-quality risk;
no automatic image critic or additional retrieval criterion was introduced.

The bounded Astra run subsequently reached 21 displayed turns and a coverage total of
17/24. Seven chapter KCs remained, and the next question was saved unanswered near the
authorized spending limit. A final reload restored it once without a loading state or
new model call, across 752 retained history rows. The shared library held 77 entries,
66 reusable. No new retrieval hit occurred, so prior-support highlighting still lacks
acceptance evidence from this full browser path. This was not complete chapter or
production-release acceptance.

A later provider output met the 2,048-character schema limit but exceeded the
2,048-byte JSON UTF-8 message budget because JSON quoting and escaped newlines count
toward persistence. Generation instructions now state both limits. Invalid content
is rejected before publication or display. Reload now continues the latest unfinished
accepted instructional event in an established categorized attempt, reusing its
assessment, feedback, selected action, and saved components. Completed attempts still
restore without generation. Isolated agent and student reload tests verify that no
accepted assessment, feedback, or support is repeated.

The user subsequently raised the total test budget to $25. The same agent-selected
species/speciation browser attempt completed all 24 expectations in 30 turns with
response-confirmed `openai/gpt-6-astra`, medium reasoning. A full reload across 1,055
retained history rows restored 24/24 coverage, final feedback, and Continue, with no
new model request. Continue returned to the practice menu; trying to relaunch there
explicitly reported that the lesson was already completed. The menu still groups all
previously used lessons under its generic "in progress" label; this does not reflect
the persisted completion state and remains a separate display issue.

The conservative aggregate accounting was $23.7777, including the earlier $1 reserve
and known figure/embedding charges; it is not a reconciled provider bill. The shared
library then contained 104 entries, 93 reusable. No new retrieval hit occurred during
this lesson continuation, so this run establishes generation, progression, completion,
and full resume, but does not establish browser highlighting acceptance or reuse speedup.
The student-selected condition was not taken through a second complete biology lesson
in this pass. The current changes passed 341 isolated tests, full application typecheck,
and lint (zero errors, 28 existing warnings). No full Meteor CI invocation, release,
deployment, commit, or push was performed. Automatic retry after output-validation
failure remains a pending user design decision; the observed recovery used manual reload.

## Administrative deletion and revision (October 18, 2026)

The instructional library has **Delete** and **Revise**, with no exclusion or deprecation state. Delete permanently removes the catalog entry. Image deletion removes its saved image and dependent support entries; video deletion removes dependent saved support. Completed-move manifests that reference deleted entries are removed because they are retrieval metadata, not learner history. Revision updates the current item in place. Text revisions replace its text and answer key as applicable; image revisions replace its raster and description. No parent links, predecessor records, old-version controls, or retained image revisions are supported.

`server/lib/sparcLibraryCurationStorage.ts` owns deletion. Its content-free receipts contain only an ID, removal time, and transient cleanup markers while deletion is unfinished. They are outside the catalog and contain no text, embeddings, media, or learner data. Readers use these receipts to show **Administrative removal** in the original field rather than report an error or regenerate substitute content. An image field can be removed without erasing neighboring tutor text. Batched receipt lookup checks at most 100 exact IDs per request. A deleted multiple-choice question has no answer controls or replacement answer key. Unrelated missing/corrupt records and storage/network failures remain errors.

The forward startup migration runs after collection consolidation. It removes existing `reusable: false` entries in pages of at most 100, records removal receipts, and unsets retired exclusion and predecessor fields on survivors. It also retires the old image-revision layout, keeping only the current image and deleting obsolete image assets and revision records. Catalog entries, shared manifests, and receipts change transactionally; image-file cleanup runs afterward and retains a retry marker until successful. A transient cleanup marker lets restart finish dependent and media deletion after the catalog item is removed. Restart repeats unfinished work safely, logs deletion counts and failures, and never edits learner histories, accepted decisions, exposures, or model state. Deletion is permanent: restoring content requires an operator backup, not a hidden archive or an Allow reuse control. The authorized existing-exclusion cleanup therefore has no in-app rollback.

Run `node scripts/sparcLibraryCuration.test.cjs` for isolated selection, revision, authorization, and rendering contracts, and the required full typecheck/lint. Mongo transaction, migration, and physical media cleanup require the supported Meteor integration environment; every integration invocation requires fresh user authorization. The current transfer tool writes format v2 and rejects retired exclusion/predecessor fields; re-export a fresh bundle after migration instead of importing an old exclusion-bearing bundle. No authored TDF fields or lesson packages change.
