# SPARC: Semantic Pages with Adaptive Rules and Cognition

This document defines **SPARC** (Semantic Pages with Adaptive Rules and Cognition): a web-native approach for instructional document design and runtime adaptation.

SPARC content is authored in **TutorScript**, the canonical JSON schema for SPARC documents.

- Windows/environment note:
  - Authoring and canonical paths in this document are written for a Windows checkout.
  - Use canonical Windows paths from `C:\dev` such as `C:\dev\mofacts_config\...`.
  - Any remaining `/` characters are not filesystem separators here; they appear in schema/version or phrasing tokens (for example, `tutorscript-sparc/1.0`) by design.

- TutorScript schema (JSON): `C:\dev\MoFaCTS\docs-developer\tutorscript.schema.json`
- SPARC Runtime Usage Checklist (current example contract): `C:\dev\mofacts_config\SPARC_Runtime_Usage_Checklist.md` (canonical config repo path sibling to `MoFaCTS`)
- SPARC Phase 1 Execution Checklist (implementation handoff): `C:\dev\MoFaCTS\docs-developer\sparc-phase-1-execution-checklist.md`

## SPARC Example-First Implementation Status (Active)

This phase is being executed as an example-first implementation pass, not as a generic spec-first exercise.

- **Goal preserved:** build a unit-engine-ready document format where nodes and node groups support two-level hierarchy and adaptive, model-driven behavior.
- **Concrete artifacts created in the config repo:**
  - `C:\dev\mofacts_config\SPARC Fractions Addition\SPARC_Fractions_Addition_stims.json`
  - `C:\dev\mofacts_config\SPARC Fractions Addition\SPARC Fractions Addition_TDF.json`
  - `C:\dev\mofacts_config\SPARC Stoichiometry\SPARC_Stoichiometry_stims.json`
  - `C:\dev\mofacts_config\SPARC Stoichiometry\SPARC Stoichiometry_TDF.json`
- Both examples currently use:
  - `display.type = "sparc"`
  - `display.schema = "tutorscript-sparc/1.0"`
  - explicit `group` and `atomic` node levels
  - explicit `layout.zones` plus per-group `placement`
  - explicit read-only `givens` with `readOnly: true`
  - node-level `response.intentByNode` where scoring is intended
- For both examples, `response` and `intentByNode` are currently defined on each stimulus’ `display` object (`clusters[...].stims[...].display.response`).
- The Runtime Usage Checklist now serves as the acceptance target for the first SPARC runtime usage path and should be used to drive the first implementation tests.
- Execution tasks are now the actionable phase-1 implementation sequence: `C:\dev\MoFaCTS\docs-developer\sparc-phase-1-execution-checklist.md`.

### Open/limited deviations from earlier plan language

- The plan’s earlier broad vision remains intact, but initial implementation favors **filled-in examples** over a pristine, fully abstract first draft.
- Schema and runtime details below are being validated against these two examples before generalization.

When authoring content for SPARC, use TutorScript for:

* semantic page structure,
* component contracts (state, actions, telemetry hooks),
* semantic action interpretation rules,
* adaptive rule definitions,
* event/state model shape,
* replay-ready logging requirements,
* and KT/rule-simulation integration.

## 1. Core Product Concept

Build a web-native system for authoring and delivering **reactive instructional documents**: structured instructional pages that combine explanatory text, embedded activities, simulations, adaptive feedback, hints, telemetry, knowledge tracing, and model-traced interaction.

The system should avoid the H5P-style model of embedding opaque compiled widgets. Instead, instructional components should be native parts of the page, exposing their state, events, and controllable actions to a shared instructional runtime.

Working description for SPARC:

> A reactive instructional document system in which semantic instructional components emit typed learner events, those events are interpreted as meaningful student actions, the actions update a hybrid instructional state model, and rules/student models drive adaptive feedback, hints, simulations, and research-grade logging.

## 2. Theoretical Lineage

The system should explicitly borrow from, but not copy, three traditions.

### 2.1 Cognitive Tutors / CTAT

