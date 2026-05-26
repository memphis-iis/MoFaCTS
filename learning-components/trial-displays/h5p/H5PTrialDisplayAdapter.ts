import type { LearningComponentManifest } from '../../runtime/ComponentManifest';
import type { TrialDisplayAdapter } from '../../runtime/TrialDisplayAdapterRegistry';
import { getH5PDisplayConfig, normalizeH5PDisplayConfig } from '../../../mofacts/common/lib/h5pDisplay';
import { normalizeH5PTrialResult } from '../../../mofacts/common/lib/h5pTrialResult';
import type { H5PDisplayConfig, H5PTrialResult } from '../../../mofacts/common/types/h5p';

export const H5P_TRIAL_DISPLAY_TYPE = 'h5p';

export interface H5PTrialDisplay {
  h5p: H5PDisplayConfig;
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const h5pTrialDisplayAdapter: TrialDisplayAdapter<H5PTrialDisplay, H5PTrialResult> = {
  id: 'mofacts.h5p-trial-display',
  displayType: H5P_TRIAL_DISPLAY_TYPE,
  requiredCapabilities: ['media', 'history'],
  ownsInteraction(display) {
    return getH5PDisplayConfig(display) !== null;
  },
  normalizeDisplay(display) {
    if (!isPlainObject(display)) {
      throw new Error('H5P trial display must be an object');
    }
    const h5pConfig = getH5PDisplayConfig(display);
    if (!h5pConfig) {
      throw new Error('H5P trial display requires h5p configuration');
    }
    return {
      ...display,
      h5p: normalizeH5PDisplayConfig(h5pConfig),
    };
  },
  normalizeResult(result, display) {
    return normalizeH5PTrialResult(result, display.h5p.contentId);
  },
};

export const h5pTrialDisplayComponentManifest: LearningComponentManifest = {
  id: h5pTrialDisplayAdapter.id,
  kind: 'trial-display',
  displayTypes: [H5P_TRIAL_DISPLAY_TYPE],
  requiredCapabilities: ['media', 'history'],
  register(context) {
    if (typeof context.registerTrialDisplayAdapter !== 'function') {
      throw new Error('H5P trial display component requires registerTrialDisplayAdapter');
    }
    context.registerTrialDisplayAdapter(h5pTrialDisplayAdapter);
  },
};
