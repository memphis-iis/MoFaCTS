# SPARC Session Unit

SPARC is intended to become a reactive instructional document engine, not a
small tutor-widget clone and not a learning-session subtype.

The current unit wrapper delegates adaptive/logistic sequencing to the shared
model package in `../../models/adaptive-logistic/`. That is only the first
boundary: the long-term SPARC architecture should treat authored content as a
replayable, addressable document graph whose widgets, expressions, model
updates, and history records can interact across the document.

The first contract types for that direction live in
`sparcSessionContracts.ts`. They define document addresses, authored nodes,
reactive events, practice observations, replayable state transitions, SPARC
history extension records, and CTAT/BRD trace-comparison records.

## Direction

SPARC content should be addressable below the region level. A region may point
to another region, a widget inside another region, an authored field, a response
slot, a hint, or a nested subpart. Regions are layout containers, not the
smallest semantic unit. The content format should therefore give every
meaningful authored object a stable id and should allow path-like references to
nested targets.
`sparcDocumentAddressing.ts` is the first resolver for that rule. It resolves a
document id, node id, and optional nested path against an authored document tree
and validates references without falling back to visual order or renderer DOM
state.

SPARC should be reactive. Widgets and authored expressions emit events; events
update document state, model state, and history; dependent expressions then
recompute. A response outcome will usually trigger an adaptive model update, and
conditions should be able to query current model state without treating the
model as a separate widget island.
`sparcConditionEvaluator.ts` is the first renderer-independent condition
boundary. Conditions can query replayed SPARC state cells, query model-state
metrics through `sparcModelQueries.ts`, and compose those checks with
`all`/`any`/`not` without using renderer globals or string evaluation.

SPARC practice and flashcard practice must use the same canonical history and
database records where their concepts overlap. Shared fields include time,
outcome, response value, practice duration, stimulus identity, response
identity, and model target identity. SPARC-specific fields should live as typed
extensions on the shared record, not in a separate SPARC-only persistence path.
Flashcard practice must be readable by SPARC when it refers to the same model
target, and SPARC practice must be readable by card practice for the same reason.
The first shared query surface for those records is
`../../runtime/modelPracticeStateQueries.ts`; SPARC accesses it through
`sparcModelQueries.ts` so authored conditions can query model-related state
without importing Learning Session code or adaptive-logistic internals.
`../../runtime/modelPracticeHistoryExchange.ts` gives every component a
normalized view of canonical model practice records, including model rows
written by card practice or model-linked SPARC outcomes. SPARC layers
`sparcModelHistoryExchange.ts` on top only to preserve SPARC-specific
observations when a model row also carries a SPARC extension.

