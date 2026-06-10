import { registerDefaultTrialDisplayComponents } from '../../../../../common/defaultTrialDisplayComponents';
import { getTrialDisplayAdapter } from '../../../../../../learning-components/runtime/TrialDisplayAdapterRegistry';
import {
  SPARC_TRIAL_DISPLAY_TYPE,
  type SparcTrialDisplay,
  type SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';

function getSparcTrialDisplayAdapter() {
  registerDefaultTrialDisplayComponents();
  return getTrialDisplayAdapter(SPARC_TRIAL_DISPLAY_TYPE);
}

export function resolveSparcTrialDisplay(
  display: Record<string, unknown> | undefined,
  source: string,
): SparcTrialDisplay | null {
  if (!display || display.type !== SPARC_TRIAL_DISPLAY_TYPE) {
    return null;
  }

  const adapter = getSparcTrialDisplayAdapter();
  try {
    return adapter.normalizeDisplay(display) as SparcTrialDisplay;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} SPARC trial display invalid: ${message}`);
  }
}

export function sparcTrialDisplayOwnsInteraction(
  display: Record<string, unknown> | undefined,
): boolean {
  return resolveSparcTrialDisplay(display, '[SPARC Trial Display]') !== null;
}

export function resolveSparcTrialDisplayResult(
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
): SparcTrialResult | null {
  const normalizedDisplay = resolveSparcTrialDisplay(display, source);
  if (!normalizedDisplay) {
    return null;
  }

  if (!result) {
    throw new Error(`${source} SPARC result missing`);
  }

  const adapter = getSparcTrialDisplayAdapter();
  if (typeof adapter.normalizeResult !== 'function') {
    throw new Error(`${source} SPARC trial display adapter cannot normalize results`);
  }
  return adapter.normalizeResult(result, normalizedDisplay) as SparcTrialResult;
}