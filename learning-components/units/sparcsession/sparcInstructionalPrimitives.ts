import { parseSparcSupportedPrompt, SPARC_SUPPORTED_PROMPT_SCHEMA_ID, type SparcSupportedPrompt } from './sparcSupportedPrompt';
import type { SparcAuthoredDocument, SparcInterfaceEvent, SparcStateTransition } from './sparcSessionContracts';
import type { SparcUtteranceRequest } from './sparcUtteranceRequest';
import { createSparcDialogueTurnTransition, requireBoundedSparcDialogueMessage } from './sparcDialogueTurnNodes';

export type SparcInstructionComponents = { readonly explanation: string | null; readonly richContent: string | null; readonly question: string };
export type SparcGeneratedInstruction = string | { readonly text: string } | SparcInstructionComponents | SparcSupportedPrompt;

export function instructionComponentsSchema(request: SparcUtteranceRequest) {
  const components = request.moveDefinition.components;
  if (!components) throw new Error('Composite instruction requires component definitions');
  return {
    type: 'object', additionalProperties: false, required: ['explanation', 'richContent', 'question'],
    properties: Object.fromEntries(['explanation', 'richContent', 'question'].map((component) => [component,
      components.includes(component as 'question') ? { type: 'string', minLength: 1, maxLength: 2048 } : { type: 'null' }])),
  };
}

export function parseInstructionComponents(value: unknown, request: SparcUtteranceRequest): SparcInstructionComponents {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Composite instruction requires an object');
  const record = value as Record<string, unknown>;
  const components = request.moveDefinition.components;
  if (!components || Object.keys(record).some((key) => !['explanation', 'richContent', 'question'].includes(key))) {
    throw new Error('Invalid composite instruction fields');
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
        atomType: component === 'richContent' ? 'html-block' : 'dialogue-utterance',
        value: composite[component], assistance: params.request.moveDefinition.assistance,
      });
    }
  } else nodes.push({ ...operation.node, ...(supported ? { figure: supported.figure } : {}), assistance: params.request.moveDefinition.assistance });
  return { ...transition, writes: [
    ...(params.includeLearner === false ? [] : [transition.writes[0]!]),
    ...nodes.map((node) => ({ ...tutorWrite, value: { type: 'append-node', boxId: 'dialogue-flow', node } })),
  ] };
}
