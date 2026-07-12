import { expect } from 'chai';
import { stampAndValidateStandardStimuliIdentity } from './contentSurfaceInit';

describe('svelte init stimulus identity preparation', function() {
  it('stamps canonical stimuliSetId onto otherwise valid standard stimuli', function() {
    const result = stampAndValidateStandardStimuliIdentity([
      { stimulusKC: 'stim-a', clusterKC: 'cluster-a' },
      { stimuliSetId: 'set-a', stimulusKC: 'stim-b', clusterKC: 'cluster-b' },
    ], 'set-a');

    expect(result).to.deep.equal([
      { stimuliSetId: 'set-a', stimulusKC: 'stim-a', clusterKC: 'cluster-a' },
      { stimuliSetId: 'set-a', stimulusKC: 'stim-b', clusterKC: 'cluster-b' },
    ]);
  });

  it('rejects standard stimuli when canonical identity cannot be proven before practice', function() {
    expect(() => stampAndValidateStandardStimuliIdentity([
      { stimulusKC: 'stim-a', clusterKC: 'cluster-a' },
    ], null)).to.throw('requires a canonical stimuliSetId');

    expect(() => stampAndValidateStandardStimuliIdentity([
      { stimuliSetId: 'other-set', stimulusKC: 'stim-a', clusterKC: 'cluster-a' },
    ], 'set-a')).to.throw('expected set-a');

    expect(() => stampAndValidateStandardStimuliIdentity([
      { stimuliSetId: 'set-a', clusterKC: 'cluster-a' },
    ], 'set-a')).to.throw('missing stimulusKC');

    expect(() => stampAndValidateStandardStimuliIdentity([
      { stimuliSetId: 'set-a', stimulusKC: 'stim-a' },
    ], 'set-a')).to.throw('missing clusterKC');
  });
});
