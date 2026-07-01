# SPARC Move-Specific Prompt Architecture Plan

## Purpose

SPARC production rules should select explicit instructional moves, and each selected move should own its own prompt and realization contract. AutoTutor-style chat messages are one important case, but the same architecture should support non-chat SPARC moves such as multiple-choice construction, component state updates, targeted hints, correction widgets, worked examples, and summaries.

This plan records the architecture so we do not lose sight of the boundary between:

- Production-rule selection: deciding what move should happen next.
- Move realization: generating the chat message or structured SPARC output for that move.
- Rendering and persistence: validating, rendering, and recording the move output.

## Source Basis

The immediate source paper is:

- `person01.pdf`: "Simulating Human Tutor Dialog Moves in AutoTutor" by Person, Graesser, Kreuz, Pomeroy, and the Tutoring Research Group.

The paper describes AutoTutor as a hybrid symbolic/fuzzy system where a dialog move generator selects moves using production rules over learner assertion quality, student ability, topic coverage, and verbosity. The paper distinguishes the dialog move selected by the production rule from the curriculum-script content used to perform that move.

The paper says AutoTutor can simulate "one or a combination" of dialog moves after each student contribution, but it does not provide a detailed composition algorithm, ordering rule, or surface-realization contract for combined moves. For the current SPARC implementation, do not support move combinations. Select exactly one matching move: the highest-salience matched production rule wins.

## Paper Move Meanings

The paper identifies these tutor dialog moves:

| Move | Meaning in the paper |
| --- | --- |
| Positive immediate feedback | Short positive evaluation of the preceding learner contribution. |
| Neutral immediate feedback | Short acknowledgement without strong correctness evaluation. |
| Negative immediate feedback | Short negative evaluation of the preceding learner contribution. |
| Pumping for more information | Ask the learner to contribute more without supplying a specific missing answer. |
| Positive pump | Acknowledge a useful contribution and ask the learner to add more. |
| Prompting for specific information | Cue a particular missing piece, often in a constrained or fill-in-the-blank form. |
| Hinting | Provide a content cue that steers the learner toward the answer without simply giving the complete answer. |
| Elaborating | Add substantive content to extend or complete the answer. |
| Splicing/correcting after error | Insert or correct content after a learner error or misconception. |
| Summarizing | Recap the answer/topic after sufficient coverage or enough turns. |
| Positive-neutral feedback | Partial-credit acknowledgement for a medium/somewhat high good-answer match. |
| Negative-neutral feedback | Redirect or mildly correct when bad-answer match is somewhat high or high under low coverage. |

## Original Rule Shape

The original paper rules have this conceptual shape:

```text
IF fuzzy learner/topic conditions
THEN select MOVE
```

Examples:

```text
IF match with good answer bag = LOW or MEDIUM
THEN select NEUTRAL FEEDBACK
```

```text
IF student verbosity = LOW and topic coverage = LOW or MEDIUM
THEN select PROMPT
```

The important architectural point is that the `THEN` side selects a dialog move. It does not itself contain the full tutor message or component output.

## Current SPARC Representation

Current AutoTutor-to-SPARC conversion represents `THEN select MOVE` as an asserted working-memory fact:

```ts
{
  type: 'assert-fact',
  persist: true,
  fact: {
    factType: 'controller.selectedAction',
    slots: {
      targetType: literal('learningTarget'),
      clusterKC: variable('targetClusterKC'),
      action: literal('neutral_feedback'),
      sourceRuleId: literal('paper-rule-15-neutral-feedback'),
    },
  },
}
```

The rule then terminates the production phase:

```ts
{
  type: 'terminate-production-phase',
  reason: 'move-selected',
}
```

That part is directionally correct: production rules select moves by asserting `controller.selectedAction`.

## Current Gap

The current prompt layer does not preserve the paper's move-specific realization semantics strongly enough.

At present, SPARC AutoTutor dialogue uses one generic OpenRouter message-generation prompt. It receives:

- selected target type
- selected target id
- selected move label
- selected action slots
- authored target content
- planner state
- learner contribution classification
- dialogue history

The generic prompt tells the model not to change the selected move and to keep every non-summary move going with a follow-up question. This collapses distinct moves into one broad "write a tutor response" behavior.

