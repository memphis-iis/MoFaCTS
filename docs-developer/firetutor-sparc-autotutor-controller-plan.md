# FireTutor SPARC AutoTutor Controller Plan

Status: draft from complete MHTML chat exports plus correction against the current SPARC implementation vocabulary. This is intentionally not a final specification. It captures the main design points and the questions that still need answers before implementation should harden.

Sources reviewed:

- `PESOSE - Young Lady's Illustrated Primer.mhtml`
- `PESOSE - Human Drives and Cognition.mhtml`
- Current SPARC code concepts: nested `nodes`, `productionRules`, state/history replay, progressive node operations, and cluster/stimulus model writes.

## Core Framing

The common controller should not treat AutoTutor dialogue and SPARC pages as separate intelligences. The shared unit is an instructional decision made after a student action: interpret what the student did, update or consult the learner model/history, then decide whether the page should remain as-is, advance, give feedback, add scaffolding, revise content, or credit practice.

In SPARC, that decision should be realized through the machinery the system already uses:

- the SPARC page/node hierarchy
- production rules and production-rule-like actions
- working memory/state writes
- feedback and hint actions
- progressive node operations such as appending, inserting, or extending nodes
- replayable SPARC history
- shared model-history writes through the ordinary cluster/stimulus model

AutoTutor is one realization style for these decisions, mainly conversational. SPARC is the broader workspace where the same decisions may also change the page, add non-dialog content, update state, or let the student continue without visible intervention. The proposed umbrella design label from the chats is FireTutor: a motivated pedagogical controller for adaptive dialogue, dynamic worksheets, and reactive instructional pages.

## Corrected Vocabulary

| Avoid | Use instead | Reason |
|---|---|---|
| graph | SPARC page/node hierarchy, page state, or document state | The current SPARC object is authored as nested nodes, not as a separate graph abstraction. |
| edges | production-rule references, node IDs, behavior refs, trace metadata, or state writes | SPARC does not currently have a distinct edge object. Relationships are represented through authored rules, node hierarchy, metadata, and state. |
| graph mutation | production-rule effect, page/node update, progressive node operation, or state transition | Runtime changes should be expressed in the same action vocabulary SPARC already replays. |
| typed edge schema | production-rule/action schema and trace/provenance metadata | The relevant structure is the rule/action/history contract, not a new relationship layer. |

## Questions And Design Points

| # | Design point | Question to answer | Current leaning |
|---|---|---|---|
| 1 | Every student action should produce an interpretable event with node values, trigger, focus, page state, history, and relevant model state. | What exact event/context object should the controller receive? | Define a compact `ControllerContext` built from SPARC trial result, replay state, current page, cluster model state, and recent history. |
| 2 | The controller should interpret the student's action before deciding what to do. | Should interpretation and action selection be one LLM call or separate steps? | Use one structured interpret-and-plan call initially, with separate fields for diagnosis, model evidence, and selected action. |
| 3 | The system may update the model on each student action. | Which actions are scorable, and when should model-history writes happen relative to LLM interpretation? | Treat model credit as an explicit production-rule/controller effect; pass current model/history into the LLM and write validated credits through the cluster/stimulus bridge. |
| 4 | A valid controller decision may do nothing visible. | How should "let the student continue" be represented? | Make `no_visible_intervention` or `allow_continue` an explicit action, still recorded in trace/history when useful. |
| 5 | SPARC behavior should remain production-rule-centered. | Should the LLM generate production rules, choose among authored rules, or emit production-rule-like actions? | Begin with production-rule-like actions constrained by a validator; later allow author-approved rule generation. |
| 6 | Page changes should use the current progressive node operation style. | Which page/node operations are allowed in v1? | Start with existing operations: `append-node`, `append-node-if-missing`, `insert-node`, and `append-text`; add new operations only when required. |
| 7 | Controller outputs must be executable and replayable. | What validator is needed before executing LLM-selected actions? | Validate node targets, operation types, required fields, KC/cluster targets, state keys, and history payloads before any runtime write. |
| 8 | Nondeterministic templates are a target capability. | How do we represent generated non-dialog page actions without reducing them to authored text? | Define parameterized page-action patterns that can produce nodes, hints, feedback, state writes, or practice credits, not only utterances. |
| 9 | AutoTutor-style generated text remains useful but is not the whole system. | When should the LLM generate prose versus structured page actions? | Let the controller select the instructional action first; prose is only one possible realization field. |
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

