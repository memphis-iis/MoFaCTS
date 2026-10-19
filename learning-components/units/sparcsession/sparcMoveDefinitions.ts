import { SPARC_SUPPORTED_PROMPT_SCHEMA_ID, SPARC_SUPPORTED_PROMPT_COMPOSITION_POLICY, SPARC_SUPPORTED_PROMPT_SIZING_POLICY } from './sparcSupportedPrompt';
import { SPARC_QUESTION_RESPONSE_FORMATS } from '../../runtime/sparcTargetCategories';

export type SparcMoveFamily =
  | 'autotutor-dialogue'
  | 'sparc-component'
  | 'navigation'
  | 'model-update';

export type SparcMoveStatus = 'active';

export type SparcMoveDefinition = {
  readonly responseFormat?: import('../../runtime/sparcTargetCategories').SparcQuestionResponseFormat;
  readonly components?: readonly ('explanation' | 'richContent' | 'question')[];
  readonly assistance?: number;
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
  readonly assistance?: number;
  readonly paperRuleIds?: readonly string[];
  readonly paperMoveName: string;
  readonly outputSchemaId?: string;
  readonly outputSchemaVersion?: string;
  readonly promptVersion?: string;
  readonly promptPolicy: string;
  readonly requiredFacts?: readonly string[];
}): SparcMoveDefinition {
  return {
    moveId: params.moveId,
    version: 'v1',
    family: 'autotutor-dialogue',
    ...(params.assistance !== undefined ? { assistance: params.assistance } : {}),
    status: 'active',
    source: {
      paperRuleIds: params.paperRuleIds ?? [],
      paperMoveName: params.paperMoveName,
    },
    requiredFacts: params.requiredFacts ?? ['controller.selectedAction'],
    promptId: `autotutor.${params.moveId}`,
    promptVersion: params.promptVersion ?? 'v1',
    outputSchemaId: params.outputSchemaId ?? AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_ID,
    outputSchemaVersion: params.outputSchemaVersion ?? AUTOTUTOR_DIALOGUE_OUTPUT_SCHEMA_VERSION,
    renderer: AUTOTUTOR_DIALOGUE_RENDERER,
    historyAction: AUTOTUTOR_DIALOGUE_HISTORY_ACTION,
    promptPolicy: params.promptPolicy,
  };
}

