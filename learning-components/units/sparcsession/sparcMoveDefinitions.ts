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
    moveId: 'positive_pump',
    paperRuleIds: ['paper-rule-03-positive-pump'],
    paperMoveName: 'Positive pump',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Briefly name the specific part of the learner\'s response that shows useful progress, especially if it reflects uptake from a prior scaffold. Then ask the learner to extend that same productive line of thought with more detail, reasoning, evidence, or connection to the task. If the learner is merely repeating the same partial answer, do not give the same positive acknowledgement again; stabilize only what is genuinely useful and ask for a new kind of extension. Do not supply the missing answer.',
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
    moveId: 'elaborate',
    paperRuleIds: ['paper-rule-09-elaborate'],
    paperMoveName: 'Elaborating',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Add substantive domain information from the current expectation or target facts to extend, clarify, or reframe the learner\'s answer. Use dialogue history to decide what resource the learner appears to need now: a missing concept, a relevant distinction, a causal link, an example, a contrast, or a bridge from their wording to the target idea. If similar information was already given and not taken up, do not repeat it as another explanation; repackage it as a usable relation, contrast, or tool for revision. When useful, ask the learner to connect the added information back to the original question.',
  }),
  autotutorDialogueMove({
    moveId: 'splice',
    paperRuleIds: ['paper-rule-04-splice'],
    paperMoveName: 'Splicing/correcting after error',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Use the selected misconception text to help the learner inspect and repair the detected misconception. Use dialogue history to determine whether this same misconception has already been addressed. If it has not, give a concise repair grounded in the selected misconception text. If it has, do not restate or paraphrase the prior repair; treat the repeated misconception as evidence of non-uptake and vary the scaffold by isolating the problematic phrase, making the relevant contrast more explicit, focusing attention on a diagnostic feature, asking the learner to compare alternatives, or prompting a constrained revision. Do not give a fuller explanation unless it is supported by the selected target content and dialogue context.',
  }),
  autotutorDialogueMove({
    moveId: 'summary',
    paperRuleIds: ['paper-rule-08-summary'],
    paperMoveName: 'Summarizing',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Concisely consolidate the expectations, relations, distinctions, corrections, or reasoning steps that have already been covered in the dialogue. Use history to summarize the actual instructional trajectory, not just the target content: preserve what the learner established, what was repaired, and what distinction matters going forward. Do not present an unresolved misconception as if the learner has mastered it. Do not introduce new substantive domain content or a new follow-up question unless the controller state explicitly calls for a transition.',
  }),
  autotutorDialogueMove({
    moveId: 'positive_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-10-positive-feedback'],
    paperMoveName: 'Positive immediate feedback',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Give brief correctness or quality confirmation. Use dialogue history to make the feedback contingent: when the learner\'s current answer resolves an earlier gap, misconception, or incomplete relation, briefly mark that progress. Do not add new substantive content, extend the answer, or open a new line of reasoning. Avoid repeating the same praise formula used in the immediately prior tutor turn.',
  }),
  autotutorDialogueMove({
    moveId: 'neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-15-neutral-feedback'],
    paperMoveName: 'Neutral immediate feedback',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Give a short neutral acknowledgement of a partial, vague, or weak match. Use dialogue history to determine whether the learner is moving closer to the target or remaining stalled. If they are moving closer, name the relevant partial idea in plain language and invite a focused revision. If they are stalled, do not repeat the same neutral acknowledgement; focus attention on a different missing feature, relation, or task demand. Do not supply the missing answer.',
  }),
  autotutorDialogueMove({
    moveId: 'negative_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-11-negative-feedback'],
    paperMoveName: 'Negative immediate feedback',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Clearly but politely indicate that the answer is incorrect, off-target, or not addressing the current expectation. Use dialogue history to distinguish a first miss from repeated non-uptake. For a first miss, keep the correction brief and general. For a repeated miss, do not simply say "not quite" again; redirect attention to the overlooked task demand, constraint, contrast, or kind of answer needed. Avoid over-explaining and do not replace the learner\'s reasoning with a full solution.',
  }),
  autotutorDialogueMove({
    moveId: 'positive_neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-12-positive-neutral-feedback'],
    paperMoveName: 'Positive-neutral feedback',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Acknowledge the useful part of the learner\'s response, then ask them to extend, specify, justify, or connect that same line of reasoning. Use dialogue history to identify what has changed since the prior turn: if the learner has taken up part of a previous scaffold, name that progress and direct them to the remaining step. If the learner repeats the same partial answer, do not repeat the same acknowledgement; ask for the missing dimension more precisely while keeping the answer work with the learner.',
  }),
  autotutorDialogueMove({
    moveId: 'negative_neutral_feedback',
    status: 'legacy-disabled',
    paperRuleIds: ['paper-rule-13-negative-neutral-feedback', 'paper-rule-14-negative-neutral-feedback'],
    paperMoveName: 'Negative-neutral feedback',
    promptPolicy: 'Begin by briefly acknowledging the learner\'s latest response in relation to the selected move, such as confirming useful progress, marking a partial idea, or gently naming that the answer is not quite right. Then continue with the selected pedagogical move. **Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.** Redirect the learner away from an unproductive or partially wrong idea without harsh evaluation. Use dialogue history to determine whether this is a new wrong path or a recurring one. If it is new, give a light constraint or reframing. If it is recurring, make the conflict with the target structure more visible by pointing to the relevant contrast, criterion, or task demand. Do not give a full correction unless the selected move and authored content permit it.',
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
