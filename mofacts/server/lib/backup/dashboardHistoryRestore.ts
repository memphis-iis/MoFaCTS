import { collectionMongoName } from '../../../common/collectionOwnership';

type Document = Record<string, unknown>;
type RestoredHistorySource = Document & { _id: string; sequence: number; repairRevision: number };

const DERIVED_DASHBOARD_FIELDS = [
  'tdfStats', 'summary', 'usageSummary', 'lastUpdated', 'version',
  'lastHistorySequence', 'historyRepairRevision', 'historyTdfTargets',
] as const;

function requireDocument(value: unknown): Document {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid dashboard history restore document');
  }
  return value as Document;
}

function isCanonicalUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function requireCounter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid dashboard history restore checkpoint');
  }
  return value;
}

/**
 * Database dumps are collected across collections, so their disposable cache
 * and source checkpoints need not describe the same history snapshot. Restore
 * keeps history unchanged, advances source repair revisions, and discards only
 * derived dashboard data before any destructive database writes begin.
 */
export function prepareDashboardHistoryRestore(
  collections: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const historyName = collectionMongoName('Histories');
  const stateName = collectionMongoName('HistoryCommitState');
  const cacheName = collectionMongoName('UserDashboardCache');
  const restoredSources = new Map<string, RestoredHistorySource>();

  function sourceFor(userId: string): RestoredHistorySource {
    let source = restoredSources.get(userId);
    if (!source) {
      source = { _id: userId, sequence: 0, repairRevision: 0 };
      restoredSources.set(userId, source);
    }
    return source;
  }

  for (const value of collections[stateName] || []) {
    const document = requireDocument(value);
    if (!isCanonicalUserId(document._id) || restoredSources.has(document._id)) {
      throw new Error('Invalid dashboard history restore source identity');
    }
    restoredSources.set(document._id, {
      ...document,
      _id: document._id,
      sequence: requireCounter(document.sequence),
      repairRevision: requireCounter(document.repairRevision),
    });
  }

  const sequencesByUser = new Map<string, Set<number>>();
  for (const value of collections[historyName] || []) {
    const document = requireDocument(value);
    if (document.historySequence === undefined) {
      // Histories predating committed sequences belong to snapshot rebuilds.
      if (isCanonicalUserId(document.userId)) sourceFor(document.userId);
      continue;
    }
    if (!isCanonicalUserId(document.userId)) {
      throw new Error('Invalid sequenced history restore identity');
    }
    const sequence = requireCounter(document.historySequence);
    if (sequence === 0) throw new Error('Invalid committed history restore sequence');
    let sequences = sequencesByUser.get(document.userId);
    if (!sequences) {
      sequences = new Set<number>();
      sequencesByUser.set(document.userId, sequences);
    }
    if (sequences.has(sequence)) throw new Error('Duplicate committed history restore sequence');
    sequences.add(sequence);
    const source = sourceFor(document.userId);
    source.sequence = Math.max(source.sequence, sequence);
  }

  const restoredCollections = { ...collections };
  const cachedDocuments = collections[cacheName];
  if (cachedDocuments) {
    restoredCollections[cacheName] = cachedDocuments.map(value => {
      const document = requireDocument(value);
      if (!isCanonicalUserId(document.userId)) {
        throw new Error('Invalid dashboard cache restore identity');
      }
      sourceFor(document.userId);
      const restoredCache = { ...document };
      for (const field of DERIVED_DASHBOARD_FIELDS) delete restoredCache[field];
      return restoredCache;
    });
  }

  if (restoredSources.size > 0 || collections[stateName]) {
    restoredCollections[stateName] = [...restoredSources.values()].map(source => {
      const restoredSource: RestoredHistorySource = {
        ...source,
        repairRevision: requireCounter(source.repairRevision + 1),
      };
      // Collections may have been dumped at different points during acceptance.
      // Reconcile actual restored decisions and history before certifying content eligibility.
      delete restoredSource.contentUseInitialization;
      return restoredSource;
    });
  }
  return restoredCollections;
}
