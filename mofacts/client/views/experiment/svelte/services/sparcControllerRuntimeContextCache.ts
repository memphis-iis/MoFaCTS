import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import {
  createSparcAuthoredDocumentFromTrialDisplay,
} from '../../../../../../learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge';
import {
  replaySparcDocumentHistory,
} from '../../../../../../learning-components/units/sparcsession/sparcDocumentReplay';
import {
  applySparcHistoryRecord,
  type SparcReplayState,
} from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import type {
  SparcAuthoredDocument,
} from '../../../../../../learning-components/units/sparcsession/sparcSessionContracts';
import type { SparcControllerDisplay } from './sparcController';
import type { SparcReplaySession } from './sparcProductionRuleHistoryCache';

type SparcRuntimeContextKeyInput = {
  readonly TDFId: string;
  readonly sessionID: string;
  readonly documentId: string;
};

export type SparcControllerRuntimeContext = {
  readonly document: SparcAuthoredDocument;
  readonly replayState: SparcReplayState;
  readonly appliedRecordCount: number;
};

type CachedSparcControllerRuntimeContext = SparcControllerRuntimeContext & {
  readonly displaySignature: string;
};

const runtimeContextByKey = new Map<string, CachedSparcControllerRuntimeContext>();

function createRuntimeContextKey(input: SparcRuntimeContextKeyInput): string {
  return JSON.stringify({
    TDFId: input.TDFId,
    sessionID: input.sessionID,
    documentId: input.documentId,
  });
}

function createDisplaySignature(display: SparcControllerDisplay): string {
  try {
    const signature = JSON.stringify(display);
    if (!signature) {
      throw new Error('empty signature');
    }
    return signature;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[SPARC] SparcController runtime context requires a serializable display signature: ${message}`);
  }
}

function createDocumentSeededContext(params: {
  readonly documentId: string;
  readonly display: SparcControllerDisplay;
  readonly displaySignature: string;
  readonly records: readonly CanonicalHistoryRecord[];
}): CachedSparcControllerRuntimeContext {
  const document = createSparcAuthoredDocumentFromTrialDisplay({
    documentId: params.documentId,
    display: params.display,
  });
  return {
    displaySignature: params.displaySignature,
    document,
    replayState: replaySparcDocumentHistory(document, params.records),
    appliedRecordCount: params.records.length,
  };
}

export function getSparcControllerRuntimeContext(params: {
  readonly TDFId: string;
  readonly sessionID: string;
  readonly documentId: string;
  readonly display: SparcControllerDisplay;
  readonly replaySession: SparcReplaySession;
}): SparcControllerRuntimeContext {
  const key = createRuntimeContextKey(params);
  const displaySignature = createDisplaySignature(params.display);
  const records = params.replaySession.retainedHistoryRecords;
  const cachedContext = runtimeContextByKey.get(key);

  if (
    !cachedContext ||
    cachedContext.displaySignature !== displaySignature ||
    cachedContext.appliedRecordCount > records.length
  ) {
    const rebuiltContext = createDocumentSeededContext({
      documentId: params.documentId,
      display: params.display,
      displaySignature,
      records,
    });
    runtimeContextByKey.set(key, rebuiltContext);
    return rebuiltContext;
  }

  if (cachedContext.appliedRecordCount === records.length) {
    return cachedContext;
  }

  let replayState = cachedContext.replayState;
  for (const record of records.slice(cachedContext.appliedRecordCount)) {
    replayState = applySparcHistoryRecord(replayState, record);
  }
  const advancedContext = {
    ...cachedContext,
    replayState,
    appliedRecordCount: records.length,
  };
  runtimeContextByKey.set(key, advancedContext);
  return advancedContext;
}

export function clearSparcControllerRuntimeContextCache(input?: SparcRuntimeContextKeyInput): void {
  if (!input) {
    runtimeContextByKey.clear();
    return;
  }
  runtimeContextByKey.delete(createRuntimeContextKey(input));
}
