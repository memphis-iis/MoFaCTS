import assert from 'node:assert/strict';
import { getContentUpdateWarnings } from './contentUpdateWarnings';

const stimuli = (...counts: number[]) => ({ setspec: { clusters: counts.map(count => ({
  stims: Array.from({ length: count }, () => ({ display: { text: 'prompt' }, response: { correctResponse: 'answer' } })),
})) } });
const tutor = (...names: string[]) => ({ unit: names.map(unitname => ({ unitname })) });

describe('content update author warnings', function() {
  for (const [name, before, after] of [
    ['question reduction in a cluster', [3, 2], [2, 2]],
    ['removed cluster', [1, 1], [2]],
    ['position reduction despite unchanged total', [3, 1], [2, 2]],
    ['position reduction despite additions elsewhere', [3, 1], [2, 5, 1]],
  ] as const) {
    it(`warns for ${name}`, function() {
      assert.deepEqual(getContentUpdateWarnings({ stimuli: stimuli(...before) }, { stimuli: stimuli(...after) }), ['questions-removed']);
    });
  }
  for (const [name, names] of [
    ['addition', ['A', 'B', 'C']], ['removal', ['A']], ['reordering', ['B', 'A']], ['rename', ['A', 'b']],
  ] as const) {
    it(`warns for unit ${name}`, function() {
      assert.deepEqual(getContentUpdateWarnings({ tutor: tutor('A', 'B') }, { tutor: tutor(...names) }), ['unit-sequence-changed']);
    });
  }
  it('combines exactly the two warnings without modifying either input', function() {
    const before = { tutor: tutor('A', 'B'), stimuli: stimuli(3, 2) };
    const after = { tutor: tutor('B', 'A'), stimuli: stimuli(2, 2) };
    const snapshot = structuredClone([before, after]);
    assert.deepEqual(getContentUpdateWarnings(before, after), ['questions-removed', 'unit-sequence-changed']);
    assert.deepEqual([before, after], snapshot);
  });
  it('does not warn for unchanged counts, additions, wording, answers, video URLs or adaptive rules', function() {
    const before = { tutor: { ...tutor('A'), unitTemplate: [{ videosession: { videosource: 'old' } }], adaptiveLogic: 'old' }, stimuli: stimuli(2) };
    const after = { tutor: { ...tutor('A'), unitTemplate: [{ videosession: { videosource: 'new' } }], adaptiveLogic: 'new' }, stimuli: stimuli(2, 1) };
    after.stimuli.setspec.clusters[0]!.stims[0]!.display.text = 'changed wording';
    after.stimuli.setspec.clusters[0]!.stims[0]!.response.correctResponse = 'changed answer';
    assert.deepEqual(getContentUpdateWarnings(before, after), []);
  });
  it('uses exact authored names and the selected semantics for unnamed/identically named units', function() {
    assert.deepEqual(getContentUpdateWarnings({ tutor: { unit: [{}, { unitname: 'A' }, { unitname: 'A' }] } },
      { tutor: { unit: [{}, { unitname: 'A' }, { unitname: 'A' }] } }), []);
    assert.deepEqual(getContentUpdateWarnings({ tutor: tutor('A') }, { tutor: tutor(' A') }), ['unit-sequence-changed']);
  });
});
