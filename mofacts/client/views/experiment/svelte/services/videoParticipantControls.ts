export interface VideoParticipantPolicy {
  preventPause: boolean;
  preventRewind: boolean;
  preventScrubbing: boolean;
}

export interface ControlledVideoPlayer {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  play: () => unknown;
  pause: () => void;
}

interface VideoParticipantControlsOptions {
  getPlayer: () => ControlledVideoPlayer | null;
  getPolicy: () => VideoParticipantPolicy;
  isPlayBlocked: () => boolean;
  onSeekBlocked: () => void;
  onPlayRejected: (error: unknown) => void;
}

const REWIND_TOLERANCE_SECONDS = 0.1;
const FORWARD_TOLERANCE_SECONDS = 1;

/** Owns participant restrictions; checkpoint decisions remain with the video runtime. */
export function createVideoParticipantControls(options: VideoParticipantControlsOptions) {
  let disposed = false;
  let systemPaused = false;
  let expectedPlayback = false;
  let recoveryAttempted = false;
  let acceptedTime = 0;
  let furthestTime = 0;
  let pendingSeek: { target: number; origin: number } | null = null;

  function isEnded(player: ControlledVideoPlayer): boolean {
    return player.ended || (player.duration > 0 && player.currentTime >= player.duration);
  }

  function canParticipantPlay(): boolean {
    return !disposed && !systemPaused && !options.isPlayBlocked();
  }

  function pauseSystem() {
    systemPaused = true;
    expectedPlayback = false;
    const player = options.getPlayer();
    if (player && !player.paused) player.pause();
  }

  async function playSystem(): Promise<void> {
    if (disposed) return;
    if (options.isPlayBlocked()) throw new Error('Video playback is blocked by instructions or a question.');
    const player = options.getPlayer();
    if (!player) return;
    systemPaused = false;
    recoveryAttempted = false;
    expectedPlayback = true;
    try {
      await player.play();
    } catch (error) {
      if (!disposed) expectedPlayback = false;
      throw error;
    }
  }

  function handlePlay(): boolean {
    const player = options.getPlayer();
    if (!player || !canParticipantPlay()) {
      if (player && !player.paused) player.pause();
      return false;
    }
    expectedPlayback = true;
    return true;
  }

  function handlePause() {
    const player = options.getPlayer();
    if (!player || !options.getPolicy().preventPause || !expectedPlayback ||
        !canParticipantPlay() || isEnded(player) || recoveryAttempted) return;
    // One attempt per interruption. Only advancing playback (or an explicit Play)
    // re-arms recovery, never a sequence of synthetic play/pause events.
    recoveryAttempted = true;
    try {
      Promise.resolve(player.play()).catch(error => {
        if (!disposed) {
          expectedPlayback = false;
          options.onPlayRejected(error);
        }
      });
    } catch (error) {
      expectedPlayback = false;
      options.onPlayRejected(error);
    }
  }

  function seekSystem(target: number) {
    const player = options.getPlayer();
    if (disposed || !player || !Number.isFinite(target)) return;
    const bounded = Math.max(0, player.duration > 0 ? Math.min(target, player.duration) : target);
    if (Math.abs(player.currentTime - bounded) <= REWIND_TOLERANCE_SECONDS) {
      acceptedTime = bounded;
      furthestTime = Math.max(furthestTime, bounded);
      pendingSeek = null;
      return;
    }
    // Retain authorization until the asynchronous seek completes. A transient
    // Boolean around currentTime assignment cannot cover browser/provider events.
    pendingSeek = { target: bounded, origin: player.currentTime };
    player.currentTime = bounded;
  }

  /** Returns true while movement is rejected or an authorized seek is pending. */
  function checkPosition(event: 'timeupdate' | 'seeking' | 'seeked' | 'provider-observation'): boolean {
    const player = options.getPlayer();
    if (disposed || !player || !Number.isFinite(player.currentTime)) return true;
    const time = player.currentTime;
    if (pendingSeek) {
      const reachedTarget = Math.abs(time - pendingSeek.target) <= REWIND_TOLERANCE_SECONDS;
      const playingPastTarget = event === 'provider-observation' && !player.paused &&
        time >= pendingSeek.target && time <= pendingSeek.target + FORWARD_TOLERANCE_SECONDS;
      if (reachedTarget || playingPastTarget) {
        if (event === 'seeked' || event === 'provider-observation') {
          acceptedTime = time;
          furthestTime = Math.max(furthestTime, time);
          pendingSeek = null;
          return false;
        }
      } else if (event === 'seeking' && Math.abs(time - pendingSeek.origin) <= REWIND_TOLERANCE_SECONDS) {
        // Plyr's YouTube adapter emits seeking synchronously, before seekTo
        // changes currentTime. That origin event is not a competing seek.
        return true;
      } else if (event === 'seeking' || event === 'seeked') {
        // A different destination is not covered by the authorized system seek.
        const target = pendingSeek.target;
        pendingSeek.origin = time;
        options.onSeekBlocked();
        player.currentTime = target;
      }
      return true;
    }
    const policy = options.getPolicy();
    let correction: number | null = null;
    if (policy.preventRewind && time < acceptedTime - REWIND_TOLERANCE_SECONDS) {
      correction = acceptedTime;
    } else if (policy.preventScrubbing && time > furthestTime + FORWARD_TOLERANCE_SECONDS) {
      correction = furthestTime;
    }
    if (correction !== null) {
      options.onSeekBlocked();
      seekSystem(correction);
      return true;
    }
    // Do not ratchet backward on sub-tolerance changes. Authorized system seeks
    // explicitly reset this reference, including instructional rewinds.
    if (event !== 'seeking') {
      if (!player.paused && time > acceptedTime) recoveryAttempted = false;
      acceptedTime = policy.preventRewind ? Math.max(acceptedTime, time) : time;
      furthestTime = Math.max(furthestTime, time);
    }
    return false;
  }

  return {
    canParticipantPlay,
    pauseSystem,
    playSystem,
    handlePlay,
    handlePause,
    seekSystem,
    checkPosition,
    hasPendingSeek: () => pendingSeek !== null,
    getAcceptedTime: () => acceptedTime,
    handleEnded() { expectedPlayback = false; recoveryAttempted = true; },
    dispose() { disposed = true; expectedPlayback = false; pendingSeek = null; },
  };
}