This context is the SPARC equivalent of the information AutoTutor sends for response interpretation, expanded to include page state and possible page actions.

### 2. Define The Controller Decision Schema

The controller response should be structured, not just prose. It should include:

- student-action diagnosis
- evidence and confidence
- model evidence or model-credit recommendation
- selected instructional action
- target nodes and target clusters
- visible or invisible realization
- requested production-rule-like effects
- provenance/debug explanation

The selected action may be visible or invisible. "Let the student continue" is a real decision, not a missing decision.

### 3. Execute Through SPARC Production-Rule Effects

Do not add a new graph/edge system. Controller decisions should compile into the same categories of effects SPARC already understands or can validate coherently:

- working memory/state writes
- feedback or hint messages
- progressive node operations
- response outcome records
- model-history writes through cluster/stimulus resolution
- replayable history events

For v1, use the existing progressive node operations where possible: `append-node`, `append-node-if-missing`, `insert-node`, and `append-text`.

### 4. Add A Validator Boundary

Before execution, validate every controller-selected effect. The validator should reject:

- unknown action/effect types
- missing or invalid node IDs
- malformed progressive node operations
- missing required state keys
- KC/cluster references outside the unit clusterlist
- model-credit requests that cannot resolve to a cluster's first stimulus
- history records without enough provenance to replay and debug

The LLM may interpret and propose. The runtime remains responsible for deciding whether the proposal is executable.

### 5. Support Nondeterministic Page-Action Patterns

Move beyond deterministic templates and dialogue-only LLM prose by defining page-action patterns. A pattern is a constrained generator for one kind of instructional intervention, such as:

- add a scaffold node
- add a targeted hint
- insert a worked example
- add a contrast/remediation block
- ask a local question in the page
- annotate or extend an existing explanation
- credit a KC and allow progress

These patterns should be able to generate non-dialog page changes, not just tutor utterances.

### 6. Preserve Shared Learning History

When the controller credits practice or evidence for a KC, it should target the ordinary cluster model. Runtime should resolve the target cluster to its canonical first stimulus and write model history using the same identity that flashcard sessions use.

SPARC page replay/history should stay page-scoped. Model learning history should stay shared across SPARC, flashcards, and later sessions that address the same clusters.

### 7. Build A Pilot Before Broad Generalization

Use one SPARC lesson as the first pilot. The pilot should demonstrate:

- a student action interpreted with page state and model/history context
- a possible no-visible-intervention decision
- a visible feedback or hint decision
- a non-dialog page update through progressive node operations
- a model-history credit through a cluster
- replayable provenance showing what the controller decided and why

After the pilot works, broaden the action pattern library and revisit whether runtime generation of reusable production rules is appropriate.

## First Implementation Boundary

The first implementation should not attempt unconstrained page generation. It should build the controller skeleton, the context and decision schemas, the validator, a small set of production-rule-like effects, replayable history, and a small library of nondeterministic page-action patterns.

## Questions To Resolve Next

1. What exact fields belong in the per-action `ControllerContext`?
2. Which student actions are immediately scorable, and which require LLM interpretation before model credit?
3. Should the LLM choose among authored production rules first, or directly emit constrained action instances?
4. What is the v1 set of allowed production-rule-like effects?
5. Which progressive node operations are enough for the pilot, and what operation is missing if they are not enough?
6. How should "allow continue / no visible intervention" be recorded in SPARC history?
7. How much SPARC and model history should be sent to the LLM on each action?
8. What is the minimum provenance needed for debugging and research analysis?
9. Where should page-action patterns live in config: inside `sparcPages`, beside them, or in reusable controller templates?
10. What is the first pilot lesson for validating this architecture?
11. What authoring UI is needed for goals, misconceptions, allowed patterns, and target clusters?
12. Should generated reusable production rules be allowed later, and if so what approval or validation workflow is required?
