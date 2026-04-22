// AudioContextManager - Phase 4 state management refactor
// Replaces window globals with managed private state
import { clientConsole } from './clientLogger';

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;
type WindowWithWebkitAudioContext = Window & { webkitAudioContext?: AudioContextCtor };

class AudioContextManager {
  #context: AudioContext | null = null;
  #currentAudio: HTMLAudioElement | null = null;
  #recorderContext: AudioContext | null = null;
  #preInitializedStream: MediaStream | null = null;

  #normalizeContext(ctx: AudioContext | null): AudioContext | null {
    if (ctx?.state === 'closed') {
      return null;
    }
    return ctx;
  }

  #getAudioContextCtor(): AudioContextCtor {
    const compatWindow = window as WindowWithWebkitAudioContext;
    const ctor = (globalThis as { AudioContext?: AudioContextCtor }).AudioContext || compatWindow.webkitAudioContext;
    if (!ctor) {
      throw new Error('AudioContext is not supported in this environment');
    }
    return ctor;
  }

  // Main AudioContext (for audio playback)
  getContext(): AudioContext | null {
    this.#context = this.#normalizeContext(this.#context);
    return this.#context;
  }

  setContext(ctx: AudioContext | null): void {
    this.#context = this.#normalizeContext(ctx);
  }

  createContext(): AudioContext {
    this.#context = this.#normalizeContext(this.#context);
    if (!this.#context) {
      const AudioContext = this.#getAudioContextCtor();
      this.#context = new AudioContext();
    }
    return this.#context;
  }

  closeContext(): void {
    if (this.#context && this.#context.state !== 'closed') {
      try {
        void this.#context.close();
      } catch (e) {
        clientConsole(1, '[AudioContextManager] Error closing audio context:', e);
      }
      this.#context = null;
    }
  }

  // Current audio object (for TTS playback)
  getCurrentAudio(): HTMLAudioElement | null {
    return this.#currentAudio;
  }

  setCurrentAudio(audio: HTMLAudioElement | null): void {
    this.pauseCurrentAudio();
    this.#currentAudio = audio;
  }

  pauseCurrentAudio(): void {
    if (this.#currentAudio) {
      try {
        this.#currentAudio.pause();
        if (this.#currentAudio.onended) {
          this.#currentAudio.onended = null;
        }
      } catch (e) {
        clientConsole(1, '[AudioContextManager] Error pausing audio:', e);
      }
      this.#currentAudio = null;
    }
  }

  playCurrentAudio(): Promise<void> {
    if (this.#currentAudio) {
      return this.#currentAudio.play();
    }
    return Promise.reject(new Error('No current audio'));
  }

  clearCurrentAudio(): void {
    if (this.#currentAudio) {
      this.#currentAudio.onended = null;
    }
    this.#currentAudio = null;
  }

  // Recorder context (for speech recognition)
  getRecorderContext(): AudioContext | null {
    this.#recorderContext = this.#normalizeContext(this.#recorderContext);
    return this.#recorderContext;
  }

  setRecorderContext(ctx: AudioContext | null): void {
    this.#recorderContext = this.#normalizeContext(ctx);
  }

  createRecorderContext(config: AudioContextOptions = { sampleRate: 16000 }): AudioContext {
    this.#recorderContext = this.#normalizeContext(this.#recorderContext);
    if (!this.#recorderContext) {
      const AudioContext = this.#getAudioContextCtor();
      this.#recorderContext = new AudioContext(config);
    }
    return this.#recorderContext;
  }

  closeRecorderContext(): void {
    if (this.#recorderContext && this.#recorderContext.state !== 'closed') {
      try {
        void this.#recorderContext.close();
      } catch (e) {
        clientConsole(1, '[AudioContextManager] Error closing recorder context:', e);
      }
      this.#recorderContext = null;
    }
  }

  // Pre-initialized stream (for speech recognition warmup)
  getPreInitializedStream(): MediaStream | null {
    return this.#preInitializedStream;
  }

  setPreInitializedStream(stream: MediaStream | null): void {
    this.#preInitializedStream = stream;
  }

  clearPreInitializedStream(): void {
    if (this.#preInitializedStream) {
      try {
        this.#preInitializedStream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        clientConsole(1, '[AudioContextManager] Error stopping stream tracks:', e);
      }
      this.#preInitializedStream = null;
    }
  }

  // Full cleanup (for session cleanup)
  cleanup(): void {
    this.pauseCurrentAudio();
    this.clearPreInitializedStream();
    this.closeRecorderContext();
    this.closeContext();
  }
}

// Singleton instance
export const audioManager = new AudioContextManager();

