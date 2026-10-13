import { parseSparcSupportedPrompt, SPARC_SUPPORTED_PROMPT_SCHEMA_ID, type SparcSupportedPrompt } from './sparcSupportedPrompt';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcStateTransition, SparcStateWrite, SparcWorkingMemoryFact } from './sparcSessionContracts';
import { buildSparcDialogueHistory, type SparcUtteranceRequest } from './sparcUtteranceRequest';
import { SPARC_FEEDBACK_MOVE_DEFINITION, getSparcMoveDefinition } from './sparcMoveDefinitions';
import { parseSparcPromptFigure, type SparcPromptFigure } from './sparcSupportedPrompt';
import { createSparcDialogueTurnTransition, requireBoundedSparcDialogueMessage } from './sparcDialogueTurnNodes';

export type SparcInstructionComponents = { readonly explanation: string | null; readonly richContent: string | null; readonly question: string; readonly figure?: SparcPromptFigure };
export type SparcGeneratedInstruction = string | { readonly text: string } | SparcInstructionComponents | SparcSupportedPrompt;

/** Primitives retain their durable identities but form one learner-facing move. */
type InstructionMessageNode = Record<string, unknown> & { children?: InstructionMessageNode[] };
export function projectSparcInstructionMessages(nodes: readonly InstructionMessageNode[]): InstructionMessageNode[] {
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
    // Realization can select rich support first; the production still owns display order.
    const componentIndex = (child: InstructionMessageNode) => components.indexOf(
      String(child.id ?? '').substring(`${child.turnEventId}:`.length) as 'explanation' | 'richContent' | 'question');
    message.children!.sort((left, right) => componentIndex(left) - componentIndex(right));
  }
  return messages;
}

export function parseInstructionComponents(value: unknown, request: SparcUtteranceRequest): SparcInstructionComponents {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Composite instruction requires an object');
  const record = value as Record<string, unknown>;
  const components = request.moveDefinition.components;
  if (!components || Object.keys(record).some((key) => !['explanation', 'richContent', 'question', 'figure'].includes(key))) {
    throw new Error('Invalid composite instruction fields');
  }
  if (record.figure !== undefined) {
    if (!components.includes('richContent')) throw new Error('Figure requires a selected rich component');
    parseSparcPromptFigure(record.figure);
  }
  for (const component of ['explanation', 'richContent', 'question'] as const) {
    if (components.includes(component)) requireBoundedSparcDialogueMessage(record[component], `SPARC ${component}`);
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
  const tutorText = supported?.tutorMessage ?? composite?.question ?? requireBoundedSparcDialogueMessage(
    typeof params.generated === 'string' ? params.generated : 'text' in params.generated ? params.generated.text : undefined,
    'SPARC tutor utterance');
  const transition = createSparcDialogueTurnTransition({
    document: params.document, event: params.event, learnerText: params.learnerText,
    utteranceRequest: params.request, tutorText,
  });
  const tutorWrite = transition.writes[1]!;
  const operation = tutorWrite.value as { node: Record<string, unknown>; [key: string]: unknown };
  const nodes: Record<string, unknown>[] = [];
  if (composite) {
    for (const component of params.request.moveDefinition.components!) {
      nodes.push({ ...operation.node, id: `${params.event.eventId}:${component}`,
        atomType: component === 'richContent' && !composite.figure ? 'html-block' : 'dialogue-utterance',
        value: composite[component], assistance: params.request.moveDefinition.assistance,
        ...(component === 'richContent' && composite.figure ? { figure: composite.figure } : {}),
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
  const learnerText = requireBoundedSparcDialogueMessage(event.payload?.input, 'SPARC feedback learner answer');
  const problem = facts.find((fact) => fact.factType === 'dialogue.problemStatement')?.slots?.text;
  const assessment = facts.filter((fact) => ['learningTarget.score', 'diagnostic.misconceptionScore'].includes(fact.factType));
  if (!facts.some((fact) => fact.factType === 'instructional.assessmentSnapshot' && fact.slots?.snapshotId === event.eventId)) {
    throw new Error('Feedback requires the current response assessment');
  }
  return {
    problemStatement: requireBoundedSparcDialogueMessage(problem, 'SPARC feedback problem statement'),
    targetType: 'feedback', targetId: event.eventId, action: SPARC_FEEDBACK_MOVE_DEFINITION.moveId,
    contentTexts: facts.filter((fact) => fact.factType === 'autotutor.expectation').map((fact) => String(fact.slots?.text)),
    targetContent: facts.filter((fact) => ['autotutor.expectation', 'autotutor.misconception'].includes(fact.factType)).map((fact) => fact.slots),
    selectedAction: { snapshotId: event.eventId, action: SPARC_FEEDBACK_MOVE_DEFINITION.moveId, sourceRuleId },
    moveDefinition: SPARC_FEEDBACK_MOVE_DEFINITION, sourceRuleId, responseModifiers: [], learnerText,
    ...(contribution ? { learnerContribution: contribution } : {}),
    plannerState: { assessment: assessment.map((fact) => ({ factType: fact.factType, ...fact.slots })) },
    dialogueHistory: buildSparcDialogueHistory(facts),
  };
}

export function createSparcInstructionComponentWrite(params: {
  document: SparcAuthoredDocument; event: SparcInterfaceEvent; request: SparcUtteranceRequest;
  component: 'explanation' | 'richContent' | 'question'; text: string; figure?: SparcPromptFigure;
}): SparcStateWrite {
  const transition = createSparcDialogueTurnTransition({ document: params.document, event: params.event,
    learnerText: params.request.learnerText!, utteranceRequest: params.request, tutorText: params.text });
  const write = transition.writes[1]!;
  const operation = write.value as { node: Record<string, unknown> };
  return { ...write, value: { type: 'append-node', boxId: 'dialogue-flow', node: {
    ...operation.node, id: `${params.event.eventId}:${params.component}`,
    atomType: params.component === 'richContent' && !params.figure ? 'html-block' : 'dialogue-utterance',
    assistance: params.request.moveDefinition.assistance, ...(params.figure ? { figure: params.figure } : {}),
  } } };
}
