import { expect } from 'chai';
import { audioManager } from './audioContextManager';

type MockAudioContext = {
  state: 'running' | 'suspended' | 'closed';
  close(): Promise<void>;
};

describe('audioContextManager', function() {
  afterEach(function() {
    audioManager.setContext(null);
    audioManager.setRecorderContext(null);
  });

  it('treats closed recorder contexts as absent', function() {
    const closedContext = {
      state: 'closed',
      close: async () => undefined,
    } as MockAudioContext as unknown as AudioContext;

    audioManager.setRecorderContext(closedContext);

    expect(audioManager.getRecorderContext()).to.equal(null);
  });

  it('recreates recorder context when the cached one is closed', function() {
    const closedContext = {
      state: 'closed',
      close: async () => undefined,
    } as MockAudioContext as unknown as AudioContext;

    const compatWindow = window as any;
    const originalAudioContext = compatWindow.AudioContext;
    const originalWebkitAudioContext = compatWindow.webkitAudioContext;
    let createdCount = 0;

    class FakeAudioContext {
      state: 'running' | 'suspended' | 'closed' = 'running';

      constructor(_config?: AudioContextOptions) {
        createdCount += 1;
      }

      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }

    try {
      compatWindow.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
      delete compatWindow.webkitAudioContext;
      audioManager.setRecorderContext(closedContext);

      const recreated = audioManager.createRecorderContext({ sampleRate: 16000 });

      expect(createdCount).to.equal(1);
      expect(recreated).to.not.equal(closedContext);
      expect(recreated.state).to.equal('running');
    } finally {
      compatWindow.AudioContext = originalAudioContext;
      if (originalWebkitAudioContext) {
        compatWindow.webkitAudioContext = originalWebkitAudioContext;
      } else {
        delete compatWindow.webkitAudioContext;
      }
      audioManager.setRecorderContext(null);
    }
  });
});
