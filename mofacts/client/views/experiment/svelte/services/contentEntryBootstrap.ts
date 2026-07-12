import { Session } from 'meteor/session';
import { leavePage } from './navigationCleanup';
import { getExperimentState } from './experimentState';
import {
  CARD_ENTRY_INTENT,
  COMPLETED_LESSON_REDIRECT,
  classifyCardRefreshRebuild,
  getCardEntryContext,
} from '../../../../lib/cardEntryIntent';
import { isConditionRootWithoutUnitArray } from '../../../../lib/tdfUtils';
import { markLaunchLoadingTiming } from '../../../../lib/launchLoading';
import type { ContentSurfaceInitResult, ExperimentState } from '../../../../../common/types';

export type ContentEntryIntentValue = ReturnType<typeof getCardEntryContext>['intent'];

export type ContentRefreshRebuildClassification = ReturnType<typeof classifyCardRefreshRebuild>;

export type ContentEntryBootstrapResolution = {
  effectiveCardEntryIntent: ContentEntryIntentValue;
  prefetchedExperimentState: ExperimentState | null;
  refreshRebuildClassification: ContentRefreshRebuildClassification | null;
  requiresConditionResolution: boolean;
  shouldUseProgressBootstrap: boolean;
};

export type ContentEntryBootstrapRedirect = ContentSurfaceInitResult & {
  redirected: true;
};

export type ContentEntryBootstrapResult =
  | { kind: 'ready'; resolution: ContentEntryBootstrapResolution }
  | { kind: 'redirected'; result: ContentEntryBootstrapRedirect };

export type TdfFileWithUnits = {
  tdfs?: {
    tutor?: {
      unit?: unknown[];
    };
  };
};

export function describeContentEntryBootstrapMode(
  shouldUseProgressBootstrap: boolean,
  requiresConditionResolution: boolean,
): 'standard' | 'persisted-progress' | 'condition-resolve' {
  if (!shouldUseProgressBootstrap) {
    return 'standard';
  }
  if (requiresConditionResolution) {
    return 'condition-resolve';
  }
  return 'persisted-progress';
}

export async function resolveContentEntryBootstrap(params: {
  requestedCardEntryIntent: ContentEntryIntentValue;
  tdfFile: TdfFileWithUnits;
  shouldUseProgressBootstrapForEntryIntent: (intent: ContentEntryIntentValue) => boolean;
}): Promise<ContentEntryBootstrapResult> {
  const { requestedCardEntryIntent, tdfFile, shouldUseProgressBootstrapForEntryIntent } = params;
  let effectiveCardEntryIntent = requestedCardEntryIntent;
  let prefetchedExperimentState: ExperimentState | null = null;
  let refreshRebuildClassification: ContentRefreshRebuildClassification | null = null;
  const unitCount = Array.isArray(tdfFile.tdfs?.tutor?.unit) ? tdfFile.tdfs.tutor.unit.length : 0;

  if (requestedCardEntryIntent === CARD_ENTRY_INTENT.CARD_REFRESH_REBUILD) {
    markLaunchLoadingTiming('getExperimentState:start', { source: 'cardRefreshRebuild' });
    prefetchedExperimentState = await getExperimentState();
    markLaunchLoadingTiming('getExperimentState:complete', { source: 'cardRefreshRebuild' });
    refreshRebuildClassification = classifyCardRefreshRebuild(prefetchedExperimentState, unitCount);
    if (refreshRebuildClassification.moduleCompleted) {
      Session.set('uiMessage', {
        text: 'This lesson has already been completed and cannot be reopened.',
        variant: 'warning',
      });
      await leavePage(COMPLETED_LESSON_REDIRECT);
      return {
        kind: 'redirected',
        result: {
          redirected: true,
          redirectTo: COMPLETED_LESSON_REDIRECT,
          moduleCompleted: true,
        },
      };
    }
    effectiveCardEntryIntent = refreshRebuildClassification.intent;
  }

  const requiresConditionResolution =
    effectiveCardEntryIntent === CARD_ENTRY_INTENT.INITIAL_TDF_ENTRY &&
    isConditionRootWithoutUnitArray(Session.get('currentTdfFile'));
  const shouldUseProgressBootstrap =
    shouldUseProgressBootstrapForEntryIntent(effectiveCardEntryIntent) || requiresConditionResolution;

  return {
    kind: 'ready',
    resolution: {
      effectiveCardEntryIntent,
      prefetchedExperimentState,
      refreshRebuildClassification,
      requiresConditionResolution,
      shouldUseProgressBootstrap,
    },
  };
}
