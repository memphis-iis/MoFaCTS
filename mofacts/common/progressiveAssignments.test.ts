import { expect } from 'chai';
import {
  assignmentMemberTdfIds,
  parseProgressiveClusterList,
  progressiveTdfIneligibilityReasons,
} from './progressiveAssignments';

function eligibleTdf() {
  return {
    _id: 'tdf-1',
    stimuliSetId: 'set-1',
    content: {
      isMultiTdf: false,
      tdfs: {
        tutor: {
          deliverySettings: { practiceseconds: 0 },
          unit: [
            { unitinstructions: '<p>Read this</p>' },
            { unitname: 'Practice', learningsession: { clusterlist: '0-1', maxTrials: 0 }, deliverySettings: { practiceseconds: 0 } },
          ],
        },
      },
    },
    rawStimuliFile: {
      setspec: {
        clusters: [
          { clusterKC: 'cluster-a', stims: [{}] },
          { clusterKC: 'cluster-b', stims: [{}] },
        ],
      },
    },
  };
}

describe('progressive assignment contracts', function() {
  it('parses ordered cluster ranges without duplicates', function() {
    expect(parseProgressiveClusterList('0-2 2 4')).to.deep.equal([0, 1, 2, 4]);
    expect(parseProgressiveClusterList('2-0')).to.deep.equal([]);
  });

  it('accepts an unbounded two-unit instruction and learning lesson', function() {
    expect(progressiveTdfIneligibilityReasons(eligibleTdf())).to.deep.equal([]);
  });

  it('rejects a bounded learning session', function() {
    const tdf = eligibleTdf();
    tdf.content.tdfs.tutor.unit[1]!.learningsession!.maxTrials = 10;
    expect(progressiveTdfIneligibilityReasons(tdf)).to.include('Unit 2 maxTrials must be zero or unset.');
  });

  it('rejects a structurally incompatible lesson', function() {
    const tdf = eligibleTdf();
    tdf.content.tdfs.tutor.unit.push({ learningsession: { clusterlist: '0' }, deliverySettings: {} } as any);
    expect(progressiveTdfIneligibilityReasons(tdf)).to.include('Lesson must contain exactly two units.');
  });

  it('extracts the one ordinary member or all ordered progressive members', function() {
    expect(assignmentMemberTdfIds({ assignmentType: 'lesson', TDFId: 'one' })).to.deep.equal(['one']);
    expect(assignmentMemberTdfIds({ assignmentType: 'progressive', memberTdfIds: ['one', 'two'] })).to.deep.equal(['one', 'two']);
  });
});
