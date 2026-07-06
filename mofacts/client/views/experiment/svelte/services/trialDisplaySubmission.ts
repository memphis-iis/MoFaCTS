import type { H5PTrialResult } from '../../../../../common/types';
import type { SparcControllerResult } from './sparcController';

export type TrialDisplaySubmitEvent =
  | {
      type: 'SUBMIT';
      userAnswer: '__H5P_COMPLETED__' | '__H5P_INCOMPLETE__';
      timestamp: number;
      source: 'h5p';
      h5pResult: H5PTrialResult;
    }
  | {
      type: 'SUBMIT';
      userAnswer: '__SPARC_COMPLETED__';
      timestamp: number;
      source: 'sparc';
      sparcResult: SparcControllerResult;
    };

type ResolveH5PResult = (
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
) => H5PTrialResult | null;

type ResolveSparcResult = (
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
) => SparcControllerResult | null;

export type TrialDisplaySubmissionController = {
  handleH5PResult(detail: unknown): void;
  handleSparcSubmit(detail: unknown): void;
  resetForDisplay(display: Record<string, unknown> | undefined): void;
};

export function createTrialDisplaySubmissionController({
  getCurrentDisplay,
  h5pOwnsResponse,
  sparcSessionOwnsResponse,
  resolveH5PResult,
  resolveSparcResult,
  now,
  submit,
}: {
  getCurrentDisplay: () => Record<string, unknown> | undefined;
  h5pOwnsResponse: () => boolean;
  sparcSessionOwnsResponse: () => boolean;
  resolveH5PResult: ResolveH5PResult;
  resolveSparcResult: ResolveSparcResult;
  now: () => number;
  submit: (event: TrialDisplaySubmitEvent) => void;
}): TrialDisplaySubmissionController {
  let currentDisplay: Record<string, unknown> | undefined;
  let submittedH5PResultKey = '';
  let submittedSparcResultKey = '';

  function resetForDisplay(display: Record<string, unknown> | undefined): void {
    if (display === currentDisplay) {
      return;
    }
    currentDisplay = display;
    submittedH5PResultKey = '';
    submittedSparcResultKey = '';
  }

  function handleH5PResult(detail: unknown): void {
    if (!h5pOwnsResponse()) {
      return;
    }
    if (submittedH5PResultKey) {
      return;
    }
    const h5pResult = resolveH5PResult(getCurrentDisplay(), detail || {}, '[ContentSurface]');
    if (!h5pResult) {
      throw new Error('[ContentSurface] H5P result received for non-H5P display');
    }
    submittedH5PResultKey = h5pResult.batchId;
    submit({
      type: 'SUBMIT',
      userAnswer: h5pResult.completed ? '__H5P_COMPLETED__' : '__H5P_INCOMPLETE__',
      timestamp: now(),
      source: 'h5p',
      h5pResult,
    });
  }

  function handleSparcSubmit(detail: unknown): void {
    if (!sparcSessionOwnsResponse()) {
      return;
    }
    const sparcResult = resolveSparcResult(getCurrentDisplay(), detail || {}, '[ContentSurface]');
    if (!sparcResult) {
      throw new Error('[ContentSurface] SPARC result received for non-SPARC display');
    }
    const resultKey = `${sparcResult.timestamp}:${sparcResult.triggeredBy || ''}`;
    if (submittedSparcResultKey === resultKey) {
      return;
    }
    submittedSparcResultKey = resultKey;
    submit({
      type: 'SUBMIT',
      userAnswer: '__SPARC_COMPLETED__',
      timestamp: sparcResult.timestamp,
      source: 'sparc',
      sparcResult,
    });
  }

  return {
    handleH5PResult,
    handleSparcSubmit,
    resetForDisplay,
  };
}
