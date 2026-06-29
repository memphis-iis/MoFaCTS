# FireTutor SPARC AutoTutor Controller Plan

Status: draft from complete MHTML chat exports plus correction against the current SPARC implementation vocabulary. This is intentionally not a final specification. It captures the main design points and the questions that still need answers before implementation should harden.

Sources reviewed:

- `PESOSE - Young Lady's Illustrated Primer.mhtml`
- `PESOSE - Human Drives and Cognition.mhtml`
- Current SPARC code concepts: nested `nodes`, `productionRules`, state/history replay, progressive node operations, and cluster/stimulus model writes.

## Core Framing

The common controller should not treat AutoTutor dialogue and SPARC pages as separate intelligences. The shared flow is aligned with AutoTutor's current separation of responsibilities: interpret the learner event, plan the next instructional move, then realize that move through the current surface. SPARC differs because interpretation is not always LLM scoring. Some node responses are transparently scored by production rules or response logic, and the LLM interprets those known results in context rather than rescoring them.

In SPARC, that decision should be realized through the machinery the system already uses:

- the SPARC page/node hierarchy
- production rules and production-rule-like actions
- working memory/state writes
- feedback and hint actions
- progressive node operations such as appending, inserting, or extending nodes
- replayable SPARC history
- shared model-history writes through the ordinary cluster/stimulus model

AutoTutor is one realization style for these decisions, mainly conversational. SPARC is the broader workspace where the same planned moves may also change the page, add non-dialog content, update state, or let the student continue without visible intervention. The proposed umbrella design label from the chats is FireTutor: a motivated pedagogical controller for adaptive dialogue, dynamic worksheets, and reactive instructional pages.

## Corrected Vocabulary

| Avoid | Use instead | Reason |
|---|---|---|
| graph | SPARC page/node hierarchy, page state, or document state | The current SPARC object is authored as nested nodes, not as a separate graph abstraction. |
| edges | production-rule references, node IDs, behavior refs, trace metadata, or state writes | SPARC does not currently have a distinct edge object. Relationships are represented through authored rules, node hierarchy, metadata, and state. |
| graph mutation | production-rule effect, page/node update, progressive node operation, or state transition | Runtime changes should be expressed in the same action vocabulary SPARC already replays. |
| typed edge schema | production-rule/action schema and trace/provenance metadata | The relevant structure is the rule/action/history contract, not a new relationship layer. |

## Questions And Design Points

| # | Design point | Question to answer | Current leaning | User Answer |
|---|---|---|---|---|
| 1 | Every student action should produce an interpretable event with node values, trigger, focus, page state, history, and relevant model state. | What exact event/context object should the controller receive? | Define a compact `ControllerContext` built from SPARC trial result, replay state, current page, cluster model state, and recent history. | generalize autotutor |
| 2 | Interpretation and planning should be separate, matching AutoTutor's scoring/interpretation, app planning, and realization split. | What exactly belongs in the SPARC interpretation result versus the SPARC plan? | Interpretation says what happened and what it means; planning chooses the next instructional/page action. | Yes |
| 3 | SPARC interpretation is not always LLM scoring. | Which node responses are system-scored, LLM-scored, mixed, or not scorable? | Make response evaluation mode explicit for each event so the LLM knows whether to evaluate the response or interpret a known result. | Some evaluations will be generalization of autotutor with LLM scoring. Many stuent actions will not need interpretation, but be intepreted the same way as clusterKC trial |
| 4 | A valid controller decision may do nothing visible. | How should "let the student continue" be represented? | Make `no_visible_intervention` or `allow_continue` an explicit action, still recorded in trace/history when useful. |
| 5 | SPARC behavior should remain production-rule-centered. | Should the planner choose among authored production rules, emit constrained production-rule-like actions, or generate reusable rules? | Begin with a planner that chooses among authored rules/action patterns or emits constrained action instances; reusable generated rules are later. |
| 6 | Page changes should use the current progressive node operation style. | Which page/node operations are allowed in v1? | Start with existing operations: `append-node`, `append-node-if-missing`, `insert-node`, and `append-text`; add new operations only when required. |
| 7 | Controller outputs must be executable and replayable. | What validator is needed before executing LLM-selected actions? | Validate node targets, operation types, required fields, KC/cluster targets, state keys, and history payloads before any runtime write. |
| 8 | Nondeterministic templates are a target capability. | How do we represent generated non-dialog page actions without reducing them to authored text? | Define parameterized page-action patterns that can produce nodes, hints, feedback, state writes, or practice credits, not only utterances. |
| 9 | AutoTutor-style generated text remains useful but is not the whole system. | When should the realization step generate prose versus structured page-action content? | Let the planner select the instructional action first; prose is only one possible realization. |
| 10 | Production rules define the possibility space. | How much of that possibility space is authored versus generated at runtime? | V1 should combine authored constraints with runtime-selected/generated action instances; fully generated reusable rules are a later step. |
| 11 | The controller needs current learner model/history, as AutoTutor does. | How much history should be sent to the LLM? | Send recent relevant SPARC history, model state for targeted clusters, and summarized prior controller decisions rather than raw full history. |
| 12 | SPARC page history and model learning history have different jobs. | What event shape keeps them separate but linked? | Record SPARC controller/action history separately; model writes still target ordinary cluster/stimulus identities. |
| 13 | Generated content and actions need provenance. | What is the minimum provenance payload? | Include triggering student action, diagnosis, selected action, target nodes, target clusters, evidence, controller version, and resulting writes. |
| 14 | Local controller missions may live on pages, nodes, or action patterns. | Where should authors define goals, expected ideas, misconceptions, and allowed interventions? | Support page-level defaults plus node/action-level overrides. |
| 15 | Human drives and needs may shape pedagogical priorities. | Should motivational state be explicit in v1? | Leave schema room for it, but do not require motivation/drives as a first implementation dependency. |
| 16 | The authoring UI should not expose raw internals unnecessarily. | What must authors be able to edit? | Authors should edit goals, target clusters, expected ideas, misconception labels, allowed action patterns, and constraints. |
| 17 | FireTutor is a possible subsystem name. | Should `FireTutor` be code-level naming now? | Keep it as the design label unless explicitly adopted for implementation. |

