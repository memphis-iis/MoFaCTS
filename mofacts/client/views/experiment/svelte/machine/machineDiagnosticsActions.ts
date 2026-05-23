import { LOG_PREFIXES } from './constants';
import { clientConsole } from '../../../../lib/clientLogger';
import { assign, type ActionArgs } from './cardMachineActionTypes';
import { disableInput } from './trialDisplayActions';
import { stopRecording } from './speechRuntimeActions';
import { stopTTS } from './mediaRuntimeActions';

export const setErrorMessage = assign({
  errorMessage: ({ context, event }: ActionArgs) => {
    const typeSource = typeof event?.type === 'string' ? event.type : '';
    const source = event?.source || (typeSource.startsWith('error.platform.') ? typeSource.replace('error.platform.', '') : typeSource) || 'unknown';
    const rawError = event?.error ?? event?.cause ?? event?.output;
    const errorRecord = (typeof rawError === 'object' && rawError !== null) ? rawError as Record<string, unknown> : null;
    const message = errorRecord?.message || errorRecord?.reason || errorRecord?.error || rawError || context.errorMessage || 'Unknown error';
    return `${source}: ${message}`;
  },
});

export const clearErrorMessage = assign({
  errorMessage: () => undefined,
});

export function logStateTransition({ context: _context, event, self }: ActionArgs) {
  const snapshotState = self?.getSnapshot?.();
  const eventType = event?.type || 'unknown';
  const stateValue = snapshotState?.value;

  if (
    typeof stateValue === 'string' ||
    (typeof stateValue === 'object' && stateValue !== null)
  ) {
    clientConsole(2, '[CardMachine][State]', {
      eventType,
      state: stateValue,
    });
  }
}

export function logError({ context, event }: ActionArgs) {
  const rawType = typeof event?.type === 'string' ? event.type : '';
  const source = event?.source ||
    (rawType.startsWith('error.platform.') ? rawType.replace('error.platform.', '') : rawType) || 'unknown';
  const error = event?.error ?? event?.cause ?? event?.output;

  if (source === 'speechRecognition' && (error === 'no-results' || event?.silence)) {
    return;
  }

  clientConsole(1, LOG_PREFIXES.ERROR, `Error from ${source}:`, error);
  if (!error) {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Error event details:', event, { context });
  }
}

export const errorActions = [
  setErrorMessage,
  logError,
  disableInput,
  stopRecording,
  stopTTS,
];
