# SPARC AutoTutor Current AI Prompt Contracts

## Scope

This document summarizes the current learner-facing AI utterance contracts for the
SPARC AutoTutor dialogue runtime. The authoritative implementation lives in:

- `learning-components/units/sparcsession/sparcMoveDefinitions.ts`
- `mofacts/client/views/experiment/svelte/services/sparcControllerDialogueOpenRouter.ts`

The non-SPARC AutoTutor session prompt path is outside this document's scope.

## Shared Utterance Contract

Every utterance request keeps target and move selection under application control:

- The model must echo the app-selected `targetType`, `targetId`, and
  `selectedMove`.
- The model must not expose internal ids, rule ids, rubric labels, scoring fields,
  or planner metadata.
- The model may use only the authored lesson content and dialogue context supplied
  in the request.
- The model receives the selected move policy, selected target content, planner
  state, dialogue history, and latest learner answer.

The shared acknowledgement boundary is intentionally non-templated:

- Usually begin with a brief acknowledgement of the learner's latest answer or the
  progress it shows.
- If there was no progress, acknowledge the answer neutrally before continuing.
- An acknowledgement confirms receipt; it does not agree with an incorrect answer
  or adopt the learner's claim as the tutor's own position.
- If the tutor refers to learner content, it must explicitly attribute that content
  to the learner.
- The model is instructed not to use a fixed template or repeat the same opener
  across turns.

The prompt deliberately does not seed stock acknowledgement phrases. Variation is
left to the model and its configured generation temperature.

## Active Moves

All active move definitions use version `v1`, the `autotutor-dialogue` family, the
`autotutor.chat_utterance` output schema, and the `sparc.dialogue_utterance`
renderer.

| Move | Current contract |
| --- | --- |
| `question-deferral` | After the selected scaffold move's acknowledgement, briefly explain that the learner should work with the problem a little longer before the answer is revealed. Do not answer the learner's question or reveal target content. |
| `question-scope-refusal` | Briefly state the tutor is built for the current learning activity and cannot discuss the off-topic or inappropriate subject, then redirect to the current problem. |
| `pump` | Use the selected authored target content to choose the dimension of elaboration while preserving meaningful learner work. For a learning target, ask the learner to elaborate, extend, apply, or compare their current reasoning toward one feature of the selected expectation without stating the full missing proposition. If the selected expectation introduces a new extension of an already-covered idea, open that dimension explicitly enough for the learner to work on it. For a misconception, use the selected misconception and correct expectations to ask about the learner's expressed claim or a relevant consequence without supplying the correction or pumping for more of the misconception. |
| `prompt` | Ask one constrained question that directs attention to a specific missing slot, relation, mechanism, contrast, variable, cause, evidence, or consequence. Ground wording in the current expectation and authored domain facts without embedding the answer. |
| `hint` | Use the selected authored target content as the destination of the clue. For a learning target, provide a clue that narrows the search space and points toward a specific feature of the selected expectation. For a misconception, use the selected misconception and correct expectations to help the learner notice a problem, limitation, consequence, or relevant contrast without fully stating the correction. |
| `assertion` | Give brief feedback grounded in the latest response, then state the missing expectation content or correct misconception contrast directly and concisely. Ask the learner to restate, apply, calculate with, or connect the supplied idea. |
| `summary` | Consolidate correct expectations the learner established and misconception repairs the learner completed. Distinguish repaired misconceptions from unresolved ones and preserve the actual instructional trajectory. |

All scaffold moves preserve the learner-language boundary: do not present rubric
language as something the learner said, meant, believed, or knew. They also share
the misconception-safety boundary: do not praise, endorse, validate, or describe
repetition or endorsement of an active misconception as progress, closeness, or a
good start.

## Prompt-Contract Watch Items

- Add runtime or live-evaluation coverage for repeated opening phrases across
  turns.
- Continue checking that authored misconception wording is not attributed to the
  learner unless the learner actually expressed it.
- Verify live Compound Interest traces now use the selected E4 frequency content
  naturally through pump, hint, and assertion moves.