Borrow:

* model tracing
* tutorable interfaces
* semantic interpretation of student actions
* distinction between correct, incorrect, buggy, and hint-relevant steps
* behavior recording / example tracing
* step-level feedback and hints
* skill/KC tagging and learning analytics

Avoid:

* making authoring depend entirely on hand-coded production systems
* requiring every activity to have a full cognitive model
* limiting the system to traditional problem-solving tutors

### 2.2 ACT-R-Inspired Hybrid Modeling

Borrow:

* symbolic state tracing
* goals/subgoals as interpretable instructional states
* production-like rules
* subsymbolic/quantitative learner variables
* latency and activation-like quantities
* conflict between possible interpretations/actions

Avoid overclaiming:

* the system is not necessarily a full ACT-R implementation
* it is better described as ACT-R-inspired or cognitive-tutor-inspired

Preferred phrase:

> **SPARC / hybrid model tracing**

Meaning:

> SPARC traces both symbolic instructional states and quantitative learner/simulation/time variables.

### 2.3 OLI / Torus and Adaptive Courseware

Borrow:

* embedded activities inside instructional text
* learning-objective/KC alignment
* courseware-level instrumentation
* authoring and runtime integration
* analytics for course improvement

Avoid:

* treating activities as isolated courseware widgets
* limiting adaptivity to coarse sequencing or completion rules

## 3. Main Architectural Principle

Do not make the sealed “activity widget” the core unit.

Use smaller semantic primitives:

* structured instructional document nodes
* reactive instructional components
* raw component events
* semantic student/system actions
* observable state variables
* rule-addressable component actions
* KC/model bindings
* time-derived signals
* append-only telemetry
* traceable instructional states

An activity is a composition of these primitives rather than a black-box object.

## 4. Core Architecture

The runtime should have the following conceptual flow:

```text
Reactive component event
        ↓
Raw event log
        ↓
Semantic action interpreter
        ↓
Hybrid instructional state model
        ↓
Model tracing / rule evaluation
        ↓
Student model / KT update
        ↓
Adaptive component actions
        ↓
Updated reactive page
```

The key CTAT-like addition is the **Semantic Action Interpreter**.

## 5. Semantic Action Interpreter

This is the crucial bridge between interface interaction and tutoring logic.

It converts low-level component events into instructionally meaningful actions.

Example:

```text
Raw event:
  graph.line_dragged, slope = 4

Semantic action:
  student proposed slope = 4 for line y = mx + b

Instructional interpretation:
  attempted_step = set_slope
  expected_value = 3
  result = incorrect
  possible_bug = confused_rise_with_slope
  kc_ids = ["linear_slope"]
```

The system should log both levels:

1. **Raw component event** for replay and debugging.
2. **Semantic interpreted action** for model tracing, rules, KT, and analytics.

This avoids the H5P problem of having only shallow widget telemetry.

## 6. Hybrid Model Tracing

The system should support both symbolic and quantitative tracing.

### 6.1 Symbolic / State Tracing

Trace things like:

* current instructional goal
* current activity
* current step
* current subgoal
* expected next actions
* alternative correct strategies
* buggy paths
* hint-relevant impasses
* interface state
* completion state

Example:

```text
Student is in activity: graph_linear_equation
Current step: set_slope
Expected semantic action: propose_slope = 3
Observed semantic action: propose_slope = 4
Diagnosis: incorrect step, possible slope misconception
```

### 6.2 Quantitative / Time-Based Tracing

Trace quantities such as:

* KC mastery estimate
* predicted probability correct
* elapsed time on step
* time since last meaningful action
* response latency
* hint usage
* error rate
* retrieval strength
* simulation variables
* confidence or engagement proxies

Example:

```text
kc_linear_slope = 0.61
elapsed_on_step = 94 seconds
prior_errors_on_step = 2
hint_level = 0
```

### 6.3 Hybrid Rule Conditions

Rules should be able to combine both kinds of information:

