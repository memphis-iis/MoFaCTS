// Dry run by default. An authorized --apply replaces ONLY the derived crowd-stat collection.
// Requires a clean assessment-history audit, a backup and a quiescent database. See docs/history.md.
require('./registerHistoryTypescript.cjs');
const { MongoClient } = require('mongodb');
const { collectionMongoName } = require('../common/collectionOwnership.ts');
const { modelPracticeHistorySelector, assertModelPracticeHistoryIdentity, createStimulusKey } = require('../common/historyEnvelope.ts');
const { shouldRecordStimulusCrowdOutcome } = require('../server/lib/stimulusCrowdStats.ts');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply') || args.length > 1) throw new Error('Unknown rebuild argument');
  const apply = args.includes('--apply');
  const maxRecords = Number(process.env.HISTORY_REBUILD_MAX_RECORDS);
  if (!process.env.MONGO_URL || !Number.isSafeInteger(maxRecords) || maxRecords < 1) {
    throw new Error('MONGO_URL and HISTORY_REBUILD_MAX_RECORDS are required');
  }
  const client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const histories = client.db().collection(collectionMongoName('Histories'));
    const stats = client.db().collection(collectionMongoName('StimulusCrowdStats'));
    const cursor = histories.find({ ...modelPracticeHistorySelector(),
      eventType: { $in: [null, ''] }, outcome: { $in: ['correct', 'incorrect'] },
    }, { projection: { _id: 0, levelUnitType: 1, modelEvidenceSource: 1, eventType: 1,
      stimuliSetId: 1, stimulusKC: 1, clusterKC: 1, KCId: 1, KCDefault: 1, KCCluster: 1,
      outcome: 1, conditionTypeD: 1, source: 1, action: 1, recordedServerTime: 1,
    } }).batchSize(500).limit(maxRecords + 1).maxTimeMS(300000);
    const byKey = new Map();
    let scanned = 0;
    let invalid = 0;
    let countable = 0;
    for await (const row of cursor) {
      if (++scanned > maxRecords) throw new Error('Rebuild scan limit exceeded');
      if (!shouldRecordStimulusCrowdOutcome(row)) continue;
      try {
        assertModelPracticeHistoryIdentity(row);
        if (!Number.isFinite(Number(row.recordedServerTime))) throw new Error('Invalid timestamp');
      } catch { invalid++; continue; }
      countable++;
      const stimulusKey = createStimulusKey(row);
      const aggregate = byKey.get(stimulusKey) || {
        stimulusKey, stimuliSetId: row.stimuliSetId, stimulusKC: row.stimulusKC,
        KCId: row.KCId, clusterKC: row.clusterKC,
        correctCount: 0, incorrectCount: 0, totalCount: 0, lastOutcomeAt: 0,
      };
      aggregate[row.outcome === 'correct' ? 'correctCount' : 'incorrectCount']++;
      aggregate.totalCount++;
      aggregate.lastOutcomeAt = Math.max(aggregate.lastOutcomeAt, Number(row.recordedServerTime));
      byKey.set(stimulusKey, aggregate);
    }
    console.log(JSON.stringify({ apply, scanned, countable, invalid, aggregateRows: byKey.size }));
    if (invalid > 0) throw new Error('Invalid histories block rebuild');
    if (!apply) return;
    await stats.deleteMany({});
    let operations = [];
    const updatedAt = new Date();
    for (const row of byKey.values()) {
      operations.push({ insertOne: { document: { ...row, updatedAt } } });
      if (operations.length === 500) { await stats.bulkWrite(operations, { ordered: true }); operations = []; }
    }
    if (operations.length) await stats.bulkWrite(operations, { ordered: true });
    await stats.createIndex({ stimulusKey: 1 }, { unique: true });
    await stats.createIndex({ stimuliSetId: 1, KCId: 1 });
    await stats.createIndex({ stimuliSetId: 1 });
    console.log(JSON.stringify({ applied: true, replacedRows: byKey.size }));
  } finally { await client.close(); }
}

main().catch(() => {
  console.error('Crowd-stat rebuild failed. Keep the database quiescent; after an apply failure rerun from unchanged history or restore the derived collection backup.');
  process.exitCode = 1;
});
