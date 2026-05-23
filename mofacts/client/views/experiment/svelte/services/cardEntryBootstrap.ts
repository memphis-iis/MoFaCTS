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
import type { ExperimentState, SvelteCardInitResult } from '../../../../../common/types';

export type CardEntryIntentValue = ReturnType<typeof getCardEntryContext>['intent'];

export type CardRefreshRebuildClassification = ReturnType<typeof classifyCardRefreshRebuild>;

export type CardEntryBootstrapResolution = {
  effectiveCardEntryIntent: CardEntryIntentValue;
  prefetchedExperimentState: ExperimentState | null;
  refreshRebuildClassification: CardRefreshRebuildClassification | null;
  requiresConditionResolution: boolean;
  shouldUseProgressBootstrap: boolean;
};

export type CardEntryBootstrapRedirect = SvelteCardInitResult & {
  redirected: true;
};

export type CardEntryBootstrapResult =
  | { kind: 'ready'; resolution: CardEntryBootstrapResolution }
  | { kind: 'redirected'; result: CardEntryBootstrapRedirect };

export type TdfFileWithUnits = {
  tdfs?: {
    tutor?: {
      unit?: unknown[];
    };
  };
};

export function describeCardEntryBootstrapMode(
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

export async function resolveCardEntryBootstrap(params: {
  requestedCardEntryIntent: CardEntryIntentValue;
  tdfFile: TdfFileWithUnits;
  shouldUseProgressBootstrapForEntryIntent: (intent: CardEntryIntentValue) => boolean;
}): Promise<CardEntryBootstrapResult> {
  const { requestedCardEntryIntent, tdfFile, shouldUseProgressBootstrapForEntryIntent } = params;
  let effectiveCardEntryIntent = requestedCardEntryIntent;
  let prefetchedExperimentState: ExperimentState | null = null;
  let refreshRebuildClassification: CardRefreshRebuildClassification | null = null;
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
