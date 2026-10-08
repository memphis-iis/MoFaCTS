// Read-only, aggregate-only output. Run in a quiescent authorized database before rollout.
require('./registerHistoryTypescript.cjs');
const { MongoClient } = require('mongodb');
const { auditAssessmentHistoryCopies } = require('../server/lib/assessmentHistoryAudit.ts');
const { collectionMongoName } = require('../common/collectionOwnership.ts');
const { isAssessmentHistoryCopy } = require('../../learning-components/runtime/historyStimulusIdentity.ts');

async function main() {
  const maxRecords = Number(process.env.HISTORY_AUDIT_MAX_RECORDS);
  if (!process.env.MONGO_URL || !Number.isSafeInteger(maxRecords) || maxRecords < 1) {
    throw new Error('MONGO_URL and a positive HISTORY_AUDIT_MAX_RECORDS are required');
  }
  const client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const histories = client.db().collection(collectionMongoName('Histories'));
    const latest = await histories.find({}, { projection: { _id: 1 } })
      .sort({ _id: -1 }).hint('_id_').limit(1).maxTimeMS(30000).toArray();
    const upperId = latest[0]?._id;
    const report = await auditAssessmentHistoryCopies({
      readPage: async (afterId, limit) => {
        if (upperId === undefined) return [];
        const page = await histories.find({
          _id: { $lte: upperId, ...(afterId === undefined ? {} : { $gt: afterId }) },
        }, { projection: { _id: 1, levelUnitType: 1, modelEvidenceSource: 1 } })
          .sort({ _id: 1 }).hint('_id_').limit(limit).maxTimeMS(30000).toArray();
        const copyIds = page.filter(isAssessmentHistoryCopy).map((row) => row._id);
        if (copyIds.length === 0) return page;
        const copies = await histories.find({ _id: { $in: copyIds } }).limit(limit).maxTimeMS(30000).toArray();
        const byId = new Map(copies.map((row) => [String(row._id), row]));
        return page.map((row) => {
          if (!isAssessmentHistoryCopy(row)) return row;
          const copy = byId.get(String(row._id));
          if (!copy) throw new Error('History changed during audit');
          return copy;
        });
      },
      readOriginals: async (scopes, limit) => histories.find({
        _id: { $lte: upperId }, $or: scopes,
      }).hint('perf_userId_TDFId_type_time').limit(limit).maxTimeMS(30000).toArray(),
    }, { maxRecords });
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  } finally { await client.close(); }
}

main().catch(() => {
  // Driver errors can contain credentials, query payloads or learner identifiers.
  console.error('Assessment history audit failed. Check connectivity, read permissions, required indexes and limits; no rollout approval was produced.');
  process.exitCode = 1;
});
