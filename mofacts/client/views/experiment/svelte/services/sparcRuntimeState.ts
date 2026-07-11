import type { CanonicalHistoryRecord } from '../../../../../../learning-components/runtime/historyEnvelope';
import {
  SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY,
  collectSparcProgressiveNodeOperations,
} from '../../../../../../learning-components/trial-displays/sparc/sparcProgressiveNodes';
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

type SparcDurableScopeInput = {
  readonly userId: unknown;
  readonly TDFId?: unknown;
  readonly tdfId?: unknown;
  readonly levelUnit: unknown;
  readonly pageKey: unknown;
};

type SparcDurableScope = {
  readonly userId: string;
  readonly TDFId: string;
  readonly levelUnit: number;
  readonly pageKey: string;
};

export type SparcResumeSnapshot = SparcDurableScope & {
  readonly document: SparcAuthoredDocument;
  readonly replayState: SparcReplayState;
  readonly retainedHistoryRecords: readonly CanonicalHistoryRecord[];
  readonly nodeValues: Readonly<Record<string, unknown>>;
  readonly progressiveNodeOperations: readonly Record<string, unknown>[];
};

export type SparcRuntimeHydrationSummary = SparcDurableScope & {
  readonly retainedHistoryCount: number;
};

type SparcRuntimeStateEntry = SparcDurableScope & {
  retainedHistoryRecords: CanonicalHistoryRecord[];
  displaySignature?: string;
  snapshot?: SparcResumeSnapshot;
};

const runtimeStateByScope = new Map<string, SparcRuntimeStateEntry>();
const hydratedUnitScopes = new Set<string>();
const unitHydrationPromises = new Map<string, Promise<readonly SparcRuntimeHydrationSummary[]>>();

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeScope(input: SparcDurableScopeInput): SparcDurableScope {
  const userId = nonBlankString(input.userId);
  const TDFId = nonBlankString(input.TDFId) ?? nonBlankString(input.tdfId);
  const levelUnit = Number(input.levelUnit);
  const pageKey = nonBlankString(input.pageKey);
  if (!userId || !TDFId || !Number.isInteger(levelUnit) || levelUnit < 0 || !pageKey) {
    throw new Error('[SPARC] Runtime state requires userId, TDFId, non-negative levelUnit, and pageKey');
  }
  return { userId, TDFId, levelUnit, pageKey };
}

function createScopeKey(input: SparcDurableScopeInput): string {
  return JSON.stringify(normalizeScope(input));
}

function normalizeUnitScope(input: Omit<SparcDurableScopeInput, 'pageKey'>) {
  const userId = nonBlankString(input.userId);
  const TDFId = nonBlankString(input.TDFId) ?? nonBlankString(input.tdfId);
  const levelUnit = Number(input.levelUnit);
  if (!userId || !TDFId || !Number.isInteger(levelUnit) || levelUnit < 0) {
    throw new Error('[SPARC] Runtime history hydration requires userId, TDFId, and non-negative levelUnit');
  }
  return { userId, TDFId, levelUnit };
}

function createUnitScopeKey(input: Omit<SparcDurableScopeInput, 'pageKey'>): string {
  return JSON.stringify(normalizeUnitScope(input));
}

function readHistoryScope(record: CanonicalHistoryRecord): SparcDurableScope {
  if (record.eventType !== 'sparc') {
    throw new Error('[SPARC] Runtime hydration received a non-SPARC history record');
  }
  const sparc = record.sparc;
  if (!sparc || typeof sparc !== 'object' || Array.isArray(sparc)) {
    throw new Error('[SPARC] Runtime history record missing sparc extension');
  }
  return normalizeScope({
    userId: record.userId,
    TDFId: record.TDFId,
    levelUnit: record.levelUnit,
    pageKey: (sparc as Record<string, unknown>).pageKey,
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
    throw new Error(`[SPARC] Runtime state requires a serializable display: ${message}`);
  }
}

export function projectSparcReplayStateToNodeValues(
  replayState: SparcReplayState,
): Record<string, unknown> {
  const nodeValues: Record<string, unknown> = {};
  for (const cell of Object.values(replayState.cells)) {
    const nodeId = nonBlankString(cell.address?.nodeId);
    const key = nonBlankString(cell.key);
    if (!nodeId || !key) {
      continue;
    }
    if (key === 'value' || key === 'message' || key === 'text') {
      nodeValues[nodeId] = cell.value;
    } else if (key === 'correctness' || key === 'visible') {
      nodeValues[`${nodeId}::${key}`] = cell.value;
    }
  }
  const progressiveNodeOperations = collectSparcProgressiveNodeOperations(
    replayState.transitions,
  ) as readonly Record<string, unknown>[];
  if (progressiveNodeOperations.length > 0) {
    nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] = progressiveNodeOperations;
  }
  return nodeValues;
}

