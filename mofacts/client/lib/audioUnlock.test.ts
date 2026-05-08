import { expect } from 'chai';
import {
  getUnlockedAppleMobileAudioElement,
  hasAppleMobileAudioUnlock,
  isAppleMobileAudioUnlockEnvironment,
  resetAppleMobileAudioUnlockForTests,
  unlockAppleMobileAudioForUserGesture,
} from './audioUnlock';

describe('audioUnlock', function() {
  const originalUserAgent = navigator.userAgent;
  const originalMaxTouchPoints = navigator.maxTouchPoints;
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
  const originalAudio = window.Audio;

  function setNavigatorForTest(userAgent: string, maxTouchPoints: number): void {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: userAgent,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: maxTouchPoints,
    });
  }

  beforeEach(function() {
    resetAppleMobileAudioUnlockForTests();
  });

  afterEach(function() {
    resetAppleMobileAudioUnlockForTests();
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: originalSpeechSynthesis,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: originalSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: originalAudio,
    });
  });

  it('targets iPhone and iPad-style Safari environments', function() {
    expect(isAppleMobileAudioUnlockEnvironment(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5
    )).to.equal(true);

    expect(isAppleMobileAudioUnlockEnvironment(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      5
    )).to.equal(true);
  });

  it('does not target Android Chrome', function() {
    expect(isAppleMobileAudioUnlockEnvironment(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      5
    )).to.equal(false);
  });

  it('does not try to unlock outside Apple mobile environments', function() {
    let speakCount = 0;
    setNavigatorForTest(
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
      5
    );
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => { speakCount += 1; } },
    });

    unlockAppleMobileAudioForUserGesture();

    expect(speakCount).to.equal(0);
    expect(hasAppleMobileAudioUnlock()).to.equal(false);
  });

  it('primes speech synthesis only once for Apple mobile environments', function() {
    let speakCount = 0;
    setNavigatorForTest(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5
    );
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class MockSpeechSynthesisUtterance {
        text: string;
        volume = 1;
        rate = 1;
        lang = '';

        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => { speakCount += 1; } },
    });
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: class MockAudio {
        muted = false;
        volume = 1;
        src = '';
        play() { return Promise.resolve(); }
        pause() {}
        removeAttribute(_name: string) {}
        load() {}
      },
    });

    unlockAppleMobileAudioForUserGesture();
    unlockAppleMobileAudioForUserGesture();

    expect(speakCount).to.equal(1);
    expect(hasAppleMobileAudioUnlock()).to.equal(true);
  });

  it('keeps the unlocked HTML audio element available for later Google TTS playback', async function() {
    setNavigatorForTest(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5
    );
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class MockSpeechSynthesisUtterance {
        text: string;
        volume = 1;
        rate = 1;
        lang = '';

        constructor(text: string) {
          this.text = text;
        }
      },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => {} },
    });

    let createdAudio: HTMLAudioElement | null = null;
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: class MockAudio {
        muted = false;
        volume = 1;
        src = '';

        constructor() {
          createdAudio = this as unknown as HTMLAudioElement;
        }

        play() { return Promise.resolve(); }
        pause() {}
        removeAttribute(_name: string) {}
        load() {}
      },
    });

    unlockAppleMobileAudioForUserGesture();
    await Promise.resolve();

    expect(getUnlockedAppleMobileAudioElement()).to.equal(createdAudio);
    const audio = createdAudio as HTMLAudioElement | null;
    expect(audio).to.not.equal(null);
    expect(audio?.muted).to.equal(false);
    expect(audio?.volume).to.equal(1);
  });
});
