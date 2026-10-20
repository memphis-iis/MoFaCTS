import { parseSparcVideoSegment, type SparcVideoSegment } from '../../runtime/sparcVideo';
import { SPARC_ADMINISTRATIVE_REMOVAL_TEXT } from '../../runtime/sparcAdministrativeRemoval';
import type { SparcPrimitiveReference } from './sparcMoveLibrary';
import { parseSparcSupportedPrompt, SPARC_SUPPORTED_PROMPT_SCHEMA_ID, type SparcSupportedPrompt } from './sparcSupportedPrompt';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcStateTransition, SparcStateWrite, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { buildSparcDialogueHistory, type SparcUtteranceRequest } from './sparcUtteranceRequest';
import { SPARC_FEEDBACK_MOVE_DEFINITION, getSparcMoveDefinition } from './sparcMoveDefinitions';
import { parseSparcPromptFigure, type SparcPromptFigure } from './sparcSupportedPrompt';
import { createSparcDialogueTurnTransition, requireSparcDialogueText } from './sparcDialogueTurnNodes';
import { parseSparcQuestionChoices, type SparcQuestionChoice } from './sparcMultipleChoiceQuestion';
import { isSparcChoiceFormat, validateSparcClozeQuestion } from '../../runtime/sparcTargetCategories';

export type SparcInstructionComponents = { readonly explanation: string | null; readonly richContent: string | null; readonly question: string; readonly video?: SparcVideoSegment; readonly figure?: SparcPromptFigure; readonly choices?: readonly SparcQuestionChoice[]; readonly supportHeading?: string; readonly removedComponents?: readonly ('explanation' | 'richContent' | 'question')[] };
export type SparcGeneratedInstruction = string | { readonly text: string } | SparcInstructionComponents | SparcSupportedPrompt;

/** Primitives retain their durable identities but form one learner-facing move. */
type InstructionMessageNode = Record<string, unknown> & { children?: InstructionMessageNode[] };
export function projectSparcInstructionMessages(nodes: readonly InstructionMessageNode[], readiness: {
  canReveal?: (node: InstructionMessageNode) => boolean;
  isReady?: (node: InstructionMessageNode) => boolean;
} = {}): InstructionMessageNode[] {
  const messages: InstructionMessageNode[] = [];
  const moves = new Map<string, InstructionMessageNode>();
  for (const node of nodes) {
    const components = getSparcMoveDefinition(String(node.action ?? ''))?.components;
    const component = String(node.id ?? '').substring(`${node.turnEventId}:`.length);
    if (!node.turnEventId || !components?.includes(component as 'explanation' | 'richContent' | 'question')) {
      messages.push(node);
      continue;
    }
    const key = `${node.turnEventId}:${node.action}`;
    let message = moves.get(key);
    if (!message) {
      message = { ...node, id: `${node.turnEventId}:instruction`, atomType: 'dialogue-utterance', children: [] };
      moves.set(key, message);
      messages.push(message);
    }
    message.children!.push(node);
  }
  return messages.flatMap(message => {
    if (moves.get(`${message.turnEventId}:${message.action}`) !== message) {
      return readiness.canReveal?.(message) === false ? [] : [message];
    }
    const components = getSparcMoveDefinition(String(message.action))!.components!;
    const children: InstructionMessageNode[] = [];
    for (const component of components) {
      const child = message.children!.find(node => node.id === `${node.turnEventId}:${component}`);
      if (!child || readiness.canReveal?.(child) === false) break;
      children.push(child);
      // A loading support occupies its place, but cannot release the question.
      if (readiness.isReady?.(child) === false) break;
    }
    return children.length ? [{ ...message, children }] : [];
  });
}

