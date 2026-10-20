import { getJsonUtf8ByteLength } from '../../../../../../learning-components/runtime/historyEnvelope';
import { SPARC_DIALOGUE_MAX_MESSAGE_CHARACTERS, SPARC_DIALOGUE_MAX_PERSISTED_MESSAGE_BYTES } from '../../../../../../learning-components/units/sparcsession/sparcDialogueTurnNodes';
import type { SparcOutputLimitWarning } from '../../../../../common/recoverableWarnings';
import type { CallResolvedOpenRouterJson } from './sparcControllerDialogueOpenRouter';
import { clientConsole } from '../../../../lib/clientLogger';

/** Size diagnostics never reject, truncate, or regenerate returned instructional content. */
export async function callWithSparcOutputDiagnostics(params: {
  request: Parameters<CallResolvedOpenRouterJson>[0];
  operation: SparcOutputLimitWarning['operation'];
  call: CallResolvedOpenRouterJson;
  onResult(result: Awaited<ReturnType<CallResolvedOpenRouterJson>>): void;
  reportWarning(warning: SparcOutputLimitWarning): void | Promise<void>;
}): ReturnType<CallResolvedOpenRouterJson> {
  const result = await params.call(params.request);
  params.onResult(result);
  const output = result.parsedContent;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return result;
  const record = output as Record<string, unknown>;
  const warn = (field: SparcOutputLimitWarning['field'], unit: SparcOutputLimitWarning['unit'], observedSize: number, limit: number) => {
    if (observedSize <= limit) return;
    const warning: SparcOutputLimitWarning = { code: 'autotutor.outputLimit', tdfId: params.request.tdfId ?? null,
      operation: params.operation, field, unit, observedSize, limit, attempts: 1, outcome: 'continued' };
    void Promise.resolve().then(() => params.reportWarning(warning)).catch(() => {
      clientConsole(1, '[SPARC] Unable to persist output-size warning.');
    });
  };
  for (const field of ['tutorMessage', 'workedExample', 'figureDescription'] as const) {
    if (typeof record[field] !== 'string') continue;
    const text = record[field].trim();
    warn(field, 'characters', text.length, SPARC_DIALOGUE_MAX_MESSAGE_CHARACTERS);
    warn(field, 'json-utf8-bytes', getJsonUtf8ByteLength(text), SPARC_DIALOGUE_MAX_PERSISTED_MESSAGE_BYTES);
  }
  for (const [field, limit] of [['imagePrompt', 8000], ['heading', 60]] as const) {
    if (typeof record[field] === 'string') warn(field, 'characters', record[field].trim().length, limit);
  }
  if (Array.isArray(record.choices)) for (const choice of record.choices) {
    if (typeof choice?.label === 'string') warn('choices.label', 'characters', choice.label.trim().length, 240);
  }
  return result;
}
