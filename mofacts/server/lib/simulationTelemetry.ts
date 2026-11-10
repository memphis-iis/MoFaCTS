import { Mongo, MongoInternals } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { createHash, randomUUID } from 'node:crypto';
import { collectionMongoName } from '../../common/collectionOwnership';
import { validateBatch, type ObservationBatch } from '../../../packages/phet-monitor/protocol';

export type SimulationScope = { tdfId: string; pageKey: string; nodeId: string; buildId: string };
type TelemetryDocument = {
  _id: string; kind: 'attempt' | 'batch'; userId: string; attemptId: string; scope: SimulationScope;
  createdAt: Date; status?: 'active' | 'interrupted' | 'incomplete' | 'ended';
  lastSequence?: number; lastOrder?: number; reason?: string; digest?: string; batch?: ObservationBatch;
};
const Telemetry = new Mongo.Collection<TelemetryDocument>(collectionMongoName('SimulationTelemetry'));
const stopReasons = new Set(['left-node', 'transport-timeout', 'simulation-reloaded', 'invalid-message-serialization',
  'batch-content-conflict', 'host-queue-overflow', 'processing-failed', 'child-monitoring-error',
  'duplicate-readiness', 'incomplete-readiness', 'incomplete-durable-evidence']);
export function validateSimulationScope(input: unknown): SimulationScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Meteor.Error(400, 'Invalid simulation scope');
  const value = input as Record<string, unknown>;
  for (const key of ['tdfId', 'pageKey', 'nodeId', 'buildId']) {
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 200) throw new Meteor.Error(400, 'Invalid simulation scope');
  }
  return { tdfId: value.tdfId as string, pageKey: value.pageKey as string, nodeId: value.nodeId as string, buildId: value.buildId as string };
}
export async function ensureSimulationTelemetryIndexes() {
  const raw = Telemetry.rawCollection();
  await raw.createIndex({ userId: 1, kind: 1, 'scope.tdfId': 1, 'scope.pageKey': 1, 'scope.nodeId': 1, status: 1 });
  await raw.createIndex({ attemptId: 1, kind: 1, 'batch.firstSequence': 1 });
}
/** Called only by the existing authorized account-deletion lifecycle. */
export async function removeSimulationResearchUserRecords(userId: string): Promise<void> {
  if (typeof userId !== 'string' || !userId.trim()) throw new Meteor.Error(400, 'Invalid simulation research owner');
  await Telemetry.rawCollection().deleteMany({ userId });
}
export async function interruptSimulationScope(userId: string, scope: SimulationScope) {
  await Telemetry.rawCollection().updateMany({ kind: 'attempt', userId, 'scope.tdfId': scope.tdfId,
    'scope.pageKey': scope.pageKey, 'scope.nodeId': scope.nodeId, status: 'active' },
  { $set: { status: 'interrupted', reason: 'explicit-restart-required' } });
}
export async function startSimulationAttempt(userId: string, scope: SimulationScope) {
  await interruptSimulationScope(userId, scope);
  const attemptId = randomUUID();
  await Telemetry.insertAsync({ _id: attemptId, kind: 'attempt', userId, attemptId, scope, createdAt: new Date(), status: 'active', lastSequence: 0, lastOrder: 0 });
  return { attemptId };
}
export async function endSimulationAttempt(userId: string, attemptId: string, reason: string) {
  if (typeof attemptId !== 'string' || attemptId.length > 100) throw new Meteor.Error(400, 'Invalid simulation attempt');
  if (!stopReasons.has(reason)) throw new Meteor.Error(400, 'Invalid simulation stop reason');
  await Telemetry.rawCollection().updateOne({ _id: attemptId, kind: 'attempt', userId, status: 'active' },
    { $set: { status: reason === 'left-node' ? 'interrupted' : 'incomplete', reason } });
}
export async function ingestSimulationBatch(userId: string, attemptId: string, input: unknown) {
  if (typeof attemptId !== 'string' || attemptId.length > 100) throw new Meteor.Error(400, 'Invalid simulation attempt');
  const raw = Telemetry.rawCollection();
  const owned = await raw.findOne({ _id: attemptId, kind: 'attempt', userId });
  if (!owned) throw new Meteor.Error(403, 'Simulation attempt unavailable');
  let batch: ObservationBatch;
  try { batch = validateBatch(input); }
  catch (error) {
    await raw.updateOne({ _id: attemptId, userId }, { $set: { status: 'incomplete', reason: 'invalid-batch' } });
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
      if (existing?.digest === digest) return;
      let order = attempt.lastOrder ?? 0;
      if (existing || batch.firstSequence !== (attempt.lastSequence ?? 0) + 1 || !complete) rejection = 'sequence-conflict-or-inactive-attempt';
      for (const record of batch.records) {
        if (record.order <= order) rejection = 'observation-order-regression';
        order = record.order;
      }
      if (rejection) {
        await raw.updateOne({ _id: attemptId, userId }, { $set: { status: 'incomplete', reason: rejection } }, { session });
        return;
      }
      complete = !batch.records.some(record => record.type === 'monitoring-error' || (record.type === 'checkpoint' && record.data.evidenceComplete !== true));
      await raw.insertOne({ _id: key, kind: 'batch', userId, attemptId, scope: attempt.scope, createdAt: new Date(), digest, batch }, { session });
      await raw.updateOne({ _id: attemptId, userId }, { $set: { lastSequence: batch.lastSequence, lastOrder: order,
        status: complete ? 'active' : 'incomplete', ...(complete ? {} : { reason: 'collector-incomplete' }) } }, { session });
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