## Draft Plan

### 1. Define The Controller Context

Create a compact context object for each student action. It should include:

- submitted node values
- focused node and trigger
- current SPARC page identity and node hierarchy
- current replay/state snapshot
- relevant production rules or allowed action patterns
- recent SPARC history
- relevant cluster/stimulus model state
- page, node, or action-level controller mission
- response evaluation mode, such as `system_scored`, `llm_scoring_required`, `mixed`, or `not_scorable`
- system-known score/outcome when available

This context is the SPARC equivalent of the information AutoTutor sends for response interpretation, expanded to include page state and possible page actions.

### 2. Define The Interpretation Result

The first LLM call should interpret the student action. It should not choose the final page operation or write the tutor-facing content. It should include:

- student-action diagnosis
- accepted system score/outcome, when one was provided
- semantic score/evaluation only when the response evaluation mode requires it
- evidence and confidence
- model evidence or model-credit recommendation
- misconceptions, partial understanding, or productive progress
- relevant history/context summary
- provenance/debug explanation

For multiple choice, numeric, button, drag/drop, or production-rule-scored input, the LLM should treat the system result as evidence and interpret its instructional meaning. For essay or short answer, the LLM may also evaluate the learner's response semantically.

### 3. Define The Planner Output

The planner consumes the interpretation result and current SPARC context. It chooses what should happen next. The planner output should include:

- selected instructional action, including `allow_continue` when no visible intervention is warranted
- target nodes and target clusters
- visible or invisible realization
- requested production-rule-like effects
- provenance/debug explanation

The selected action may be visible or invisible. "Let the student continue" is a real decision, not a missing decision.

The first implementation should decide whether this planner is deterministic app code, an LLM call constrained by schemas, or a hybrid. AutoTutor uses deterministic app planning after LLM scoring; SPARC should preserve that separation even if the planner later includes LLM assistance.

### 4. Realize And Execute Through SPARC Production-Rule Effects

Do not add a new graph/edge system. Controller decisions should compile into the same categories of effects SPARC already understands or can validate coherently:

- working memory/state writes
- feedback or hint messages
- progressive node operations
- response outcome records
- model-history writes through cluster/stimulus resolution
- replayable history events

For v1, use the existing progressive node operations where possible: `append-node`, `append-node-if-missing`, `insert-node`, and `append-text`.

### 5. Add A Validator Boundary

Before execution, validate every planned or realized effect. The validator should reject:

- unknown action/effect types
- missing or invalid node IDs
- malformed progressive node operations
- missing required state keys
- KC/cluster references outside the unit clusterlist
- model-credit requests that cannot resolve to a cluster's first stimulus
- history records without enough provenance to replay and debug

The LLM may interpret and propose. The runtime remains responsible for deciding whether the proposal is executable.

