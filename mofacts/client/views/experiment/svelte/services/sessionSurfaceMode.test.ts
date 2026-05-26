import { expect } from 'chai';
import { resolveSessionSurfaceState } from './sessionSurfaceMode';

describe('session surface mode', function() {
  it('uses the standard card surface when no specialized session is active', function() {
    expect(resolveSessionSurfaceState({})).to.deep.equal({
      isAutoTutorSession: false,
      isVideoSession: false,
      mode: 'card',
    });
  });

  it('detects video sessions from delivery settings, Session state, or unit content', function() {
    expect(resolveSessionSurfaceState({ deliverySettings: { isVideoSession: true } }).mode).to.equal('video');
    expect(resolveSessionSurfaceState({ sessionIsVideoSession: true }).isVideoSession).to.equal(true);
    expect(resolveSessionSurfaceState({ currentTdfUnit: { videosession: {} } }).mode).to.equal('video');
  });

  it('detects AutoTutor sessions and preserves their priority over video rendering', function() {
    expect(resolveSessionSurfaceState({ sessionUnitType: 'autotutor' })).to.deep.equal({
      isAutoTutorSession: true,
      isVideoSession: false,
      mode: 'autotutor',
    });
    expect(resolveSessionSurfaceState({
      currentTdfUnit: {
        autotutorsession: {},
        videosession: {},
      },
    })).to.deep.equal({
      isAutoTutorSession: true,
      isVideoSession: true,
      mode: 'autotutor',
    });
  });
});
