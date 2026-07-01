export type SparcMoveFamily =
  | 'autotutor-dialogue'
  | 'sparc-component'
  | 'navigation'
  | 'model-update';

export type SparcMoveStatus = 'active' | 'legacy-disabled';

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
  readonly status?: SparcMoveStatus;
  readonly paperRuleIds?: readonly string[];
  readonly paperMoveName: string;
  readonly promptPolicy: string;
}): SparcMoveDefinition {
  return {
    moveId: params.moveId,
    version: 'v1',
    family: 'autotutor-dialogue',
    status: params.status ?? 'active',
    source: {
      paperRuleIds: params.paperRuleIds ?? [],
      paperMoveName: params.paperMoveName,
    },
    requiredFacts: [
      'controller.selectedAction',
      'dialogue.moveContent',
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
    promptPolicy: 'Ask the learner for more information without giving away the specific missing content. Use this when the learner should continue elaborating.',
  }),
  autotutorDialogueMove({
    moveId: 'positive_pump',
    paperRuleIds: ['paper-rule-03-positive-pump'],
    paperMoveName: 'Positive pump',
    promptPolicy: 'Briefly acknowledge useful progress, then ask the learner for more detail without supplying the missing answer.',
  }),
  autotutorDialogueMove({
    moveId: 'prompt',
    paperRuleIds: ['paper-rule-05-prompt'],
    paperMoveName: 'Prompting for specific information',
    promptPolicy: 'Ask for a specific missing piece. Use constrained question wording grounded in the current expectation and authored domain facts.',
  }),
  autotutorDialogueMove({
    moveId: 'hint',
    paperRuleIds: ['paper-rule-06-hint', 'paper-rule-07-hint'],
    paperMoveName: 'Hinting',
    promptPolicy: 'Provide a clue or content cue that points toward the missing idea while preserving meaningful learner work.',
  }),
  autotutorDialogueMove({
    moveId: 'elaborate',
    paperRuleIds: ['paper-rule-09-elaborate'],
    paperMoveName: 'Elaborating',
    promptPolicy: 'Add substantive domain information from the current expectation or target facts to extend the answer; you may ask the learner to connect it back to the question.',
  }),
  autotutorDialogueMove({
    moveId: 'splice',
    paperRuleIds: ['paper-rule-04-splice'],
    paperMoveName: 'Splicing/correcting after error',
    promptPolicy: 'Correct or insert specific content after an error or misconception, then ask the learner to repair or apply the corrected idea.',
  }),
  autotutorDialogueMove({
    moveId: 'summary',
    paperRuleIds: ['paper-rule-08-summary'],
    paperMoveName: 'Summarizing',
    promptPolicy: 'Recap covered expectations concisely and end or transition according to the controller state. Do not introduce a new follow-up question unless the controller state calls for a transition.',
  }),
  autotutorDialogueMove({
    moveId: 'positive_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-10-positive-feedback'],
    paperMoveName: 'Positive immediate feedback',
    promptPolicy: 'Give brief correctness or quality confirmation. Do not add new substantive content.',
  }),
  autotutorDialogueMove({
    moveId: 'neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-15-neutral-feedback'],
    paperMoveName: 'Neutral immediate feedback',
    promptPolicy: 'Give short neutral acknowledgement of partial or weak good-answer match, name the relevant idea in plain language, and invite a focused revision without repeating generic phrasing.',
  }),
  autotutorDialogueMove({
    moveId: 'negative_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-11-negative-feedback'],
    paperMoveName: 'Negative immediate feedback',
    promptPolicy: 'Clearly but politely indicate the answer is not correct or not addressing the target. Do not over-explain.',
  }),
  autotutorDialogueMove({
    moveId: 'positive_neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-12-positive-neutral-feedback'],
    paperMoveName: 'Positive-neutral feedback',
    promptPolicy: 'Acknowledge partial progress and ask the learner to extend the same line of reasoning.',
  }),
  autotutorDialogueMove({
    moveId: 'negative_neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-13-negative-neutral-feedback', 'paper-rule-14-negative-neutral-feedback'],
    paperMoveName: 'Negative-neutral feedback',
    promptPolicy: 'Redirect away from an unproductive or partially wrong idea without harsh evaluation.',
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
