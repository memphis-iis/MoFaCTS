import { expect } from 'chai';
import {
  getNestedStimulusClustersFromTdfFile,
  getUserDisplayIdentifier,
} from './currentTestingHelpers';

describe('currentTestingHelpers user identity', function() {
  it('prefers username when present', function() {
    const identifier = getUserDisplayIdentifier({
      username: 'student@example.com',
      email_canonical: 'canonical@example.com',
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('student@example.com');
  });

  it('uses canonical email when username is missing', function() {
    const identifier = getUserDisplayIdentifier({
      email_canonical: 'canonical@example.com',
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('canonical@example.com');
  });

  it('uses primary email when username and canonical email are missing', function() {
    const identifier = getUserDisplayIdentifier({
      emails: [{ address: 'primary@example.com' }],
    });

    expect(identifier).to.equal('primary@example.com');
  });

  it('returns empty string when no display identifier exists', function() {
    expect(getUserDisplayIdentifier(null)).to.equal('');
    expect(getUserDisplayIdentifier({})).to.equal('');
  });
});

describe('currentTestingHelpers nested stimulus clusters', function() {
  it('builds runtime clusters from nested setspec clusters when available', function() {
    const clusters = getNestedStimulusClustersFromTdfFile({
      tdfFile: {
        stimuliSetId: 'stim-set-1',
        rawStimuliFile: {
          setspec: {
            clusters: [{
              clusterKC: 'fractions.lcd',
              stims: [{
                display: { clozeText: 'Find the least common denominator.' },
                response: { correctResponse: 'fractions lcd' },
                parameter: '0,0.8',
              }],
            }],
          },
        },
      },
      currentStimuliSetId: 'stim-set-1',
      currentStimuliSet: [{
        stimuliSetId: 'stim-set-1',
        clusterKC: 10000,
        stimulusKC: 10001,
        responseKC: 'response-kc',
        correctResponse: 'legacy answer',
        params: '0,0.7',
      }],
    });

    expect(clusters).to.have.length(1);
    const cluster = clusters?.[0];
    expect(cluster).to.exist;
    expect(cluster?.clusterKC).to.equal('fractions.lcd');
    const stim = cluster?.stims[0];
    expect(stim).to.exist;
    expect(stim).to.deep.include({
      stimuliSetId: 'stim-set-1',
      clusterKC: 'fractions.lcd',
      stimulusKC: 10001,
      responseKC: 'response-kc',
      correctResponse: 'fractions lcd',
      params: '0,0.8',
      clozeStimulus: 'Find the least common denominator.',
    });
  });

  it('generates deterministic item identity when nested stimuli have no legacy flat row', function() {
    const clusters = getNestedStimulusClustersFromTdfFile({
      tdfFile: {
        stimuliSetId: 'stim-set-1',
        rawStimuliFile: {
          setspec: {
            clusters: [{
              clusterKC: 'fractions.lcd',
              stims: [{
                display: { text: 'Determine LCD' },
                response: { correctResponse: 'Determine LCD' },
                parameter: '0,0.8',
              }],
            }],
          },
        },
      },
      currentStimuliSetId: 'stim-set-1',
      currentStimuliSet: [],
    });

    const stim = clusters?.[0]?.stims[0];
    expect(stim).to.exist;
    expect(stim).to.deep.include({
      stimuliSetId: 'stim-set-1',
      clusterKC: 'fractions.lcd',
      stimulusKC: 'stim-set-1:0:0',
      correctResponse: 'Determine LCD',
      textStimulus: 'Determine LCD',
    });
  });

  it('uses the canonical TDF document when currentTdfFile omits raw stimuli', function() {
    const clusters = getNestedStimulusClustersFromTdfFile({
      tdfFile: {
        stimuliSetId: 'stim-set-1',
        fileName: 'Fraction KC Definitions_TDF.json',
        tdfs: { tutor: { setspec: { lessonname: 'Fraction KC Definitions' } } },
      },
      currentTdfDoc: {
        rawStimuliFile: {
          setspec: {
            clusters: [{
              clusterKC: 'fractions.lcd',
              stims: [{
                display: { text: 'Find the least common denominator.' },
                response: { correctResponse: 'lcd' },
                parameter: '0,0.8',
              }],
            }],
          },
        },
      },
      currentStimuliSetId: 'stim-set-1',
      currentStimuliSet: [{
        stimuliSetId: 'stim-set-1',
        clusterKC: 10000,
        stimulusKC: 10001,
        correctResponse: 'legacy numeric answer',
        params: '0,0.7',
      }],
    });

    expect(clusters[0]?.clusterKC).to.equal('fractions.lcd');
    expect(clusters[0]?.stims[0]).to.deep.include({
      clusterKC: 'fractions.lcd',
      stimulusKC: 10001,
      correctResponse: 'lcd',
      textStimulus: 'Find the least common denominator.',
    });
  });

  it('fails clearly instead of falling back to numeric clusterKC when raw clusters are unavailable', function() {
    expect(() => getNestedStimulusClustersFromTdfFile({
      tdfFile: { stimuliSetId: 'stim-set-1' },
      currentTdfId: 'tdf-without-raw-clusters',
      currentStimuliSetId: 'stim-set-1',
      currentStimuliSet: [{
        clusterKC: 10000,
        stimulusKC: 10001,
      }],
    })).to.throw('refusing numeric clusterKC fallback');
  });
});
