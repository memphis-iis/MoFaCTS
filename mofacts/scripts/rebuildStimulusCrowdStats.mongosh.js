/* global db, printjson, APPLY_STIMULUS_CROWD_STATS_REBUILD, STIMULUS_CROWD_STATS_BATCH_SIZE, STIMULUS_CROWD_STATS_SAMPLE_LIMIT */
/*
 * Rebuild the durable stimulus crowd-stats read model from accepted history.
 *
 * Dry run:
 *   mongosh "$MONGO_URL" --file mofacts/scripts/rebuildStimulusCrowdStats.mongosh.js
 *
 * Apply, after dry run is clean and the database is backed up:
 *   mongosh "$MONGO_URL" --eval "var APPLY_STIMULUS_CROWD_STATS_REBUILD = true" --file mofacts/scripts/rebuildStimulusCrowdStats.mongosh.js
 */

(function rebuildStimulusCrowdStats() {
  const apply = typeof APPLY_STIMULUS_CROWD_STATS_REBUILD === 'boolean'
    ? APPLY_STIMULUS_CROWD_STATS_REBUILD
    : false;
  const batchSize = typeof STIMULUS_CROWD_STATS_BATCH_SIZE === 'number'
    ? STIMULUS_CROWD_STATS_BATCH_SIZE
    : 1000;
  const sampleLimit = typeof STIMULUS_CROWD_STATS_SAMPLE_LIMIT === 'number'
    ? STIMULUS_CROWD_STATS_SAMPLE_LIMIT
    : 25;

  const histories = db.getCollection('history');
  const stats = db.getCollection('stimulus_crowd_stats');
  const issueCounts = {};
  const issueSamples = [];
  const rowsByStimulusKey = new Map();
  let scanned = 0;
  let countable = 0;

  function isBlank(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
  }

  function recordIssue(kind, row, details) {
    issueCounts[kind] = (issueCounts[kind] || 0) + 1;
    if (issueSamples.length < sampleLimit) {
      issueSamples.push({
        kind,
        historyId: row && row._id,
        TDFId: row && row.TDFId,
        details,
      });
    }
  }

  function requireIdentity(row, fieldName) {
    if (isBlank(row[fieldName])) {
      recordIssue(`missing-${fieldName}`, row, {});
      return false;
    }
    return true;
  }

  function identityValuesMatch(left, right) {
    return !isBlank(left) && !isBlank(right) && String(left) === String(right);
  }

  function lastOutcomeAt(row) {
    for (const fieldName of ['recordedServerTime', 'time', 'problemStartTime']) {
      const value = Number(row[fieldName]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  function scanRows() {
    return histories.find(
      {
        levelUnitType: 'model',
        eventType: { $in: [null, ''] },
        outcome: { $in: ['correct', 'incorrect'] },
      },
      {
        _id: 1,
        TDFId: 1,
        stimuliSetId: 1,
        stimulusKC: 1,
        clusterKC: 1,
        KCId: 1,
        KCDefault: 1,
        KCCluster: 1,
        outcome: 1,
        recordedServerTime: 1,
        time: 1,
        problemStartTime: 1,
      },
    ).noCursorTimeout();
  }

  const cursor = scanRows();
  while (cursor.hasNext()) {
    const row = cursor.next();
    scanned += 1;
    let valid = true;
    for (const fieldName of ['stimuliSetId', 'stimulusKC', 'clusterKC', 'KCId', 'KCDefault', 'KCCluster']) {
      valid = requireIdentity(row, fieldName) && valid;
    }
    if (valid && !identityValuesMatch(row.KCId, row.stimulusKC)) {
      recordIssue('KCId-stimulusKC-mismatch', row, { KCId: row.KCId, stimulusKC: row.stimulusKC });
      valid = false;
    }
    if (valid && !identityValuesMatch(row.KCDefault, row.stimulusKC)) {
      recordIssue('KCDefault-stimulusKC-mismatch', row, { KCDefault: row.KCDefault, stimulusKC: row.stimulusKC });
      valid = false;
    }
    if (valid && !identityValuesMatch(row.KCCluster, row.clusterKC)) {
      recordIssue('KCCluster-clusterKC-mismatch', row, { KCCluster: row.KCCluster, clusterKC: row.clusterKC });
      valid = false;
    }
    const outcomeAt = lastOutcomeAt(row);
    if (valid && outcomeAt === null) {
      recordIssue('missing-outcome-timestamp', row, {});
      valid = false;
    }
    if (!valid) {
      continue;
    }

    countable += 1;
    const stimulusKey = `${String(row.stimuliSetId)}:${String(row.stimulusKC)}`;
    const existing = rowsByStimulusKey.get(stimulusKey) || {
      stimulusKey,
      stimuliSetId: row.stimuliSetId,
      stimulusKC: row.stimulusKC,
      KCId: row.KCId,
      clusterKC: row.clusterKC,
      correctCount: 0,
      incorrectCount: 0,
      totalCount: 0,
      lastOutcomeAt: 0,
    };
    if (row.outcome === 'correct') {
      existing.correctCount += 1;
    } else {
      existing.incorrectCount += 1;
    }
    existing.totalCount += 1;
    existing.lastOutcomeAt = Math.max(existing.lastOutcomeAt, outcomeAt);
    rowsByStimulusKey.set(stimulusKey, existing);
  }

  printjson({
    apply,
    scanned,
    countable,
    aggregateRows: rowsByStimulusKey.size,
    issueCounts,
    issueSamples,
  });

  if (Object.keys(issueCounts).length > 0) {
    throw new Error('Stimulus crowd stats rebuild found invalid countable history rows; fix identity first.');
  }
  if (!apply) {
    print('Dry run only. Re-run with APPLY_STIMULUS_CROWD_STATS_REBUILD = true after backup to replace stimulus_crowd_stats.');
    return;
  }

  stats.deleteMany({});
  let ops = [];
  const now = new Date();
  for (const row of rowsByStimulusKey.values()) {
    ops.push({
      insertOne: {
        document: {
          ...row,
          updatedAt: now,
        },
      },
    });
    if (ops.length >= batchSize) {
      stats.bulkWrite(ops, { ordered: true });
      ops = [];
    }
  }
  if (ops.length > 0) {
    stats.bulkWrite(ops, { ordered: true });
  }

  stats.createIndex({ stimulusKey: 1 }, { unique: true });
  stats.createIndex({ stimuliSetId: 1, KCId: 1 });
  stats.createIndex({ stimuliSetId: 1 });

  printjson({
    applied: true,
    replacedRows: rowsByStimulusKey.size,
  });
})();
