export type SparcMoveFamily =
  | 'autotutor-dialogue'
  | 'sparc-component'
  | 'navigation'
  | 'model-update';

export type SparcMoveStatus = 'active';

export type SparcMoveDefinition = {
  readonly moveId: string;
  readonly version: string;
  readonly family: SparcMoveFamily;
  readonly status: SparcMoveStatus;
  readonly source?: {
    readonly paperRuleIds?: readonly string[];
    readonly paperMoveName?: string;
  };
  readonly requiredFacts: readonly string[];
  readonly promptId: string;
  readonly promptVersion: string;
  readonly outputSchemaId: string;
  readonly outputSchemaVersion: string;
  readonly renderer: string;
  readonly historyAction: string;
  readonly promptPolicy: string;
};

const AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_ID = 'autotutor.chat_utterance';
const AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_VERSION = 'v1';
const AUTOTUTOR_DIALOGUE_RENDERER = 'sparc.dialogue_utterance';
const AUTOTUTOR_DIALOGUE_HISTORY_ACTION = 'sparc-dialogue-turn';

function promptPolicy(...requirements: readonly string[]): string {
  return requirements.join('\n');
}

function autotutorDialogueMove(params: {
  readonly moveId: string;
  readonly paperRuleIds?: readonly string[];
  readonly paperMoveName: string;
  readonly promptPolicy: string;
  readonly requiredFacts?: readonly string[];
}): SparcMoveDefinition {
  return {
    moveId: params.moveId,
    version: 'v1',
    family: 'autotutor-dialogue',
    status: 'active',
    source: {
      paperRuleIds: params.paperRuleIds ?? [],
      paperMoveName: params.paperMoveName,
    },
    requiredFacts: params.requiredFacts ?? ['controller.selectedAction'],
    promptId: `autotutor.${params.moveId}`,
    promptVersion: 'v1',
    outputSchemaId: AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_ID,
    outputSchemaVersion: AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_VERSION,
    renderer: AUTOTUTOR_DIALOGUE_RENDERER,
    historyAction: AUTOTUTOR_DIALOGUE_HISTORY_ACTION,
    promptPolicy: params.promptPolicy,
  };
}

