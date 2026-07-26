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
  readonly promptVersion?: string;
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
    promptVersion: params.promptVersion ?? 'v1',
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
    promptVersion: 'v3',
    requiredFacts: ['dialogue.responseModifier'],
    promptPolicy: promptPolicy(
      '1. Question handling: Respond to the learner\'s latest question according to the work it contains. If the learner proposes a substantive answer, interpretation, calculation, or inference, give brief and direct correctness feedback on that proposal. Confirm it when correct; when incorrect, say so without supplying more of the solution than the selected scaffold move permits.',
      '2. Clarification handling: If the learner asks for clarification of a term, condition, representation, or previously supplied statement, provide the minimum clarification needed for the learner to continue.',
      '3. Work-preserving deferral: Defer only when the learner asks the tutor to perform reasoning or provide target content that the learner has not yet attempted. State the deferral conversationally and without referring to answer revelation, tutoring procedure, reflection time, system policy, or instructional machinery.',
      '4. Confirmation scope: When the learner asks whether a proposed answer, relationship, calculation setup, or inference is correct, confirm or reject only the proposition the learner supplied. Do not calculate an unstated result, supply a consequence the learner has not proposed, complete the next reasoning step, or answer the instructional question reserved for the selected scaffold move. After the confirmation, let the selected move preserve the remaining learner work.',
      '5. Composition boundary: Do not add a separate instructional question as part of this modifier. After the brief answer, clarification, feedback, or deferral, continue naturally into the application-selected scaffold move, which supplies the single instructional question.',
      '6. Content boundary: Answer only what the learner actually asked. Do not use the question as permission to introduce other missing expectations, repair unrelated misconceptions, or disclose internal targets.',
      '7. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
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
    promptVersion: 'v4',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief, natural acknowledgement of the learner\'s latest contribution. Acknowledge demonstrated progress when present; otherwise acknowledge the contribution neutrally. Do not agree with or praise an incorrect claim.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Move execution: Give one short, genuinely open invitation for the learner to continue, elaborate, or explain their current thinking in whatever direction they consider relevant.',
      '4. Open-invitation boundary: Do not identify, name, paraphrase, narrow toward, or ask directly about missing target content. Do not request a particular feature, relation, mechanism, contrast, variable, cause, consequence, calculation, example, piece of evidence, or reasoning step. Do not offer alternatives, clues, completion slots, or answer-bearing information.',
      '5. Target isolation: Treat the selected target and authored target content as internal routing information only. They must not determine the subject or wording of the pump\'s question. Base the invitation on the learner\'s latest contribution, not on what the learner has not yet said.',
      '6. Misconception boundary: When the learner expresses a misconception, invite them to say more about their thinking without endorsing the claim and without asking them to repeat or elaborate the misconception itself.',
      '7. Semantic openness check: Before returning tutorMessage, verify that the pump does not introduce a domain concept, variable, relationship, comparison, time dimension, consequence, or calculation that was absent from the learner\'s latest contribution. The invitation must remain valid regardless of which part of the learner\'s current thinking they choose to elaborate. If it points toward a particular missing dimension, rewrite it as a genuinely open invitation.',
      '8. Wording variation: Compare the proposed pump with the recent tutor questions in the supplied dialogue history. Do not reuse the same interrogative frame, opening construction, or closing phrase used in either of the two most recent tutor turns. If the candidate wording is structurally similar, rewrite it while preserving the same open pedagogical function.',
      '9. Form boundary: Ask only one brief open question. Do not combine an open invitation with a content-specific question, and do not turn the pump into a prompt or hint even when an earlier pump produced no progress.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'prompt',
    paperRuleIds: ['paper-rule-05-prompt'],
    paperMoveName: 'Prompting for specific information',
    promptVersion: 'v3',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: If targetType is learningTarget, ask one constrained question that directs attention to a specific missing slot, relation, mechanism, contrast, variable, cause, evidence, or consequence. If targetType is misconception, ask one constrained question that helps the learner examine a consequence, contradiction, or relevant contrast in the claim they actually expressed without presenting rubric wording as their position or embedding the correction. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '6. Repetition handling: Use dialogue history to see whether this same slot has already been prompted. If it has, do not repeat the same question; narrow or reframe the prompt by focusing on a different feature of the same target structure.',
      '7. Content boundary: Ground the wording in the current expectation and authored domain facts, but do not embed the answer in the question.',
      '8. Technical-condition clarity: Use correct domain terminology, but do not rely on an unexplained technical term when its interpretation changes the answer. Briefly restate the decisive condition in learner-accessible language without supplying the target conclusion. Preserve the authored meaning and do not silently replace it with a different assumption.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'hint',
    paperRuleIds: ['paper-rule-06-hint', 'paper-rule-07-hint'],
    paperMoveName: 'Hinting',
    promptVersion: 'v3',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Move execution: Use the selected authored target content as the destination of the clue. If targetType is learningTarget, provide a clue that reduces the search space and points toward a specific feature of the selected expectation while preserving meaningful learner work. If targetType is misconception, use the selected misconception and correct expectations to provide a clue that helps the learner notice a problem, limitation, consequence, or relevant contrast in the claim they actually expressed without presenting rubric wording as their position or fully stating the correction. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '6. Strength calibration: Use dialogue history to calibrate the hint\'s strength: use a minimal cue when the learner has not yet received help on this target, and a more diagnostic cue when a prior prompt or hint was not taken up.',
      '7. Repetition handling: If the learner repeats the same error after a hint, do not paraphrase the prior hint; change the mediating form by highlighting a contrast, feature, example, term, process step, or relation that makes the next inference more visible.',
      '8. Hint-strength boundary: A hint may expose one useful feature, contrast, intermediate representation, or consequence, but it must leave the selected inference or correction for the learner. Do not state the complete corrected proposition, provide the requested final result, or give a sentence that could serve as the learner\'s complete answer. If the proposed hint fully resolves the target, reduce it to an earlier clue and ask the learner to make the remaining connection.',
      '9. Misconception-repair boundary: When addressing a misconception, prefer making a relevant contrast or consequence visible and asking the learner to evaluate it. Do not simply replace the learner\'s claim with the complete correct claim; that belongs to an assertion.',
      '10. Technical-condition clarity: Use correct domain terminology, but do not rely on an unexplained technical term when its interpretation changes the answer. Briefly restate the decisive condition in learner-accessible language without supplying the target conclusion. Preserve the authored meaning and do not silently replace it with a different assumption.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'assertion',
    paperMoveName: 'Assertion/direct content supply',
    promptVersion: 'v2',
    promptPolicy: promptPolicy(
      '1. Acknowledgement and feedback: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally, then give brief immediate feedback grounded in the latest response. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Move execution: If targetType is learningTarget, state the missing expectation content directly and concisely. If targetType is misconception, directly correct the claim the learner actually expressed and state the correct contrast without presenting rubric wording as the learner\'s position. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '4. Misconception safety: Do not endorse or repeat the misconception as correct.',
      '5. Uptake check: Ask the learner to restate, apply, calculate with, or connect the supplied idea so the next response can demonstrate uptake.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'summary',
    paperRuleIds: ['paper-rule-08-summary'],
    paperMoveName: 'Summarizing',
    promptVersion: 'v2',
    promptPolicy: promptPolicy(
      '1. Acknowledgement: Briefly recognize the learner\'s final contribution and the understanding it demonstrates. Do not begin with an administrative receipt or generic praise.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Summary source: Build the summary primarily from completed expectations, repaired misconceptions, and the learner\'s strongest correct explanations, applications, examples, or calculations.',
      '4. Move execution: Present the learner\'s final understanding as one concise, connected explanation. Emphasize what the learner established and how the established ideas relate.',
      '5. Misconception treatment: Do not quote, catalogue, or foreground the learner\'s earlier errors. Mention an earlier misconception only when the contrast is necessary to explain the final understanding. When needed, describe the repaired distinction neutrally and focus on the correct current understanding.',
      '6. Trajectory boundary: Do not narrate the conversation turn by turn or use formulations such as "you first said," "although you originally thought," or "you were wrong about." Describe conceptual progress positively, for example by stating what the learner worked out, connected, distinguished, or established.',
      '7. Content boundary: Do not introduce new substantive domain content, unresolved claims as mastered content, internal scoring language, or a new follow-up question.',
      '8. Completion handling: For required-coverage completion, consolidate the established understanding. For max-turn completion, summarize demonstrated progress and identify unresolved content neutrally without implying mastery.',
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