export function parseInstructionComponents(value: unknown, request: SparcUtteranceRequest): SparcInstructionComponents {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Composite instruction requires an object');
  const record = value as Record<string, unknown>;
  const components = request.moveDefinition.components;
  if (!components || Object.keys(record).some((key) => !['explanation', 'richContent', 'question', 'figure', 'video', 'choices', 'supportHeading', 'removedComponents'].includes(key))) {
    throw new Error('Invalid composite instruction fields');
  }
  const removed = record.removedComponents;
  if (removed !== undefined && (!Array.isArray(removed) || new Set(removed).size !== removed.length
    || removed.some(kind => !components.includes(kind) || record[kind] !== SPARC_ADMINISTRATIVE_REMOVAL_TEXT))) throw new Error('Invalid administrative removal presentation');
  if (isSparcChoiceFormat(request.moveDefinition.responseFormat) && !(removed as string[] | undefined)?.includes('question')) parseSparcQuestionChoices(record.choices, request.moveDefinition.responseFormat);
  else if (record.choices !== undefined) throw new Error('Text-response instruction cannot contain multiple-choice options');
  if (request.moveDefinition.responseFormat === 'cloze' && !(removed as string[] | undefined)?.includes('question')) validateSparcClozeQuestion(String(record.question ?? ''));
  if (record.supportHeading !== undefined) {
    const heading = requireSparcDialogueText(record.supportHeading, 'Support heading');
    if (!components.includes('richContent') || record.figure || /[<>\r\n]/.test(heading)) throw new Error('Invalid instructional support heading');
  }
  if (record.video !== undefined) {
    if (!components.includes('richContent') || record.figure || record.supportHeading || record.richContent !== (record.video as SparcVideoSegment).transcript) throw new Error('Video requires standalone rich support');
    parseSparcVideoSegment(record.video);
  }
  if (record.figure !== undefined) {
    if (!components.includes('richContent')) throw new Error('Figure requires a selected rich component');
    parseSparcPromptFigure(record.figure);
  }
  for (const component of ['explanation', 'richContent', 'question'] as const) {
    if (components.includes(component)) requireSparcDialogueText(record[component], `SPARC ${component}`);
    else if (record[component] !== null) throw new Error(`Unexpected ${component} in selected instruction`);
  }
  if (typeof record.richContent === 'string' && /<(script|iframe|input|button|style)\b|\bon\w+\s*=|javascript:/i.test(record.richContent)) {
    throw new Error('Rich instruction contains unsupported active content');
  }
  return record as SparcInstructionComponents;
}

/** One shared realization path; productions own the move, target, and context. */
export function createSparcInstructionTransition(params: {
  readonly document: SparcAuthoredDocument;
  readonly event: SparcInterfaceEvent;
  readonly learnerText: string;
  readonly request: SparcUtteranceRequest;
  readonly generated: SparcGeneratedInstruction;
  readonly includeLearner?: boolean;
}): SparcStateTransition {
  const composite = params.request.moveDefinition.components ? parseInstructionComponents(params.generated, params.request) : undefined;
  const supported = params.request.moveDefinition.outputSchemaId === SPARC_SUPPORTED_PROMPT_SCHEMA_ID
    ? parseSparcSupportedPrompt(params.generated) : undefined;
  const tutorText = supported?.tutorMessage ?? composite?.question ?? requireSparcDialogueText(
    typeof params.generated === 'string' ? params.generated : 'text' in params.generated ? params.generated.text : undefined,
    'SPARC tutor utterance');
  const transition = createSparcDialogueTurnTransition({
    document: params.document, event: params.event, learnerText: params.learnerText,
    utteranceRequest: params.request, tutorText, includeLearner: params.includeLearner !== false,
  });
  const tutorWrite = transition.writes.at(-1)!;
  const operation = tutorWrite.value as { node: Record<string, unknown>; [key: string]: unknown };
  const nodes: Record<string, unknown>[] = [];
  if (composite) {
    for (const component of params.request.moveDefinition.components!) {
      nodes.push({ ...operation.node, id: `${params.event.eventId}:${component}`,
        atomType: component === 'richContent' && !composite.figure && !composite.video ? 'html-block' : 'dialogue-utterance',
        value: composite[component], assistance: params.request.moveDefinition.assistance,
        ...(composite.removedComponents?.includes(component) ? { administrativeRemoval: true, readOnly: true } : {}),
        ...(component === 'richContent' && composite.video ? { video: composite.video } : {}),
        ...(component === 'richContent' && composite.figure ? { figure: composite.figure } : {}),
        ...(component === 'richContent' && composite.supportHeading ? { supportHeading: composite.supportHeading } : {}),
        ...(component === 'question' && composite.choices ? { choices: composite.choices } : {}),
      });
    }
  } else nodes.push({ ...operation.node, ...(supported ? { figure: supported.figure } : {}), assistance: params.request.moveDefinition.assistance });
  return { ...transition, writes: [
    ...(params.includeLearner === false ? [] : [transition.writes[0]!]),
    ...nodes.map((node) => ({ ...tutorWrite, value: { type: 'append-node', boxId: 'dialogue-flow', node } })),
  ] };
}