### 6. Support Nondeterministic Page-Action Patterns

Move beyond deterministic templates and dialogue-only LLM prose by defining page-action patterns. A pattern is a constrained generator for one kind of instructional intervention, such as:

- add a scaffold node
- add a targeted hint
- insert a worked example
- add a contrast/remediation block
- ask a local question in the page
- annotate or extend an existing explanation
- credit a KC and allow progress

These patterns should be able to generate non-dialog page changes, not just tutor utterances.

### 7. Align The Two LLM Calls With AutoTutor's Split

The SPARC controller should keep two LLM calls, but the calls should not collapse interpretation and planning together.

Call 1 is interpretation. It receives a bounded interpretation packet:

- student event: submitted node values, focused node, trigger, and timestamp
- current page state: relevant nodes, visible context, current progressive additions, and current working-memory/state values
- response evaluation mode and system-known score/outcome when available
- learner evidence: recent SPARC history, relevant cluster model state, and prior controller decisions
- target structure: target clusters/KCs, expected ideas, known misconceptions, and completion criteria

Call 1 emits an interpretation result:

- diagnosis of the student action
- accepted score/outcome or semantic evaluation
- model evidence and misconception/understanding evidence
- context summary for the planner
- brief rationale/provenance

Then the planner selects the next instructional action from the interpretation and the allowed SPARC possibility space. This may be deterministic app code, a constrained LLM-assisted planner, or a hybrid, but it should be a separate step from interpretation.

Call 2 is realization. It receives the selected plan and emits only the concrete content or parameters needed to implement that plan:

- tutor message text, when a message is needed
- generated node content, when a page update is needed
- page-action pattern parameters
- proposed progressive node operation content
- state/history payload fragments

The runtime then validates and compiles the realized result into executable SPARC effects. For page changes, the first supported compilation targets should be the existing progressive node operations:

- `append-node`
- `append-node-if-missing`
- `insert-node`
- `append-text`

This means the LLM does not simply emit arbitrary next node operations. It interprets when needed, and it may realize content or parameters for a selected action. The validated runtime turns the selected and realized action into production-rule-style effects. Later versions may allow LLM-assisted planning or reusable production-rule generation, but only through validation and approval boundaries.

### 8. Preserve Shared Learning History

When the controller credits practice or evidence for a KC, it should target the ordinary cluster model. Runtime should resolve the target cluster to its canonical first stimulus and write model history using the same identity that flashcard sessions use.

SPARC page replay/history should stay page-scoped. Model learning history should stay shared across SPARC, flashcards, and later sessions that address the same clusters.

### 9. Build A Pilot Before Broad Generalization

Use one SPARC lesson as the first pilot. The pilot should demonstrate:

- a student action interpreted with page state and model/history context
- at least one system-scored response interpreted without LLM rescoring
- at least one LLM-scored short-answer response, if the pilot includes text input
- a possible no-visible-intervention decision
- a visible feedback or hint decision
- a non-dialog page update through progressive node operations
- a model-history credit through a cluster
- replayable provenance showing what the controller decided and why

After the pilot works, broaden the action pattern library and revisit whether runtime generation of reusable production rules is appropriate.

## First Implementation Boundary

The first implementation should not attempt unconstrained page generation. It should build the controller skeleton, the context schema, the interpretation result schema, the planner output schema, the realization boundary, the validator, a small set of production-rule-like effects, replayable history, and a small library of nondeterministic page-action patterns.

## Questions To Resolve Next

1. What exact fields belong in the per-action `ControllerContext`?
2. Which student actions are immediately scorable, and which require LLM interpretation before model credit?
3. Should the SPARC planner be deterministic app code like AutoTutor's planner, LLM-assisted, or a hybrid?
4. If the planner is hybrid, what decisions can the LLM influence without bypassing validation?
5. What is the v1 set of allowed production-rule-like effects?
6. Which progressive node operations are enough for the pilot, and what operation is missing if they are not enough?
7. How should "allow continue / no visible intervention" be recorded in SPARC history?
8. How much SPARC and model history should be sent to the LLM interpretation call?
9. What context should the realization call receive after the planner has selected an action?
10. What is the minimum provenance needed for debugging and research analysis?
11. Where should page-action patterns live in config: inside `sparcPages`, beside them, or in reusable controller templates?
12. What is the first pilot lesson for validating this architecture?
13. What authoring UI is needed for goals, misconceptions, allowed patterns, and target clusters?
14. Should generated reusable production rules be allowed later, and if so what approval or validation workflow is required?
