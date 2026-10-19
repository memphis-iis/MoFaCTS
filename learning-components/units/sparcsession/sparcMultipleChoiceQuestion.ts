import { expandSparcSemanticNodes } from '../../trial-displays/sparc/sparcSemanticNodes';
import { parseSparcQuestionChoices } from '../../runtime/sparcQuestionChoiceContract';
import { sparcQuestionFormatFromAction } from '../../runtime/sparcTargetCategories';
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
