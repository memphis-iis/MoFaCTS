import { expect } from 'chai';
import {
  buildStimulusCrowdStatKeys,
  recordStimulusCrowdOutcome,
  shouldRecordStimulusCrowdOutcome,
} from './stimulusCrowdStats';

type UpsertCall = {
  selector: Record<string, unknown>;
  modifier: Record<string, any>;
};

function createRecord(overrides: Record<string, unknown> = {}) {
  return {
    levelUnitType: 'model',
    eventType: '',
    stimuliSetId: 'set-1',
    stimulusKC: 'kc-1',
    clusterKC: 'cluster-1',
    KCId: 'kc-1',
    KCDefault: 'kc-1',
    KCCluster: 'cluster-1',
    outcome: 'correct',
    recordedServerTime: 1234,
    ...overrides,
  };
}

function createStatsCollection() {
  const docs = new Map<string, any>();
  const calls: UpsertCall[] = [];
  return {
    calls,
    docs,
    collection: {
      async upsertAsync(selector: Record<string, unknown>, modifier: Record<string, any>) {
        calls.push({ selector, modifier });
        const stimulusKey = String(selector.stimulusKey);
        const existing = docs.get(stimulusKey) || modifier.$setOnInsert || {};
        docs.set(stimulusKey, {
          ...existing,
          correctCount: (existing.correctCount || 0) + (modifier.$inc.correctCount || 0),
          incorrectCount: (existing.incorrectCount || 0) + (modifier.$inc.incorrectCount || 0),
          totalCount: (existing.totalCount || 0) + (modifier.$inc.totalCount || 0),
          ...modifier.$set,
        });
      },
    },
  };
}

describe('stimulus crowd stats', function() {
  it('increments correct and incorrect outcomes for the same stimulus key', async function() {
    const stats = createStatsCollection();

    await recordStimulusCrowdOutcome(stats.collection, createRecord({ outcome: 'correct' }));
    await recordStimulusCrowdOutcome(stats.collection, createRecord({ outcome: 'incorrect' }));

    const doc = stats.docs.get('set-1:kc-1');
    expect(doc.correctCount).to.equal(1);
    expect(doc.incorrectCount).to.equal(1);
    expect(doc.totalCount).to.equal(2);
    expect(stats.calls).to.have.length(2);
  });

  it('ignores unsupported outcomes, non-model rows, explicit event rows, and timeouts', async function() {
    const stats = createStatsCollection();

    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ outcome: 'hint' }))).to.equal(false);
    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ levelUnitType: 'video' }))).to.equal(false);
    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ eventType: 'h5p' }))).to.equal(false);
    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ conditionTypeD: 'timeout' }))).to.equal(false);
    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ source: 'timeout' }))).to.equal(false);
    expect(await recordStimulusCrowdOutcome(stats.collection, createRecord({ action: '[timeout]' }))).to.equal(false);

    expect(stats.calls).to.have.length(0);
  });

  it('fails clearly when a countable model-practice row lacks stimulus identity', async function() {
    const stats = createStatsCollection();

    try {
      await recordStimulusCrowdOutcome(stats.collection, createRecord({ stimulusKC: '' }));
      expect.fail('Expected missing identity to fail');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.contain('stimulusKC');
    }
  });

  it('deduplicates batch read keys without changing their stimulus grain', function() {
    expect(buildStimulusCrowdStatKeys('set-1', ['kc-1', 'kc-1', 'kc-2'])).to.deep.equal([
      'set-1:kc-1',
      'set-1:kc-2',
    ]);
  });

  it('classifies only model blank-event correct or incorrect rows as countable', function() {
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ outcome: 'correct' }))).to.equal(true);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ outcome: 'incorrect' }))).to.equal(true);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ outcome: 'study' }))).to.equal(false);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ eventType: 'h5p' }))).to.equal(false);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ conditionTypeD: 'timeout' }))).to.equal(false);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ source: 'timeout' }))).to.equal(false);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ action: '[timeout]' }))).to.equal(false);
    expect(shouldRecordStimulusCrowdOutcome(createRecord({ conditionTypeD: 'voice', outcome: 'incorrect' }))).to.equal(true);
  });
});
