require('./registerHistoryTypescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SparcWorksheet, worksheetEvent } = require('../../learning-components/units/sparcsession/sparcWorksheet.ts');
const { worksheetHistoryWriteId, sameWorksheetWrite } = require('../server/lib/worksheetHistoryWrite.ts');
const { isModelPracticeHistoryRecord } = require('../common/historyEnvelope.ts');
function fixture(overrides = {}) {
  let time = 1000, serial = 0;
  const records = [];
  const display = { type: 'sparc', schema: 'tutorscript-sparc/2.0', pageKey: 'page', worksheet: { workDurationSeconds: 600, reviewDurationSeconds: 300, randomizeQuestions: false },
    nodes: [0, 1].map(i => ({ id: `q${i}`, nodeType: 'semantic', semanticType: 'multiple-choice', clusterIndex: i,
      prompt: { value: 'Pick' }, choices: [{ id: `a${i}`, value: 'a', label: 'A', correct: true }, { id: `b${i}`, value: 'b', label: 'B' }] })),
    clusterTargets: [0, 1].map(i => ({ clusterIndex: i, stimuliSetId: 'set', stimulusKC: `q${i}`, clusterKC: `kc${i}`, KCId: `q${i}`, KCDefault: `q${i}`, KCCluster: `kc${i}` })) };
  const deps = { display, core: { userId: 'synthetic', TDFId: 'tdf', sessionID: 'session', levelUnit: 1 }, checkpointIndex: 0,
    now: () => time, random: () => 0, id: () => `synthetic-${++serial}`, write: async record => records.push(structuredClone(record)), ...overrides };
  return { deps, records, setTime: t => time = t, create: () => new SparcWorksheet(deps) };
}
test('answers are normal model-eligible records; blank questions and review never create answers', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]);
  await w.answer('b0'); await w.answer('a0'); await w.finishWork();
  assert.equal(f.records.filter(isModelPracticeHistoryRecord).length, 2);
  assert.equal(w.selection(w.questions[0]).value, 'a'); assert.equal(w.selection(w.questions[1]), undefined);
  assert.equal(f.records.filter(r => worksheetEvent(r).kind === 'answer')[0].responseValue, 'b');
  await w.answer('b1'); assert.equal(f.records.filter(isModelPracticeHistoryRecord).length, 2);
});
test('feedback appearances log once per mount; reload creates a new exposure without changing answers or deadline', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('b0'); await w.finishWork();
  await Promise.all([w.feedbackAppeared(), w.feedbackAppeared()]); const deadline = w.deadline;
  const reloaded = f.create(); await reloaded.initialize(f.records); await reloaded.feedbackAppeared();
  assert.equal(reloaded.deadline, deadline); assert.equal(reloaded.selection(reloaded.questions[0]).value, 'b');
  assert.equal(f.records.filter(r => worksheetEvent(r).kind === 'exposure').length, 2);
  assert.equal(f.records.filter(isModelPracticeHistoryRecord).length, 1);
});
test('finish waits for pending writes and simultaneous completion triggers save once', async () => {
  let release; const gate = new Promise(resolve => release = resolve); const f = fixture();
  const write = f.deps.write; f.deps.write = async record => { if (worksheetEvent(record).kind === 'answer') await gate; await write(record); };
  const w = f.create(); await w.initialize([]); const answer = w.answer('a0'); const end = w.finishWork();
  assert.equal(w.phase, 'work'); release(); await Promise.all([answer, end]);
  await Promise.all([w.complete(), w.complete()]); assert.deepEqual(f.records.map(r => worksheetEvent(r).kind), ['start', 'answer', 'review', 'complete']);
});
test('failed answer write blocks feedback instead of presenting an incomplete replica', async () => {
  const f = fixture(), original = f.deps.write; f.deps.write = async r => { if (worksheetEvent(r).kind === 'answer') throw Error('failure'); await original(r); };
  const w = f.create(); await w.initialize([]); await assert.rejects(w.answer('a0'), /failure/); await assert.rejects(w.finishWork());
  assert.equal(w.phase, 'work'); assert.equal(f.records.length, 1);
});
test('work deadline blocks late answers and resume preserves realized random order', async () => {
  const f = fixture(); f.deps.display.worksheet.randomizeQuestions = true; const w = f.create(); await w.initialize([]);
  assert.deepEqual(w.order, ['q1', 'q0']); f.setTime(w.deadline); await w.answer('a0');
  const restored = f.create(); await restored.initialize(f.records); assert.deepEqual(restored.order, w.order); assert.equal(restored.deadline, w.deadline);
  await restored.finishWork(); assert.equal(f.records.filter(isModelPracticeHistoryRecord).length, 0);
});
test('checkpoint and learner scopes do not mix', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('a0');
  const other = fixture({ checkpointIndex: 1 }); const second = other.create(); await second.initialize(f.records);
  assert.equal(second.selection(second.questions[0]), undefined); assert.equal(other.records.length, 1);
});
test('completed worksheet remains completed after reload', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.finishWork(); await w.complete();
  const next = f.create(); await next.initialize(f.records); assert.equal(next.phase, 'complete');
});
test('write identities deduplicate transport retries and reject changed payloads', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('a0');
  const answer = f.records[1]; const saved = { ...answer, _id: 'server', eventId: 15, recordedServerTime: 4, dynamicTagFields: [] };
  assert.equal(worksheetHistoryWriteId(answer), worksheetHistoryWriteId(saved)); assert.ok(sameWorksheetWrite(saved, answer));
  assert.equal(sameWorksheetWrite(saved, { ...answer, responseValue: 'b' }), false);
  assert.throws(() => worksheetHistoryWriteId({ ...answer, levelUnitType: 'sparc' }));
});
test('conflicting persisted sequences fail clearly', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('a0');
  await assert.rejects(f.create().initialize([...f.records, f.records[1]]), /Conflicting/);
});

test('orphaned worksheet answers fail rather than silently start a new attempt', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('a0');
  await assert.rejects(f.create().initialize(f.records.slice(1)), /no matching start/);
});
test('learner, lesson, unit and page scopes isolate answer reconstruction', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]); await w.answer('a0');
  for (const core of [{userId:'other'}, {TDFId:'other'}, {levelUnit:2}]) {
    const other = fixture({core:{...f.deps.core,...core}}), next = other.create(); await next.initialize(f.records);
    assert.equal(next.selection(next.questions[0]), undefined);
  }
  const other = fixture(); other.deps.display.pageKey = 'other'; const next = other.create(); await next.initialize(f.records);
  assert.equal(next.selection(next.questions[0]), undefined);
});
test('lifecycle records cannot masquerade as answer observations', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]);
  const start = f.records[0];
  assert.throws(() => worksheetHistoryWriteId({...start,responseValue:'answer'}));
  assert.throws(() => worksheetHistoryWriteId({...start,sparc:{...start.sparc,practiceObservation:{}}}));
  assert.equal(worksheetHistoryWriteId({eventType:'video'}), undefined);
});
test('server retry identity separates course assignments and rejects competing starts', async () => {
  const f = fixture(), w = f.create(); await w.initialize([]);
  const start = f.records[0]; const copy = structuredClone(start); copy.sparc.worksheet.attemptId = 'competing';
  assert.equal(worksheetHistoryWriteId(start),worksheetHistoryWriteId(copy));
  assert.equal(sameWorksheetWrite(start,copy),false);
  assert.notEqual(worksheetHistoryWriteId({...start,courseAssignment:{courseId:'course',assignmentId:'a'}}),
    worksheetHistoryWriteId({...start,courseAssignment:{courseId:'course',assignmentId:'b'}}));
});