Authored content is the start state. Ordered history records should describe the
changes from that start state well enough to recreate the learner-visible
document state, practice state, and model state. This does not require knowledge
tracing in the first implementation, but it does require stable event identity
and replay semantics. Authored documents can declare `initialState` writes for
addressed state cells; `sparcAuthoredInitialState.ts` materializes those writes
as the replay baseline without creating history records. History then records
only learner/runtime changes from that baseline. `sparcDocumentReplay.ts`
combines authored baseline creation with ordered history replay so document
runtime callers do not have to rebuild that sequence by hand.
`sparcResponseOutcomeProcessor.ts` is the first response-event boundary for
that rule: it turns a widget/reactive response outcome into one canonical SPARC
history record containing the practice observation, replayable state transition,
and optional trace step. Model-linked outcomes use shared model identity fields;
non-model reactive outcomes remain SPARC history without pretending to be card
practice. Model-linked outcomes also emit an explicit model-update request so a
live adaptive-model capability can update probabilities without SPARC importing
Learning Session internals. The model-linked canonical record is built through
`../../runtime/modelPracticeUpdates.ts`, keeping the shared flashcard/SPARC
history shape outside the SPARC unit itself. Adaptive-logistic probability state
can consume the same request through
`../../models/adaptive-logistic/modelPracticeUpdateApplication.ts`, which matches
the canonical model target by identity rather than by SPARC or Learning Session
session-local indices. A host runtime should expose that behavior through the
generic `adaptive-model` capability from `../../runtime/modelPracticeRuntime.ts`
and persist the returned canonical record through the `history` capability.
Authored nodes can declare `modelTarget`; `sparcAuthoredModelTargets.ts`
resolves the deepest model target for a full document address, and
`sparcAuthoredResponseOutcome.ts` uses that authored binding when a response
outcome does not supply an explicit override. Document validation checks that
an authored model target names the same SPARC document and authored node where
it is attached; when `sparcPath` is present, it must end at that authored node.
The same validation also applies the shared model-history identity rules, so
`KCId`/`KCDefault` must match `stimulusKC` and `KCCluster` must match
`clusterKC` before a document can emit model practice records.
`sparcResponseOutcomeCommit.ts` is the SPARC-side orchestration point for that:
model-linked outcomes are applied through `adaptive-model` before the returned
shared model record is written, while SPARC-only reactive outcomes write their
SPARC history record directly.
The same `adaptive-model` capability answers live model-state queries such as
probability; history-backed model queries continue to cover replayable metrics
such as prior correct, prior incorrect, total practice duration, and last
outcome.
`sparcReactiveRuleEvaluator.ts` evaluates condition-gated document rules and
returns replayable state transitions. Rule writes target full
`SparcDocumentAddress` values, so a rule from one region can update another
region or a nested address inside that region without relying on visual layout
order. Document validation also resolves state-condition query targets inside
authored rules, including nested `all`/`any`/`not` condition trees, so reactive
dependencies fail at authoring time instead of at first learner interaction.
`sparcStateTransitionHistory.ts` wraps those transitions in canonical SPARC
history records so replay can recreate rule-driven document changes from the
authored start state.
Authored SPARC documents can carry `reactiveRules` directly, keeping declarative
reactivity with the authored start state instead of in renderer-local scripts.
`evaluateSparcAuthoredReactiveRules` is the default entry point for executing
those authored rules.
`sparcReactiveRuleCommit.ts` adds the persistence boundary: authored rule
matches become canonical SPARC state-transition history records, and no-op rule
passes do not write empty history.
`sparcResponseOutcomePipeline.ts` ties response commits to authored rules: it
writes the response/model record first, replays that record into document state,
then evaluates and persists any matching authored rules. The pipeline returns the
final replay state after both response and rule history records are applied.
`commitSparcResponseOutcomeFromDocumentHistory` is the document-runtime entry
point: it starts from authored `initialState`, applies prior canonical history
records, commits the new response/model record, and then evaluates authored
rules against the resulting state and shared model history.
`processAndCommitSparcAuthoredResponseOutcome` is the higher-level entry point
when the runtime has a raw response outcome: it resolves authored model bindings
first, then uses the same document-history commit path.

The unit registry should become the long-term plugin boundary. SPARC should get
rendering, history, adaptive-model, practice-record, content-state, and external
sync capabilities through explicit runtime interfaces instead of reaching into
learning-session or Meteor internals.
`SparcSessionUnitEngine.ts` now exposes document-runtime entry points directly:
document-reference validation, authored-start-state plus history replay, and
authored response commit through canonical history. The commit entry point takes
the history writer explicitly and uses the engine's shared adaptive-model API
for model-linked outcomes; it does not import Learning Session unit code or
create a SPARC-only persistence lane. The engine also exposes the CTAT sample
BRD batch verifier advertised by the manifest, so hosts can run the sample
production-rule equivalence check through the same unit-runtime boundary.
The current manifest advertises the first SPARC-owned services through
`providedServices`: document addressing, document replay, state replay,
response-outcome history, authored initial state, authored model targets,
authored response outcomes, condition evaluation, model-history exchange,
model-query adaptation, model-update requests, response-outcome
commit/authored-rules, vertical layout validation, CTAT trace comparison,
CTAT sample BRD verification, reactive rule commit/evaluation,
state-transition history, and sample documents.

## BRD And CTAT Role

CTAT BRD files are a reference and test oracle, not the final architecture. The
primary BRD use is to prove that selected SPARC sample problems have equivalent
production-rule logic and model-trace behavior to the CTAT originals.

The recommended first BRD milestone is a trace-comparison adapter:

- extract the expected CTAT rule/action sequence for the two sample BRD
  problems;
- author equivalent SPARC widgets and response events;
- record SPARC trace events with stable rule/action ids;
- compare the logical trace order and outcomes;
- defer knowledge tracing until the production-rule equivalence is proven.