This likely explains why `neutral_feedback` often becomes:

```text
Good start ... Can you say that in your own words?
```

The production rule selected a move, but the move realization layer did not give the model a move-specific contract.

## Desired Architecture

The target architecture is:

```text
production rule -> selected move -> move-specific realization contract -> validated output -> renderer/history
```

More explicitly:

1. Production rules select an instructional move by asserting `controller.selectedAction`.
2. A move registry resolves that selected action to a move definition.
3. The move definition names required facts, prompt policy, output schema, renderer, and history shape.
4. A move-specific generator prompt produces either a chat message or structured SPARC output.
5. The output is validated against the move's schema.
6. SPARC renders the output through the appropriate component path.
7. History records the source production rule, selected move, prompt id/version, output schema version, and rendered output metadata.

Move selection is single-winner for now. If multiple rules match, the engine selects only the highest-salience matching production. Do not represent move sequences until a later design explicitly defines ordering, question ownership, and rendering semantics.

## Offline Conversion Boundary

AutoTutor paper-derived baseline production rules are offline conversion/addition templates only. They are not learner-runtime defaults, substitutions, or fallbacks.

The required operational boundary is:

```text
legacy AutoTutor source -> offline conversion/addition -> committed SPARC stim/config JSON -> deploy -> runtime evaluates loaded config
```

The offline conversion/addition step may materialize the canonical AutoTutor move-selection rules into SPARC `display.productionRules`. After that step, the SPARC stim/config file is the source of truth. If an author or developer wants to change, remove, or add AutoTutor-derived production rules, they should edit the SPARC stim/config content before deployment and validate that content. The learner runtime must not generate, merge, or substitute AutoTutor production rules dynamically.

Do not design a deployed-stim merge rule for "the same or different than the canonical nine" AutoTutor move-selection productions. That case should not occur at learner runtime. If the canonical added set is wrong for a package, run the offline addition/conversion step, modify the resulting SPARC stim/config JSON intentionally, and deploy that committed content. The runtime still only evaluates the production rules present in the loaded SPARC display.

If deployed SPARC content lacks required AutoTutor move-selection rules, that is a content/config validation failure. Do not add runtime recovery behavior that silently inserts paper-derived rules into a loaded display.

## Move Definition Contract

A move definition should be explicit and versioned:

```ts
type SparcMoveDefinition = {
  moveId: string;
  version: string;
  family: 'autotutor-dialogue' | 'sparc-component' | 'navigation' | 'model-update';
  source?: {
    paperRuleIds?: string[];
    paperMoveName?: string;
  };
  requiredFacts: string[];
  promptId: string;
  promptVersion: string;
  outputSchemaId: string;
  renderer: string;
  historyAction: string;
};
```

For AutoTutor dialogue:

```ts
{
  moveId: 'hint',
  family: 'autotutor-dialogue',
  promptId: 'autotutor.hint',
  outputSchemaId: 'autotutor.chat_utterance',
  renderer: 'sparc.dialogue_utterance',
}
```

For a non-chat SPARC move:

```ts
{
  moveId: 'ask_multiple_choice',
  family: 'sparc-component',
  promptId: 'sparc.multiple_choice_question',
  outputSchemaId: 'sparc.multiple_choice_node',
  renderer: 'sparc.multiple_choice',
}
```

## AutoTutor Move Prompt Policies

Each active AutoTutor instructional move should have a distinct prompt policy. Feedback-labeled paper moves are listed separately as legacy prompt policies because their rules remain in code but are disabled for active selection.

Active instructional moves:

| Move | Prompt policy |
| --- | --- |
| `pump` | Ask for more information without giving away the specific missing content. Use when the learner should continue elaborating. |
| `positive_pump` | Briefly acknowledge useful progress, then ask for more detail. |
| `prompt` | Ask for a specific missing piece. Use code-owned constrained question wording grounded in the current expectation/domain facts. |
| `hint` | Provide a clue or content cue that points toward the missing idea while preserving learner work. |
| `elaborate` | Add substantive domain information from the current expectation/target facts to extend the answer; may ask the learner to connect it back to the question. |
| `splice` | Use the authored splice content for a detected error/misconception and ask the learner to examine or repair the misconception. Do not split splice into hidden submoves. |
| `summary` | Recap covered expectations concisely and end or transition according to the controller state. |

