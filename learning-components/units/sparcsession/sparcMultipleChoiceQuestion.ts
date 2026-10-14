import { expandSparcSemanticNodes } from '../../trial-displays/sparc/sparcSemanticNodes';
import { requireBoundedSparcDialogueMessage } from './sparcDialogueTurnNodes';
import type { SparcReplayState } from './sparcStateReplay';
import type { SparcProgressiveNodeOperation } from '../../trial-displays/sparc/sparcProgressiveNodes';
import { collectSparcProgressiveNodeOperations } from '../../trial-displays/sparc/sparcProgressiveNodes';

export type SparcQuestionChoice = { readonly id: string; readonly label: string; readonly correct: boolean };

export function parseSparcQuestionChoices(value: unknown): readonly SparcQuestionChoice[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) throw new Error('Multiple-choice question requires 3 or 4 choices');
  const ids = new Set<string>();
  const labels = new Set<string>();
  const choices = value.map(choice => {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)
      || Object.keys(choice).some(key => !['id', 'label', 'correct'].includes(key))
      || typeof choice.correct !== 'boolean' || typeof choice.id !== 'string' || !/^[a-zA-Z0-9_-]{1,24}$/.test(choice.id)) {
      throw new Error('Invalid multiple-choice option');
    }
    const label = requireBoundedSparcDialogueMessage(choice.label, 'Multiple-choice option label');
    if (label.length > 240 || /<\/?[a-z][^>]*>/i.test(label)) throw new Error('Multiple-choice option requires short plain text');
    if (ids.has(choice.id) || labels.has(label)) throw new Error('Multiple-choice options must have distinct identities and labels');
    ids.add(choice.id); labels.add(label);
    return { id: choice.id, label, correct: choice.correct };
  });
  if (choices.filter(choice => choice.correct).length !== 1) throw new Error('Multiple-choice question requires exactly one correct option');
  return choices;
}

/** Reuse TutorScript's semantic multiple-choice primitive; it owns the standard buttons. */
export function sparcQuestionAnswerNodes(node: Record<string, unknown>, readOnly: boolean): Record<string, unknown> {
  const choices = parseSparcQuestionChoices(node.choices);
  const questionId = String(node.id);
  const expanded = expandSparcSemanticNodes([{ id: questionId, nodeType: 'semantic', semanticType: 'multiple-choice', prompt: { value: String(node.value) },
    choices: choices.map(choice => ({ ...choice, id: `${questionId}:answer:${choice.id}`, value: choice.id })) }])[0] as { children: Record<string, unknown>[] };
  const answers = expanded.children.find(child => child.groupType === 'answer-list')!;
  return { ...answers, children: (answers.children as Record<string, unknown>[]).map(child => ({
    ...child, questionId, readOnly, selected: node.selectedChoiceId === child.value,
  })) };
}

export function savedSparcChoiceQuestions(replay: SparcReplayState): Record<string, unknown>[] {
  return replay.transitions.flatMap(transition => transition.writes.flatMap(write => {
    const node = (write.value as { node?: Record<string, unknown> })?.node;
    return node?.choices && String(node.id).endsWith(':question') ? [node] : [];
  }));
}

export function projectSparcAnsweredQuestionOperations(replay: SparcReplayState): SparcProgressiveNodeOperation[] {
  // Annotate the original operation, retaining its chronological position in the dialogue.
  return collectSparcProgressiveNodeOperations(replay.transitions).map(operation => {
    if (!('node' in operation) || !operation.node.choices) return operation;
    const node = operation.node;
    const answer = replay.transitions.find(transition => transition.event.type === 'response-submitted'
      && transition.event.payload?.questionId === node.id);
    return answer ? { ...operation, node: {
      ...node, readOnly: true, selectedChoiceId: answer.event.payload?.choiceId,
    } } : operation;
  });
}
