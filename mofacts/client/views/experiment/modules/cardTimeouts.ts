/**
 * cardTimeouts.js - Timeout and Interval Management Module
 *
 * Extracted from card.js as part of C1 refactoring (Phase 1)
 *
 * This module provides centralized timeout/interval management for the card template,
 * including:
 * - Timeout registry for debugging and cleanup
 * - Main card timeout coordination
 * - Display timeout management
 * - Review/feedback timeout calculation
 *
 * Dependencies: Minimal - Session plus CardStore/UiSettingsStore facades
 *
 * @module cardTimeouts
 */

import { Session } from 'meteor/session';
import { Meteor } from 'meteor/meteor';
import { secsIntervalString } from '../../../../common/globalHelpers';
import { clientConsole } from '../../../index';
import { CardStore } from './cardStore';

import { legacyTrim } from '../../../../common/underscoreCompat';

// ============================================================================
// Module Variables
// ============================================================================

// Centralized Timeout Registry - tracks all active timeouts/intervals for debugging
// Maps timeout name → {id, type, delay, created, description}
type TimeoutEntry = {
  id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
  type: 'timeout' | 'interval';
  delay: number;
  created: number;
  description: string;
};
const activeTimeouts = new Map<string, TimeoutEntry>();

// Main card timeout state (shared across functions)
// NOTE: simTimeoutName kept in card.js (used by checkSimulation which will move to cardUtils in Phase 3)
let currentTimeoutFunc: (() => void) | null = null;
let currentTimeoutDelay: number | null = null;
let countdownInterval: number | null = null;

type TimeoutDebugWindow = Window & {
  listActiveTimeouts?: () => Array<Record<string, unknown>>;
  clearAllRegisteredTimeouts?: () => void;
};

// ============================================================================
// Timeout Registry Functions
// ============================================================================

/**
 * Clear all registered timeouts/intervals (useful for cleanup)
 */
function clearAllRegisteredTimeouts(): void {
  for (const [_name, entry] of activeTimeouts) {
    if (entry.type === 'timeout') {
      clearTimeout(entry.id);
    } else {
      clearInterval(entry.id);
    }
  }
  activeTimeouts.clear();
  clientConsole(2, '[TIMEOUT] Cleared all registered timeouts');
}

/**
 * Debug helper - list all active timeouts
 * @returns {Array} List of active timeout info objects
 */
function listActiveTimeouts(): Array<Record<string, unknown>> {
  if (activeTimeouts.size === 0) {
    clientConsole(2, '[TIMEOUT] No active timeouts');
    return [];
  }

  const now = Date.now();
  const list = [];
  for (const [name, entry] of activeTimeouts) {
    const elapsed = now - entry.created;
    list.push({
      name,
      type: entry.type,
      delay: entry.delay,
      elapsed,
      remaining: entry.type === 'timeout' ? Math.max(0, entry.delay - elapsed) : 'N/A',
      description: entry.description
    });
  }

  clientConsole(2, '[TIMEOUT] Active timeouts', list);
  return list;
}

// Expose debug helpers to window for console access
if (Meteor.isDevelopment) {
  const timeoutDebugWindow = window as TimeoutDebugWindow;
  timeoutDebugWindow.listActiveTimeouts = listActiveTimeouts;
  timeoutDebugWindow.clearAllRegisteredTimeouts = clearAllRegisteredTimeouts;
}

// ============================================================================
// Timing Helper Functions
// ============================================================================

/**
 * Return elapsed seconds since unit started
 * Note: Technically seconds since unit RESUME began (when we set currentUnitStartTime)
 * @returns {number} Elapsed seconds
 */
function elapsedSecs(): number {
  const currentUnitStartTime = Number(Session.get('currentUnitStartTime') ?? Date.now());
  return (Date.now() - currentUnitStartTime) / 1000.0;
}

/**
 * Get min and max display timeouts from current TDF unit
 * These determine potential messages, continue button functionality, and auto-advance
 * @returns {{minSecs: number, maxSecs: number}}
 */
function getDisplayTimeouts(): { minSecs: number; maxSecs: number } {
  const curUnit = Session.get('currentTdfUnit') as { learningsession?: { displayminseconds?: unknown; displaymaxseconds?: unknown } } | null;
  // Safely handle undefined curUnit or learningsession
  const session = (curUnit && curUnit.learningsession) || null;
  return {
    'minSecs': parseInt(String((session ? session.displayminseconds : 0) || 0), 10),
    'maxSecs': parseInt(String((session ? session.displaymaxseconds : 0) || 0), 10),
  };
}

/**
 * Set display timeout message text
 * @param {string} txt - Message to display
 */
function setDispTimeoutText(txt: string): void {
  let msg = legacyTrim(txt || '');
  if (msg.length > 0) {
    msg = ' (' + msg + ')';
  }
  $('#displayTimeoutMsg').text(msg);
}

// ============================================================================
// Card Timeout Management Functions
// ============================================================================