Legacy feedback policies, not active selectors:

| Move | Legacy prompt policy |
| --- | --- |
| `positive_feedback` | Give brief correctness/quality confirmation. Do not add new substantive content. |
| `neutral_feedback` | Give short neutral acknowledgement of partial/weak good-answer match, name the relevant idea in plain language, and invite a focused revision without repeating generic phrasing. |
| `negative_feedback` | Clearly but politely indicate the answer is not correct or not addressing the target. Do not over-explain. |
| `positive_neutral_feedback` | Acknowledge partial progress and ask the learner to extend the same line of reasoning. |
| `negative_neutral_feedback` | Redirect away from an unproductive or partially wrong idea without harsh evaluation. |

These policies should be refined against the paper's generalized move meanings, not against lesson-specific or content-owned wording.

Each move prompt should own its own acknowledgement or brief feedback policy, such as neutral, positive, or corrective acknowledgement, before performing the instructional move. This avoids forcing `neutral_feedback` to carry the whole follow-up turn by itself.

Current decision: feedback-labeled paper rules are legacy only for now. Keep their rule definitions in code so they can be restored if needed, but mark them non-selectable/disabled in the active selector. Positive, neutral, negative, positive-neutral, and negative-neutral feedback should instead be expressed inside the prompt policy for the selected instructional move.

## Output Contracts

Move outputs should not all be plain strings.

Schemas are code-owned. TDF/config content may provide lesson facts and authored domain content, but it should not own the prompt wording or output schema for a move. Move prompt policies and validation schemas should be generalized, versioned runtime contracts.

AutoTutor dialogue output:

```ts
type AutoTutorDialogueMoveOutput = {
  targetType: 'learningTarget' | 'misconception' | 'completion';
  targetId: string | null;
  selectedMove: string;
  tutorMessage: string;
};
```

Multiple-choice SPARC output:

```ts
type SparcMultipleChoiceMoveOutput = {
  nodeType: 'atomic';
  atomType: 'multiple-choice';
  prompt: string;
  choices: readonly {
    id: string;
    label: string;
    feedback?: string;
  }[];
  correctChoiceId?: string;
};
```

For non-chat SPARC moves, prefer a smaller semantic output object over asking the model to emit full SPARC node JSON. The model should generate the instructional semantics; deterministic code should translate those semantics into component nodes and state writes.

For example:

```ts
type MultipleChoiceSemanticOutput = {
  prompt: string;
  choices: readonly {
    label: string;
    rationale?: string;
  }[];
  correctChoiceIndex?: number;
};
```

Then a deterministic renderer converts that smaller object into full SPARC nodes with ids, atom types, layout, validation metadata, and history fields.

The exact schemas should live in code and be referenced by id/version from the move registry.

## Production Rule Compatibility

The current converter maps several original paper conditions imperfectly:

- "match with good answer bag" is often represented as selected target coverage.
- "student ability" is partly approximated by required-coverage mean.
- "student verbosity" is represented by learner word count.
- "match with bad answer bag" depends on misconception scoring/selection, which may be absent in some runs.
- Feedback-labeled rules should remain in the legacy rule set but must be disabled for active selection unless explicitly re-enabled later.

In the current implementation, this means the move selector may select broad default moves, especially `paper-rule-15-neutral-feedback`, even when other moves would be pedagogically plausible. In the target implementation, feedback-labeled legacy rules should be disabled for active selection, and selector fidelity should be audited after the fact model is faithful.

Working decision: do not restore the paper's good-answer and bad-answer bag concepts as explicit SPARC facts. In the current MoFaCTS/SPARC vocabulary, good-answer progress is represented by expectation coverage and bad-answer/repair pressure is represented by misconception confidence. The paper terms remain useful for interpreting the source rule catalogue, but they are not a separate runtime scoring layer.

Distinguish paper-style topic coverage from active SPARC selector signals:

