import { expect } from 'chai';
import { Session } from 'meteor/session';
import { createStimClusterMapping } from '../../../../../../learning-components/content/tdf/clusterMapping';
import {
  applyMappingRecordToSession,
  loadMappingRecord,
  resolveOriginalClusterIndex,
  validateMappingRecord,
} from './mappingRecordService';

describe('mappingRecordService', function() {
  beforeEach(function() {
    Session.set('clusterMapping', '');
    Session.set('mappingSignature', null);
  });

  afterEach(function() {
    Session.set('clusterMapping', '');
    Session.set('mappingSignature', null);
  });

  it('prefers persisted mapping over stale session mapping', function() {
    Session.set('clusterMapping', [9, 8, 7]);
    Session.set('mappingSignature', 'session-sig');

    const record = loadMappingRecord({
      clusterMapping: [0, 1, 2],
      mappingSignature: 'persisted-sig',
    });

    expect(record).to.not.equal(null);
    expect(record!.mappingTable).to.deep.equal([0, 1, 2]);
    expect(record).not.to.have.property('mappingSignature');
  });

  it('reuses a structurally valid mapping with an old stored signature', function() {
    const state = { clusterMapping: [1, 0], mappingSignature: 'old-signature' };
    const record = loadMappingRecord(state);
    expect(validateMappingRecord(record, 2)).to.equal(true);
    applyMappingRecordToSession(record!);
    expect(Session.get('clusterMapping')).to.deep.equal([1, 0]);
    expect(state.mappingSignature).to.equal('old-signature');
  });

  it('does not hide a missing persisted mapping with stale session state', function() {
    Session.set('clusterMapping', [0, 1]);
    expect(loadMappingRecord({ overallStudyHistory: [{}] })).to.equal(null);
  });

  it('rejects duplicate, missing, fractional and out-of-range question references', function() {
    for (const mapping of [[0, 0], [0], [0, 1.5], [0, 2]]) {
      expect(validateMappingRecord({ mappingTable: mapping, createdAt: 0 }, 2)).to.equal(false);
    }
  });

  it('creates an invertible permutation mapping for configured shuffle/swap ranges', function() {
    const mapping = createStimClusterMapping(8, ['2-5'], ['0-1'], []);

    expect(mapping).to.have.length(8);
    const unique = new Set(mapping);
    expect(unique.size).to.equal(8);
    expect([...unique].sort((a, b) => a - b)).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('preserves identity for untouched indexes outside shuffle/swap ranges', function() {
    const mapping = createStimClusterMapping(8, ['2-5'], ['0-1'], []);

    expect(mapping[6]).to.equal(6);
    expect(mapping[7]).to.equal(7);
  });

  it('resolveOriginalClusterIndex returns null for invalid index and mapped value for valid index', function() {
    const record = {
      mappingTable: [3, 0, 2, 1],
      createdAt: Date.now(),
    };

    expect(resolveOriginalClusterIndex(-1, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(4, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(1.5 as number, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(0, record)).to.equal(3);
  });
});
