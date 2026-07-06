import { clientConsole } from '../../../../lib/clientLogger';
import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import type {
  SparcControllerDisplay,
  SparcControllerResult,
} from './sparcController';
import {
  resolveSparcControllerDisplay,
} from './sparcController';
import {
  SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
  collectSparcProgressiveNodeOperations,
} from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
import type {
  SparcTrialDisplayControllerDialogueTurnRuntimeParams,
} from '../../../../../../learning-components/units/sparcsession/SparcSessionUnitEngine';
import type {
  SparcTrialDisplayDialogueTurnScorer,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import type {
  SparcUtteranceGenerator,
} from '../../../../../../learning-components/units/sparcsession/sparcControllerDialogueTurn';
import type { UnitEngineLike } from '../../../../../common/types';
import { insertCompressedHistory } from '../../../../lib/historyWire';
import {
  createEmptySparcProductionRuleReplaySession,
  readSparcProductionRuleReplaySession,
  rememberSparcProductionRuleHistoryRecord,
} from './sparcProductionRuleHistoryCache';
import {
  getSparcControllerRuntimeContext,
} from './sparcControllerRuntimeContextCache';
import {
  buildSparcWorkingMemoryFacts,
} from '../../../../../../learning-components/units/sparcsession/sparcWorkingMemoryFacts';
import {
  applySparcStateTransition,
  replaySparcHistory,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import {
  SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY,
} from './sparcAutoTutorProgress';

type SparcControllerDialogueDisplay = SparcControllerDisplay & {
  readonly documentId: string;
  readonly unitType: 'sparc-autotutor-dialogue';
};

type SparcControllerDialogueEngine = UnitEngineLike & {
  readonly commitSparcTrialDisplayControllerDialogueTurn?: (
    params: SparcTrialDisplayControllerDialogueTurnRuntimeParams
  ) => Promise<{
    readonly document?: unknown;
    readonly dialogueTurn?: {
      readonly transition?: Parameters<typeof applySparcStateTransition>[1];
      readonly historyRecord?: CanonicalHistoryRecord;
    };
  }>;
};

type SparcControllerDialogueCommitDeps = {
  readonly getUserId?: () => string | null;
  readonly writeHistory?: (historyRecord: CanonicalHistoryRecord) => Promise<void>;
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

export function isSparcControllerDialogueDisplay(display: unknown): display is SparcControllerDialogueDisplay {
  const sparcDisplay = resolveSparcControllerDisplay(
    isRecord(display) ? display : undefined,
    '[SPARC][Dialogue]',
  );
  return Boolean(
    sparcDisplay
      && sparcDisplay.unitType === 'sparc-autotutor-dialogue'
      && nonBlankString(sparcDisplay.documentId).length > 0
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
  const documentId = nonBlankString(sparcDisplay.documentId);
  if (!documentId) {
    throw new Error('[SPARC][Dialogue] Controller dialogue display requires documentId');
  }
  if (!Array.isArray(sparcDisplay.nodes)) {
    throw new Error('[SPARC][Dialogue] Controller dialogue display requires nodes array');
  }
  return sparcDisplay as unknown as SparcControllerDialogueDisplay;
}

function extractDialogueNodeValues(params: {
  readonly historyRecords: readonly CanonicalHistoryRecord[];
  readonly transition?: Parameters<typeof applySparcStateTransition>[1];
  readonly document?: unknown;
}): Record<string, unknown> {
  const progressiveOperations = collectSparcProgressiveNodeOperations([
    ...params.historyRecords.map((record) => (
      isRecord(record.sparc) && isRecord(record.sparc.stateTransition)
        ? record.sparc.stateTransition
        : {}
    )),
    params.transition ?? {},
  ]);
  const values: Record<string, unknown> = {};
  if (progressiveOperations.length > 0) {
    values[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] = progressiveOperations;
    values['learner-response-input'] = '';
  }
  if (isRecord(params.document)) {
    const replayedState = replaySparcHistory(params.historyRecords);
    const currentState = params.transition
      ? applySparcStateTransition(replayedState, params.transition)
      : replayedState;
    values[SPARC_DIALOGUE_PROGRESS_FACTS_VALUE_KEY] = buildSparcWorkingMemoryFacts({
      document: params.document as Parameters<typeof buildSparcWorkingMemoryFacts>[0]['document'],
      replayState: currentState,
    }).filter((fact) => (
      fact.factType === 'learningTarget.score'
      || fact.factType === 'diagnostic.misconceptionScore'
      || fact.factType === 'session.turnState'
      || fact.factType === 'controller.completionState'
      || fact.factType === 'learningTarget.selected'
      || fact.factType === 'diagnostic.misconceptionSelected'
    ));
  }
  return values;
}

export async function commitSparcControllerDialogueSubmit(params: {
  readonly engine: UnitEngineLike | null | undefined;
  readonly currentDisplay: unknown;
  readonly sparcResult: SparcControllerResult;
  readonly tdfId: unknown;
  readonly sessionId: unknown;
  readonly levelUnit: unknown;
  readonly scoreLearnerResponse: SparcTrialDisplayDialogueTurnScorer;
  readonly generateTutorUtterance: SparcUtteranceGenerator;
  readonly deps?: SparcControllerDialogueCommitDeps;
}): Promise<{
  readonly committed: boolean;
  readonly sparcNodeValues: Record<string, unknown>;
}> {
  const sparcDisplay = requireSparcControllerDialogueDisplay(params.currentDisplay);
  if (!sparcDisplay) {
    return { committed: false, sparcNodeValues: {} };
  }

  const tdfId = nonBlankString(params.tdfId);
  const sessionId = nonBlankString(params.sessionId);
  if (!tdfId || !sessionId) {
    throw new Error('[SPARC][Dialogue] History requires TDFId and sessionID');
  }
  const userId = params.deps?.getUserId ? params.deps.getUserId() : defaultUserId();
  if (!userId) {
    throw new Error('[SPARC][Dialogue] History requires an authenticated user');
  }
  const levelUnit = Number(params.levelUnit);
  if (!Number.isFinite(levelUnit)) {
    throw new Error('[SPARC][Dialogue] History requires finite levelUnit');
  }

  const engine = params.engine as SparcControllerDialogueEngine | null | undefined;
  if (typeof engine?.commitSparcTrialDisplayControllerDialogueTurn !== 'function') {
    throw new Error('[SPARC][Dialogue] Submit requires SPARC session controller-dialogue commit support');
  }
  const sparcReplaySession = readSparcProductionRuleReplaySession({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
  }) ?? createEmptySparcProductionRuleReplaySession({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
  });
  const sparcRuntimeContext = getSparcControllerRuntimeContext({
    TDFId: tdfId,
    sessionID: sessionId,
    documentId: sparcDisplay.documentId,
    display: sparcDisplay,
    replaySession: sparcReplaySession,
  });
  const priorHistoryRecords = sparcReplaySession.retainedHistoryRecords;
  const startedAt = Date.now();
  let writtenHistoryCount = 0;

  const result = await engine.commitSparcTrialDisplayControllerDialogueTurn({
    core: {
      TDFId: tdfId,
      sessionID: sessionId,
      levelUnit,
      userId,
    },
    documentId: sparcDisplay.documentId,
    display: sparcDisplay,
    result: params.sparcResult,
    document: sparcRuntimeContext.document,
    replayState: sparcRuntimeContext.replayState,
    priorHistoryRecords,
    scoreLearnerResponse: params.scoreLearnerResponse,
    generateTutorUtterance: params.generateTutorUtterance,
    history: {
      async writeCanonicalHistory(historyRecord: CanonicalHistoryRecord) {
        if (params.deps?.writeHistory) {
          await params.deps.writeHistory(historyRecord);
        } else {
          await insertCompressedHistory(historyRecord as Record<string, unknown>);
        }
        rememberSparcProductionRuleHistoryRecord(historyRecord);
        writtenHistoryCount += 1;
      },
    },
  });
  clientConsole(2, '[SPARC][Dialogue] committed controller turn', {
    documentId: sparcDisplay.documentId,
    tdfId,
    levelUnit,
    triggeredBy: nonBlankString(params.sparcResult.triggeredBy) || undefined,
    submittedNodeCount: Object.keys(params.sparcResult.submittedNodes ?? {}).length,
    retainedHistoryCount: priorHistoryRecords.length,
    writtenHistoryCount,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    committed: true,
    sparcNodeValues: extractDialogueNodeValues({
      historyRecords: priorHistoryRecords,
      ...(result.dialogueTurn?.transition ? { transition: result.dialogueTurn.transition } : {}),
      document: result.document,
    }),
  };
}