- Paper-style `topic coverage` considers content that has appeared in the dialogue, including tutor and learner contributions, against the Ideal Answer bag. The paper uses this as a production-rule parameter, but it is not learner-owned because tutor contributions can increase it.
- SPARC should not treat tutor/LLM statements as learner progress. For active move selection, prefer learner-owned signals: current expectation coverage, selected misconception confidence, learner contribution, student verbosity, and derived student ability.
- Current expectation coverage should drive local moves such as prompting, pumping, hinting, splicing, and elaborating for the expectation currently under attention.
- Derived student ability should drive global readiness decisions such as summary, completion, or advancement.
- Paper-style topic coverage may remain as a legacy/reference concept for understanding the original paper rules, but it should not be an active selector input in the first SPARC implementation unless explicitly reintroduced.

The paper production-rule variables "match with good answer bag" and "match with bad answer bag" are represented by the canonical scoring facts already produced by response evaluation:

- `learningTarget.score` with `coverage` per expectation/clusterKC.
- `diagnostic.misconceptionScore` with `confidence` per misconception id.

Do not add `selector.goodAnswerMatch` or `selector.badAnswerMatch`. Move-selection rules should join against the selected expectation or selected misconception and read the corresponding coverage or confidence.

When an active rule needs student ability, compute it as a transient derived score rather than storing a separate independent construct:

```text
studentAbilityScore = mean(expectation coverage) - mean(misconception confidence)
```

This produces a standardized score from `-1` to `1`, assuming both inputs are normalized `0..1`.

Reasonable initial student ability bands:

| Band | Score range |
| --- | --- |
| `VERY_LOW` | `-1.00 <= score < 0.00` |
| `LOW` | `0.00 <= score < 0.30` |
| `MEDIUM` | `0.30 <= score < 0.80` |
| `HIGH` | `0.80 <= score <= 1.00` |

These bands are initial tuning defaults. They preserve the user's intended interpretation: negative means misconception confidence exceeds expectation coverage; near zero is low ability; above `0.30` is medium; above `0.80` is excellent/high.

## Active Selector Signal Defaults

For the first SPARC implementation, active production rules should use these learner-owned selector facts:

| Selector fact | Source | Default bands | Primary use |
| --- | --- | --- | --- |
| `currentExpectationCoverage` | `learningTarget.score.coverage` for the selected/attended expectation. Missing coverage is `0`. | LOW `<0.30`; MEDIUM `0.30-0.80`; HIGH `>=0.80`. | Local expectation moves: prompt, pump, hint, splice, elaborate. |
| selected misconception confidence | `diagnostic.misconceptionScore.confidence` for `diagnostic.misconceptionSelected.id`. Missing confidence is `0`. | Repair-active `>=0.20`; strong `>=0.67`. | Misconception repair, splice, and negative feedback moves. |
| `studentAbility` | `mean(expectation coverage) - mean(misconception confidence)`. Missing scores are `0`. | VERY_LOW `<0.00`; LOW `0.00-0.30`; MEDIUM `0.30-0.80`; HIGH `>=0.80`. | Global readiness moves: summary, completion, advancement. |
| `studentVerbosity` | Learner word count for the current contribution. | LOW `<12`; MEDIUM `12-30`; HIGH `>=30`. | Tie-breaker/input for prompt versus pump behavior. |

Do not use paper-style tutor-plus-learner topic coverage as an active selector fact in this first implementation.

Embedding/cosine infrastructure remains available for relationship graphs and other authored-content analysis, but it is not part of SPARC AutoTutor dialogue move selection unless a future design explicitly reintroduces it.

## Diagnostics Needed

For the current implementation, admin diagnostic mode should stay minimal and expose only:

- source production rule id
- selected move id

Do not add broader diagnostic fields yet. Potential future diagnostics, if explicitly needed later, include:

- move definition id/version
- prompt id/version
- target type/id
- output schema id/version
- rendered component type

For AutoTutor chat, this can appear inside the tutor bubble for admins. For SPARC components, it should appear near the generated component or in an inspector panel.

## Implementation Phases

### Phase 1: Preserve and Display Rule/Move Metadata

- Ensure dialogue nodes and history facts carry source production rule id.
- Show source production rule and selected move in admin diagnostic mode.
- Keep learner UI unchanged.

### Phase 2: Introduce Move Registry

- Add a typed registry for AutoTutor dialogue moves.
- Resolve `controller.selectedAction.action` through the registry.
- Fail clearly when a selected move has no registered definition.

