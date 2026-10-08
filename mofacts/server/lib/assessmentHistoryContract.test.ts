import { strict as assert } from 'node:assert';
import { isAssessmentHistoryCopy, isModelPracticeHistoryRecord, modelPracticeHistorySelector, operationalHistorySelector,
  assertCanonicalHistoryEnvelope } from '../../common/historyEnvelope';
import { readSharedModelPracticeEvents, sharedModelPracticeIdentityMatches } from '../../../learning-components/runtime/modelPracticeHistoryExchange';
import { reconstructLearningStateFromHistory } from '../../common/lib/historyReconstruction';
import { auditAssessmentHistoryCopies, compareAssessmentCopy } from './assessmentHistoryAudit';
import { recordStimulusCrowdOutcome } from './stimulusCrowdStats';
import { writeHistoryExport } from './historyExport';

type Row = Record<string, any>;
function answer(overrides: Row = {}): Row {
  return { _id: '01', historySchemaVersion: 1, userId: 'synthetic-learner', TDFId: 'lesson', sessionID: 'attempt',
    levelUnit: 0, levelUnitType: 'schedule', modelEvidenceSource: 'assessment', time: 2000, problemStartTime: 1000,
    recordedServerTime: 2100, eventId: 1, selection: 'question', action: 'response', outcome: 'correct',
    typeOfResponse: 'text', responseValue: 'answer', input: 'answer', displayedStimulus: 'prompt', eventType: '',
    stimuliSetId: 'set', stimulusKC: 'item', clusterKC: 'concept', KCId: 'item', KCDefault: 'item', KCCluster: 'concept',
    responseKey: 'answer', CFCorrectAnswer: 'answer', responseDuration: 1000, CFEndLatency: 1000, CFFeedbackLatency: 0,
    ...overrides };
}
function copy(original: Row): Row {
  return { ...original, _id: '02', levelUnitType: 'model', eventId: 2, recordedServerTime: 2200 };
}
function audit(rows: Row[], maxRecords = 100, pageSize = 2) {
  return auditAssessmentHistoryCopies({
    readPage: async (afterId, limit) => rows.filter((row) => afterId === undefined || row._id > String(afterId)).slice(0, limit),
    readOriginals: async (scopes, limit) => rows.filter((row) => scopes.some((scope) => (
      Object.entries(scope).every(([key, value]) => row[key] === value)
    ))).slice(0, limit),
  }, { maxRecords, pageSize });
}

describe('single-record assessment history contract', function() {
  it('accepts original assessment and adaptive answers while excluding only the exact historical copy marker', function() {
    for (const origin of ['assessment', 'learning', 'sparc', undefined, null]) {
      for (const unit of ['schedule', 'model', 'video', 'Instruction', 'autotutor', 'sparc']) {
        const row = { levelUnitType: unit, modelEvidenceSource: origin };
        const duplicate = unit === 'model' && origin === 'assessment';
        assert.equal(isAssessmentHistoryCopy(row), duplicate);
        assert.equal(isModelPracticeHistoryRecord(row), ['model', 'schedule'].includes(unit) && !duplicate);
      }
    }
    assert.deepEqual(operationalHistorySelector(), { $nor: [{ levelUnitType: 'model', modelEvidenceSource: 'assessment' }] });
    assert.deepEqual(modelPracticeHistorySelector(), { levelUnitType: { $in: ['model', 'schedule'] }, ...operationalHistorySelector() });
  });

  it('validates original assessment identities as strictly as adaptive practice', function() {
    for (const unit of ['schedule', 'model']) {
      const row = answer({ levelUnitType: unit, modelEvidenceSource: 'learning' });
      assert.doesNotThrow(() => assertCanonicalHistoryEnvelope(row));
      assert.throws(() => assertCanonicalHistoryEnvelope({ ...row, KCId: 'wrong-item' }), /Identity mismatch|identity mismatch/);
    }
  });

  it('reconstructs identical model state from a historical pair or its original alone, before and after reload', function() {
    const original = answer();
    const practice = answer({ _id: '03', time: 4000, problemStartTime: 3000, levelUnit: 1,
      levelUnitType: 'model', modelEvidenceSource: 'learning', outcome: 'incorrect' });
    const pair = [original, copy(original), practice];
    const events = readSharedModelPracticeEvents(pair);
    assert.equal(events.length, 2);
    assert.equal(events[0]!.record.levelUnitType, 'schedule');
    const actual = reconstructLearningStateFromHistory(pair);
    const expected = reconstructLearningStateFromHistory([original, practice]);
    assert.deepEqual(actual, expected);
    assert.deepEqual(reconstructLearningStateFromHistory(JSON.parse(JSON.stringify(pair))), expected);
    assert.equal(actual.numQuestionsAnswered, 2);
    assert.deepEqual(actual.overallOutcomeHistory, [1, 0]);
    assert.equal(actual.clusterState.concept!.totalPracticeDuration, 2000);
  });

  it('preserves SPARC evidence, excludes playback and instruction records, and preserves learner/course boundaries', function() {
    const assessment = answer({ courseAssignment: { courseId: 'course-a' } });
    const sparc = answer({ levelUnitType: 'model', modelEvidenceSource: 'sparc', eventType: 'sparc' });
    const events = readSharedModelPracticeEvents([assessment, sparc,
      answer({ levelUnitType: 'video', eventType: 'video' }), answer({ levelUnitType: 'Instruction' })]);
    assert.equal(events.length, 2);
    const event = events[0]!;
    const matches = (user: string, course: string) => sharedModelPracticeIdentityMatches({
      target: event.identity, targetUserId: user,
      targetContext: { contextKind: 'course', contextId: course }, event,
    });
    assert.equal(matches('synthetic-learner', 'course-a'), true);
    assert.equal(matches('different-learner', 'course-a'), false);
    assert.equal(matches('synthetic-learner', 'course-b'), false);
  });

  it('continues existing crowd totals without replaying old assessments or counting copies', async function() {
    const totals = { correctCount: 6, incorrectCount: 4, totalCount: 10 };
    const stats = { upsertAsync: async (_selector: Row, update: Row) => {
      for (const field of ['correctCount', 'incorrectCount', 'totalCount'] as const) totals[field] += update.$inc[field];
    } };
    assert.equal(await recordStimulusCrowdOutcome(stats, copy(answer())), false);
    await recordStimulusCrowdOutcome(stats, answer());
    await recordStimulusCrowdOutcome(stats, answer({ levelUnitType: 'model', modelEvidenceSource: 'learning', outcome: 'incorrect' }));
    assert.deepEqual(totals, { correctCount: 7, incorrectCount: 5, totalCount: 12 });
  });

  it('streams original assessment and practice rows once in ordinary TSV exports', async function() {
    const original = answer();
    const practice = answer({ levelUnitType: 'model', modelEvidenceSource: 'learning' });
    let output = '';
    await writeHistoryExport([original, copy(original), practice], (chunk) => { output += chunk; }, (error) => { throw error; });
    const rows = output.trimEnd().split('\n').map((line) => line.split('\t'));
    assert.equal(rows.length, 3);
    const originIndex = rows[0]!.indexOf('Level (Unittype)');
    assert.ok(originIndex >= 0);
    assert.deepEqual(rows.slice(1).map((row) => row[originIndex]), ['schedule', 'model']);
  });
});