function buildSnapshot(
  entry: SparcRuntimeStateEntry,
  display: SparcControllerDisplay,
  displaySignature: string,
): SparcResumeSnapshot {
  const document = createSparcAuthoredDocumentFromTrialDisplay({
    pageKey: entry.pageKey,
    display,
  });
  const replayState = replaySparcDocumentHistory(document, entry.retainedHistoryRecords);
  const nodeValues = projectSparcReplayStateToNodeValues(replayState);
  const progressiveNodeOperations = (
    nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] as readonly Record<string, unknown>[] | undefined
  ) ?? [];
  const snapshot: SparcResumeSnapshot = {
    userId: entry.userId,
    TDFId: entry.TDFId,
    levelUnit: entry.levelUnit,
    pageKey: entry.pageKey,
    document,
    replayState,
    retainedHistoryRecords: [...entry.retainedHistoryRecords],
    nodeValues,
    progressiveNodeOperations,
  };
  entry.displaySignature = displaySignature;
  entry.snapshot = snapshot;
  return snapshot;
}

export function readSparcResumeSnapshot(params: SparcDurableScopeInput & {
  readonly display: SparcControllerDisplay;
}): SparcResumeSnapshot {
  const scope = normalizeScope(params);
  const key = createScopeKey(scope);
  const displaySignature = createDisplaySignature(params.display);
  let entry = runtimeStateByScope.get(key);
  if (!entry) {
    entry = { ...scope, retainedHistoryRecords: [] };
    runtimeStateByScope.set(key, entry);
  }
  if (!entry.snapshot || entry.displaySignature !== displaySignature) {
    return buildSnapshot(entry, params.display, displaySignature);
  }
  return entry.snapshot;
}

export function hydrateSparcRuntimeHistory(
  records: readonly CanonicalHistoryRecord[],
): readonly SparcRuntimeHydrationSummary[] {
  const grouped = new Map<string, { scope: SparcDurableScope; records: CanonicalHistoryRecord[] }>();
  for (const record of records) {
    const scope = readHistoryScope(record);
    const key = createScopeKey(scope);
    const group = grouped.get(key) ?? { scope, records: [] };
    group.records.push(record);
    grouped.set(key, group);
  }
  for (const [key, group] of grouped) {
    runtimeStateByScope.set(key, {
      ...group.scope,
      retainedHistoryRecords: [...group.records],
    });
  }
  return [...grouped.values()].map(({ scope, records: groupedHistory }) => ({
    ...scope,
    retainedHistoryCount: groupedHistory.length,
  }));
}

export async function ensureSparcRuntimeHistoryHydrated(
  input: Omit<SparcDurableScopeInput, 'pageKey'>,
  load: () => Promise<readonly CanonicalHistoryRecord[]>,
): Promise<readonly SparcRuntimeHydrationSummary[]> {
  const expectedScope = normalizeUnitScope(input);
  const unitKey = createUnitScopeKey(expectedScope);
  if (hydratedUnitScopes.has(unitKey)) {
    return [];
  }
  const pending = unitHydrationPromises.get(unitKey);
  if (pending) {
    return pending;
  }
  const hydration = (async () => {
    const records = await load();
    for (const record of records) {
      const recordScope = readHistoryScope(record);
      if (recordScope.userId !== expectedScope.userId
        || recordScope.TDFId !== expectedScope.TDFId
        || recordScope.levelUnit !== expectedScope.levelUnit) {
        throw new Error('[SPARC] Runtime history loader returned a record outside the requested unit scope');
      }
    }
    const summaries = hydrateSparcRuntimeHistory(records);
    hydratedUnitScopes.add(unitKey);
    return summaries;
  })();
  unitHydrationPromises.set(unitKey, hydration);
  try {
    return await hydration;
  } finally {
    unitHydrationPromises.delete(unitKey);
  }
}

export function rememberSparcRuntimeHistoryRecord(record: CanonicalHistoryRecord): void {
  const scope = readHistoryScope(record);
  const key = createScopeKey(scope);
  const entry = runtimeStateByScope.get(key) ?? {
    ...scope,
    retainedHistoryRecords: [],
  };
  entry.retainedHistoryRecords = [...entry.retainedHistoryRecords, record];
  if (entry.snapshot) {
    const replayState = applySparcHistoryRecord(entry.snapshot.replayState, record);
    const nodeValues = projectSparcReplayStateToNodeValues(replayState);
    entry.snapshot = {
      ...entry.snapshot,
      replayState,
      retainedHistoryRecords: [...entry.retainedHistoryRecords],
      nodeValues,
      progressiveNodeOperations: (
        nodeValues[SPARC_PROGRESSIVE_NODE_OPERATIONS_VALUE_KEY] as readonly Record<string, unknown>[] | undefined
      ) ?? [],
    };
  }
  runtimeStateByScope.set(key, entry);
}

export function clearSparcRuntimeState(input?: SparcDurableScopeInput): void {
  if (!input) {
    runtimeStateByScope.clear();
    hydratedUnitScopes.clear();
    unitHydrationPromises.clear();
    return;
  }
  runtimeStateByScope.delete(createScopeKey(input));
}