/** Feedback binds the assessed response, never a next instructional decision. */
export function createSparcFeedbackRequest(facts: readonly SparcWorkingMemoryFact[], event: SparcInterfaceEvent, sourceRuleId: string): SparcUtteranceRequest {
  const contribution = facts.find((fact) => fact.factType === 'learnerResponse.contribution')?.slots;
  const learnerText = requireSparcDialogueText(event.payload?.input, 'SPARC feedback learner answer');
  const problem = facts.find((fact) => fact.factType === 'dialogue.problemStatement')?.slots?.text;
  const question = facts.filter(fact => fact.factType === 'dialogue.utterance' && fact.slots?.speaker === 'tutor'
    && ['learningTarget', 'misconception'].includes(String(fact.slots?.targetType))
    && !['explanation', 'richContent'].includes(String(fact.slots?.component))
    && ![':explanation', ':richContent'].some(suffix => String(fact.factId).endsWith(suffix))).at(-1);
  const targetId = question?.slots?.targetId;
  const targetType = question?.slots?.targetType;
  if (typeof targetId !== 'string' || !targetId.trim()
    || (event.payload?.questionId && event.payload.questionId !== question?.factId)) {
    throw new Error('Feedback requires the answered question and its intended target');
  }
  const expectation = targetType === 'learningTarget';
  const target = facts.find(fact => fact.factType === (expectation ? 'autotutor.expectation' : 'autotutor.misconception')
    && fact.slots?.[expectation ? 'clusterKC' : 'id'] === targetId);
  if (!target) throw new Error('Feedback question target is missing from authored content');
  const assessment = facts.filter(fact => fact.factType === 'instructional.evidence'
    ? fact.slots?.kind === (expectation ? 'expectation' : 'misconception') && fact.slots?.id === targetId
    : fact.factType === (expectation ? 'learningTarget.score' : 'diagnostic.misconceptionScore')
      && fact.slots?.[expectation ? 'clusterKC' : 'id'] === targetId);
  if (!facts.some((fact) => fact.factType === 'instructional.assessmentSnapshot' && fact.slots?.snapshotId === event.eventId)) {
    throw new Error('Feedback requires the current response assessment');
  }
  return {
    problemStatement: requireSparcDialogueText(problem, 'SPARC feedback problem statement'),
    targetType: 'feedback', targetId, action: SPARC_FEEDBACK_MOVE_DEFINITION.moveId,
    contentTexts: [String(target.slots?.text)], targetContent: target.slots,
    selectedAction: { snapshotId: event.eventId, action: SPARC_FEEDBACK_MOVE_DEFINITION.moveId, sourceRuleId },
    moveDefinition: SPARC_FEEDBACK_MOVE_DEFINITION, sourceRuleId, responseModifiers: [], learnerText,
    ...(contribution ? { learnerContribution: contribution } : {}),
    plannerState: { assessment: assessment.map((fact) => ({ factType: fact.factType, ...fact.slots })) },
    dialogueHistory: buildSparcDialogueHistory(facts.filter(fact => fact.factType === 'dialogue.utterance'
      && (fact.slots?.eventId === question?.slots?.eventId || fact.slots?.eventId === event.eventId))),
  };
}

export function createSparcInstructionComponentWrite(params: {
  document: SparcAuthoredDocument; event: SparcInterfaceEvent; request: SparcUtteranceRequest;
  component: 'explanation' | 'richContent' | 'question'; text: string; figure?: SparcPromptFigure;
  details?: Pick<SparcInstructionComponents, 'choices' | 'supportHeading' | 'video'> & { primitiveReference?: SparcPrimitiveReference; administrativeRemoval?: true };
}): SparcStateWrite {
  const transition = createSparcDialogueTurnTransition({ document: params.document, event: params.event,
    includeLearner: false, utteranceRequest: params.request, tutorText: params.text });
  const write = transition.writes[0]!;
  const operation = write.value as { node: Record<string, unknown> };
  return { ...write, value: { type: 'append-node', boxId: 'dialogue-flow', node: {
    ...operation.node, id: `${params.event.eventId}:${params.component}`, component: params.component,
    atomType: params.component === 'richContent' && !params.figure && !params.details?.video ? 'html-block' : 'dialogue-utterance',
    assistance: params.request.moveDefinition.assistance, ...(params.figure ? { figure: params.figure } : {}),
    ...(params.details ?? {}),
  } } };
}
