/**
 * Video Player Service
 *
 * Wraps Plyr video player for video session mode.
 * Handles checkpoints, rewinds on incorrect answers, and question overlays.
 *
 * Reference:
 * - client/lib/plyrHelper.js (initializePlyr, playerController, destroyPlyr)
 */

import { initializePlyr, destroyPlyr, playerController } from '../../../../lib/plyrHelper';
import { clientConsole } from '../../../../lib/clientLogger';
import type {
  VideoCheckpoint,
  VideoPlayerLike,
  VideoPlayerServiceContext,
  VideoPlayerServiceEvent,
  VideoPlayerServiceReceive,
  VideoPlayerServiceSend
} from '../../../../../common/types/svelteServices';

/**
 * Video checkpoint types
 */
const CheckpointType = {
  QUESTION: 'question',      // Show question at this time
  CHECKPOINT: 'checkpoint',  // Generic checkpoint
  END: 'end'                 // Video end
} as const;

const initializePlyrCompat = initializePlyr as unknown as (
  engine: unknown
) => Promise<void>;

const destroyPlyrCompat = destroyPlyr as unknown as () => void;

/**
 * Initialize Plyr video player with checkpoints.
 *
 * @param {string} videoSrc - Video file URL
 * @param {Array<VideoCheckpoint>} checkpoints - Array of checkpoint objects
 * @param {(checkpoint: VideoCheckpoint, player: VideoPlayerLike) => void | null} onCheckpoint - Callback when checkpoint reached
 * @returns {VideoPlayerLike} Plyr player instance
 */
async function initializeVideoPlayer(
  videoSrc: string,
  checkpoints: VideoCheckpoint[] = [],
  onCheckpoint: ((checkpoint: VideoCheckpoint, player: VideoPlayerLike) => void) | null = null,
  engine?: unknown,
): Promise<VideoPlayerLike> {
  
  

  if (!engine) {
    throw new Error('Video player initialization requires an explicit current unit engine');
  }

  await initializePlyrCompat(engine);
  const player = playerController?.player as VideoPlayerLike | null | undefined;
  if (!player) {
    throw new Error('Video player initialization did not create a Plyr player');
  }

  // Sort checkpoints by time
  const sortedCheckpoints = [...checkpoints].sort((a, b) => a.time - b.time);
  let lastCheckpointIndex = -1;

  // Set up timeupdate handler for checkpoints
  player.on('timeupdate', () => {
    const currentTime = player.currentTime;

    // Check if we've reached a new checkpoint
    for (let i = lastCheckpointIndex + 1; i < sortedCheckpoints.length; i++) {
      const checkpoint = sortedCheckpoints[i];
      if (!checkpoint) {
        continue;
      }

      // Allow 0.5 second tolerance for checkpoint detection
      if (currentTime >= checkpoint.time && currentTime < checkpoint.time + 0.5) {
        

        // Pause video at checkpoint
        player.pause();

        // Update last checkpoint index
        lastCheckpointIndex = i;

        // Call checkpoint callback
        if (onCheckpoint) {
          onCheckpoint(checkpoint, player);
        }

        break;
      }
    }
  });

  // Video ended
  player.on('ended', () => {
    
    if (onCheckpoint) {
      onCheckpoint({ type: CheckpointType.END, time: player.duration }, player);
    }
  });

  // Video error
  player.on('error', (error: unknown) => {
    clientConsole(1, '[Video] Player error:', error);
  });

  return player;
}

/**
 * Rewind video to specific time.
 * Used when user answers incorrectly and needs to review.
 *
 * @param {VideoPlayerLike | null | undefined} player - Plyr player instance
 * @param {number} time - Time in seconds to rewind to
 * @returns {void}
 */
function rewindTo(player: VideoPlayerLike | null | undefined, time: number): void {
  if (!player) {
    clientConsole(1, '[Video] Cannot rewind - no player');
    return;
  }

  
  player.currentTime = time;
  player.play();
}

/**
 * Resume video playback from current position.
 *
 * @param {VideoPlayerLike | null | undefined} player - Plyr player instance
 * @returns {void}
 */
function resumeVideo(player: VideoPlayerLike | null | undefined): void {
  if (!player) {
    clientConsole(1, '[Video] Cannot resume - no player');
    return;
  }

  
  player.play();
}

/**
 * Pause video playback.
 *
 * @param {VideoPlayerLike | null | undefined} player - Plyr player instance
 * @returns {void}
 */
function pauseVideo(player: VideoPlayerLike | null | undefined): void {
  if (!player) {
    clientConsole(1, '[Video] Cannot pause - no player');
    return;
  }

  
  player.pause();
}

/**
 * Destroy video player and clean up resources.
 *
 * @param {VideoPlayerLike | null | undefined} player - Plyr player instance
 * @returns {void}
 */
