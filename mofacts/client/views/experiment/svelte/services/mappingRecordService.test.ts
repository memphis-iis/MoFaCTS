import { expect } from 'chai';
import { Session } from 'meteor/session';
import { createStimClusterMapping } from '../../../../lib/clusterMappingUtils';
import {
  applyMappingRecordToSession,
  loadMappingRecord,
  resolveOriginalClusterIndex,
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
    expect(record!.mappingSignature).to.equal('persisted-sig');
  });

  it('clears stale signature when applying null signature record', function() {
    Session.set('mappingSignature', 'stale-signature');

    applyMappingRecordToSession({
      mappingTable: [0, 1, 2],
      mappingSignature: null,
      createdAt: Date.now(),
    });

    expect(Session.get('clusterMapping')).to.deep.equal([0, 1, 2]);
    expect(Session.get('mappingSignature')).to.equal(null);
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
      mappingSignature: 'msig_v2_test',
      createdAt: Date.now(),
    };

    expect(resolveOriginalClusterIndex(-1, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(4, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(1.5 as number, record)).to.equal(null);
    expect(resolveOriginalClusterIndex(0, record)).to.equal(3);
  });
});
