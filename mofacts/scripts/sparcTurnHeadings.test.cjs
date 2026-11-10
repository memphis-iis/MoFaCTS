const { it } = require('node:test');
const assert = require('node:assert/strict');
require('./registerHistoryTypescript.cjs');
const { buildSparcTurnHeadings, projectSparcTurnOrientations } = require('../client/views/experiment/svelte/services/sparcTurnHeadings.ts');

const orientation = (text, met = 0, reason = 'introduction') => ({
  reason, current: { kind: 'expectation', id: text, text }, progress: { total: 3, met, remaining: 3 - met },
});
const message = (id, turnEventId, extra = {}) => ({ id, turnEventId, ...extra });
const feedback = id => message(id, id, { action: 'instruction.feedback' });

it('keeps old headings and feedback with the preceding instruction', () => {
  const headings = buildSparcTurnHeadings([message('first'), message('answer'), feedback('feedback1'),
    message('next'), feedback('feedback2')]);
  assert.deepEqual([...headings], [['first', { count: 1 }], ['next', { count: 2 }]]);
});

it('shares one heading between a student menu, its selection and a question-only turn', () => {
  const saved = orientation('Interval width', 1, 'advance');
  const headings = buildSparcTurnHeadings([
    message('instructional-choice-menu', undefined, { groupType: 'button-group', children: [{}] }),
    message('choice:selected', undefined, { groupType: 'button-group', children: [{}] }),
    message('choice:orientation', 'choice'), message('choice:question', 'choice'),
  ], { choice: saved });
  assert.deepEqual([...headings], [['instructional-choice-menu', { count: 1, orientation: saved }]]);
});

it('adds a fresh heading snapshot for same-KC continuation and suppresses completion-only headings', () => {
  const first = orientation('Interval width'), next = orientation('Interval width', 1, 'continue');
  const headings = buildSparcTurnHeadings([message('one:orientation', 'one'), message('one:question', 'one'),
    feedback('answer1'), message('two:orientation', 'two'), message('two:question', 'two'),
    feedback('answer2'), message('done:orientation', 'done', { completionOrientation: true })],
  { one: first, two: next, done: { reason: 'completion', progress: { total: 3, met: 3, remaining: 0 } } });
  assert.deepEqual([...headings], [
    ['one:orientation', { count: 1, orientation: first }], ['two:orientation', { count: 2, orientation: next }],
  ]);
});

it('ignores empty menus rather than creating a phantom turn', () => {
  assert.equal(buildSparcTurnHeadings([message('empty', undefined, { groupType: 'button-group', children: [] })]).size, 0);
});

it('restores each accepted heading with its historical progress rather than the latest cell', () => {
  const first = orientation('Confidence level'), next = orientation('Interval width', 1, 'advance');
  const replay = { cells: { latest: { value: { request: next } } }, transitions: [
    { event: { eventId: 'one' }, writes: [{ key: 'instructionalOrientation', value: { request: first, bridge: 'First bridge' } }] },
    { event: { eventId: 'two' }, writes: [{ key: 'instructionalOrientation', value: { request: next, bridge: 'Next bridge' } }] },
  ] };
  const restored = projectSparcTurnOrientations(replay);
  assert.deepEqual(restored, { one: first, two: next });
  assert.equal(restored.one.progress.remaining, 3);
  assert.equal(restored.two.progress.remaining, 2);
});

it('preserves mixed full, off and headings turns after the lesson mode changes', () => {
  const full = orientation('Confidence level');
  const headingsOnly = orientation('Interval width', 1, 'advance');
  const checkpoint = (eventId, mode) => ({ event: { eventId },
    writes: [{ key: 'instructionalOrientationMode', value: mode }] });
  const replay = { cells: { currentMode: { value: 'off' } }, transitions: [
    checkpoint('one', 'full'),
    { event: { eventId: 'one' }, writes: [{ key: 'instructionalOrientation', value: { request: full, bridge: 'Begin with confidence levels.' } }] },
    checkpoint('two', 'off'),
    checkpoint('three', 'headings'),
    { event: { eventId: 'three' }, writes: [{ key: 'instructionalOrientation', value: { request: headingsOnly, bridge: null } }] },
    checkpoint('next', 'off'),
  ] };
  const restored = projectSparcTurnOrientations(replay);
  assert.deepEqual(restored, { one: full, three: headingsOnly });
  const messages = [
    message('one:orientation', 'one'), message('one:question', 'one'), feedback('answer1'),
    message('two:question', 'two'), feedback('answer2'),
    message('three:orientation', 'three'), message('three:question', 'three'), feedback('answer3'),
  ];
  assert.deepEqual([...buildSparcTurnHeadings(messages, restored)], [
    ['one:orientation', { count: 1, orientation: full }],
    ['two:question', { count: 2 }],
    ['three:orientation', { count: 3, orientation: headingsOnly }],
  ]);
});
