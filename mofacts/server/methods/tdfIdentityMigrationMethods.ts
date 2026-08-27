import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

const crypto = require('crypto');

type UnknownRecord = Record<string, any>;
type MethodContext = { userId?: string | null };

type MigrationDeps = {
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  UserTimesLog: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
  };
  ScheduledTurkMessages: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<number>;
  };
  AuditLog: { insertAsync: (document: UnknownRecord) => Promise<unknown> };
  userIsInRoleAsync: (userId: string, roles: string[]) => Promise<boolean>;
  serverConsole: (...args: unknown[]) => void;
};

export type FilenameReferenceMigrationOptions = {
  dryRun?: boolean;
  confirmWrite?: string;
  expectedFingerprint?: string;
  afterUserTimesLogId?: string;
  afterTurkMessageId?: string;
  batchSize?: number;
};

function normalizedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashValue(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function logRecordArrays(document: UnknownRecord) {
  return Object.entries(document).filter(([key, value]) => key !== '_id' && key !== 'userId' && Array.isArray(value));
}

export async function migrateFilenameTdfReferences(
  deps: Pick<MigrationDeps, 'Tdfs' | 'UserTimesLog' | 'ScheduledTurkMessages' | 'AuditLog' | 'serverConsole'>,
  options: FilenameReferenceMigrationOptions = {},
) {
  const dryRun = options.dryRun !== false;
  const batchSize = Math.max(1, Math.min(500, Number(options.batchSize) || 100));
  if (!dryRun && options.confirmWrite !== 'backfill-filename-tdf-references') {
    throw new Meteor.Error('migration-confirmation-required', 'Apply requires the exact filename-reference migration confirmation token.');
  }

  const logSelector = options.afterUserTimesLogId ? { _id: { $gt: options.afterUserTimesLogId } } : {};
  const messageSelector = options.afterTurkMessageId ? { _id: { $gt: options.afterTurkMessageId } } : {};
  const [logs, turkMessages] = await Promise.all([
    deps.UserTimesLog.find(logSelector, { sort: { _id: 1 }, limit: batchSize }).fetchAsync(),
    deps.ScheduledTurkMessages.find(messageSelector, { sort: { _id: 1 }, limit: batchSize }).fetchAsync(),
  ]);
  const fileNames = new Set<string>();
  const messageExperimentKeys = new Set<string>();
  for (const log of logs) {
    for (const [, records] of logRecordArrays(log)) {
      for (const record of records as UnknownRecord[]) {
        if (!normalizedString(record?.currentTdfId || record?.TDFId)) {
          const fileName = normalizedString(record?.currentTdfName);
          if (fileName) fileNames.add(fileName);
        }
      }
    }
  }
  for (const message of turkMessages) {
    const experiment = normalizedString(message?.experiment);
    if (experiment) messageExperimentKeys.add(experiment);
  }

  const lookupKeys = new Set([...fileNames, ...messageExperimentKeys]);
  const tdfs = lookupKeys.size > 0
    ? await deps.Tdfs.find({
        $or: [
          { _id: { $in: [...lookupKeys] } },
          { 'content.fileName': { $in: [...lookupKeys] } },
          { tdfFileName: { $in: [...lookupKeys] } },
        ],
      }, { fields: { _id: 1, tdfFileName: 1, 'content.fileName': 1 } }).fetchAsync()
    : [];
  const idsByFileName = new Map<string, string[]>();
  const existingTdfIds = new Set<string>();
  for (const tdf of tdfs) {
    const tdfId = normalizedString(tdf?._id);
    if (tdfId) existingTdfIds.add(tdfId);
    for (const candidate of [tdf?.content?.fileName, tdf?.tdfFileName]) {
      const fileName = normalizedString(candidate);
      if (!fileName) continue;
      const ids = idsByFileName.get(fileName) || [];
      if (tdfId && !ids.includes(tdfId)) ids.push(tdfId);
      idsByFileName.set(fileName, ids);
    }
  }

  const ambiguousFileNames = new Set<string>();
  const missingFileNames = new Set<string>();
  const updates: Array<{ logId: string; guard: UnknownRecord; set: UnknownRecord; changedRecords: number }> = [];
  const messageUpdates: Array<{ messageId: string; previousExperiment: string; tdfId: string }> = [];
  let alreadyCanonical = 0;
  let scannedRecords = 0;
  for (const log of logs) {
    const set: UnknownRecord = {};
    let changedRecords = 0;
    for (const [field, records] of logRecordArrays(log)) {
      let fieldChanged = false;
      const nextRecords = (records as UnknownRecord[]).map((record) => {
        scannedRecords += 1;
        if (normalizedString(record?.currentTdfId || record?.TDFId)) {
          alreadyCanonical += 1;
          return record;
        }
        const fileName = normalizedString(record?.currentTdfName);
        if (!fileName) return record;
        const ids = idsByFileName.get(fileName) || [];
        if (ids.length === 0) {
          missingFileNames.add(fileName);
          return record;
        }
        if (ids.length > 1) {
          ambiguousFileNames.add(fileName);
          return record;
        }
        fieldChanged = true;
        changedRecords += 1;
        return { ...record, currentTdfId: ids[0] };
      });
      if (fieldChanged) set[field] = nextRecords;
    }
    if (changedRecords > 0) {
      const guard = Object.fromEntries(Object.keys(set).map((field) => [field, log[field]]));
      updates.push({ logId: String(log._id), guard, set, changedRecords });
    }
  }
  let canonicalTurkMessages = 0;
  for (const message of turkMessages) {
    const experiment = normalizedString(message?.experiment);
    if (!experiment) continue;
    if (existingTdfIds.has(experiment)) {
      canonicalTurkMessages += 1;
      continue;
    }
    const ids = idsByFileName.get(experiment) || [];
    if (ids.length === 0) {
      missingFileNames.add(experiment);
      continue;
    }
    if (ids.length > 1) {
      ambiguousFileNames.add(experiment);
      continue;
    }
    messageUpdates.push({ messageId: String(message._id), previousExperiment: experiment, tdfId: ids[0]! });
  }

  const fingerprintPayload = {
    scannedDocuments: logs.length,
    scannedRecords,
    changedDocuments: updates.length,
    changedRecords: updates.reduce((sum, update) => sum + update.changedRecords, 0),
    alreadyCanonical,
    scannedTurkMessages: turkMessages.length,
    changedTurkMessages: messageUpdates.length,
    canonicalTurkMessages,
    ambiguousFileNames: [...ambiguousFileNames].sort(),
    missingFileNames: [...missingFileNames].sort(),
    nextAfterUserTimesLogId: logs.length === batchSize ? String(logs[logs.length - 1]?._id || '') : null,
    nextAfterTurkMessageId: turkMessages.length === batchSize ? String(turkMessages[turkMessages.length - 1]?._id || '') : null,
  };
  const fingerprint = hashValue(fingerprintPayload);
  const reportBase = { dryRun, ...fingerprintPayload };
  if (!dryRun) {
    if (ambiguousFileNames.size > 0 || missingFileNames.size > 0) {
      throw new Meteor.Error('tdf-reference-migration-unresolved', 'Filename reference migration has ambiguous or missing mappings.');
    }
    if (!options.expectedFingerprint || options.expectedFingerprint !== fingerprint) {
      throw new Meteor.Error('migration-fingerprint-mismatch', 'Migration inputs changed after the reviewed dry run.');
    }
    for (const update of updates) {
      const written = await deps.UserTimesLog.updateAsync(
        { _id: update.logId, ...update.guard },
        { $set: update.set },
      );
      if (written !== 1) throw new Meteor.Error('migration-write-conflict', 'A user time log changed during migration.');
    }
    for (const update of messageUpdates) {
      const written = await deps.ScheduledTurkMessages.updateAsync(
        { _id: update.messageId, experiment: update.previousExperiment },
        { $set: { experiment: update.tdfId } },
      );
      if (written !== 1) throw new Meteor.Error('migration-write-conflict', 'A scheduled Turk message changed during migration.');
    }
    await deps.AuditLog.insertAsync({
      eventType: 'tdf-filename-reference-migration',
      occurredAt: new Date(),
      counts: {
        scannedDocuments: reportBase.scannedDocuments,
        scannedRecords: reportBase.scannedRecords,
        changedDocuments: reportBase.changedDocuments,
        changedRecords: reportBase.changedRecords,
        scannedTurkMessages: reportBase.scannedTurkMessages,
        changedTurkMessages: reportBase.changedTurkMessages,
      },
    });
  }
  deps.serverConsole('TDF filename reference migration', { ...reportBase, fingerprint });
  return { ...reportBase, fingerprint };
}

export function createTdfIdentityMigrationMethods(deps: MigrationDeps) {
  return {
    migrateFilenameTdfReferences: async function(this: MethodContext, options: FilenameReferenceMigrationOptions = {}) {
      const userId = normalizedString(this.userId);
      if (!userId) throw new Meteor.Error(401, 'Must be logged in');
      if (!(await deps.userIsInRoleAsync(userId, ['admin']))) throw new Meteor.Error(403, 'Admin access required');
      check(options, {
        dryRun: Match.Maybe(Boolean),
        confirmWrite: Match.Maybe(String),
        expectedFingerprint: Match.Maybe(String),
        afterUserTimesLogId: Match.Maybe(String),
        afterTurkMessageId: Match.Maybe(String),
        batchSize: Match.Maybe(Number),
      });
      return await migrateFilenameTdfReferences(deps, options);
    },
  };
}