```text
IF current_step = set_slope
AND proposed_slope is incorrect
AND elapsed_on_step > 90 seconds
AND kc_linear_slope < .70
AND hint_level = 0
THEN show targeted slope hint
```

## 7. Hybrid Reactive State Model

Represent each instructional page as a hybrid reactive state model.

It includes four major state classes.

### 7.1 Discrete Instructional State

Examples:

* reading
* attempting
* hinting
* simulating
* reflecting
* completed
* current activity
* current step
* current hint level
* current strategy path

### 7.2 Semantic Action State

Examples:

* last meaningful action
* current attempted step
* expected step
* correctness status
* possible buggy rule
* unresolved misconception
* step history
* strategy trace

### 7.3 Quantitative Learner/Time State

Examples:

* elapsed time on page
* elapsed time on step
* response latency
* time since last action
* KC mastery
* predicted correctness
* hint dependence
* error history
* practice schedule state

### 7.4 Simulation State

Examples:

* simulation running/paused
* current simulation variables
* learner-manipulated parameters
* system-generated events
* detected simulation outcomes
* links between simulation actions and instructional prompts

## 8. Proposed Initial Technical Stack

### 8.1 Frontend Application

Use the existing MoFaCTS frontend stack for this phase (no framework migration).

Implementation note:

* Phase 1 SPARC runtime work reuses the existing Svelte experiment runtime surface in the application codebase, including files and services whose historical names contain `card` (for example `CardScreen`, `cardMachine`, and related payload builders).
* Those names are inherited implementation-surface labels in the current MoFaCTS runtime. They are **not** the SPARC conceptual model and should not be read as saying that SPARC sessions are flash cards.
* In SPARC-specific code, docs, contracts, and discussions, prefer SPARC domain vocabulary such as `sparcsession`, `page`, `interaction`, `node`, `surface`, and `interaction step`.
* Do not introduce new SPARC-specific abstractions that call SPARC payloads `cards` unless a shared pre-existing runtime boundary leaves no narrower alternative.

Purpose:

* runtime renderer in existing MoFaCTS app surface
* semantic instructional components
* compact preview/debug tooling needed for this phase
* state/rule visibility for example validation
* simulation UI integration where examples require it

Rationale:

* prevents unrelated migration risk in Phase 1
* aligns with already-stable app conventions
* keeps this effort focused on rule/state/contract quality

### 8.2 Structured Authoring Editor

No editor migration in this phase.

Purpose:

* preserve existing configuration-driven SPARC example contract flow
* keep authoring boundaries explicit in config source of truth
* defer tooling changes until two example contracts are stable

### 8.3 Runtime State Control

Use **XState** for statecharts and actor-like orchestration.

Purpose:

* discrete modes
* nested and parallel states
* guards
* actions
* delayed transitions
* activity-level control
* page-level control

### 8.4 Time and Event Streams

Use **RxJS selectively** when event/time complexity warrants it.

Purpose:

* inactivity detection
* dwell-time windows
* debounced/throttled signals
* repeated-attempt patterns
* simulation ticks
* rolling latency/engagement features

Initial implementation can start with simpler timers and timestamped events.

### 8.5 Rule Layer

Use **json-rules-engine** as the rule engine for this first SPARC runtime pass.

Purpose:

* authorable instructional rules
* adaptive feedback
* hints
* page modifications
* component actions
* time-based cues
* model-tracing policies

Rules should operate over the interpreted hybrid state, not raw DOM events.

### 8.6 Student Model / KT Layer

Keep the student model separate from the UI but connected to the event stream.

For Phase 1, KT is fixed to the existing flash-card integration path.
KT updates are emitted as evidence against `stimulusid` and then consumed as state inputs for rule evaluation.
No new KT family is introduced in this phase.

## 9. Instructional Component Model

Each component should have an explicit manifest-like contract.

Example:

```json
{
  "type": "numeric-response",
  "events": [
    "focus",
    "input",
    "submit",
    "correct",
    "incorrect",
    "hint_requested"
  ],
  "semanticActions": [
    "propose_value",
    "revise_value",
    "submit_answer"
  ],
  "state": {
    "value": "number|string",
    "attempts": "number",
    "correct": "boolean",
    "latency": "number"
  },
  "actions": [
    "set_value",
    "show_feedback",
    "disable",
    "focus",
    "mark_correct"
  ],
  "bindings": {
    "kc_ids": [],
    "activity_id": "",
    "ruleset_id": ""
  }
}
```

Initial component set:

* rich text block
* prompt block
* multiple choice
* numeric response
* short text response
* hint panel
* feedback panel
* adaptive region
* worked example
* faded worked example
* slider
* graph/plot component
* simulation container
* reflection response
* page/navigation marker

## 10. Behavior Recording / Example Tracing

Include a CTAT-inspired authoring mode where the author can demonstrate solution paths.

Author workflow:

1. Author opens lesson in authoring-preview mode.
2. Author performs a correct solution path.
3. System records raw events and semantic actions.
4. Author labels steps as correct, alternative, buggy, hint-worthy, or irrelevant.
5. System builds a behavior graph or trace template.
6. Author optionally generalizes the trace into rules.
7. Student runtime compares future semantic actions against the behavior graph/rules.

This gives the system an easier authoring path than hand-writing all rules.

For Phase 1, this workflow is deferred (no example tracing build in this iteration). We are shipping the two concrete SPARC examples with explicit JSON rule payloads and event/history-based grading feedback.

Possible trace types:

* correct path
* alternative correct path
* common misconception path
* hint path
* simulation exploration path
* dead-end path
* reflection/repair path

## 11. Rule and Model-Tracing Layer

The rule layer should support several different uses.

### 11.1 Feedback Rules

```text
IF semantic_action = propose_slope
AND value != expected_slope
THEN show feedback about slope
```

### 11.2 Hint Rules

```text
IF current_step = set_slope
AND elapsed_on_step > 90 seconds
AND attempts = 0
THEN show hint level 1
```

### 11.3 Buggy-Rule Diagnosis

```text
IF proposed_slope = rise
AND ignored_run = true
THEN diagnose bug = rise_equals_slope
```

### 11.4 State Transition Rules

```text
IF current_step = set_slope
AND slope_correct = true
THEN advance to set_intercept
```

### 11.5 Student-Model Rules

```text
IF kc_mastery < .60
AND error_count >= 2
THEN assign additional isomorphic practice
```

### 11.6 Simulation Rules

```text
IF simulation.projectile_landed = true
AND student_has_not_explained = true
THEN pause simulation and prompt reflection
```

## 12. Event Log and Replay

Use an append-only event log as the central telemetry substrate.

Log both:

1. raw component events
2. semantic interpreted actions
3. rule firings
4. model updates
5. system actions
6. state snapshots where needed

Event fields:

* event id
* timestamp
* session id
* learner id
* document id
* activity id
* component id
* raw event type
* semantic action type
* value/state data
* KC tags
* current step
* expected step
* interpretation result
* rule context
* model update
* latency/time fields

Replay should support:

* debugging
* research analysis
* rule validation
* behavior graph inspection
* learner-path review
* reconstruction of state

## 13. Authoring Workflow

Initial human authoring workflow:

1. Author structure in current SPARC config assets (no editor migration in this phase).
2. Insert instructional components.
3. Tag components with activity ids, KCs, and semantic roles.
4. Define correctness checks or scoring logic.
5. Define feedback and hint content.
6. Demonstrate example paths where useful.
7. Define or revise rules.
8. Preview as student.
9. Inspect semantic action trace and rule firings.
10. Publish/export lesson.

Future AI-assisted workflow:

1. LLM proposes KCs from text and tasks.
2. LLM proposes semantic action mappings.
3. LLM drafts activity variants.
4. LLM drafts misconception-specific feedback.
5. LLM drafts hints and fading sequences.
6. LLM drafts rule conditions.
7. LLM generalizes demonstrated paths into rules.
8. LLM checks for unreachable states or broken bindings.
9. Human reviews and edits.

## 14. Runtime Workflow

At runtime:

1. Document loads from structured JSON.
2. Runtime creates the instructional page from existing config-driven contracts.
3. Components register with the runtime.
4. Learner/system events are timestamped.
5. Raw events are appended to the log.
6. Semantic Action Interpreter maps raw events to meaningful actions.
7. Hybrid state model updates.
8. XState transitions fire where appropriate.
9. Rule layer evaluates conditions.
10. Model tracing accepts, rejects, or diagnoses the semantic action.
11. KT/student model updates when appropriate.
12. Components receive adaptive actions.
13. UI changes reactively.
14. All state, action, rule, and model events remain replayable.

## 14.1 Phase 1 implementation playbook (coherent execution path)

- Execute directly from SPARC Phase 1 Execution Checklist (`C:\dev\MoFaCTS\docs-developer\sparc-phase-1-execution-checklist.md`); each section corresponds to this playbook stage.

### A) Parse-time contract module

- Build one `loadSparcStimulus()` entrypoint that takes `{setspec, clusterid, stimulusid}` and returns:
  - `layoutRuntime`: normalized zones + region map + strict placement map
  - `nodeIndex`: `id -> node metadata`
  - `responseSpec`: parsed `gradingMode`, `evaluation`, `scoredNodes`, `intentByNode`
  - `runtimeOptions`: feature flags needed by the rule bridge
- Reject immediately on required-missing values (no fallback):
  - missing `display.type`, `display.schema`, `display.layout.zones`, required `activityId` bindings, group/atomic IDs, response fields
  - unmapped required `placement.region`
  - duplicate ids, unknown required node types in used paths
- Emit normalized diagnostics for parser/layout failures and warnings using one shape:
  - `{ severity, code, path, message, stimulusid? }`
- Keep unknown optional metadata in `runtimeOptions` for diagnostics only; do not auto-correct structure.

### B) Interpreter module

- Add `toSemanticAction(rawEvent, context)`:
  - `rawEvent`: component interaction payload
  - `context`: node descriptor, activity bindings, node response expectations
  - return shape: `{ actionType, componentId, activityId, timestamp, stepId, value, result, kcIds, expectedValue, latencyMs }`
- Ensure interpreter output always includes:
  - `actionType`
  - `componentId`
  - `activityId`
  - `timestamp`
- Keep interpretation deterministic:
  - same raw event + state snapshot must produce same semantic action every time

### C) Runtime state layer

- Keep runtime state split by domain:
  - `flowState` (XState-managed): page mode, navigation, completion flags
  - `domainState` (explicit): discrete/semantic/quantitative/simulation buckets
- State update policy:
  - rules return `runtimeAction[]` only
  - interpreter and UI never mutate domainState directly
  - all domain state changes flow through one reducer-style updater
- Per-event execution order is fixed:
  1. capture raw event
  2. derive semantic action
  3. apply learner-event state update through the reducer
  4. build rule facts from updated `domainState` + current semantic action
  5. evaluate rules and emit `runtimeAction[]`
  6. apply runtime actions through the same reducer path
  7. persist ordered history entries
- Rule evaluation must not read partially applied runtime-action effects from the same cycle.

### D) Rule bridge module

- Add a `buildRuleFacts(domainState, context, semanticAction)` object for json-rules-engine:
  - `state.currentStep`, `state.correctness`, `state.stepAttempts`
  - `quant.elapsedMs`, `quant.stepElapsedMs`, `quant.hintCount`, `quant.errorCount`, `quant.kcMastery.<kcId>`
  - `interface.lastAction`, `activityId`, `componentId`, `stimulusid`
- Rule output contract is always `runtimeAction` and should include:
  - `type` (required)
  - `target`/`componentId` (optional depending on action)
  - `payload` (normalized)
  - `meta` with `{ ruleId, firedAt, sequence }`
- Rule side effect policy:
  - Rule condition checks only state/input.
  - Rule effects are action contracts only.

### E) Scoring and grading module

