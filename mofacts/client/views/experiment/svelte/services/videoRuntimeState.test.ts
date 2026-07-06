import { expect } from 'chai';
import {
  getVideoSource,
  resetVideoRuntimeState,
  setVideoSource,
} from './videoRuntimeState';

describe('videoRuntimeState', function() {
  beforeEach(function() {
    resetVideoRuntimeState();
  });

  afterEach(function() {
    resetVideoRuntimeState();
  });

  it('stores and clears the resolved video source', function() {
    expect(getVideoSource()).to.equal(undefined);

    setVideoSource('lesson-video.mp4');
    expect(getVideoSource()).to.equal('lesson-video.mp4');

    resetVideoRuntimeState();
    expect(getVideoSource()).to.equal(undefined);
  });
});
