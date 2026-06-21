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
history extension records, and runtime trace records.

## Direction

SPARC content should be addressed by authored nodes only. Nodes can contain
nodes, but references should not require authors or runtime code to describe a
containment path. Any meaningful authored object that can be referenced,
updated, scored, shown, hidden, or linked to model state should be a node with a
stable id.
`sparcDocumentAddressing.ts` is the first resolver for that rule. It resolves a
document id and node id against an authored document tree and validates
references without falling back to visual order, renderer DOM state, or
hierarchy traversal.
Authored `refs` can also declare `stateKey` or `modelMetric` metadata, so a
cross-node link can say whether it depends on a specific replayed state cell or
model query metric instead of relying on visual placement.

SPARC should be reactive. Widgets and authored expressions emit events; events
update document state, model state, and history; dependent expressions then
recompute. A response outcome will usually trigger an adaptive model update, and
conditions should be able to query current model state without treating the
model as a separate widget island.
`sparcConditionEvaluator.ts` is the first renderer-independent condition
boundary. Conditions can query replayed SPARC state cells, query model-state
metrics through `sparcModelQueries.ts`, and compose those checks with
`all`/`any`/`not` without using renderer globals or string evaluation.
Authored nodes can also declare `reactive.visibleWhen` or
`reactive.enabledWhen`, giving SPARC a Shiny-style conditional panel/output
shape while keeping the condition language shared with authored rules.
Document validation resolves those node-level state and model conditions before
runtime, including references to contained nodes by their own ids.

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
Authored documents declare model identities in `clusterTargets`; SPARC nodes
may attach zero or more `clusterIndex` values through `clusterIndices`.
Nodes remain interface/document elements, not model stimuli. `sparcAuthoredModelTargets.ts`
resolves model-linked outcomes from an explicit cluster target or from an
addressed node with exactly one cluster attachment. Missing cluster targets,
ambiguous node attachments, and SPARC-only nodes fail clearly before model
history is written. Document validation applies the shared model-history
identity rules to cluster targets, so `KCId`/`KCDefault` must match
`stimulusKC` and `KCCluster` must match `clusterKC` before a document can emit
model practice records.
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
`SparcDocumentAddress` values, so a rule from one node can update another node
without relying on visual layout order. Document validation also resolves state-condition query targets inside
authored rules, including nested `all`/`any`/`not` condition trees, so reactive
dependencies fail at authoring time instead of at first learner interaction.
`sparcStateTransitionHistory.ts` wraps those transitions in canonical SPARC
history records so replay can recreate rule-driven document changes from the
authored start state.
Authored SPARC documents can carry `reactiveRules` directly, keeping declarative
reactivity with the authored start state instead of in renderer-local scripts.
`evaluateSparcAuthoredReactiveRules` is the default entry point for executing
those authored rules.
`sparcProductionRuleEvaluator.ts` is the first SPARC-owned production-rule
substrate for CTAT-informed tutor behavior. It treats interface state, learner
events, problem givens, and inferred model state as working-memory facts, then
matches Jess-like fact patterns with variable bindings and explicit tests. BRD
edges are expected to be converted into evidence for these generalized rule
families, not copied as graph transitions. Rule effects can assert new working
memory facts, write addressed interface state, emit templated hint/buggy/success
messages, classify an action, and credit KCs. This keeps SPARC declarative and
node-addressed while allowing Fractions and Stoichiometry rules to generalize
across problem content instead of hard-coding a single BRD path.
`sparcProductionRuleCommit.ts` and `sparcReactiveRuleCommit.ts` add persistence
boundaries: authored production-rule and reactive-rule matches become canonical
SPARC state-transition history records, and no-op rule passes do not write empty
history. Production-rule assertions are persisted as hidden working-memory state
cells and rehydrated into facts on later events, so a rule can infer model state
such as an active common denominator and a later rule can match that inferred
state without making it a visible document node. Interface effects remain
explicit addressed node writes.
Stoichiometry content uses the same mechanism with authored `chemistry-field`
facts: rules derive accepted conversion values, units, cancellation, and result
values from problem facts and prior completed-field facts, while BRD-derived
buggy responses remain learner-facing feedback effects.
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
The current unit manifest still declares `adaptive-card-model` because the
wrapper borrows the shared adaptive-logistic card engine; that is a visible
transitional dependency, separate from the generic model-practice
`adaptive-model` API used for SPARC outcome updates and model-state queries.
`SparcSessionUnitEngine.ts` now exposes document-runtime entry points directly:
combined authored-document validation, document-reference validation,
authored-start-state plus history replay, and authored response commit through
canonical history. The combined validation gate runs both address/reference
checks and vertical-layout checks, so host runtimes do not have to remember two
separate validators before rendering or committing a document. The commit entry
point takes the history writer explicitly and uses the engine's shared
adaptive-model API for model-linked outcomes; it does not import Learning
Session unit code or create a SPARC-only persistence lane.
The current manifest advertises the first SPARC-owned services through
`providedServices`: document addressing, document replay, state replay,
authored-document validation, response-outcome history, authored initial state,
authored model targets, authored response outcomes, condition evaluation,
model-history exchange, model-query adaptation, model-update requests,
production-rule commit/evaluation, response-outcome commit/authored-rules,
vertical layout validation, reactive rule commit/evaluation, and
state-transition history.

