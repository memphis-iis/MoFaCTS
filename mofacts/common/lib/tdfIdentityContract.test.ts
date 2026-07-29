import { strict as assert } from 'node:assert';

import {
  reconcileConditionCountsByChildId,
  validateConditionFamilyTutor,
} from './tdfIdentityContract';

describe('tdfIdentityContract', function() {
  it('accepts canonical roots without unit and runnable ordinary TDFs', function() {
    const root = validateConditionFamilyTutor({
      setspec: { condition: ['a.json', 'b.json'], conditionTdfIds: ['a-id', 'b-id'] },
    }, { requireCanonicalIds: true });
    const ordinary = validateConditionFamilyTutor({ setspec: {}, unit: [{}] }, { requireCanonicalIds: true });
    assert.deepEqual(root.errors, []);
    assert.deepEqual(ordinary.errors, []);
  });

  it('rejects empty-unit and mixed roots, duplicates, missing ids, and length mismatch', function() {
    assert.match(validateConditionFamilyTutor({ setspec: {}, unit: [] }).errors.join(' '), /at least one/);
    assert.match(validateConditionFamilyTutor({
      setspec: { condition: ['a.json'], conditionTdfIds: ['a-id'] },
      unit: [],
    }, { requireCanonicalIds: true }).errors.join(' '), /must not contain/);
    assert.match(validateConditionFamilyTutor({
      setspec: { condition: ['a.json', 'a.json'], conditionTdfIds: ['a-id'] },
    }, { requireCanonicalIds: true }).errors.join(' '), /unique|one entry/);
    assert.match(validateConditionFamilyTutor({
      setspec: { condition: ['a.json'] },
    }, { requireCanonicalIds: true }).errors.join(' '), /required/);
  });

  it('preserves counts by child id through reorder and initializes additions', function() {
    assert.deepEqual(
      reconcileConditionCountsByChildId(['a-id', 'b-id'], [4, 9], ['b-id', 'c-id', 'a-id']),
      [9, 0, 4],
    );
  });
});
