import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsBridgeMessage, validateBatch, ObservedState } from './protocol.ts';

const record = (sequence, type, data) => ({ sequence, order: sequence, frame: 1, time: sequence, type, data });
const batch = (...records) => ({ firstSequence: records[0].sequence, lastSequence: records.at(-1).sequence, records });

test('bridge requires exact origin, source window, version, build and session', () => {
  const source = {};
  const expected = { origin: 'https://sim.example', source, buildId: 'build', sessionId: 'attempt' };
  const event = { origin: expected.origin, source, data: { protocol: 'phet-research', version: 2, buildId: 'build', sessionId: 'attempt', kind: 'batch' } };
  assert.equal(acceptsBridgeMessage(event, expected), true);
  for (const changed of [{ origin: 'https://other.example' }, { source: {} }, { data: { ...event.data, version: 1 } }, { data: { ...event.data, sessionId: 'old' } }]) {
    assert.equal(acceptsBridgeMessage({ ...event, ...changed }, expected), false);
  }
});
test('batch validation rejects missing intermediate observations', () => {
  assert.throws(() => validateBatch({ firstSequence: 1, lastSequence: 3, records: [record(1, 'checkpoint', {}), record(3, 'checkpoint', {})] }));
  assert.throws(() => validateBatch(batch(record(1, 'invented', {}))));
});
test('reconstructs supported observed state and releases removed objects', () => {
  const state = new ObservedState();
  state.apply(validateBatch(batch(record(1, 'catalog', { id: 'p', coverage: 'observed' }), record(2, 'initial', { id: 'p', state: { value: 1 } }))));
  state.apply(validateBatch(batch(record(3, 'property', { id: 'p', args: [2, 1] }), record(4, 'checkpoint', { evidenceComplete: true }))));
  assert.equal(state.states.get('p').value, 2);
  state.apply(validateBatch(batch(record(5, 'disposed', { id: 'p' }))));
  assert.equal(state.states.size, 0);
});
test('a gap, duplicate, order regression, or monitor error invalidates evidence', () => {
  for (const invalid of [record(2, 'checkpoint', { evidenceComplete: true }), { ...record(1, 'checkpoint', {}), order: 0 }]) {
    const state = new ObservedState();
    assert.throws(() => state.apply(batch(invalid)));
    assert.equal(state.complete, false);
  }
  const state = new ObservedState();
  state.apply(batch(record(1, 'monitoring-error', { reason: 'overflow' })));
  assert.equal(state.complete, false);
  assert.throws(() => state.apply(batch(record(2, 'checkpoint', { evidenceComplete: true }))));
});

test('address indexes retain ambiguity and follow moves, disposal and detachment', () => {
  const state = new ObservedState();
  state.apply(batch(record(1, 'catalog', { id: 'p', path: 'model.a', tandem: 'named.p' }),
    record(2, 'catalog', { id: 'q', path: 'model.a', tandem: 'named.q' })));
  assert.equal(state.findAddress({ path: 'model.a' }).length, 2);
  state.apply(batch(record(3, 'catalog', { id: 'q', path: 'model.b', tandem: 'named.q' })));
  assert.equal(state.findAddress({ path: 'model.a' })[0][0], 'p');
  assert.equal(state.findAddress({ tandem: 'named.q' })[0][1].path, 'model.b');
  state.apply(batch(record(4, 'disposed', { id: 'p' }), record(5, 'detached', { id: 'q' })));
  assert.deepEqual(state.findAddress({ path: 'model.a' }), []);
  assert.deepEqual(state.findAddress({ tandem: 'named.q' }), []);
  assert.equal(state.catalog.size, 0);
});
