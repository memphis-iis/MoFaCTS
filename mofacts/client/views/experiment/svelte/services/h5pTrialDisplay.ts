import { registerDefaultTrialDisplayComponents } from '../../../../../common/defaultTrialDisplayComponents';
import { H5P_TRIAL_DISPLAY_TYPE } from '../../../../../common/h5pTrialDisplayAdapter';
import { isSelfHostedH5PDisplay } from '../../../../../common/lib/h5pDisplay';
import type { H5PTrialResult } from '../../../../../common/types';
import { getTrialDisplayAdapter } from '../../../../../../learning-components/runtime/TrialDisplayAdapterRegistry';

export function resolveH5PTrialDisplayResult(
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
): H5PTrialResult | null {
  if (!isSelfHostedH5PDisplay(display)) {
    return null;
  }

  if (!result) {
    throw new Error(`${source} H5P result missing`);
  }

  registerDefaultTrialDisplayComponents();
  const adapter = getTrialDisplayAdapter(H5P_TRIAL_DISPLAY_TYPE);
  const normalizedDisplay = adapter.normalizeDisplay(display);
  if (typeof adapter.normalizeResult !== 'function') {
    throw new Error(`${source} H5P trial display adapter cannot normalize results`);
  }
  return adapter.normalizeResult(result, normalizedDisplay) as H5PTrialResult;
}
