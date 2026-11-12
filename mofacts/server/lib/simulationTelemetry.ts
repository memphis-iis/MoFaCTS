import { Mongo, MongoInternals } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { createHash, randomUUID } from 'node:crypto';
import { collectionMongoName } from '../../common/collectionOwnership';
import { validateBatch, type ObservationBatch } from '../../../packages/phet-monitor/protocol';
import { simulationLifecycleHistory, type SimulationHistoryScope } from '../../../learning-components/runtime/simulationLifecycleHistory';
import { assertSimulationActivityHistory } from '../../common/simulationActivityHistory';

export type SimulationScope = SimulationHistoryScope;
export type SimulationHistoryWriter = (userId: string, record: Record<string, unknown>) => Promise<unknown>;
type TelemetryDocument = {
  _id: string; kind: 'attempt' | 'batch'; userId: string; attemptId: string; scope: SimulationScope;
  createdAt: Date; status?: 'active' | 'interrupted' | 'incomplete' | 'ended';
  lastSequence?: number; lastOrder?: number; reason?: string; digest?: string; batch?: ObservationBatch;
  endedAt?: Date; lifecycleHistoryPending?: boolean; initialValues?: Record<string, unknown>;
  startHistoryWritten?: boolean; legacyHistoryUnavailable?: boolean;
};
const Telemetry = new Mongo.Collection<TelemetryDocument>(collectionMongoName('SimulationTelemetry'));
const stopReasons = new Set(['left-node', 'transport-timeout', 'simulation-reloaded', 'invalid-message-serialization',
  'batch-content-conflict', 'host-queue-overflow', 'processing-failed', 'child-monitoring-error',
  'duplicate-readiness', 'incomplete-readiness', 'incomplete-durable-evidence', 'completed']);