export const SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS = Object.freeze([
  autotutorDialogueMove({
    moveId: 'question-deferral',
    paperMoveName: 'Deferring a legitimate learner question',
    requiredFacts: ['dialogue.responseModifier'],
    promptPolicy: promptPolicy(
      '1. Deferral statement: After the selected scaffold move\'s acknowledgement, briefly explain that the learner should work with the problem a little longer before the answer is revealed so they have time to reflect on the possibilities.',
      '2. Boundary: Do not answer the learner\'s question, reveal target content, or ask the learner for a response as part of this modifier. The selected scaffold move supplies the single instructional question that follows.',
      '3. Learner-language boundary: When referring to the learner\'s question, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'question-scope-refusal',
    paperMoveName: 'Declining an off-topic or inappropriate learner question',
    promptPolicy: promptPolicy(
      '1. Scope boundary: Briefly state that the tutor is built to discuss the current learning activity and cannot discuss that subject.',
      '2. Content boundary: Do not answer, elaborate on, repeat, or explore off-topic, rude, lewd, illicit, or otherwise inappropriate content. Do not moralize. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Return to task: Briefly redirect the learner to the current problem and invite a content-focused response.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'pump',
    paperRuleIds: ['paper-rule-01-pump', 'paper-rule-02-pump'],
    paperMoveName: 'Pumping for more information',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language boundary: When referring to the learner\'s response, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: Use the selected authored target content to choose the dimension of elaboration, while preserving meaningful learner work. If targetType is learningTarget, ask the learner to elaborate, extend, apply, or compare their current reasoning toward one feature of the selected expectation without stating the full missing proposition. When the selected expectation introduces a new extension of an already-covered idea, open that dimension explicitly enough for the learner to work on it. If targetType is misconception, use the selected misconception and correct expectations to ask about the reasoning behind the learner\'s expressed claim or a relevant consequence, without introducing rubric language, supplying the correction, or pumping for more of the misconception. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '6. Adaptation: Use dialogue history to determine what kind of elaboration is most likely within reach: explanation, evidence, example, connection, qualification, or implication.',
      '7. Repetition handling: If a broad pump was already tried and the learner did not extend, do not repeat the same generic invitation; ask for a different dimension of elaboration while still leaving the target content for the learner to produce.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'prompt',
    paperRuleIds: ['paper-rule-05-prompt'],
    paperMoveName: 'Prompting for specific information',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language boundary: When referring to the learner\'s response, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: If targetType is learningTarget, ask one constrained question that directs attention to a specific missing slot, relation, mechanism, contrast, variable, cause, evidence, or consequence. If targetType is misconception, ask one constrained question that helps the learner examine a consequence, contradiction, or relevant contrast in the claim they actually expressed without presenting rubric wording as their position or embedding the correction. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '6. Repetition handling: Use dialogue history to see whether this same slot has already been prompted. If it has, do not repeat the same question; narrow or reframe the prompt by focusing on a different feature of the same target structure.',
      '7. Content boundary: Ground the wording in the current expectation and authored domain facts, but do not embed the answer in the question.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'hint',
    paperRuleIds: ['paper-rule-06-hint', 'paper-rule-07-hint'],
    paperMoveName: 'Hinting',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language boundary: When referring to the learner\'s response, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: Use the selected authored target content as the destination of the clue. If targetType is learningTarget, provide a clue that reduces the search space and points toward a specific feature of the selected expectation while preserving meaningful learner work. If targetType is misconception, use the selected misconception and correct expectations to provide a clue that helps the learner notice a problem, limitation, consequence, or relevant contrast in the claim they actually expressed without presenting rubric wording as their position or fully stating the correction. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '6. Strength calibration: Use dialogue history to calibrate the hint\'s strength: use a minimal cue when the learner has not yet received help on this target, and a more diagnostic cue when a prior prompt or hint was not taken up.',
      '7. Repetition handling: If the learner repeats the same error after a hint, do not paraphrase the prior hint; change the mediating form by highlighting a contrast, feature, example, term, process step, or relation that makes the next inference more visible.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'assertion',
    paperMoveName: 'Assertion/direct content supply',
    promptPolicy: promptPolicy(
      '1. Acknowledgement and feedback: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally, then give brief immediate feedback grounded in the latest response. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language boundary: When referring to the learner\'s response, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Move execution: If targetType is learningTarget, state the missing expectation content directly and concisely. If targetType is misconception, directly correct the claim the learner actually expressed and state the correct contrast without presenting rubric wording as the learner\'s position. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '4. Misconception safety: Do not endorse or repeat the misconception as correct.',
      '5. Uptake check: Ask the learner to restate, apply, calculate with, or connect the supplied idea so the next response can demonstrate uptake.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'summary',
    paperRuleIds: ['paper-rule-08-summary'],
    paperMoveName: 'Summarizing',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language boundary: When referring to the learner\'s response, use only phrases and constructions the learner actually used. Do not present rubric language as something the learner said, meant, believed, or knew.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: Because targetType is completion, consolidate correct expectations the learner established and misconception repairs the learner completed. Distinguish repaired misconceptions from unresolved misconceptions, and do not present authored rubric wording as the learner\'s language.',
      '6. Trajectory fidelity: Use history to summarize the actual instructional trajectory, not just the target content: preserve what the learner established, what was repaired, and what distinction matters going forward.',
      '7. Misconception safety: Do not present an unresolved misconception as if the learner has mastered it.',
      '8. Completion boundary: Use the structured completion reason. If the reason is max-turns, summarize partial progress and unresolved content without implying mastery. If the reason is required-coverage, consolidate the established trajectory. Do not introduce new substantive domain content or a new follow-up question.',
    ),
  }),
] as const satisfies readonly SparcMoveDefinition[]);

export function getSparcMoveDefinition(moveId: string): SparcMoveDefinition | undefined {
  return SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.find((definition) => definition.moveId === moveId);
}

export function requireActiveSparcMoveDefinition(moveId: string): SparcMoveDefinition {
  const definition = getSparcMoveDefinition(moveId);
  if (!definition) {
    throw new Error(`SPARC selected move "${moveId}" has no registered move definition`);
  }
  if (definition.status !== 'active') {
    throw new Error(`SPARC selected move "${moveId}" is registered as ${definition.status} and is not active for selection`);
  }
  return definition;
}
