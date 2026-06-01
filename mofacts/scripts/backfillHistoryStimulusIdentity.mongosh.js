/* global db, printjson, APPLY_HISTORY_STIMULUS_IDENTITY, HISTORY_STIMULUS_IDENTITY_BATCH_SIZE, HISTORY_STIMULUS_IDENTITY_SAMPLE_LIMIT */
/*
 * Backfill explicit stimulus identity onto historical model-practice rows.
 *
 * Dry run:
 *   mongosh "$MONGO_URL" --file mofacts/scripts/backfillHistoryStimulusIdentity.mongosh.js
 *
 * Apply, after dry run is clean and the database is backed up:
 *   mongosh "$MONGO_URL" --eval "var APPLY_HISTORY_STIMULUS_IDENTITY = true" --file mofacts/scripts/backfillHistoryStimulusIdentity.mongosh.js
 */

(function backfillHistoryStimulusIdentity() {
  const apply = typeof APPLY_HISTORY_STIMULUS_IDENTITY === 'boolean'
    ? APPLY_HISTORY_STIMULUS_IDENTITY
    : false;
  const batchSize = typeof HISTORY_STIMULUS_IDENTITY_BATCH_SIZE === 'number'
    ? HISTORY_STIMULUS_IDENTITY_BATCH_SIZE
    : 1000;
  const sampleLimit = typeof HISTORY_STIMULUS_IDENTITY_SAMPLE_LIMIT === 'number'
    ? HISTORY_STIMULUS_IDENTITY_SAMPLE_LIMIT
    : 25;

  const histories = db.getCollection('history');
  const tdfs = db.getCollection('tdfs');
  const tdfStimuliSetIdById = new Map();
  const issueCounts = {};
  const issueSamples = [];
  let scanned = 0;
  let migratable = 0;
  let alreadyExplicit = 0;
  let updated = 0;

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

  function getTdfStimuliSetId(tdfId) {
    const key = String(tdfId);
    if (tdfStimuliSetIdById.has(key)) {
      return tdfStimuliSetIdById.get(key);
    }
    const tdf = tdfs.findOne(
      { _id: tdfId },
      { stimuliSetId: 1 },
    );
    const stimuliSetId = tdf ? tdf.stimuliSetId : undefined;
    tdfStimuliSetIdById.set(key, stimuliSetId);
    return stimuliSetId;
  }

  function validateExistingExplicitIdentity(row) {
    if (!isBlank(row.stimulusKC) && !isBlank(row.KCId) && String(row.stimulusKC) !== String(row.KCId)) {
      recordIssue('existing-stimulusKC-KCId-mismatch', row, {
        stimulusKC: row.stimulusKC,
        KCId: row.KCId,
      });
      return false;
    }
    if (!isBlank(row.clusterKC) && !isBlank(row.KCCluster) && String(row.clusterKC) !== String(row.KCCluster)) {
      recordIssue('existing-clusterKC-KCCluster-mismatch', row, {
        clusterKC: row.clusterKC,
        KCCluster: row.KCCluster,
      });
      return false;
    }
    return true;
  }

  function buildUpdate(row) {
    if (!validateExistingExplicitIdentity(row)) {
      return null;
    }

    if (isBlank(row.KCId)) {
      recordIssue('missing-KCId', row, {});
      return null;
    }
    if (isBlank(row.KCDefault)) {
      recordIssue('missing-KCDefault', row, {});
      return null;
    }
    if (String(row.KCDefault) !== String(row.KCId)) {
      recordIssue('KCDefault-KCId-mismatch', row, {
        KCDefault: row.KCDefault,
        KCId: row.KCId,
      });
      return null;
    }
    if (isBlank(row.KCCluster)) {
      recordIssue('missing-KCCluster', row, {});
      return null;
    }

    const needsBackfill = isBlank(row.stimuliSetId) || isBlank(row.stimulusKC) || isBlank(row.clusterKC);
    if (!needsBackfill) {
      alreadyExplicit += 1;
      return null;
    }

    if (isBlank(row.TDFId)) {
      recordIssue('missing-TDFId', row, {});
      return null;
    }
    const stimuliSetId = isBlank(row.stimuliSetId)
      ? getTdfStimuliSetId(row.TDFId)
      : row.stimuliSetId;
    if (isBlank(stimuliSetId)) {
      recordIssue('missing-tdf-stimuliSetId', row, {});
      return null;
    }

    return {
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            stimuliSetId,
            stimulusKC: row.KCId,
            clusterKC: row.KCCluster,
          },
        },
      },
    };
  }

  function scanRows() {
    const selector = {
      levelUnitType: 'model',
    };
    return histories.find(selector, {
      _id: 1,
      TDFId: 1,
      KCId: 1,
      KCDefault: 1,
      KCCluster: 1,
      stimuliSetId: 1,
      stimulusKC: 1,
      clusterKC: 1,
    }).noCursorTimeout();
  }

  const dryRunCursor = scanRows();
  while (dryRunCursor.hasNext()) {
    const row = dryRunCursor.next();
    scanned += 1;
    if (buildUpdate(row)) {
      migratable += 1;
    }
  }

  printjson({
    apply,
    scanned,
    migratable,
    alreadyExplicit,
    issueCounts,
    issueSamples,
  });

  if (Object.keys(issueCounts).length > 0) {
    throw new Error('History stimulus identity backfill found unmigratable rows; fix or quarantine them before applying.');
  }
  if (!apply) {
    print('Dry run only. Re-run with APPLY_HISTORY_STIMULUS_IDENTITY = true after backup to write changes.');
    return;
  }

  let ops = [];
  const applyCursor = scanRows();
  while (applyCursor.hasNext()) {
    const row = applyCursor.next();
    const op = buildUpdate(row);
    if (!op) {
      continue;
    }
    ops.push(op);
    if (ops.length >= batchSize) {
      const result = histories.bulkWrite(ops, { ordered: true });
      updated += result.modifiedCount;
      ops = [];
    }
  }
  if (ops.length > 0) {
    const result = histories.bulkWrite(ops, { ordered: true });
    updated += result.modifiedCount;
  }

  printjson({
    applied: true,
    updated,
  });
})();
