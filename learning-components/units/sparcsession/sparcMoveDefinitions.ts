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

function autotutorDialogueMove(params: {
  readonly moveId: string;
  readonly paperRuleIds?: readonly string[];
  readonly paperMoveName: string;
  readonly promptPolicy: string;
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
    requiredFacts: [
      'controller.selectedAction',
    ],
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
    moveId: 'pump',
    paperRuleIds: ['paper-rule-01-pump', 'paper-rule-02-pump'],
    paperMoveName: 'Pumping for more information',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Ask the learner to elaborate their current answer, reasoning, example, evidence, or next step without naming the specific missing target content. Use dialogue history to determine what kind of elaboration is most likely within reach: explanation, evidence, example, connection, qualification, or implication. If a broad pump was already tried and the learner did not extend, do not repeat the same generic invitation; ask for a different dimension of elaboration while still leaving the target content for the learner to produce.',
  }),
  autotutorDialogueMove({
    moveId: 'prompt',
    paperRuleIds: ['paper-rule-05-prompt'],
    paperMoveName: 'Prompting for specific information',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Ask one constrained question that directs attention to a specific missing slot, relation, mechanism, contrast, variable, cause, evidence, or consequence. Use dialogue history to see whether this same slot has already been prompted. If it has, do not repeat the same question; narrow or reframe the prompt by focusing on a different feature of the same target structure. Ground the wording in the current expectation and authored domain facts, but do not embed the answer in the question.',
  }),
  autotutorDialogueMove({
    moveId: 'hint',
    paperRuleIds: ['paper-rule-06-hint', 'paper-rule-07-hint'],
    paperMoveName: 'Hinting',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Provide a clue that reduces the search space and points toward the missing idea while preserving meaningful learner work. Use dialogue history to calibrate the hint\'s strength: use a minimal cue when the learner has not yet received help on this target, and a more diagnostic cue when a prior prompt or hint was not taken up. If the learner repeats the same error after a hint, do not paraphrase the prior hint; change the mediating form by highlighting a contrast, feature, example, term, process step, or relation that makes the next inference more visible.',
  }),
  autotutorDialogueMove({
    moveId: 'assertion',
    paperMoveName: 'Assertion/direct content supply',
    promptPolicy: 'Begin with brief immediate feedback grounded in the latest response. Then state the missing expectation content or the correct contrast needed to repair the selected misconception directly and concisely. Do not endorse or repeat the misconception as correct. Ask the learner to restate, apply, calculate with, or connect the supplied idea so the next response can demonstrate uptake.',
  }),
  autotutorDialogueMove({
    moveId: 'summary',
    paperRuleIds: ['paper-rule-08-summary'],
    paperMoveName: 'Summarizing',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Concisely consolidate the expectations, relations, distinctions, corrections, or reasoning steps that have already been covered in the dialogue. Use history to summarize the actual instructional trajectory, not just the target content: preserve what the learner established, what was repaired, and what distinction matters going forward. Do not present an unresolved misconception as if the learner has mastered it. Do not introduce new substantive domain content or a new follow-up question unless the controller state explicitly calls for a transition.',
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
