import { registerDefaultTrialDisplayComponents } from '../../../../../common/defaultTrialDisplayComponents';
import { getTrialDisplayAdapter } from '../../../../../../learning-components/runtime/TrialDisplayAdapterRegistry';
import {
  SPARC_TRIAL_DISPLAY_TYPE,
  type SparcTrialDisplay,
  type SparcTrialResult,
} from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import {
  evaluateSparcTrialDisplayResponse,
} from '../../../../../../learning-components/trial-displays/sparc/sparcTrialDisplayEvaluation';

function getSparcControllerDisplayAdapter() {
  registerDefaultTrialDisplayComponents();
  return getTrialDisplayAdapter(SPARC_TRIAL_DISPLAY_TYPE);
}

export type SparcControllerDisplay = SparcTrialDisplay;
export type SparcControllerResult = SparcTrialResult;

export function resolveSparcControllerDisplay(
  display: Record<string, unknown> | undefined,
  source: string,
): SparcControllerDisplay | null {
  if (!display) {
    return null;
  }

  const adapter = getSparcControllerDisplayAdapter();
  if (!adapter.ownsInteraction(display)) {
    return null;
  }
  try {
    return adapter.normalizeDisplay(display) as SparcControllerDisplay;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} SPARC display invalid: ${message}`);
  }
}

export function resolveSparcControllerResult(
  display: Record<string, unknown> | undefined,
  result: unknown,
  source: string,
): SparcControllerResult | null {
  const normalizedDisplay = resolveSparcControllerDisplay(display, source);
  if (!normalizedDisplay) {
    return null;
  }

  if (!result) {
    throw new Error(`${source} SPARC result missing`);
  }

  const adapter = getSparcControllerDisplayAdapter();
  if (typeof adapter.normalizeResult !== 'function') {
    throw new Error(`${source} SPARC display adapter cannot normalize results`);
  }
  return adapter.normalizeResult(result, normalizedDisplay) as SparcControllerResult;
}

export function evaluateSparcControllerResponse({
  display,
  result,
}: {
  display: SparcControllerDisplay;
  result: SparcControllerResult;
}) {
  return evaluateSparcTrialDisplayResponse({
    display,
    result,
  });
}