The initial executable extraction/comparison boundary is
`ctatBrdTraceExtractor.ts`, `sparcTraceFromTrialResult.ts`, and
`sparcTraceComparison.ts`. The BRD extractor turns CTAT BRD edges into
reference trace steps using the production rule and full SAI triple. The SPARC
trace generator turns authored SPARC display trace metadata plus submitted nodes
into comparable trace steps. The comparator checks SPARC trace steps against
reference steps by production rule, action, outcome, and optional
stimulus/response KC identities.
Because the CTAT BRDs also contain startup/interface-population edges,
`selectCtatReferenceSubtrace` projects the selected sample rule/action sequence
from the larger BRD trace and fails if any expected step is missing or out of
order.
`sparcSampleTraceManifest.ts` names the first two CTAT sample BRDs
(`balloons.brd` and `cookies.brd`) and carries explicit BRD-derived reference
traces plus matching SPARC trace fixtures generated from authored SPARC display
metadata and submitted values for those production-rule/action sequences. Those
fixtures prove the trace-comparison oracle and trace-generation boundary.
`assertAllSparcSampleTracesMatchCtatBrds` is the batch verification entry point:
the caller supplies CTAT-root-relative BRD XML by path, SPARC extracts each BRD
trace, selects the authored sample subtrace, and compares every selected sample
fixture. Full authored SPARC document content for the same problems remains
separate work.
`sparcSampleDocuments.ts` adds the next layer: small authored SPARC document
fixtures for the same samples, with stable widget nodes, separate regions, and
cross-region references into nested content. These are trace/document skeletons,
not finished chapter-scale instructional layouts.

## Replay Boundary

`sparcStateReplay.ts` is the first renderer-independent replay boundary. It
loads ordered canonical history records, skips non-SPARC events, requires SPARC
events to carry the typed `sparc` extension, applies explicit
`stateTransition.writes`, and collects SPARC practice observations and trace
steps. It does not infer state from DOM layout, renderer widgets, or node names.

The current replay state is a key/value cell map addressed by document id, node
id, optional nested path, and state key. This is intentionally lower level than
the eventual document renderer: it proves that history records can replay
changes below the region level while leaving layout, expression recomputation,
and adaptive-model query execution to explicit future capabilities.

## Shiny-Inspired Layout

Shiny for R is a better layout/reactivity inspiration than CTAT for parts of
SPARC. SPARC should borrow the mental model of declarative inputs, outputs,
conditional panels, reactive values, observers, modules, default usable layouts,
state bookmarking/reproduction, and embedding interactive apps inside larger
dynamic documents. It should not copy Shiny's runtime directly.

The layout invariant remains vertical scrolling only. Wide authored elements
should declare how they reflow, shrink, stack, or render inside a constrained
viewer. Page-level horizontal scrolling should be treated as a layout error.
`sparcLayoutPolicy.ts` is the first executable check for that invariant: SPARC
documents must declare vertical layout; authored nodes with `width`, `minWidth`,
or `maxWidth` must declare `reflow`, `shrink`, `stack`, or `constrain`
behavior; and authored nodes must not request horizontal overflow through
`overflowX: "auto"` or `overflowX: "scroll"`.

## Open Design Questions And Recommended Answers

1. What is the address model?
   Use stable authored ids plus nested path references. Do not rely on visual
   region order as identity.

2. What is the shared practice-event shape?
   Define a canonical practice event with required shared fields and typed
   SPARC/card extensions. Use that as the database/history bridge.

3. How is state replayed?
   Recreate state by loading authored content and applying ordered history
   events. Treat history records as state transitions, not just audit logs.

4. How does SPARC query adaptive state?
   Provide model-state query functions through the shared `adaptive-model`
   capability. History-derived metrics can be answered from canonical model
   records; probability must come from the live model-state provider.

5. How much BRD should be translated?
   Translate enough to prove production-rule and model-trace equivalence for
   the sample problems. Do not translate BRD layout or runtime assumptions
   directly into SPARC.

6. What should be implemented next?
   Define types for SPARC document addresses, reactive events, canonical
   practice observations, and replayable state transitions before adding more
   renderer behavior.