export function validateSimulationScope(input: unknown): SimulationScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Meteor.Error(400, 'Invalid simulation scope');
  const value = input as Record<string, unknown>;
  for (const key of ['tdfId', 'pageKey', 'nodeId', 'buildId']) {
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 200) throw new Meteor.Error(400, 'Invalid simulation scope');
  }
  const history = value.history as Record<string, unknown> | undefined;
  if (!history || typeof history.sessionID !== 'string' || !history.sessionID || history.sessionID.length > 200
    || !Number.isSafeInteger(history.levelUnit) || Number(history.levelUnit) < 0
    || history.levelUnitName !== undefined && (typeof history.levelUnitName !== 'string' || history.levelUnitName.length > 200)) throw new Meteor.Error(400, 'Simulation requires canonical history context');
  return { tdfId: value.tdfId as string, pageKey: value.pageKey as string, nodeId: value.nodeId as string, buildId: value.buildId as string,
    history: { sessionID: history.sessionID, levelUnit: history.levelUnit as number, ...(typeof history.levelUnitName === 'string' ? { levelUnitName: history.levelUnitName } : {}) } };
}
export async function ensureSimulationTelemetryIndexes() {
  const raw = Telemetry.rawCollection();
  await raw.createIndex({ userId: 1, kind: 1, 'scope.tdfId': 1, 'scope.pageKey': 1, 'scope.nodeId': 1, status: 1 });
  await raw.createIndex({ attemptId: 1, kind: 1, 'batch.firstSequence': 1 });
  await raw.createIndex({ userId: 1, kind: 1, 'scope.tdfId': 1, 'scope.pageKey': 1, 'scope.nodeId': 1, lifecycleHistoryPending: 1 });
}
/** Called only by the existing authorized account-deletion lifecycle. */
export async function removeSimulationResearchUserRecords(userId: string): Promise<void> {
  if (typeof userId !== 'string' || !userId.trim()) throw new Meteor.Error(400, 'Invalid simulation research owner');
  await Telemetry.rawCollection().deleteMany({ userId });
}
async function flushLifecycle(attempt: TelemetryDocument, write: SimulationHistoryWriter) {
  // Historical attempts predate canonical context. Preserve their research records; never invent a learning-session identity.
  if (!attempt.scope.history) {
    await Telemetry.rawCollection().updateOne({ _id: attempt._id, userId: attempt.userId }, { $set: { lifecycleHistoryPending: false, legacyHistoryUnavailable: true } });
    return;
  }
  if (!attempt.startHistoryWritten) {
    await write(attempt.userId, simulationLifecycleHistory(attempt.userId, attempt.scope, attempt.attemptId, 'Start', attempt.createdAt.getTime(), attempt.createdAt.getTime()));
    await Telemetry.rawCollection().updateOne({ _id: attempt._id, userId: attempt.userId }, { $set: { startHistoryWritten: true } });
  }
  if (attempt.endedAt && attempt.status !== 'ended') await write(attempt.userId, simulationLifecycleHistory(attempt.userId, attempt.scope, attempt.attemptId,
    attempt.status === 'interrupted' ? 'Interrupted' : 'Monitoring failed', attempt.createdAt.getTime(), attempt.endedAt.getTime(), attempt.reason));
  await Telemetry.rawCollection().updateOne({ _id: attempt._id, userId: attempt.userId }, { $set: { lifecycleHistoryPending: false } });
}
export async function interruptSimulationScope(userId: string, scope: SimulationScope, write: SimulationHistoryWriter) {
  const raw = Telemetry.rawCollection();
  const base = { kind: 'attempt' as const, userId, 'scope.tdfId': scope.tdfId, 'scope.pageKey': scope.pageKey, 'scope.nodeId': scope.nodeId };
  const active = await raw.find({ ...base, status: 'active' }).limit(101).toArray();
  const pending = await raw.find({ ...base, lifecycleHistoryPending: true }).limit(101).toArray();
  if (active.length > 100 || pending.length > 100) throw new Meteor.Error(409, 'Simulation lifecycle repair required');
  for (const attempt of new Map([...active, ...pending].map(row => [row._id, row])).values()) {
    if (attempt.status === 'active') {
      await raw.updateOne({ _id: attempt._id, userId, status: 'active' }, { $set: { status: 'interrupted', reason: 'explicit-restart-required', endedAt: new Date(), lifecycleHistoryPending: true } });
    }
    await flushLifecycle((await raw.findOne({ _id: attempt._id, userId }))!, write);
  }
}
export async function startSimulationAttempt(userId: string, scope: SimulationScope, write: SimulationHistoryWriter) {
  await interruptSimulationScope(userId, scope, write);
  const attemptId = randomUUID();
  const attempt: TelemetryDocument = { _id: attemptId, kind: 'attempt', userId, attemptId, scope, createdAt: new Date(), status: 'active', lastSequence: 0, lastOrder: 0, lifecycleHistoryPending: true };
  await Telemetry.insertAsync(attempt);
  await flushLifecycle(attempt, write);
  return { attemptId };
}
export async function endSimulationAttempt(userId: string, attemptId: string, reason: string, write: SimulationHistoryWriter) {
  if (typeof attemptId !== 'string' || attemptId.length > 100) throw new Meteor.Error(400, 'Invalid simulation attempt');
  if (!stopReasons.has(reason)) throw new Meteor.Error(400, 'Invalid simulation stop reason');
  const owned = await Telemetry.rawCollection().findOne({ _id: attemptId, kind: 'attempt', userId });
  if (!owned) throw new Meteor.Error(403, 'Simulation attempt unavailable');
  await Telemetry.rawCollection().updateOne({ _id: attemptId, kind: 'attempt', userId, endedAt: { $exists: false } },
    { $set: { status: owned.status === 'incomplete' ? 'incomplete' : reason === 'completed' ? 'ended' : reason === 'left-node' ? 'interrupted' : 'incomplete',
      reason: owned.status === 'incomplete' ? owned.reason ?? reason : reason, endedAt: new Date(), lifecycleHistoryPending: true } });
  const attempt = await Telemetry.rawCollection().findOne({ _id: attemptId, kind: 'attempt', userId });
  if (attempt?.lifecycleHistoryPending) await flushLifecycle(attempt, write);
}
export async function ingestSimulationBatch(userId: string, attemptId: string, input: unknown, initialValues?: Record<string, unknown>) {
  if (typeof attemptId !== 'string' || attemptId.length > 100) throw new Meteor.Error(400, 'Invalid simulation attempt');
  const raw = Telemetry.rawCollection();
  const owned = await raw.findOne({ _id: attemptId, kind: 'attempt', userId });
  if (!owned) throw new Meteor.Error(403, 'Simulation attempt unavailable');
  if (initialValues !== undefined) assertSimulationActivityHistory({ version: 1, recordRole: 'internal', origin: 'observation',
    buildId: owned.scope.buildId, attemptId, sourceEventId: `${attemptId}:initial`, eventName: 'initial', values: initialValues });
  let batch: ObservationBatch;
  try { batch = validateBatch(input); }
  catch (error) {
    await raw.updateOne({ _id: attemptId, userId }, { $set: { status: 'incomplete', reason: 'invalid-batch', endedAt: new Date(), lifecycleHistoryPending: true } });
    throw new Meteor.Error(400, error instanceof Error ? error.message : 'Invalid observation batch');
  }
  const digest = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
  const session = MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession();
  let rejection = '';
  let complete = false;
  try {
    await session.withTransaction(async () => {
      rejection = '';
      const attempt = await raw.findOne({ _id: attemptId, kind: 'attempt', userId }, { session });
      if (!attempt) throw new Meteor.Error(403, 'Simulation attempt unavailable');
      const key = `${attemptId}:${batch.firstSequence}`;
      const existing = await raw.findOne({ _id: key, userId }, { session });
      complete = attempt.status === 'active';
      const initialConflict = initialValues !== undefined && attempt.initialValues !== undefined && JSON.stringify(initialValues) !== JSON.stringify(attempt.initialValues);
      if (existing?.digest === digest && !initialConflict) {
        if (initialValues !== undefined && attempt.initialValues === undefined && complete) await raw.updateOne({ _id: attemptId, userId }, { $set: { initialValues } }, { session });
        return;
      }
      let order = attempt.lastOrder ?? 0;
      if (existing || batch.firstSequence !== (attempt.lastSequence ?? 0) + 1 || !complete) rejection = 'sequence-conflict-or-inactive-attempt';
      for (const record of batch.records) {
        if (record.order <= order) rejection = 'observation-order-regression';
        order = record.order;
      }
      if (initialConflict) rejection = 'initial-state-conflict';
      if (rejection) {
        await raw.updateOne({ _id: attemptId, userId }, { $set: { status: 'incomplete', reason: rejection, endedAt: attempt.endedAt ?? new Date(), lifecycleHistoryPending: true } }, { session });
        return;
      }
      complete = !batch.records.some(record => record.type === 'monitoring-error' || (record.type === 'checkpoint' && record.data.evidenceComplete !== true));
      await raw.insertOne({ _id: key, kind: 'batch', userId, attemptId, scope: attempt.scope, createdAt: new Date(), digest, batch }, { session });
      await raw.updateOne({ _id: attemptId, userId }, { $set: { lastSequence: batch.lastSequence, lastOrder: order,
        ...(initialValues !== undefined && attempt.initialValues === undefined ? { initialValues } : {}),
        status: complete ? 'active' : 'incomplete', ...(complete ? {} : { reason: 'collector-incomplete', endedAt: new Date(), lifecycleHistoryPending: true }) } }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
  if (rejection) throw new Meteor.Error(409, 'Simulation evidence is incomplete; start a fresh attempt');
  return { sequence: batch.lastSequence, complete };
}
export async function exportSimulationTrace(attemptId: string, afterSequence: number) {
  if (typeof attemptId !== 'string' || attemptId.length > 100 || !Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Meteor.Error(400, 'Invalid research export cursor');
  // One bounded, indexed attempt export. No broad reactive publication.
  const raw = Telemetry.rawCollection();
  const attempt = await raw.findOne({ _id: attemptId, kind: 'attempt' });
  if (!attempt) throw new Meteor.Error(404, 'Simulation attempt unavailable');
  const batches = await raw.find({ attemptId, kind: 'batch', 'batch.firstSequence': { $gt: afterSequence } })
    .sort({ 'batch.firstSequence': 1 }).limit(4).toArray();
  return { attempt, batches, nextSequence: batches.at(-1)?.batch?.firstSequence ?? afterSequence };
}
