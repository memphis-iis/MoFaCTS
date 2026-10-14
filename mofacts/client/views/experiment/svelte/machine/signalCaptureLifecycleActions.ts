import type { ActionArgs } from './contentRuntimeMachineActionTypes';
import { emitSignalCaptureFromContext } from '../services/signalCaptureLifecycleEmitter';

export function emitSessionStart({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('session-start', context as Record<string, unknown>);
}

export function emitSessionEnd({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('session-end', context as Record<string, unknown>);
}

export function emitTrialStart({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('trial-start', context as Record<string, unknown>);
}

export function emitStimulusOnset({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('stimulus-onset', context as Record<string, unknown>);
}

export function emitResponse({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('response', context as Record<string, unknown>);
}

export function emitFeedback({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('feedback', context as Record<string, unknown>);
}

export function emitTrialEnd({ context }: ActionArgs): void {
  emitSignalCaptureFromContext('trial-end', context as Record<string, unknown>);
}