describe('assessment-copy rollout audit', function() {
  it('accepts originals without copies and a pair spread across pages', async function() {
    assert.equal((await audit([answer()])).passed, true);
    const report = await audit([answer(), copy(answer())], 100, 1);
    assert.equal(report.passed, true);
    assert.equal(report.scanned, 2);
    assert.equal(report.matched, 1);
    assert.equal(report.copies, 1);
  });
  it('blocks a copy without an original instead of silently substituting the copy', async function() {
    const report = await audit([copy(answer())]);
    assert.equal(report.missing, 1);
    assert.equal(report.passed, false);
    assert.deepEqual(readSharedModelPracticeEvents([copy(answer())]), []);
  });
  it('blocks changed answers or different origins and ignores only permitted server-generated differences', function() {
    const original = answer();
    assert.equal(compareAssessmentCopy(copy(original), [original]), 'matched');
    assert.equal(compareAssessmentCopy(copy(original), [{ ...original, responseValue: 'different' }]), 'conflicting');
    assert.equal(compareAssessmentCopy(copy(original), [{ ...original, modelEvidenceSource: 'learning' }]), 'conflicting');
    assert.equal(compareAssessmentCopy(copy(original), [{ ...original, userId: 'different-learner' }]), 'missing');
  });
  it('blocks multiple originals even if one exact payload matches', function() {
    assert.equal(compareAssessmentCopy(copy(answer()), [answer(), answer({ _id: '03', responseValue: 'changed' })]), 'ambiguous');
  });
  it('blocks invalid model identities, invalid outcomes and missing pairing fields', function() {
    for (const changes of [{ KCId: 'wrong-item' }, { outcome: 'unknown' }, { time: undefined }]) {
      const original = answer(changes);
      assert.equal(compareAssessmentCopy(copy(original), [original]), 'invalid');
    }
  });
  it('reports an incomplete bounded scan as blocked, never as a clean audit', async function() {
    const report = await audit([answer(), copy(answer())], 1, 1);
    assert.equal(report.complete, false);
    assert.equal(report.passed, false);
  });
  it('blocks excessive original candidates and rejects invalid limits', async function() {
    const deps = { readPage: async (after: unknown) => after ? [] : [copy(answer())], readOriginals: async () => Array(3).fill(answer()) };
    const report = await auditAssessmentHistoryCopies(deps, { maxRecords: 10, pageSize: 1 });
    assert.equal(report.candidateLimitExceeded, 1);
    assert.equal(report.passed, false);
    await assert.rejects(auditAssessmentHistoryCopies(deps, { maxRecords: 0 }), /limits/);
  });
});