### Phase 3: Split Prompt Construction by Move

- Replace the single generic message-generation prompt with move-specific prompt builders.
- Keep shared safety/context instructions in a common preamble.
- Add move-specific prompt policies and output schemas.
- Add tests for each AutoTutor move's prompt inputs and required output envelope.

### Phase 4: Structured Output Validation

- Validate each generated output against the move's schema before rendering.
- Fail clearly on schema mismatch.
- Store prompt id/version and schema id/version in history.

### Phase 5: Generalize Beyond AutoTutor Chat

- Add non-chat move families such as multiple choice, component update, worked example, and targeted reflection.
- Route each move to a renderer/component contract.
- Keep production-rule selection independent from rendering implementation.

### Phase 6: Revisit Production Rule Fidelity

- Audit the current mapping from paper conditions to SPARC facts.
- Replace selected target coverage as a substitute for good-answer match.
- Add explicit good-answer-match and bad-answer-match facts.
- Replace active use of paper-style topic coverage with learner-owned selector facts: current expectation coverage for local moves and derived student ability for global readiness.
- Reuse embedding/cosine infrastructure for current-turn match against expectation and misconception bags.
- Extract reusable embedding/vector/provenance utilities into shared modules before wiring bag scoring, instead of coupling new code to AutoTutor relationship-specific modules.
- Rebalance salience only after the fact model is faithful.

## Current Decisions

- Move combinations are intentionally out of scope for now. The selector should choose the single highest-salience matching rule.
- `controller.selectedAction` remains a single selected move for now, not a sequence.
- "Match with good answer bag" should be restored as a separate fact distinct from target coverage, using one concatenated expectations/aspects bag.
- "Match with bad answer bag" should be restored as a separate fact using one concatenated authored misconceptions bag.
- Good-answer and bad-answer bag scores should be computed by embedding each concatenated bag and the current learner contribution, then comparing with cosine similarity and thresholds.
- Initial cosine thresholds should be non-overlapping defaults: NONE `<0.20`, LOW `0.20-0.40`, MEDIUM `0.40-0.60`, HIGH `0.60-0.80`, VERY_HIGH `>=0.80`.
- Concatenated bag similarity is only for production-rule matching. It does not replace per-expectation coverage scoring or per-misconception confidence scoring.
- Feedback-labeled paper rules are deprecated for active selection. Keep them in code as legacy disabled rules, but do not let them win selection unless they are explicitly re-enabled later.
- Student ability is not an independent stored concept. Active rules that need it derive it as mean expectation coverage minus mean misconception confidence, with initial bands VERY_LOW `<0.00`, LOW `0.00-0.30`, MEDIUM `0.30-0.80`, HIGH `>=0.80`.
- Missing expectation coverage and missing misconception confidence are treated as `0` when computing derived learner-owned aggregates.
- Move-specific prompts and schemas are code-owned generalized contracts. TDF/config content supplies lesson/domain facts, not prompt wording. Prompt versions are independent runtime registry versions and must not be tied to any specific lesson, TDF content, or package content.
- For non-chat SPARC moves, generated JSON should produce a smaller semantic output that deterministic code converts into full SPARC nodes.
- Paper-style topic coverage is a legacy/reference concept, not a first-pass active SPARC selector input. Tutor-stated content must not count as learner mastery.
- Current expectation coverage should drive local expectation-level moves such as prompt, pump, hint, splice, and elaborate.
- Derived student ability should drive global readiness moves such as summary, completion, or advancement.
- AutoTutor baseline production additions happen only before deployment as offline content materialization. Do not add learner-runtime merging, overriding, or substitution of canonical AutoTutor productions into loaded stim/config content.

## Ambiguity Status

No noticeable architecture ambiguities are worth discussion at this time. Implementation may uncover code-level details, but the current design defaults are explicit.

## Current Working Hypothesis

The correct durable boundary is:

```text
Production rules decide moves.
Move definitions decide prompts and output contracts.
Prompt outputs are validated before rendering.
Renderers are deterministic consumers of validated move outputs.
History preserves every boundary crossing for diagnosis.
```

This preserves the original AutoTutor idea while making it general enough for SPARC components that are not chat messages.
