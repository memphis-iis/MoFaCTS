import { resetSrAttempts as resetSrAttemptsService } from '../services/speechRecognitionService';
import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

export const incrementSrAttempt = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    srAttempts: context.audio.srAttempts + 1,
  }),
});

export const resetSrState = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    srAttempts: 0,
    waitingForTranscription: false,
    recordingLocked: false,
  }),
});

export function resetSrAttempts() {
  resetSrAttemptsService();
}

export const lockRecording = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    recordingLocked: true,
  }),
});

export const unlockRecording = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    recordingLocked: false,
  }),
});

export const setWaitingForTranscription = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: true,
  }),
});

export const clearWaitingForTranscription = assign({
  audio: ({ context }: ActionArgs) => ({
    ...context.audio,
    waitingForTranscription: false,
  }),
});

export function startRecording({ context: _context, event: _event }: ActionArgs) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:startRecording'));
  }
}

export function stopRecording({ context: _context, event: _event }: ActionArgs) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('contentRuntimeMachine:stopRecording'));
  }
}