`sparcAuthoringCatalog.ts` is the source-owned starting point for editor-facing
TutorScript/SPARC authoring palettes. It catalogs supported atomic nodes,
generated group patterns, semantic nodes, layout policies and glue modes,
production-rule fact patterns/tests/expressions/effects, and reactive
state/model conditions. Editor UI should project from that catalog instead of
retyping node and rule vocabularies in a separate surface.

## Content Development Role

SPARC runtime code must stay generic. It must not import, special-case, or
hard-code any particular lesson content. The active content-development targets
live in the configuration repository, currently `C:\dev\mofacts_config\SPARC
Fractions Addition` and `C:\dev\mofacts_config\SPARC Stoichiometry`.

Those TDF packages are the content test point for moving toward CTAT-like
functionality in the new SPARC system. Development should improve the generic
runtime contracts and, when necessary, the authored TDF content so those
packages run correctly. CTAT may inform expected learner-facing behavior, but
BRD files are not a SPARC runtime input, fixture source, service boundary, or
test oracle in this codebase.

## Replay Boundary

`sparcStateReplay.ts` is the first renderer-independent replay boundary. It
loads ordered canonical history records, skips non-SPARC events, requires SPARC
events to carry the typed `sparc` extension, applies explicit
`stateTransition.writes`, and collects SPARC practice observations and trace
steps. It does not infer state from DOM layout, renderer widgets, or node names.

The current replay state is a key/value cell map addressed by document id, node
id, and state key. This is intentionally lower level than the eventual document
renderer: it proves that history records can replay node-level changes while
leaving layout, expression recomputation, and adaptive-model query execution to
explicit future capabilities.

## Shiny-Inspired Layout

Shiny for R is a useful layout/reactivity inspiration for the visual and
reactive document experience SPARC wants. The Shiny thread is primarily about
elegant default layout, readable vertical documents, and reactive authoring
concepts. SPARC should borrow the mental model of declarative inputs, outputs,
conditional panels, reactive values, observers, modules, default usable layouts,
state bookmarking/reproduction, and embedding interactive apps inside larger
dynamic documents. It should not copy Shiny's runtime directly.

The first authored-layout vocabulary for that direction is deliberately small:
nodes can be `panel` or `module`, and layout policies can declare
`layoutMode: "document"`, `"stack"`, `"columns"`, `"sidebar"`, or `"tabs"`.
`columns` and `sidebar` are allowed only when the node also declares
`wideContent: "reflow"` or `"stack"`, so Shiny-style multi-panel authoring still
collapses into a vertical document instead of creating a horizontal-scroll
surface.

The visual vocabulary is also declarative: `visualPreset` can name assignment,
chapter, section, practice-panel, feedback-panel, callout, or control-panel
treatments, and `density` can be compact, comfortable, or spacious. Those tokens
give the eventual renderer polished layout defaults for spacing, surfaces, and
type scale without embedding per-node CSS or copying Shiny runtime behavior.

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
   Use stable authored node ids. Do not rely on visual order or containment
   paths as identity.

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

5. How should CTAT-like behavior be pursued?
   Use the real SPARC TDF examples in the config repository as the content test
   point. Do not import BRD files or hard-code lesson-specific behavior in the
   runtime.

6. What should be implemented next?
   Define types for SPARC document addresses, reactive events, canonical
   practice observations, and replayable state transitions before adding more
   renderer behavior.
