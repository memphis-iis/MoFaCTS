import assert from 'node:assert/strict';
import {
  resolveLearningSessionProbabilitySource,
  resolveLearningSessionRuntimeConfig,
  resolveLearningSessionUnitMode,
} from './learningSessionRuntimeConfig';

describe('learning session runtime config', function() {
  it('prefers learning-session config and falls back to video-session config', function() {
    const learningSession = { unitMode: 'learning-mode' };
    const videoSession = { unitMode: 'video-mode' };

    assert.equal(resolveLearningSessionRuntimeConfig({
      learningsession: learningSession,
      videosession: videoSession,
    }), learningSession);
    assert.equal(resolveLearningSessionRuntimeConfig({
      videosession: videoSession,
    }), videoSession);
    assert.equal(resolveLearningSessionRuntimeConfig({}), null);
  });

  it('resolves unit mode with default and trimming behavior', function() {
    assert.equal(resolveLearningSessionUnitMode({ learningsession: { unitMode: '  drill  ' } }), 'drill');
    assert.equal(resolveLearningSessionUnitMode({ videosession: { unitMode: ' video ' } }), 'video');
    assert.equal(resolveLearningSessionUnitMode({ learningsession: { unitMode: '   ' } }), 'default');
    assert.equal(resolveLearningSessionUnitMode({}), 'default');
  });

  it('resolves probability source from the selected session config', function() {
    assert.equal(resolveLearningSessionProbabilitySource({
      learningsession: { calculateProbability: ' return p; ' },
      videosession: { calculateProbability: ' return pFunc; ' },
    }), 'return p;');
    assert.equal(resolveLearningSessionProbabilitySource({
      videosession: { calculateProbability: ' return pFunc; ' },
    }), 'return pFunc;');
    assert.equal(resolveLearningSessionProbabilitySource({
      videosession: { calculateProbability: '   ' },
    }), undefined);
  });
});
