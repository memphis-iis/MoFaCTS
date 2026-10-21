import { expandSparcSemanticNodes } from '../../trial-displays/sparc/sparcSemanticNodes';
import { parseSparcQuestionChoices } from '../../runtime/sparcQuestionChoiceContract';
import { sparcQuestionFormatFromAction } from '../../runtime/sparcTargetCategories';
import type { SparcAuthoredDocument, SparcStateTransition, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { buildSparcWorkingMemoryFacts } from './sparcWorkingMemoryFacts';
import { createSparcAuthoredInitialReplayState } from './sparcAuthoredInitialState';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcProgressiveNodeOperation } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { applySparcProgressiveNodeOperations, collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';

export { parseSparcQuestionChoices, type SparcQuestionChoice } from '../../runtime/sparcQuestionChoiceContract';

/** Reuse TutorScript's semantic multiple-choice primitive; it owns the standard buttons. */
export function sparcQuestionAnswerNodes(node: Record<string, unknown>, readOnly: boolean): Record<string, unknown> {
  const choices = parseSparcQuestionChoices(node.choices, sparcQuestionFormatFromAction(node.action) === 'true-false' ? 'true-false' : 'multiple-choice');
  const questionId = String(node.id);
  const expanded = expandSparcSemanticNodes([{ id: questionId, nodeType: 'semantic', semanticType: 'multiple-choice', prompt: { value: String(node.value) },
    choices: choices.map(choice => ({ ...choice, id: `${questionId}:answer:${choice.id}`, value: choice.id })) }])[0] as { children: Record<string, unknown>[] };
  const answers = expanded.children.find(child => child.groupType === 'answer-list')!;
  return { ...answers, children: (answers.children as Record<string, unknown>[]).map(child => ({
    ...child, questionId, readOnly, selected: node.selectedChoiceId === child.value,
  })) };
}

export function savedSparcQuestions(replay: SparcReplayState): Record<string, unknown>[] {
  // Resolve stable node identities exactly as the display does, including corrections.
  return applySparcProgressiveNodeOperations([], collectSparcProgressiveNodeOperations(replay.transitions))
    .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === 'object'
      && 'id' in node && String(node.id).endsWith(':question')));
}

export function projectSparcAnsweredQuestionOperations(replay: SparcReplayState): SparcProgressiveNodeOperation[] {
  const responses = new Map(replay.transitions.filter(transition => transition.event.type === 'response-submitted')
    .map(transition => [transition.event.eventId, transition.event]));
  const answers = new Map([...responses.values()].filter(event => event.payload?.questionId)
    .map(event => [event.payload!.questionId, event]));
  // A selection stays visible in its original question. Preserve the canonical
  // contribution for assessment/context, but do not echo it as a chat message.
  // Typed/cloze messages and all surviving operations retain their chronology.
  return collectSparcProgressiveNodeOperations(replay.transitions).filter(operation => {
    if (!('node' in operation) || operation.node.speaker !== 'learner') return true;
    const response = responses.get(String(operation.node.turnEventId));
    return response?.payload?.choiceId === undefined;
  }).map(operation => {
    if (!('node' in operation)) return operation;
    const node = operation.node;
    if (node.speaker === 'learner') {
      const response = responses.get(String(node.turnEventId));
      return typeof response?.payload?.responseFormat === 'string'
        ? { ...operation, node: { ...node, responseFormat: response.payload.responseFormat } } : operation;
    }
    if (!node.choices) return operation;
    const answer = answers.get(node.id);
    return answer ? { ...operation, node: {
      ...node, readOnly: true, selectedChoiceId: answer.payload?.choiceId,
    } } : operation;
  });
}

/** Review colors are a projection of accepted assessments, never another saved score. */
export function projectSparcResponseCorrectness(document: SparcAuthoredDocument, replay: SparcReplayState): Record<string, string> {
  const scores = new Map<string, number>();
  function readScore(fact: SparcWorkingMemoryFact): [string, number] | undefined {
    const expectation = fact?.factType === 'learningTarget.score';
    if (!expectation && fact?.factType !== 'diagnostic.misconceptionScore') return;
    const id = expectation ? fact.slots?.clusterKC : fact.slots?.id;
    const value = expectation ? fact.slots?.coverage : fact.slots?.supportStrength;
    if (typeof id !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('SPARC response review requires valid saved target scores');
    }
    return [`${expectation ? 'expectation' : 'misconception'}:${id}`, value];
  }
  for (const fact of buildSparcWorkingMemoryFacts({ document, replayState: createSparcAuthoredInitialReplayState(document) })) {
    const score = readScore(fact);
    if (score) scores.set(...score);
  }
  const events = new Map<string, SparcStateTransition[]>();
  for (const transition of replay.transitions) {
    const id = transition.event.eventId;
    const group = events.get(id);
    if (group) group.push(transition); else events.set(id, [transition]);
  }
  const questions = new Map(savedSparcQuestions(replay).map(question => [question.id, question]));
  const values: Record<string, string> = {};
  for (const [id, transitions] of events) {
    const updates = new Map<string, number>();
    for (const transition of transitions) for (const write of transition.writes) {
      if (!write.key.startsWith('workingMemoryFact')) continue;
      const score = readScore(write.value as SparcWorkingMemoryFact);
      if (score) updates.set(...score);
    }
    const event = transitions[0]!.event;
    // Categorized assessments use an atomic checkpoint plus changed-score rows;
    // progressive scaffolding saves its scores in the accepted dialogue turn.
    const assessed = transitions.some(transition => transition.transitionId === `${id}:assessment`
      || (transition.transitionId === `${id}:dialogue-turn` && updates.size > 0));
    if (event.type === 'response-submitted' && assessed) {
      let correct: boolean;
      if (event.payload?.choiceId !== undefined) {
        const question = questions.get(event.payload.questionId);
        if (!question) throw new Error('SPARC response review cannot resolve the answered question');
        const choices = parseSparcQuestionChoices(question.choices, sparcQuestionFormatFromAction(question.action) === 'true-false' ? 'true-false' : 'multiple-choice');
        const choice = choices.find(choice => choice.id === event.payload!.choiceId);
        if (!choice) throw new Error('SPARC response review cannot resolve the selected option');
        correct = choice.correct;
        values[`${String(question.id)}:answer:${choice.id}::correctness`] = correct ? 'correct' : 'incorrect';
      } else {
        correct = [...updates].some(([key, value]) => key.startsWith('expectation:')
          ? value > (scores.get(key) ?? 0) : value < (scores.get(key) ?? 0));
      }
      if (event.payload?.choiceId === undefined) values[`${id}:learner::correctness`] = correct ? 'correct' : 'incorrect';
    }
    if (event.type !== 'response-submitted' || assessed) for (const [key, value] of updates) scores.set(key, value);
  }
  return values;
}
