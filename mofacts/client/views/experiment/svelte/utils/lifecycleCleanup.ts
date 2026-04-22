/**
 * Lifecycle Cleanup Utilities
 *
 * Provides cleanup functions for the Svelte card screen when unmounting or navigating away.
 * Ensures proper resource cleanup to prevent memory leaks and unexpected behavior.
 */
import { clientConsole } from '../../../../lib/clientLogger';
import { cleanupAudioRecorder } from '../services/speechRecognitionService';

/**
 * Stop all active timers
 * @param {Object} timerHandles - Object containing timer IDs (setTimeout/setInterval)
 */
type CleanupWindow = Window & {
  speechRecognition?: { stop(): void } | null;
  currentMediaStream?: MediaStream | null;
  _imageBlobUrls?: string[];
};

type TimerHandles = Record<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null | undefined>;
type SubscriptionLike = { stop(): void };
type ComputationLike = { stop(): void };
type PlyrLike = { destroy(): void };

function stopAllTimers(timerHandles: TimerHandles = {}): void {
  if (!timerHandles || typeof timerHandles !== 'object') {
    return;
  }

  Object.keys(timerHandles).forEach((key) => {
    const handle = timerHandles[key];
    if (handle) {
      clearTimeout(handle);
      clearInterval(handle);
    }
  });

  
}

/**
 * Cancel speech recognition
 * Stops the active SR session and cleans up audio resources
 */
function cancelSpeechRecognition(): void {
  const compatWindow = window as CleanupWindow;
  // Stop active SR session
  if (compatWindow.speechRecognition) {
    try {
      compatWindow.speechRecognition.stop();
      compatWindow.speechRecognition = null;
    } catch (e) {
      clientConsole(1, '[Cleanup] Error stopping speech recognition:', e);
    }
  }

  // Stop active media streams
  if (compatWindow.currentMediaStream) {
    try {
      compatWindow.currentMediaStream.getTracks().forEach((track) => track.stop());
      compatWindow.currentMediaStream = null;
    } catch (e) {
      clientConsole(1, '[Cleanup] Error stopping media stream:', e);
    }
  }

  try {
    cleanupAudioRecorder();
  } catch (e) {
    clientConsole(1, '[Cleanup] Error releasing speech recognition resources:', e);
  }

  
}

/**
 * Stop text-to-speech playback
 * Cancels active TTS and clears the speech synthesis queue
 */
function stopTTS(): void {
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      clientConsole(1, '[Cleanup] Error stopping TTS:', e);
    }
  }

  
}

/**
 * Dispose Plyr instance
 * @param {Object} plyrInstance - Plyr player instance
 */
function disposePlyr(plyrInstance: PlyrLike | null | undefined): void {
  if (plyrInstance && typeof plyrInstance.destroy === 'function') {
    try {
      plyrInstance.destroy();
    } catch (e) {
      clientConsole(1, '[Cleanup] Error destroying Plyr:', e);
    }
  }

  
}

/**
 * Unsubscribe from Meteor subscriptions
 * @param {Array} subscriptions - Array of Meteor subscription handles
 */
function unsubscribeMeteorSubscriptions(subscriptions: SubscriptionLike[] = []): void {
  if (!Array.isArray(subscriptions)) {
    clientConsole(1, '[Cleanup] subscriptions must be an array');
    return;
  }

  subscriptions.forEach((sub) => {
    if (sub && typeof sub.stop === 'function') {
      try {
        sub.stop();
      } catch (e) {
        clientConsole(1, '[Cleanup] Error stopping subscription:', e);
      }
    }
  });

  
}

/**
 * Clear image cache
 * Removes prefetched images from memory
 */
function clearImageCache(): void {
  const compatWindow = window as CleanupWindow;
  // Clear cached images in session storage
  if (window.sessionStorage) {
    try {
      const keys = Object.keys(window.sessionStorage);
      keys.forEach(key => {
        if (key.startsWith('imageCache_')) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      clientConsole(1, '[Cleanup] Error clearing image cache:', e);
    }
  }

  // Clear image blob URLs
  if (compatWindow._imageBlobUrls && Array.isArray(compatWindow._imageBlobUrls)) {
    compatWindow._imageBlobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        clientConsole(1, '[Cleanup] Error revoking blob URL:', e);
      }
    });
    compatWindow._imageBlobUrls = [];
  }

  
}

/**
 * Stop Tracker computations
 * @param {Array} computations - Array of Tracker.Computation instances
 */
function stopTrackerComputations(computations: ComputationLike[] = []): void {
  if (!Array.isArray(computations)) {
    clientConsole(1, '[Cleanup] computations must be an array');
    return;
  }

  computations.forEach((comp) => {
    if (comp && typeof comp.stop === 'function') {
      try {
        comp.stop();
      } catch (e) {
        clientConsole(1, '[Cleanup] Error stopping computation:', e);
      }
    }
  });

  
}

/**
 * Complete cleanup - stops all resources
 * @param {Object} resources - Object containing all resources to clean up
 * @param {Object} resources.timers - Timer handles
 * @param {Object} resources.plyr - Plyr instance
 * @param {Array} resources.subscriptions - Meteor subscriptions
 * @param {Array} resources.computations - Tracker computations
 * @param {Boolean} resources.stopSR - Whether to stop speech recognition
 * @param {Boolean} resources.stopTTS - Whether to stop TTS
 */
export function completeCleanup(resources: {
  timers?: TimerHandles;
  plyr?: PlyrLike | null;
  subscriptions?: SubscriptionLike[];
  computations?: ComputationLike[];
  stopSR?: boolean;
  stopTTS?: boolean;
} = {}): void {
  

  const {
    timers,
    plyr,
    subscriptions,
    computations,
    stopSR = true,
    stopTTS: shouldStopTTS = true
  } = resources;

  // Stop all timers
  if (timers) {
    stopAllTimers(timers);
  }

  // Stop SR
  if (stopSR) {
    cancelSpeechRecognition();
  }

  // Stop TTS
  if (shouldStopTTS) {
    stopTTS();
  }

  // Dispose Plyr
  if (plyr) {
    disposePlyr(plyr);
  }

  // Unsubscribe from Meteor subscriptions
  if (subscriptions) {
    unsubscribeMeteorSubscriptions(subscriptions);
  }

  // Stop Tracker computations
  if (computations) {
    stopTrackerComputations(computations);
  }

  // Clear image cache
  clearImageCache();

  
}

