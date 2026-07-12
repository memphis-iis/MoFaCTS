import { expect } from 'chai';
import {
  getContentSurfaceAdapter,
  isSpecializedSurfaceReadyToCommit,
} from './contentSurfaceActivation';

const base = {
  initializedForRender: true,
  sparcContentReady: false,
  videoInstructionVisible: false,
  videoPlayerReady: false,
};

describe('specialized content surface activation', function() {
  it('declares one runtime owner for every surface adapter', function() {
    expect(getContentSurfaceAdapter('flashcard').runtimeOwner).to.equal('shared-machine');
    expect(getContentSurfaceAdapter('assessment').runtimeOwner).to.equal('shared-machine');
    expect(getContentSurfaceAdapter('sparc').runtimeOwner).to.equal('shared-machine');
    expect(getContentSurfaceAdapter('video').runtimeOwner).to.equal('shared-machine');
    expect(getContentSurfaceAdapter('autotutor').runtimeOwner).to.equal('surface');
  });

  it('waits for the shared render initialization boundary', function() {
    expect(isSpecializedSurfaceReadyToCommit({
      ...base,
      initializedForRender: false,
      surface: 'autotutor',
    })).to.equal(false);
  });

  it('commits AutoTutor when its initialized component can render', function() {
    expect(isSpecializedSurfaceReadyToCommit({ ...base, surface: 'autotutor' })).to.equal(true);
  });

  it('waits for authored SPARC content', function() {
    expect(isSpecializedSurfaceReadyToCommit({ ...base, surface: 'sparc' })).to.equal(false);
    expect(isSpecializedSurfaceReadyToCommit({
      ...base,
      surface: 'sparc',
      sparcContentReady: true,
    })).to.equal(true);
  });

  it('waits for either the video player or its visible instruction surface', function() {
    expect(isSpecializedSurfaceReadyToCommit({ ...base, surface: 'video' })).to.equal(false);
    expect(isSpecializedSurfaceReadyToCommit({
      ...base,
      surface: 'video',
      videoPlayerReady: true,
    })).to.equal(true);
    expect(isSpecializedSurfaceReadyToCommit({
      ...base,
      surface: 'video',
      videoInstructionVisible: true,
    })).to.equal(true);
  });

  it('does not bypass flashcard or assessment visible-trial ownership', function() {
    expect(isSpecializedSurfaceReadyToCommit({ ...base, surface: 'flashcard' })).to.equal(false);
    expect(isSpecializedSurfaceReadyToCommit({ ...base, surface: 'assessment' })).to.equal(false);
  });
});
