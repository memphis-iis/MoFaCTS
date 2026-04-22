/**
 * Navigation Cleanup Service
 * Performs comprehensive cleanup before navigating away from card screen
 */

import { Session } from 'meteor/session';
import { meteorCallAsync } from '../../../../index';
import { sessionCleanUp } from '../../../../lib/sessionUtils';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { clientConsole } from '../../../../lib/clientLogger';
import { audioManager } from '../../../../lib/audioContextManager';
import { stopStimDisplayTypeMapVersionSync } from '../../../../lib/stimDisplayTypeMapSync';
import { destroyPlyr } from '../../../../lib/plyrHelper';
import { cleanupAudioRecorder } from './speechRecognitionService';
import { completeCleanup } from '../utils/lifecycleCleanup';
import type { UpdateDashboardCacheResult } from '../../../../../server/methods/dashboardCacheMethods.contracts';
import type { NavigationDestination } from '../../../../../common/types/svelteServices';

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { go(path: string): void };
};

let isNavigatingAway = false;

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

  try {
    cleanupAudioRecorder();

    // Full cleanup when leaving practice (not /card or /instructions)
    if (dest !== '/card' && dest !== '/instructions' && document.location.pathname !== '/instructions') {
      // Capture TDF ID before sessionCleanUp clears it
      const currentTdfId = Session.get('currentTdfId');

      // Clear experiment state
      ExperimentStateStore.clear();

      // Session state cleanup (clears 50+ session variables)
      sessionCleanUp();

      // **CRITICAL**: Update dashboard cache with latest performance data
      if (currentTdfId && (dest === '/home' || dest === '/profile')) {
        try {
          const _updateResult = await meteorCallAsync<UpdateDashboardCacheResult>('updateDashboardCacheForTdf', currentTdfId);
        } catch (err) {
          clientConsole(1, '[Navigation] Dashboard cache update failed:', err);
          // Continue navigation even if cache update fails
        }
      }
    }

    // Universal cleanup (all destinations)

    // Stop Google TTS audio
    if (audioManager.getCurrentAudio()) {
      audioManager.pauseCurrentAudio();
    }

    // Cancel browser TTS
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Destroy Plyr video player
    try {
      await destroyPlyr();
    } catch (err) {
      clientConsole(1, '[Navigation] destroyPlyr failed:', err);
    }

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
