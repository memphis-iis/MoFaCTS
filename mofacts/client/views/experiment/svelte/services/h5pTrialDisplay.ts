import { registerDefaultTrialDisplayComponents } from '../../../../../common/defaultTrialDisplayComponents';
import { H5P_TRIAL_DISPLAY_TYPE } from '../../../../../common/h5pTrialDisplayAdapter';
import { isSelfHostedH5PDisplay } from '../../../../../common/lib/h5pDisplay';
import type { H5PTrialResult } from '../../../../../common/types';
import { getTrialDisplayAdapter } from '../../../../../../learning-components/runtime/TrialDisplayAdapterRegistry';
import type { H5PTrialDisplay } from '../../../../../../learning-components/trial-displays/h5p/H5PTrialDisplayAdapter';

function getH5PTrialDisplayAdapter() {
  registerDefaultTrialDisplayComponents();
  return getTrialDisplayAdapter(H5P_TRIAL_DISPLAY_TYPE);
}

export function resolveSelfHostedH5PTrialDisplay(
  display: Record<string, unknown> | undefined,
  source: string,
): H5PTrialDisplay | null {
  if (!isSelfHostedH5PDisplay(display)) {
    return null;
  }

  const adapter = getH5PTrialDisplayAdapter();
  try {
    return adapter.normalizeDisplay(display) as H5PTrialDisplay;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} H5P trial display invalid: ${message}`);
  }
}

export function selfHostedH5PTrialDisplayOwnsInteraction(
  display: Record<string, unknown> | undefined,
): boolean {
  return resolveSelfHostedH5PTrialDisplay(display, '[H5P Trial Display]') !== null;
}

export function resolveH5PTrialDisplayResult(
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
): H5PTrialResult | null {
  const normalizedDisplay = resolveSelfHostedH5PTrialDisplay(display, source);
  if (!normalizedDisplay) {
    return null;
  }

  if (!result) {
    throw new Error(`${source} H5P result missing`);
  }

  const adapter = getH5PTrialDisplayAdapter();
  if (typeof adapter.normalizeResult !== 'function') {
    throw new Error(`${source} H5P trial display adapter cannot normalize results`);
  }
  return adapter.normalizeResult(result, normalizedDisplay) as H5PTrialResult;
}
