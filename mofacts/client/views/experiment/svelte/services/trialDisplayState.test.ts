import { expect } from 'chai';
import {
  buildTrialSubset,
  buildTrialSubsetKey,
  cloneDisplay,
  getBaseTrialSubsetKind,
  isOutgoingFreezeState,
  isPreparedAdvanceWaitState,
} from './trialDisplayState';

function stateMatching(paths: string[]) {
  return {
    matches: (path: string) => paths.includes(path),
  };
}

describe('trial display state', function() {
  it('names the active trial subset kind from machine state booleans', function() {
    expect(getBaseTrialSubsetKind({
      isFeedbackState: false,
      isForceCorrecting: true,
      isPrestimulusState: false,
      isQuestionState: true,
      isStudyState: false,
    })).to.equal('forceCorrect');
    expect(getBaseTrialSubsetKind({
      isFeedbackState: false,
      isForceCorrecting: false,
      isPrestimulusState: true,
      isQuestionState: true,
      isStudyState: false,
    })).to.equal('prestimulus');
    expect(getBaseTrialSubsetKind({
      isFeedbackState: false,
      isForceCorrecting: false,
      isPrestimulusState: false,
      isQuestionState: false,
      isStudyState: false,
    })).to.equal('none');
  });

  it('classifies freeze and prepared-advance wait states', function() {
    expect(isOutgoingFreezeState(stateMatching(['transition.logging']))).to.equal(true);
    expect(isOutgoingFreezeState(stateMatching(['presenting.awaiting']))).to.equal(false);
    expect(isPreparedAdvanceWaitState(stateMatching(['feedback']))).to.equal(true);
    expect(isPreparedAdvanceWaitState(stateMatching(['transition.directAdvance']))).to.equal(true);
    expect(isPreparedAdvanceWaitState(stateMatching(['presenting.awaiting']))).to.equal(false);
  });

  it('clones display content and keeps H5P nested state isolated', function() {
    const original = {
      text: 'Question',
      h5p: { packageId: 'pkg-1', nested: { value: 1 } },
      attribution: { creatorName: 'Author' },
    };
    const cloned = cloneDisplay(original);

    expect(cloned).to.deep.equal({
      text: 'Question',
      clozeText: '',
      imgSrc: '',
      videoSrc: '',
      audioSrc: '',
      h5p: { packageId: 'pkg-1', nested: { value: 1 } },
      attribution: {
        creatorName: 'Author',
        sourceName: '',
        sourceUrl: '',
        licenseName: '',
        licenseUrl: '',
      },
    });
    expect(cloned.h5p).to.not.equal(original.h5p);
  });

  it('preserves structured SPARC display payloads during cloning', function() {
    const original = {
      type: 'sparc',
      schema: 'tutorscript-sparc/1.0',
      layout: { zones: [{ id: 'main' }] },
      nodes: [{ id: 'node-1', nodeType: 'atomic', atomType: 'text-input', value: '' }],
      response: { gradingMode: 'node-intent', scoredNodes: ['node-1'], intentByNode: [{ node: 'node-1', expected: '2' }] },
    };

    const cloned = cloneDisplay(original);

    expect(cloned).to.deep.include({
      type: 'sparc',
      schema: 'tutorscript-sparc/1.0',
      text: '',
      clozeText: '',
      imgSrc: '',
      videoSrc: '',
      audioSrc: '',
    });
    expect(cloned.nodes).to.deep.equal(original.nodes);
    expect(cloned.nodes).to.not.equal(original.nodes);
    expect(cloned.response).to.deep.equal(original.response);
  });

  it('builds trial subset visibility flags', function() {
    expect(buildTrialSubset({
      kind: 'study',
      display: { text: 'Study' },
      displayVisible: 1,
      showSkipStudyButton: true,
      questionNumber: '3',
    })).to.deep.include({
      kind: 'study',
      displayVisible: true,
      showOverlay: true,
      showSkipStudyButton: true,
      questionNumber: 3,
    });
    expect(buildTrialSubset({
      kind: 'question',
      showSkipStudyButton: true,
    }).showSkipStudyButton).to.equal(false);
  });

  it('builds a stable trial subset key from display and video identity fields', function() {
    const subset = buildTrialSubset({
      kind: 'question',
      display: {
        text: 'Prompt',
        imgSrc: '/image.png',
        attribution: { sourceName: 'Source' },
      },
    });

    expect(buildTrialSubsetKey({
      context: {
        timestamps: { trialStart: 123 },
        videoSession: { currentCheckpointIndex: 4 },
        engineIndices: { clusterIndex: 5 },
        questionIndex: 6,
      },
      isVideoSession: true,
      subset,
    })).to.equal('123::4::5::6::Prompt:::/image.png::::::Source:::');

    expect(buildTrialSubsetKey({
      context: {},
      isVideoSession: false,
      subset: buildTrialSubset({ kind: 'none' }),
    })).to.equal('none');
  });
});