/**
 * Clear all card-related timeouts and intervals
 * This should be called before routing to other templates to prevent
 * timeouts from firing repeatedly
 *
 * NOTE: simTimeoutName (used by checkSimulation) is NOT cleared here - it stays in card.js
 * and will be cleared there when needed. It will move to cardUtils in Phase 3.
 *
 */
export function clearCardTimeout(): void {
  const safeClear = function<T>(clearFunc: (id: T) => void, clearParm: T | null | undefined) {
    try {
      if (clearParm) {
        clearFunc(clearParm);
      }
    } catch (e) {
      clientConsole(1, 'Error clearing meteor timeout/interval', e);
    }
  };
  safeClear(Meteor.clearTimeout, CardStore.getActiveTimeoutHandle());
  // NOTE: simTimeoutName NOT cleared here - stays in card.js for now
  safeClear(Meteor.clearInterval, CardStore.getVarLenTimeoutName());
  safeClear(Meteor.clearInterval, countdownInterval);
  CardStore.clearActiveTimeoutHandle();
  currentTimeoutFunc = null;
  currentTimeoutDelay = null;
  countdownInterval = null;
  CardStore.setVarLenTimeoutName(null);
}

/**
 * Restart main card timeout if necessary after pause/modal
 * TODO: there is a minor bug here related to not being able to truly pause on
 * re-entering a tdf for the first trial
 */
export function restartMainCardTimeoutIfNecessary(): void {
  clientConsole(2, 'restartMainCardTimeoutIfNecessary');
  const mainCardTimeoutStart = CardStore.getMainCardTimeoutStart();
  if (!mainCardTimeoutStart) {
    CardStore.decrementPausedLocks();
    return;
  }
  const errorReportStart = Session.get('errorReportStart');
  Session.set('errorReportStart', null);
  const startMs = mainCardTimeoutStart instanceof Date ? mainCardTimeoutStart.getTime() : Number(mainCardTimeoutStart);
  const errorStartMs = errorReportStart instanceof Date ? errorReportStart.getTime() : Number(errorReportStart ?? Date.now());
  const usedDelayTime = errorStartMs - startMs;
  const remainingDelay = Number(currentTimeoutDelay ?? 0) - usedDelayTime;
  currentTimeoutDelay = remainingDelay;
  const rightNow = new Date();
  CardStore.setMainCardTimeoutStart(rightNow);
  function wrappedTimeout() {
    CardStore.decrementPausedLocks();
    const numRemainingLocks = Number(CardStore.getPausedLocks() ?? 0);
    if (numRemainingLocks <= 0) {
      const func = currentTimeoutFunc;
      if (func) func();
    } else {
      clientConsole(2, 'timeout reached but there are', numRemainingLocks, 'locks outstanding');
    }
  }
  CardStore.setActiveTimeoutHandle(Meteor.setTimeout(wrappedTimeout, remainingDelay));
  CardStore.setVarLenTimeoutName(Meteor.setInterval(() => varLenDisplayTimeout(), 400));
}

/**
 * Variable-length display timeout handler
 * Manages continue button state and display timeout messages based on min/max display times
 * @param {function} onUnitFinished - Callback when max display time exceeded (optional)
 */
function varLenDisplayTimeout(onUnitFinished: ((reason: string) => void) | null = null): void {
  const display = getDisplayTimeouts();
  if (!(display.minSecs > 0.0 || display.maxSecs > 0.0)) {
    // No variable display parameters - we can stop the interval
    $('#continueButton').prop('disabled', false);
    setDispTimeoutText('');
    const varLenTimeoutName = CardStore.getVarLenTimeoutName();
    if (typeof varLenTimeoutName === 'number') {
      Meteor.clearInterval(varLenTimeoutName);
    }
    CardStore.setVarLenTimeoutName(null);
    return;
  }

  const elapsed = elapsedSecs();
  if (elapsed <= display.minSecs) {
    // Haven't reached min yet
    $('#continueButton').prop('disabled', true);
    const dispLeft = display.minSecs - elapsed;
    if (dispLeft >= 1.0) {
      setDispTimeoutText('You can continue in: ' + secsIntervalString(dispLeft));
    } else {
      setDispTimeoutText(''); // Don't display 0 secs
    }
  } else if (elapsed <= display.maxSecs) {
    // Between min and max
    $('#continueButton').prop('disabled', false);
    const dispLeft = display.maxSecs - elapsed;
    if (dispLeft >= 1.0) {
      setDispTimeoutText('Time remaining: ' + secsIntervalString(dispLeft));
    } else {
      setDispTimeoutText('');
    }
  } else if (display.maxSecs > 0.0) {
    // Past max and a max was specified - it's time to go
    $('#continueButton').prop('disabled', true);
    setDispTimeoutText('');
    if (onUnitFinished) {
      onUnitFinished('DisplaMaxSecs exceeded');
    }
  } else {
    // Past max and no valid maximum - they get a continue button
    $('#continueButton').prop('disabled', false);
    setDispTimeoutText('You can continue whenever you want');
  }
}