- Build `evaluateIntent(scoredNodeId, nodeValue, responseSpec, context)`:
  - enforce grading mode and evaluation policy
  - evaluate only listed `response.scoredNodes`
  - compare against `response.intentByNode` by strict node map
- Generate one deterministic semantic action per graded node and mark:
  - `result: correct | incorrect | partiallyCorrect | irrelevant`
  - optional `bugCode` when mis-match patterns become known
- Preserve existing behavior:
  - unscored open nodes are ignored by correctness gating

### F) KT hook module

- Keep KT event input as:
  - semantic action outcome
  - node-level correctness
  - `stimulusid` evidence tag
- Do not add new KT strategy in phase 1.
- Output from KT is mapped into domain state numeric fields used only by rule facts.

### G) History persistence module

- On every student/action event and every interface-triggered action:
  - append raw event
  - append interpreted action
  - append rule firing summary
  - append state snapshot/delta and KT delta
- Maintain explicit event ordering fields:
  - `eventId`, `sequence`, `timestamp`, `triggerSource`
- Hard fail only if event append writes are structurally invalid; preserve existing recorder boundary where possible.

### H) Integration harness and verification order

1. Parse + schema gate (`display.schema`, layout map, node map)
2. Render contract verification (zone/placement + static required groups)
3. One node interaction path (open response grading)
4. One rule condition path (time/step condition -> interface action)
5. KT evidence tagging + state update
6. History append ordering assertions
7. End-to-end stimulus run for both example packages

### I) Concrete acceptance output for this phase

- A single runtime adapter that passes both:
  - `SPARC Fractions Addition`
  - `SPARC Stoichiometry`
- A deterministic log format for debug and replay.
- A no-fallback failure report with:
  - schema/parsing error list
  - missing references
  - unknown region/type errors
- Existing behavior preserved (including exact scored-node behavior and fixed-field semantics).

## 14.2 Canonical runtime interface (for implementation handoff)

Use these four object shapes across parser → interpreter → rules → history:

1) `SparcParsedStimulus`
- `layoutRuntime: { zones: ..., panelMap: ..., placements: ... }`
- `nodeIndex: Record<string, NodeRuntimeDef>`
- `responseSpec: ResponseContract`
- `runtimeOptions: Record<string, unknown>`

2) `SparcSemanticAction`
- `actionType: string`
- `componentId: string`
- `activityId: string`
- `timestamp: string`
- `stepId?: string`
- `value?: unknown`
- `expectedValue?: unknown`
- `result?: 'correct'|'incorrect'|'buggy'|'irrelevant'|'partiallyCorrect'`
- `kcIds?: string[]`
- `latencyMs?: number`

3) `RuleInput`
- `state: RuntimeDomainState`
- `lastAction: SparcSemanticAction`
- `env: { nowMs, stimulusid, stepElapsedMs, lastMeaningfulActionMs }`

4) `RuntimeAction`
- `type: string`
- `target?: string`
- `componentId?: string`
- `payload?: Record<string, unknown>`
- `meta: { ruleId: string, firedAt: string, sequence: number }`

### Required consistency checks

- `nodeIndex` must contain all IDs in `response.scoredNodes`.
- Every scored node in `response.scoredNodes` must resolve to `intentByNode`.
- Every `placement.region` in use must exist in `layout.zones`.
- Every interactive or scored node in used paths must resolve to an explicit `activityId` before interpretation.
- Unknown required node kind must fail before UI render.

## 15. Debugging and Inspection Tools

Early debugging tools are essential.

Include:

* raw event stream viewer
* semantic action trace viewer
* current hybrid state viewer
* rule firing history
* model-tracing decisions
* behavior graph viewer
* component registry viewer
* KT estimate viewer
* replay mode
* simulated learner path testing
* author warnings for broken bindings

Example warnings:

* rule references nonexistent component
* KC tag missing from scored component
* raw event has no semantic mapping
* semantic action has no rule/model interpretation
* hint panel has no triggering condition
* correctness checker is undefined
* rule can never fire
* adaptive region has no default state
* behavior graph has unreachable node

## 16. MVP Scope