function destroyVideoPlayer(player: VideoPlayerLike | null | undefined): void {
  if (!player) return;

  

  // Remove all event listeners
  player.off('timeupdate');
  player.off('ended');
  player.off('error');

  // Destroy Plyr instance
  destroyPlyrCompat();
}

/**
 * Parse video checkpoints from the TDF delivery configuration.
 * Converts checkpoint strings to checkpoint objects.
 *
 * Format: "time:type:data" or "time:question:index"
 * Example: "15.5:question:0" = Question at 15.5 seconds, question index 0
 *
 * @param {Array<string>} checkpointStrings - Array of checkpoint strings
 * @returns {Array<VideoCheckpoint>} Array of checkpoint objects
 */
function parseCheckpoints(checkpointStrings: string[]): VideoCheckpoint[] {
  if (!Array.isArray(checkpointStrings)) {
    return [];
  }

  return checkpointStrings.map((str, index) => {
    const [timeStr = '', typeStr = CheckpointType.CHECKPOINT, dataStr = ''] = str.split(':');

    if (!timeStr || !typeStr) {
      clientConsole(1, '[Video] Invalid checkpoint format:', str);
      return null;
    }

    const time = parseFloat(timeStr);
    const type = typeStr as VideoCheckpoint['type'];
    const data = dataStr || null;

    const checkpoint: VideoCheckpoint = {
      id: `checkpoint-${index}`,
      time,
      type,
      data,
      index
    };
    return checkpoint;
  }).filter((cp): cp is VideoCheckpoint => cp !== null);
}

/**
 * XState service for video player management.
 * Initializes player, handles checkpoints, manages playback.
 *
 * Usage in cardMachine.js:
 * ```
 * invoke: {
 *   src: 'videoPlayerService',
 *   data: {
 *     videoSrc: context.currentDisplay.videoSrc,
 *     checkpoints: context.videoCheckpoints
 *   },
 *   onDone: { actions: 'onVideoComplete' },
 *   onError: { target: 'error', actions: 'onVideoError' }
 * }
 * ```
 */
/**
 * @param {VideoPlayerServiceContext} context
 * @param {VideoPlayerServiceEvent} event
 * @returns {(send: VideoPlayerServiceSend, receive: VideoPlayerServiceReceive) => (() => void)}
 */
export function videoPlayerService(
  context: VideoPlayerServiceContext,
  event: VideoPlayerServiceEvent
): (send: VideoPlayerServiceSend, receive: VideoPlayerServiceReceive) => () => void {
  return (send: VideoPlayerServiceSend, receive: VideoPlayerServiceReceive): (() => void) => {
    let player: VideoPlayerLike | null = null;

    void (async () => {
      try {
        

        const videoSrc = event.videoSrc || context.currentDisplay?.videoSrc;
        const checkpointStrings = event.checkpoints || context.videoCheckpoints || [];

        if (!videoSrc) {
          throw new Error('No video source provided');
        }

        // Parse checkpoints
        const checkpoints = parseCheckpoints(checkpointStrings);

        // Initialize player with checkpoint handler
        player = await initializeVideoPlayer(videoSrc, checkpoints, (checkpoint: VideoCheckpoint) => {

          if (checkpoint.type === CheckpointType.QUESTION) {
            // Send event to show question
            send({
              type: 'QUESTION_CHECKPOINT',
              checkpoint,
              questionIndex: checkpoint.data ? parseInt(checkpoint.data) : 0,
              time: checkpoint.time
            });
          } else if (checkpoint.type === CheckpointType.END) {
            // Video ended
            send({ type: 'VIDEO_ENDED' });
          } else {
            // Generic checkpoint
            send({ type: 'CHECKPOINT_REACHED', checkpoint });
          }
        }, context.engine);

        // Store player reference in context
        send({ type: 'PLAYER_INITIALIZED', player });

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        clientConsole(1, '[Video] Service error:', error);
        send({ type: 'ERROR', source: 'videoPlayer', error: message });
      }
    })();

    // Handle incoming events
    receive((serviceEvent: VideoPlayerServiceEvent) => {
      if (!player) return;

      switch (serviceEvent.type) {
        case 'RESUME_VIDEO':
          resumeVideo(player);
          break;

        case 'PAUSE_VIDEO':
          pauseVideo(player);
          break;

        case 'REWIND_TO_CHECKPOINT': {
          const checkpoint = serviceEvent.checkpoint;
          if (checkpoint && typeof checkpoint.time === 'number') {
            rewindTo(player, checkpoint.time);
          } else {
            clientConsole(1, '[Video] Invalid checkpoint for rewind:', checkpoint);
          }
          break;
        }

        case 'REWIND_TO_TIME':
          if (typeof serviceEvent.time === 'number') {
            rewindTo(player, serviceEvent.time);
          }
          break;

        case 'DESTROY_PLAYER':
          destroyVideoPlayer(player);
          player = null;
          break;

        default:
          break;
      }
    });

    // Cleanup on service stop
    return () => {
      if (player) {
        destroyVideoPlayer(player);
      }
    };
  };
}