const AUTOTUTOR_PROMPT_POLICY = promptPolicy(
      '1. Acknowledgement: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally before continuing. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Transition: Then continue with the selected pedagogical move.',
      '4. Scaffolding principle: Scaffold locally: use dialogue history diagnostically to infer the learner\'s current ZPD, make the relevant task structure visible, and keep the main reasoning step with the learner.',
      '5. Selected target expectation: If targetType is learningTarget, ask one focused question that elicits a specific, substantive part of the selected target expectation that the learner has not yet supplied correctly: a conceptually important entity, property, process step, or technical concept. Seek a short answer. Make clear what information is requested without supplying it or explaining the relationship the learner needs to establish. Ground the question in the expectation\'s conceptual content; use details from the opening example only when needed to make the question understandable.',
      '6. Selected target misconception: If targetType is misconception, ask one focused question that elicits a conceptually important entity, property, process step, or technical concept needed to recognize or correct the misconception the learner actually expressed. Use the relevant correct expectation to identify that missing content, without stating the correction or supplying an explanatory clue. Do not present rubric wording as the learner\'s position or describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '7. Repetition handling: Use dialogue history to see whether this same substantive part has already been prompted. If it has, do not repeat the same question; narrow or reframe the prompt by focusing on a different substantive part of the same selected target.',
      '8. Content boundary: Ground the wording in the selected target expectation and authored domain facts, but do not embed the answer in the question.',
      '9. Question form: Use a natural question or a brief completion request, whichever fits the dialogue. A fill-in-the-blank form is optional.',
      '10. Technical-condition clarity: Use correct domain terminology, but do not rely on an unexplained technical term when its interpretation changes the answer. Briefly restate the decisive condition in learner-accessible language without supplying the target conclusion. Preserve the authored meaning and do not silently replace it with a different assumption.',
    );

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
    moveId: 'pump', assistance: 0,
    paperRuleIds: ['paper-rule-01-pump', 'paper-rule-02-pump'],
    paperMoveName: 'Pumping for more information',
    promptVersion: 'v7',
    promptPolicy: promptPolicy(
      '1. Content-grounded acknowledgement: When the learner\'s latest contribution contains substantive lesson content, begin with a brief, natural acknowledgement anchored only to one concept, relationship, calculation, or conclusion actually present in that contribution. Do not explain, extend, interpret, or paraphrase the contribution into additional answer content. When it contains no substantive lesson content, use a neutral acknowledgement or omit it if one would sound artificial. Acknowledge demonstrated progress when present; otherwise acknowledge the contribution neutrally. Do not agree with or praise an incorrect claim.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Move execution: After any acknowledgement, give one short, genuinely open invitation for the learner to continue, elaborate, or explain their current thinking in whatever direction they consider relevant.',
      '4. Named-concept focus: Explicitly identify the active concept before the open invitation. Use a compact learner-facing concept label, normally one to three content words, derived from the selected authored target content. Use a noun or established term such as "compound interest"; do not use a descriptive clause such as "the balance used to calculate interest," framing such as "the idea of," an internal id, or the full target proposition.',
      '5. Open-invitation boundary: Keep the invitation open within that named concept. Do not ask directly about the particular missing feature, relation, mechanism, contrast, variable, cause, consequence, calculation, example, piece of evidence, or reasoning step. Do not offer alternatives, clues, completion slots, or answer-bearing information.',
      '6. Target isolation: Use the selected target to determine the pump\'s named subject, but do not teach or reveal the missing target content. Ground the acknowledgement only in content the learner has already contributed or correctly established, then invite further thinking about the named concept.',
      '7. Misconception boundary: When the learner expresses a misconception, invite them to say more about their thinking without endorsing the claim and without asking them to repeat or elaborate the misconception itself.',
      '8. Semantic openness and brevity check: Before returning tutorMessage, verify that the pump introduces only the compact active-concept label needed to establish focus. It must not introduce a missing relationship, comparison, time dimension, consequence, calculation, or descriptive restatement of the answer. If the label exceeds three content words, reduce it to the shortest established concept term. The invitation must remain valid regardless of which part of the named concept the learner chooses to elaborate. If it points toward a particular missing dimension, rewrite it as a genuinely open invitation.',
      '9. Wording variation: Compare the proposed pump with the recent tutor questions in the supplied dialogue history. Do not reuse the same interrogative frame, opening construction, or closing phrase used in either of the two most recent tutor turns. If the candidate wording is structurally similar, rewrite it while preserving the same open pedagogical function.',
      '10. Form boundary: Ask only one brief open question. Do not combine an open invitation with a content-specific question, and do not turn the pump into a prompt or hint even when an earlier pump produced no progress.',
    ),
  }),
  autotutorDialogueMove({
    moveId: 'prompt', assistance: 0.66,
    paperRuleIds: ['paper-rule-05-prompt'],
    paperMoveName: 'Prompting for specific information',
    promptVersion: 'v4',
    promptPolicy: AUTOTUTOR_PROMPT_POLICY,
  }),
  autotutorDialogueMove({
    moveId: 'prompt-supported', assistance: 1.33,
    promptVersion: 'v3',
    paperMoveName: 'Prompting with an incomplete aligned figure',
    outputSchemaId: SPARC_SUPPORTED_PROMPT_SCHEMA_ID,
    outputSchemaVersion: 'v2',
    promptPolicy: AUTOTUTOR_PROMPT_POLICY + '\n' +
      '11. Figure support: Return tutorMessage, imagePrompt, figureDescription, and displayWidth together. Write a precise image-generation brief for a polished, incomplete educational figure aligned with the selected target and the single tutor question. Choose the visual form appropriate to the subject: an illustration, process, spatial arrangement, comparison, table, plot, or other figure. Leave a conceptually important feature, relationship, step, or label for the learner to infer; incompleteness need not be a missing word or a cloze item. Specify exactly what is visible, what is intentionally omitted, the exact short labels to show, and how the question refers to the figure. Use only the authored problem, selected expectation, and established dialogue; do not invent numeric variables or domain-specific assumptions. Do not put the missing answer in visible labels, the tutor message, or figureDescription. The description is accessible text describing the visible figure and its omission, not an answer key. If addressing a misconception, use the correct expectation to challenge only the misconception actually expressed; do not present it as correct. Do not return markup, image URLs, or executable drawing code.' + ' ' + SPARC_SUPPORTED_PROMPT_COMPOSITION_POLICY + ' ' + SPARC_SUPPORTED_PROMPT_SIZING_POLICY,
  }),
  autotutorDialogueMove({
    moveId: 'hint', assistance: 2,
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
    moveId: 'assertion', assistance: 2.4,
    paperMoveName: 'Assertion/direct content supply',
    promptVersion: 'v3',
    promptPolicy: promptPolicy(
      '1. Acknowledgement and feedback: Usually begin with a brief natural acknowledgement of the learner\'s latest answer or the progress it shows. If there was no progress, acknowledge the answer neutrally, then give brief immediate feedback grounded in the latest response. The acknowledgement must not agree with an incorrect answer or adopt the learner\'s claim as the tutor\'s own position. Avoid fixed templates and vary wording across turns.',
      '2. Learner-language and terminology boundary: Represent the learner\'s meaning faithfully, but do not mechanically reproduce their wording. In the tutor\'s own voice, use canonical authored terminology and silently normalize obvious misspellings, transcription errors, malformed grammar, and incorrect nonconceptual word choices. Do not attribute rubric language, unstated beliefs, or missing content to the learner. Do not interrupt the lesson to correct the learner\'s language unless the terminology distinction is itself instructionally relevant.',
      '3. Move execution: If targetType is learningTarget, state the missing expectation content directly and concisely. If targetType is misconception, directly correct the claim the learner actually expressed and state the correct contrast without presenting rubric wording as the learner\'s position. Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      '4. Misconception safety: Do not endorse or repeat the misconception as correct.',
      '5. Uptake check: Ask the learner to restate, apply, calculate with, or connect the supplied idea so the next response can demonstrate uptake.',
      '6. Bottom-out persistence: Assertion is the terminal scaffold level for an unresolved target. If dialogue history already contains an assertion for this same target, directly re-express or concretely apply the selected target content and give another narrow uptake check. Do not return to a pump, prompt, or hint, and do not broaden to another target.',
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

const categorizedMoveTemplates: readonly (Omit<SparcMoveDefinition, 'assistance'> & {
  readonly assistance: Readonly<Record<NonNullable<SparcMoveDefinition['responseFormat']>, number>>;
})[] = [
  { moveId: 'instruction.dynamic.question', components: ['question'], assistance: { text: 0.5, cloze: 0.75, 'multiple-choice': 1, 'true-false': 1.25 } },
  { moveId: 'instruction.dynamic.explanation-question', components: ['explanation', 'question'], assistance: { text: 1.5, cloze: 1.75, 'multiple-choice': 2, 'true-false': 2.25 } },
  { moveId: 'instruction.dynamic.explanation-rich-question', components: ['explanation', 'richContent', 'question'], assistance: { text: 2.5, cloze: 2.75, 'multiple-choice': 3, 'true-false': 3.25 } },
].map((definition) => ({
  ...definition, components: definition.components as NonNullable<SparcMoveDefinition['components']>,
  version: 'v1', family: 'sparc-component', status: 'active', requiredFacts: ['controller.selectedAction'],
  promptId: definition.moveId, promptVersion: 'v1', outputSchemaId: 'sparc.instruction-components', outputSchemaVersion: 'v2',
  renderer: 'sparc.nodes', historyAction: 'sparc-instruction',
  promptPolicy: 'Teach only the selected expectation or the correct distinction for the selected misconception. Generate a new case appropriate to that target; the opening is context, not a limit on subsequent cases. The requested components share the actual case, notation, and relationships. A worked example may include a formula and complete reasoning. Prefer figures for illustrating models and worked examples for applying principles; choose pedagogically within the selected rich move. End with one focused question with its own necessary givens. For rich instruction, that question must be isomorphic to the actual selected support, with a new case or inputs rather than copying the demonstrated answer. Do not repeat feedback already given. Do not expose internal scores or rule metadata.'
    + (definition.moveId === 'instruction.dynamic.question' ? '\n' + AUTOTUTOR_PROMPT_POLICY.split('\n').slice(4).join('\n') : ''),
}));

/** Twelve complete moves share the existing component generator and node renderer. */
export const SPARC_CATEGORIZED_MOVE_DEFINITIONS: readonly SparcMoveDefinition[] = categorizedMoveTemplates.flatMap(definition =>
  SPARC_QUESTION_RESPONSE_FORMATS.map(responseFormat => ({
    ...definition, moveId: `${definition.moveId}.${responseFormat}`, responseFormat,
    assistance: definition.assistance[responseFormat],
    version: 'v2', promptId: `${definition.promptId}.${responseFormat}`, promptVersion: 'v2',
    outputSchemaVersion: 'v3',
    // Category-aware learning-process focuses are composed at request construction.
    promptPolicy: 'Generate only the selected composition and response format. Teach the selected KC using the shared KLI category instructions. Instructional text uses Markdown with GFM tables; option labels remain plain text. Do not wrap the complete response in a code fence or include raw HTML. Generate the selected instruction without repeating prior feedback.',
  })));

export const SPARC_FEEDBACK_MOVE_DEFINITION: SparcMoveDefinition = autotutorDialogueMove({
  moveId: 'instruction.feedback', paperMoveName: 'Post-answer feedback', promptVersion: 'v1',
  promptPolicy: promptPolicy(
    SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.find((definition) => definition.moveId === 'assertion')!.promptPolicy.split('\n').slice(0, 2).join('\n'),
    'Give brief substantive feedback on the latest learner answer to the actual preceding problem. Use the supplied assessment and dialogue as context. Identify what is correct and correct the specific error or omission, explaining enough to understand the correction. State the correct answer or distinction when needed. Do not attribute an unexpressed misconception to the learner or endorse an incorrect claim. Do not automatically provide a full worked example. Do not ask a new question, choose a next target or move, or evaluate knowledge again. Answer an on-topic clarification when appropriate; neutrally redirect off-topic content. Use learner-facing language, never internal scores or identifiers.',
  ),
});

export function getSparcMoveDefinition(moveId: string): SparcMoveDefinition | undefined {
  return [...SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS, ...SPARC_CATEGORIZED_MOVE_DEFINITIONS, SPARC_FEEDBACK_MOVE_DEFINITION].find((definition) => definition.moveId === moveId);
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
