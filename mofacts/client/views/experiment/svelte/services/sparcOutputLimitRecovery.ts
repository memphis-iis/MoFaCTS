import {
  requireBoundedSparcDialogueMessage,
  SparcDialogueMessageLimitError,
} from '../../../../../../learning-components/units/sparcsession/sparcDialogueTurnNodes';
import type { SparcOutputLimitWarning } from '../../../../../common/recoverableWarnings';
import type { CallResolvedOpenRouterJson } from './sparcControllerDialogueOpenRouter';
import { clientConsole } from '../../../../lib/clientLogger';

/** Only generated text limits are recoverable here; other validation/service errors keep their owner. */
export class SparcOutputLimitRecoveryError extends Error {
  constructor() {
    super('Tutor response needs regeneration; accepted progress is retained.');
    this.name = 'SparcOutputLimitRecoveryError';
  }
}

type OutputField = SparcOutputLimitWarning['field'];

function validateGeneratedText(value: unknown, schema: Record<string, unknown>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const output = value as Record<string, unknown>;
  for (const field of ['tutorMessage', 'workedExample', 'figureDescription'] as const) {
    if (typeof output[field] === 'string' && output[field].trim()) requireBoundedSparcDialogueMessage(output[field], field);
  }
  const properties = schema.properties as Record<string, { maxLength?: number; items?: { properties?: Record<string, { maxLength?: number }> } }> | undefined;
  const checkLength = (text: unknown, field: OutputField, limit: number | undefined) => {
    if (typeof text === 'string' && typeof limit === 'number' && text.trim().length > limit) {
      throw new SparcDialogueMessageLimitError(field, 'characters', text.trim().length, limit);
    }
  };
  for (const field of ['imagePrompt', 'heading'] as const) checkLength(output[field], field, properties?.[field]?.maxLength);
  if (Array.isArray(output.choices)) {
    for (const choice of output.choices) checkLength(choice?.label, 'choices.label', properties?.choices?.items?.properties?.label?.maxLength);
  }
}

/** One regeneration of the same JSON request, before publication, persistence, or image generation. */
export async function callWithSparcOutputLimitRecovery(params: {
  request: Parameters<CallResolvedOpenRouterJson>[0];
  operation: SparcOutputLimitWarning['operation'];
  call: CallResolvedOpenRouterJson;
  onResult(result: Awaited<ReturnType<CallResolvedOpenRouterJson>>): void;
  reportWarning(warning: SparcOutputLimitWarning): void | Promise<void>;
}): ReturnType<CallResolvedOpenRouterJson> {
  const call = async (request: Parameters<CallResolvedOpenRouterJson>[0]) => {
    const result = await params.call(request);
    params.onResult(result);
    validateGeneratedText(result.parsedContent, request.intent.schema);
    return result;
  };
  let violation: SparcDialogueMessageLimitError;
  try {
    return await call(params.request);
  } catch (error) {
    if (!(error instanceof SparcDialogueMessageLimitError)) throw error;
    violation = error;
  }
  let outcome: SparcOutputLimitWarning['outcome'] = 'failed';
  try {
    const result = await call({ ...params.request, messages: [...params.request.messages, {
      role: 'system',
      content: `Regenerate the same requested teaching content and JSON fields. The previous ${violation.field} exceeded its ${violation.limit} ${violation.unit} limit (${violation.observedSize}). Rewrite it concisely, aiming for at most half of each text limit to leave space for JSON escaping and Unicode. Preserve complete reasoning, words, selected target, teaching action, response format, and any supplied support. Do not truncate text or mention this correction to the learner.`,
    }] });
    outcome = 'regenerated';
    return result;
  } catch (error) {
    if (!(error instanceof SparcDialogueMessageLimitError)) throw error;
    violation = error;
    outcome = 'retry-needed';
    throw new SparcOutputLimitRecoveryError();
  } finally {
    const warning: SparcOutputLimitWarning = { code: 'autotutor.outputLimit', tdfId: params.request.tdfId ?? null,
      operation: params.operation, field: violation.field as OutputField, unit: violation.unit,
      observedSize: violation.observedSize, limit: violation.limit, attempts: 2, outcome };
    void Promise.resolve().then(() => params.reportWarning(warning)).catch(() => {
      clientConsole(1, '[RECOVERABLE WARNING] Unable to persist AutoTutor output-limit warning.');
    });
  }
}
