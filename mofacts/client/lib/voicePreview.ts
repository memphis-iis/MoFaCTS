const PREVIEW_VOICES = new Set('ABCDEFGHIJ'.split('').map(letter => `en-US-Standard-${letter}`));

type PreviewAudio = Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime' | 'onerror'>;

/** Owns only the free documentation sample, never a synthesis request. */
export function createVoicePreview(
  onFailure: (error: unknown) => void,
  makeAudio: (url: string) => PreviewAudio = url => new Audio(url),
) {
  let audio: PreviewAudio | null = null;
  let destroyed = false;
  function stop() {
    const previous = audio;
    audio = null;
    if (previous) {
      previous.onerror = null;
      previous.pause();
      previous.currentTime = 0;
    }
  }
  return {
    play(voice: string) {
      if (destroyed) return;
      stop();
      if (!PREVIEW_VOICES.has(voice)) {
        onFailure(new Error('Unsupported preview voice.'));
        return;
      }
      try {
        const next = makeAudio(`https://docs.cloud.google.com/text-to-speech/docs/audio/${voice}.wav`);
        audio = next;
        const fail = (error: unknown) => {
          if (audio !== next || destroyed) return;
          stop();
          onFailure(error);
        };
        next.onerror = () => fail(new Error('Voice sample playback failed.'));
        void next.play().catch(fail);
      } catch (error) {
        stop();
        onFailure(error);
      }
    },
    stop,
    destroy() { destroyed = true; stop(); },
  };
}
