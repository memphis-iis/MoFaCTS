import { clientConsole } from './clientLogger';

type NavigatorWithUserActivation = Navigator & {
  userActivation?: {
    isActive?: boolean;
    hasBeenActive?: boolean;
  };
};

let speechSynthesisUnlocked = false;
let htmlAudioUnlocked = false;
let unlockAttempted = false;

export function isAppleMobileAudioUnlockEnvironment(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0
): boolean {
  const normalizedUserAgent = String(userAgent || '');
  if (/(iPhone|iPad|iPod)/i.test(normalizedUserAgent)) {
    return true;
  }

  return /\bMacintosh\b/i.test(normalizedUserAgent) && Number(maxTouchPoints) > 1;
}

export function hasAppleMobileAudioUnlock(): boolean {
  return speechSynthesisUnlocked || htmlAudioUnlocked;
}

export function resetAppleMobileAudioUnlockForTests(): void {
  speechSynthesisUnlocked = false;
  htmlAudioUnlocked = false;
  unlockAttempted = false;
}

function unlockSpeechSynthesis(): void {
  if (speechSynthesisUnlocked || typeof window === 'undefined' || !window.speechSynthesis) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  utterance.rate = 1;
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
  speechSynthesisUnlocked = true;
}

function unlockHtmlAudio(): void {
  if (htmlAudioUnlocked || typeof Audio === 'undefined') {
    return;
  }

  const audio = new Audio();
  audio.muted = false;
  audio.volume = 1;
  audio.src = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.then === 'function') {
    void playPromise
      .then(() => {
        htmlAudioUnlocked = true;
        audio.pause();
      })
      .catch((error: unknown) => {
        clientConsole(1, '[Audio Unlock] HTML audio unlock failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return;
  }

  htmlAudioUnlocked = true;
}

export function unlockAppleMobileAudioForUserGesture(): void {
  if (!isAppleMobileAudioUnlockEnvironment() || hasAppleMobileAudioUnlock()) {
    return;
  }

  const activation = (navigator as NavigatorWithUserActivation).userActivation;
  unlockAttempted = true;
  clientConsole(2, '[Audio Unlock] Attempting Apple mobile audio unlock', {
    transientActivation: activation?.isActive ?? null,
    stickyActivation: activation?.hasBeenActive ?? null,
  });

  try {
    unlockSpeechSynthesis();
  } catch (error) {
    clientConsole(1, '[Audio Unlock] Speech synthesis unlock failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    unlockHtmlAudio();
  } catch (error) {
    clientConsole(1, '[Audio Unlock] HTML audio unlock threw', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function warnIfAppleMobileAudioMayBeLocked(context: string): void {
  if (!isAppleMobileAudioUnlockEnvironment() || hasAppleMobileAudioUnlock()) {
    return;
  }

  const activation = (navigator as NavigatorWithUserActivation).userActivation;
  clientConsole(1, '[Audio Unlock] Apple mobile audio may be locked before playback', {
    context,
    unlockAttempted,
    transientActivation: activation?.isActive ?? null,
    stickyActivation: activation?.hasBeenActive ?? null,
  });
}
