import { sparcPolicyForAccount, isSparcCategorizedPolicy } from '../../../../../../learning-components/runtime/sparcInstructionalPolicies';
import { clientConsole } from '../../../../lib/clientLogger';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type {
  SparcControllerDisplay,
  SparcControllerResult,
} from './sparcController';
import {
  resolveSparcControllerDisplay,
} from './sparcController';
import type {
  SparcTrialDisplayAutoTutorRuleRuntimeParams,
} from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';
import type {
  SparcTrialDisplayDialogueTurnScorer,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcUtteranceGenerator,
} from '../../../../../../learning-components/units/sparcsession/sparcAutoTutorRuleRuntime';
import type { UnitEngineLike } from '../../../../../common/types';
import { insertCompressedHistory, insertCompressedHistoryBatch } from '../../../../lib/historyWire';
import {
  readSparcResumeSnapshot,
  rememberSparcRuntimeHistoryRecord,
} from './sparcRuntimeState';
import {
  applySparcStateTransition,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';

type SparcControllerDialogueDisplay = SparcControllerDisplay & {
  readonly pageKey: string;
  readonly unitType: 'sparc-autotutor-dialogue';
};

type SparcControllerDialogueEngine = UnitEngineLike & {
  readonly commitSparcTrialDisplayAutoTutorRules?: (
    params: SparcTrialDisplayAutoTutorRuleRuntimeParams
  ) => Promise<{
    readonly document?: unknown;
    readonly dialogueTurn?: {
      readonly transition?: Parameters<typeof applySparcStateTransition>[1];
      readonly historyRecord?: CanonicalHistoryRecord;
    };
  }>;
};

type SparcControllerDialogueCommitDeps = {
  readonly getIsAdmin?: () => boolean;
  readonly getUserId?: () => string | null;
  readonly writeHistory?: (historyRecord: CanonicalHistoryRecord) => Promise<void>;
  readonly writeHistoryBatch?: (records: readonly CanonicalHistoryRecord[]) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function defaultUserId(): string | null {
  const meteor = (globalThis as typeof globalThis & {
    Meteor?: { userId?: () => string | null };
  }).Meteor;
  return typeof meteor?.userId === 'function' ? meteor.userId() : null;
}

export function isSparcAutoTutorDisplay(display: unknown): display is SparcControllerDialogueDisplay {
  const sparcDisplay = resolveSparcControllerDisplay(
    isRecord(display) ? display : undefined,
    '[SPARC][Dialogue]',
  );
  return Boolean(
    sparcDisplay
      && sparcDisplay.unitType === 'sparc-autotutor-dialogue'
      && nonBlankString(sparcDisplay.pageKey).length > 0
      && Array.isArray(sparcDisplay.nodes),
  );
}

function requireSparcControllerDialogueDisplay(display: unknown): SparcControllerDialogueDisplay | null {
  const sparcDisplay = resolveSparcControllerDisplay(
    isRecord(display) ? display : undefined,
    '[SPARC][Dialogue]',
  );
  if (!sparcDisplay || sparcDisplay.unitType !== 'sparc-autotutor-dialogue') {
    return null;
  }
  const pageKey = nonBlankString(sparcDisplay.pageKey);
  if (!pageKey) {
    throw new Error('[SPARC][Dialogue] Controller dialogue display requires pageKey');
  }
  if (!Array.isArray(sparcDisplay.nodes)) {
    throw new Error('[SPARC][Dialogue] Controller dialogue display requires nodes array');
  }
  return sparcDisplay as unknown as SparcControllerDialogueDisplay;
}

type SparcAutoTutorCommitParams = {
  readonly engine: UnitEngineLike | null | undefined;
  readonly currentDisplay: unknown;
  readonly sparcResult?: SparcControllerResult;
  readonly tdfId: unknown;
  readonly userId: unknown;
  readonly attemptId: unknown;
  readonly levelUnit: unknown;
  readonly scoreLearnerResponse: SparcTrialDisplayDialogueTurnScorer;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly onNodeValues?: (values: Record<string, unknown>) => void | Promise<void>;
  readonly deps?: SparcControllerDialogueCommitDeps;
};

export function commitSparcAutoTutorSubmit(params: SparcAutoTutorCommitParams & { readonly sparcResult: SparcControllerResult }) {
  return commitSparcAutoTutorEvent(params);
}

export function commitSparcAutoTutorDocumentLoad(params: Omit<SparcAutoTutorCommitParams, 'sparcResult'>) {
  return commitSparcAutoTutorEvent(params);
}

async function commitSparcAutoTutorEvent(params: SparcAutoTutorCommitParams): Promise<{
  readonly committed: boolean;
  readonly sparcNodeValues: Record<string, unknown>;
}> {
  const sparcDisplay = requireSparcControllerDialogueDisplay(params.currentDisplay);
  if (!sparcDisplay) {
    return { committed: false, sparcNodeValues: {} };
  }

  const tdfId = nonBlankString(params.tdfId);
  const userId = nonBlankString(params.userId);
  const attemptId = nonBlankString(params.attemptId);
  if (!tdfId || !userId || !attemptId) {
    throw new Error('[SPARC][Dialogue] History requires TDFId, userId, and attemptId');
  }
  const authenticatedUserId = params.deps?.getUserId ? params.deps.getUserId() : defaultUserId();
  if (authenticatedUserId !== userId) {
    throw new Error('[SPARC][Dialogue] History requires an authenticated user');
  }
  const isAdmin = params.deps?.getIsAdmin ? params.deps.getIsAdmin() : (await import('../../../../lib/roleUtils')).currentUserHasRole('admin');
  if (sparcDisplay.instructionalController?.policyId !== sparcPolicyForAccount(isAdmin, sparcDisplay.instructionalController?.policyId)) {
    throw new Error('AutoTutor account policy changed; reopen this lesson before submitting');
  }
  const levelUnit = Number(params.levelUnit);
  if (!Number.isFinite(levelUnit)) {
    throw new Error('[SPARC][Dialogue] History requires finite levelUnit');
  }

  const engine = params.engine as SparcControllerDialogueEngine | null | undefined;
  if (typeof engine?.commitSparcTrialDisplayAutoTutorRules !== 'function') {
    throw new Error('[SPARC][Dialogue] Submit requires SPARC session controller-dialogue commit support');
  }
  const sparcRuntime = readSparcResumeSnapshot({
    userId,
    TDFId: tdfId,
    levelUnit,
    pageKey: sparcDisplay.pageKey,
    display: sparcDisplay,
  });
  const priorHistoryRecords = sparcRuntime.retainedHistoryRecords;
  const startedAt = Date.now();
  let writtenHistoryCount = 0;

  await engine.commitSparcTrialDisplayAutoTutorRules({
    core: {
      TDFId: tdfId,
      sessionID: String(priorHistoryRecords.at(-1)?.sessionID ?? `${attemptId}:${sparcDisplay.instructionalController!.policyId}:${startedAt}`),
      levelUnit,
      userId,
    },
    pageKey: sparcDisplay.pageKey,
    display: sparcDisplay,
    ...(params.sparcResult ? { result: params.sparcResult } : {}),
    document: sparcRuntime.document,
    replayState: sparcRuntime.replayState,
    priorHistoryRecords,
    scoreLearnerResponse: params.scoreLearnerResponse,
    generateTutorUtterance: params.generateTutorUtterance,
    history: {
      async writeCanonicalHistoryBatch(records) {
        if (params.deps?.writeHistoryBatch) await params.deps.writeHistoryBatch(records);
        else {
          if (params.deps?.writeHistory) throw new Error('Injected SPARC history requires an atomic batch writer');
          await insertCompressedHistoryBatch(records);
        }
        // Publish replay state only after every row has been durably accepted.
        for (const record of records) rememberSparcRuntimeHistoryRecord(record);
        writtenHistoryCount += records.length;
      },
      async writeCanonicalHistory(historyRecord: CanonicalHistoryRecord) {
        if (params.deps?.writeHistory) {
          await params.deps.writeHistory(historyRecord);
        } else {
          await insertCompressedHistory(historyRecord as Record<string, unknown>);
        }
        rememberSparcRuntimeHistoryRecord(historyRecord);
        writtenHistoryCount += 1;
        const transitionId = (historyRecord.sparc as { stateTransition?: { transitionId?: string } })?.stateTransition?.transitionId ?? '';
        if (isSparcCategorizedPolicy(sparcDisplay.instructionalController?.policyId)
          && (transitionId.endsWith(':feedback') || transitionId.includes(':primitive:'))) {
          await params.onNodeValues?.(readSparcResumeSnapshot({ userId, TDFId: tdfId, levelUnit, pageKey: sparcDisplay.pageKey, display: sparcDisplay }).nodeValues);
        }
      },
    },
  });
  clientConsole(2, '[SPARC][Dialogue] committed controller turn', {
    pageKey: sparcDisplay.pageKey,
    tdfId,
    levelUnit,
    triggeredBy: nonBlankString(params.sparcResult?.triggeredBy) || undefined,
    submittedNodeCount: Object.keys(params.sparcResult?.submittedNodes ?? {}).length,
    retainedHistoryCount: priorHistoryRecords.length,
    writtenHistoryCount,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    committed: true,
    sparcNodeValues: { ...readSparcResumeSnapshot({ userId, TDFId: tdfId, levelUnit, pageKey: sparcDisplay.pageKey, display: sparcDisplay }).nodeValues,
      'learner-response-input': '' },
  };
}