The MVP should prove the architecture, not the full ecosystem.

Minimum viable lesson:

* one structured page
* explanatory text
* one or two embedded activities
* raw event logging
* semantic action interpretation
* one correctness-based rule
* one time-based rule
* one hint panel
* one simple KC/mastery estimate
* one debug/replay view

Suggested MVP example:

> A short lesson on slope or probability with an explanation, a numeric-response component, a graph or slider component, a hint panel, and rules responding to errors, elapsed time, and KC estimate.

MVP success criterion:

> The system can show that a learner action on a reactive page is interpreted as a semantic step, traced against an instructional model, used to update learner state, and used to adapt the page.

## 17. Things to Avoid Early

Avoid:

* building an H5P-like marketplace
* making each widget own isolated state
* using raw HTML as the source of truth
* overengineering Web Components before portability matters
* implementing a full ACT-R architecture too early
* requiring every activity to have a full cognitive model
* making rules too Jess-like before authoring workflows are clear
* building full LMS/LTI integration before the runtime works
* treating AI chat as the tutor instead of authoring support
* building complex KT before event semantics are stable

## 18. Phase 1 Decisions and Scope Boundaries

### Phase 1 locked (final for this iteration)

1. Target examples are fixed to:
  - `C:\dev\mofacts_config\SPARC Fractions Addition\SPARC_Fractions_Addition_stims.json`
  - `C:\dev\mofacts_config\SPARC Stoichiometry\SPARC_Stoichiometry_stims.json`
2. Rule engine is fixed to **json-rules-engine**.
3. `display.schema` contract is fixed at **`tutorscript-sparc/1.0`** for phase 1.
4. Parser hard-fail policy is active for missing/invalid required structure:
  - required IDs, required layout fields, required `activityId` bindings, and required rule/response contracts must exist
   - unknown `placement.region` or unknown group/atomic type is a blocking diagnostic
5. `response.scoredNodes` + `response.intentByNode` remain the single grading truth for this phase.
6. History writes remain required for each student/action event.
7. No example-tracing workflow in phase 1.
8. XState is for flow control only; non-flow explicit state remains in runtime state ownership.
9. `activityId` is a required authored contract for phase 1 semantic actions; the runtime must not synthesize it implicitly.

### Deferred (explicitly out of scope in phase 1)

- React/Tiptap migration
- New canonical schema migration tooling beyond these examples
- Cross-example behavior-graph authoring workflows
- Full visual rule editor
- Non-trivial replay/time-snapshot UX expansion

### Still uncertain (documented for phase 2)

- Whether `schemaVersion` becomes the canonical version gate once more example families are onboarded.
- Fine-grained `runtimeAction` serialization fields for future rule tooling compatibility.

### Canonical implementation targets this phase

Current implementation target remains explicit:

- No visual rule-authoring builder (the first pass uses authored JSON rule payloads).
- No full rule-language normalization pass beyond what is needed for these two example packages.
- No generalized event/state serializer rewrite in `history` beyond current recorder boundaries.
- No cross-component behavior graph builder for dynamic adaptation outside explicit SPARC examples.

### Phase 2 backlog questions

1. Canonical raw event schema for SPARC actions at the MoFaCTS history boundary.
2. Canonical semantic action schema to feed `json-rules-engine` consistently.
3. Representation of buggy-rule outcomes for both feedback and scoring traces.
4. Minimum event/state replay depth for wider QA/debug in phase 2.

## 19. Working Positioning

Potential positioning statement:

> This system is a modern, open, AI-assistable alternative to opaque instructional widgets and expensive model-traced tutors. It lets authors create reactive instructional documents whose components are observable, controllable, semantically interpreted, rule-driven, model-traced, and connected to student models.

Shorter label:

> Reactive instructional documents.

Technical label:

> A hybrid model-tracing architecture for reactive instructional web pages.

Most precise technical description for SPARC:

> An ACT-R-inspired, CTAT-informed hybrid model-tracing runtime for reactive instructional documents, combining symbolic state tracing with quantitative learner, time, and simulation variables.
