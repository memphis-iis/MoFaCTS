import type { AutoTutorCompressedHistoryRecord } from './AutoTutorRuntimeCapabilities';

export type AutoTutorEndReason = 'in_progress' | 'mastery' | 'max_turns' | 'cost_cap';

export type AutoTutorEndState = {
  completed: boolean;
  mastered: boolean;
  endReason: AutoTutorEndReason;
  stoppedByCost: boolean;
};

export const AUTO_TUTOR_END_REASONS = new Set<AutoTutorEndReason>([
  'in_progress',
  'mastery',
  'max_turns',
  'cost_cap',
]);

export function isAutoTutorEndReason(value: unknown): value is AutoTutorEndReason {
  return typeof value === 'string' && AUTO_TUTOR_END_REASONS.has(value as AutoTutorEndReason);
}

export function applyAutoTutorEndReason<TState extends AutoTutorEndState>(
  state: TState,
  endReason: AutoTutorEndReason,
): void {
  state.endReason = endReason;
  state.completed = endReason !== 'in_progress';
  state.mastered = endReason === 'mastery';
  state.stoppedByCost = endReason === 'cost_cap';
}

export function getAutoTutorHistoryAction(
  state: AutoTutorEndState,
): AutoTutorCompressedHistoryRecord['action'] {
  if (!state.completed) {
    return 'autotutor-turn';
  }
  if (state.mastered) {
    return 'autotutor-complete';
  }
  if (state.endReason === 'max_turns') {
    return 'autotutor-ended-max_turns';
  }
  if (state.endReason === 'cost_cap') {
    return 'autotutor-ended-cost_cap';
  }
  throw new Error(`AutoTutor completed state has invalid end reason: ${state.endReason}`);
}
