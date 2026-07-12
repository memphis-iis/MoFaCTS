/**
 * Navigation Cleanup Service
 * Performs comprehensive cleanup before navigating away from card screen
 */

import { sessionCleanUp } from '../../../../lib/sessionUtils';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { clientConsole } from '../../../../lib/clientLogger';
import { stopStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
import { cleanupAudioRecorder } from './speechRecognitionService';
import { stopTtsPlayback } from './ttsService';
import { completeCleanup } from '../utils/lifecycleCleanup';
import type { NavigationDestination } from '../../../../../common/types/svelteServices';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

let isNavigatingAway = false;

function stopCardAudioNow(): void {
  try {
    stopTtsPlayback('navigation');
  } catch (err) {
    clientConsole(1, '[Navigation] Error stopping active audio:', err);
  }
}

/**
 * Perform comprehensive cleanup and navigate to destination.
 */
export async function leavePage(dest: NavigationDestination): Promise<void> {
  // Prevent duplicate navigation
  if (isNavigatingAway) {
    return;
  }
  isNavigatingAway = true;
  stopStimDisplayTypeMapVersionSync('svelte leavePage');
  stopCardAudioNow();

  try {
    cleanupAudioRecorder();

    // Full cleanup when leaving the learner flow (not /content or /instructions).
    if (dest !== '/content' && dest !== '/instructions' && document.location.pathname !== '/instructions') {
      // Clear experiment state
      ExperimentStateStore.clear();

      // Session state cleanup (clears 50+ session variables)
      sessionCleanUp();

    }

    // Universal cleanup (all destinations)
    stopCardAudioNow();

    // Complete lifecycle cleanup (timers, trackers, etc.)
    await completeCleanup();
  } catch (error) {
    clientConsole(1, '[Navigation] Cleanup error (continuing navigation):', error);
  } finally {
    // Navigate regardless of cleanup success
    FlowRouter.go(dest);

    // Reset flag after navigation completes
    setTimeout(() => {
      isNavigatingAway = false;
    }, 1000);
  }
}
