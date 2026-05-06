import {currentUserHasRole} from '../../lib/roleUtils';
import {secsIntervalString} from '../../../common/globalHelpers';
import {haveMeteorUser} from '../../lib/currentTestingHelpers';
import './instructions.html';
import { createExperimentState, getExperimentState } from './svelte/services/experimentState';
import { revisitUnit, unitIsFinished } from './unitProgression';
import {routeToSignin} from '../../lib/router';
import { meteorCallAsync } from '../../index';
import { clientConsole } from '../../lib/userSessionHelpers';
import _ from 'underscore';
import DOMPurify from 'dompurify';
import {audioManager} from '../../lib/audioContextManager';
import { DeliveryParamsStore } from '../../lib/state/deliveryParamsStore';
import { UiSettingsStore } from '../../lib/state/uiSettingsStore';
import { CardStore } from './modules/cardStore';
import { resolveDynamicAssetPath } from './svelte/services/mediaResolver';
import { assertIdInvariants, logIdInvariantBreachOnce } from '../../lib/idContext';
import { CARD_ENTRY_INTENT, setCardEntryIntent } from '../../lib/cardEntryIntent';
import {
  finishLaunchLoading,
  isLaunchLoadingActive,
  markLaunchLoadingTiming,
  startLaunchLoading,
} from '../../lib/launchLoading';
const { FlowRouter } = require('meteor/ostrio:flow-router-extra');

declare const Meteor: any;
declare const Template: any;
declare const Session: any;
declare const $: any;
declare const Tracker: any;

// Security: HTML sanitization for user-generated content
// Allow safe formatting tags but block scripts, iframes, and event handlers
function sanitizeHTML(dirty: any) {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div',
                   'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'table', 'tr', 'td', 'th', 'thead', 'tbody',
                   'ul', 'ol', 'li', 'center', 'a', 'img', 'audio', 'source',
                   'button'],
    ALLOWED_ATTR: ['style', 'class', 'id', 'border', 'href', 'src', 'alt', 'width', 'height', 'controls', 'preload', 'data-audio-id', 'aria-label', 'type'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
  });
}

export { instructContinue, unitHasLockout, checkForFileImage, recordCurrentInstructionContinue };
// //////////////////////////////////////////////////////////////////////////
// Instruction timer and leaving this page - we don't want to leave a
// timer running!

let lockoutInterval: any = null;
let lockoutFreeTime: any = null;
let lockoutHandled = false;
let serverNotify: any = null;
// Will get set on first periodic check and cleared when we leave the page
let displayTimeStart: any = null;
let timeRendered = 0
let inlineAudioClickHandler: any = null;
let instructionShortcutHandler: any = null;
let lockoutDataWatcher: any = null;
let lockoutScopeKey: string | null = null;
const INSTRUCTIONS_LEAVING_KEY = 'instructionsLeaving';

function checkAudioInputMode() {
  const userAudioToggled = (Meteor.user() as any)?.audioSettings?.audioInputMode || false;
  const tdfAudioEnabled = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.audioInputEnabled === 'true';
  return userAudioToggled && tdfAudioEnabled;
}

function trimText(value: any) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function toInt(value: any, defaultVal = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

function getPositiveLockoutMinutes(value: any) {
  if (Array.isArray(value)) {
    return getPositiveLockoutMinutes(value[0]);
  }
  const parsed = toInt(value, 0);
  return parsed > 0 ? parsed : 0;
}

function getLockoutMinutesFromParams(params: any) {
  if (!params || typeof params !== 'object') {
    return 0;
  }
  return (
    getPositiveLockoutMinutes((params as any).lockoutminutes) ||
    getPositiveLockoutMinutes((params as any).lockoutMinutes)
  );
}

function getConfiguredLockoutMinutes() {
  // Canonical source: resolved active delivery params for this unit/xcond.
  const storeParams = DeliveryParamsStore.get();
  if (!storeParams || typeof storeParams !== 'object') {
    return null;
  }
  return getLockoutMinutesFromParams(storeParams);
}

function startLockoutInterval(initialLockoutFreeTime: number | null = null) {
  clearLockoutInterval();
  if (typeof initialLockoutFreeTime === 'number' && Number.isFinite(initialLockoutFreeTime)) {
    lockoutFreeTime = initialLockoutFreeTime;
  }
  lockoutPeriodicCheck();
  lockoutInterval = Meteor.setInterval(lockoutPeriodicCheck, 250);
}

function clearLockoutInterval() {
  if (lockoutInterval) {
    Meteor.clearInterval(lockoutInterval);
  }
  lockoutInterval = null;
  lockoutFreeTime = null;
  lockoutHandled = false;
  serverNotify = null;
}

function getCurrentLockoutScopeKey() {
  return `${String(Session.get('currentTdfId') || '')}:${String(Session.get('currentUnitNumber') || '')}`;
}

function leavePage(dest: any) {
  clearLockoutInterval();
  displayTimeStart = null;
  if (typeof dest === 'function') {
    dest();
  } else {
    if (dest == '/card' && document.location.pathname == '/card') {
      // Force a same-route refresh when already on /card
      FlowRouter.go('/card', {}, {refreshCard: Date.now()});
    } else {
      FlowRouter.go(dest);
    }
  }
}

// //////////////////////////////////////////////////////////////////////////
// Utility functions used below

// Added because the LOCKOUT call overwhelms the console - so we throttle to one
// call every 1000ms (1 second)
const logLockout = _.throttle(
    function(lockoutminutes: any) {
      clientConsole(2, 'LOCKOUT:', lockoutminutes, 'min');
    },
    250,
);

// Return current TDF unit's lockout minutes (or 0 if none-specified)
function getCurrentUnitLockoutRecord() {
  const tdfId = Session.get('currentTdfId');
  const unitNumber = Session.get('currentUnitNumber');
  const user = Meteor.user();
  const lockoutEntry = user?.lockouts?.[tdfId];
  if (!lockoutEntry) {
    return null;
  }
  if (lockoutEntry.currentLockoutUnit != unitNumber) {
    return null;
  }
  return lockoutEntry;
}

function getLockoutEndTimeMs() {
  const lockoutEntry = getCurrentUnitLockoutRecord();
  if (!lockoutEntry) {
    return null;
  }
  const lockoutTimeStamp = Number(lockoutEntry.lockoutTimeStamp);
  const lockoutMinutes = Number(lockoutEntry.lockoutMinutes);
  if (!Number.isFinite(lockoutTimeStamp) || !Number.isFinite(lockoutMinutes)) {
    return null;
  }
  return lockoutTimeStamp + lockoutMinutes * 60 * 1000;
}

function currLockOut() {
  const lockoutTime = getLockoutEndTimeMs();
  if (lockoutTime === null) {
    return 0;
  }
  return lockoutTime - Date.now();
}

function checkForFileImage(string: any) {
  if (!string) return '';

  // Security: Sanitize HTML first to prevent XSS
  string = sanitizeHTML(string);

  const div = document.createElement('div');
  div.innerHTML = string;
  const mediaNodes = div.querySelectorAll('[src]');
  const localMediaExtRegex = /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mov|m4v|jpg|jpeg|png|gif|svg|webp|bmp|ico)(\?.*)?$/i;
  for (const node of mediaNodes) {
    const src = node.getAttribute('src');
    const resolvedSrc = resolveDynamicAssetPath(src, { logPrefix: '[Instructions]' });
    if (resolvedSrc !== src) {
      if (resolvedSrc) {
        node.setAttribute('src', resolvedSrc);
        node.removeAttribute('data-unresolved-src');
      } else {
        const rawSrc = String(src || '').trim();
        if (rawSrc && localMediaExtRegex.test(rawSrc) && !/^(https?:|data:|blob:|\/\/)/i.test(rawSrc)) {
          // Preserve unresolved local media refs for click-time resolution while
          // preventing browser preload of bad root-level URLs.
          node.setAttribute('data-unresolved-src', rawSrc);
          node.removeAttribute('src');
        }
      }
    }
  }
  return div.innerHTML;
}

function unitHasLockout() {
  const lockoutTime = getLockoutEndTimeMs();
  if (lockoutTime !== null) {
    const currTime = new Date().getTime();
    if(currTime < lockoutTime){
      const newLockoutMinutes = Math.ceil((lockoutTime - currTime)/(60*1000));
      return newLockoutMinutes;
    }
  } else {
    const lockoutminutes = getConfiguredLockoutMinutes();
    return lockoutminutes;
  }
}

async function lockoutKick() {
  const currentScopeKey = getCurrentLockoutScopeKey();
  if (lockoutScopeKey !== currentScopeKey) {
    clearLockoutInterval();
    lockoutScopeKey = currentScopeKey;
    $('#lockoutTimeRemaining').html('');
    setDispTimeoutText('');
  }

  const display = getDisplayTimeouts();
  //if an existing lockout is not in place, we will set one if the current unit has a lockout
  const lockoutminutes = getConfiguredLockoutMinutes();
  if (lockoutminutes === null) {
    $('#continueButton').prop('disabled', true);
    return;
  }
  if (
    lockoutminutes > 0 &&
    !checkForExistingLockout() &&
    lockoutFreeTime === null &&
    !lockoutInterval
  ) {
    $('#continueButton').prop('disabled', true);
    try {
      const requestedLockoutTimeStamp = Date.now();
      const persistedLockout = await meteorCallAsync(
        'setLockoutTimeStamp',
        requestedLockoutTimeStamp,
        lockoutminutes,
        Session.get('currentUnitNumber'),
        Session.get('currentTdfId'),
      ) as { lockoutTimeStamp?: unknown; lockoutMinutes?: unknown };
      const persistedLockoutTimeStamp = Number(persistedLockout?.lockoutTimeStamp);
      const persistedLockoutMinutes = Number(persistedLockout?.lockoutMinutes);
      if (!Number.isFinite(persistedLockoutTimeStamp) || !Number.isFinite(persistedLockoutMinutes)) {
        clientConsole(1, 'Invalid persisted lockout payload from server', persistedLockout);
        return;
      }
      const initialLockoutEndTime = persistedLockoutTimeStamp + persistedLockoutMinutes * 60 * 1000;
      startLockoutInterval(initialLockoutEndTime);
    } catch (error) {
      clientConsole(1, 'Failed to persist lockout timestamp on server', error);
    }
    return
  }
  logLockout(lockoutminutes);
  const hasExistingLockout = checkForExistingLockout();
  const doDisplay = (display.minSecs > 0 || display.maxSecs > 0);
  const doLockout = (!lockoutInterval && currLockOut() > 0);
  // No lockout and no display timeout: enable Continue immediately.
  if (!doDisplay && !doLockout && lockoutminutes <= 0) {
    clearLockoutInterval();
    $('#lockoutTimeRemaining').html('');
    $('#continueButton').prop('disabled', false);
    setDispTimeoutText('');
    return;
  }
  // Ensure countdown UI keeps ticking for persisted lockouts on initial load/resume.
  const shouldRunInterval = doDisplay || doLockout || (hasExistingLockout && !lockoutInterval);
  if (shouldRunInterval) {
    clientConsole(2, 'interval kicked');
    startLockoutInterval();
  }
}


function checkForExistingLockout() {
  return !!getCurrentUnitLockoutRecord();
}
  
// Min and Max display seconds: if these are enabled, they determine
// potential messages, the continue button functionality, and may even move
// the screen forward. HOWEVER, the lockout functionality currently overrides
// this functionality (i.e. we don't check this stuff while we are locked out)
function getDisplayTimeouts() {
  const unit = Session.get('currentTdfUnit');
  return {
    'minSecs': parseInt((unit ? unit.instructionminseconds : 0) || 0),
    'maxSecs': parseInt((unit ? unit.instructionmaxseconds : 0) || 0),
  };
}

function setDispTimeoutText(txt: any) {
  let msg = trimText(txt);
  if (msg.length > 0) {
    msg = ' (' + msg + ')';
  }
  $('#displayTimeoutMsg').text(msg);
}

// Called intermittently to see if we are still locked out
function lockoutPeriodicCheck() {
  if (lockoutFreeTime === null) {
    const persistedLockoutEnd = getLockoutEndTimeMs();
    if (persistedLockoutEnd !== null) {
      lockoutFreeTime = persistedLockoutEnd;
    }
  }

  // Lockout handling
  const hasActiveLockout = typeof lockoutFreeTime === 'number' && Number.isFinite(lockoutFreeTime);
  const lockoutExpired = hasActiveLockout && Date.now() >= lockoutFreeTime;
  if (lockoutExpired) {
    // All done - clear out time remaining, hide the display, enable the
    // continue button, and stop the lockout timer
    if (!lockoutHandled) {
      $('#lockoutTimeRemaining').html('');
      $('#continueButton').prop('disabled', false);
      $('#continueBar').show();
      // Since the interval will continue to fire, we need to know we've
      // done this
      lockoutHandled = true;
    }
  } else if (hasActiveLockout) {
    // Still locked - handle and then bail

    // Figure out how to display time remaining
    const timeLeft = Math.floor((lockoutFreeTime - Date.now()) / 1000.0);
    const timeLeftDisplay = 'Time Remaining: ' + secsIntervalString(timeLeft);

    // Insure they can see the lockout message, update the time remaining
    // message, and disable the continue button
    $('#lockoutTimeRemaining').text(timeLeftDisplay);
    $('#continueButton').prop('disabled', true);

    // Make sure that the server knows a lockout has been detected - but
    // we only need to call it once
    if (serverNotify === null) {
      serverNotify = async function() {
        if (Meteor.user()?.loginParams?.loginMode !== 'experiment') {
          return; // Nothing to do
        }

        // We're in experiment mode and locked out - if they should get a Turk email,
        // now is the time to let the server know we've shown a lockout msg
        const currUnit = Session.get('currentTdfUnit');
        const turkemail = trimText(currUnit?.turkemail);
        const subject = trimText(currUnit?.turkemailsubject);

        if (!turkemail) {
          return; // No message to show
        }

        const experimentId = Session.get('currentRootTdfId');

        const scheduleAt = Math.floor(lockoutFreeTime) + 1;
        try {
          await meteorCallAsync('turkScheduleLockoutMessage', experimentId, scheduleAt, subject, turkemail);
          clientConsole(2, 'Server accepted lockout msg schedule', scheduleAt, turkemail);
        } catch (error) {
          clientConsole(1, 'Server schedule failed. Error:', error);
        }
      };
      void serverNotify();
    }
    // IMPORTANT: we're leaving
    return;
  }

  // Lockout logic has been handled - if we're here then we're unlocked
  // Get the display min/max handling
  const display = getDisplayTimeouts();
  if (display.minSecs > 0 || display.maxSecs > 0) {
    if (!displayTimeStart) {
      displayTimeStart = Date.now(); // Start tracking time
    }

    const elapsedSecs = Math.floor((1.0 + Date.now() - displayTimeStart) / 1000.0);

    if (elapsedSecs <= display.minSecs) {
      // Haven't reached min yet
      $('#continueButton').prop('disabled', true);
      const dispLeft = display.minSecs - elapsedSecs;
      if (dispLeft >= 1.0) {
        setDispTimeoutText('You can continue in: ' + secsIntervalString(dispLeft));
      } else {
        setDispTimeoutText(''); // Don't display 0 secs
      }
    } else if (elapsedSecs <= display.maxSecs) {
      // Between min and max
      $('#continueButton').prop('disabled', false);
      const dispLeft = display.maxSecs - elapsedSecs;
      if (dispLeft >= 1.0) {
        setDispTimeoutText('Time remaining: ' + secsIntervalString(dispLeft));
      } else {
        setDispTimeoutText('');
      }
    } else if (display.maxSecs > 0.0) {
      // Past max and a max was specified - it's time to go
      $('#continueButton').prop('disabled', true);
      setDispTimeoutText('');
      instructContinue();
    } else {
      // Past max and no valid maximum - they get a continue button
      $('#continueButton').prop('disabled', false);
      setDispTimeoutText('You can continue whenever you want');
    }
  } else {
    // No display handling - if lockout is fine then we can stop polling
    $('#continueButton').prop('disabled', false);
    setDispTimeoutText('');
    if (lockoutHandled) {
      clearLockoutInterval();
    }
  }
}

// Get units left to display/execute - note that the current unit isn't
// counted. Ex: if you have three units (0, 1, 2) and unit 1 is the current
// unit, then you have 1 unit remaining. If there are no units or there is
// we return 0
function getUnitsRemaining() {
  let unitsLeft = 0;

  const thisTdf = Session.get('currentTdfFile');
  if (thisTdf) {
    let unitCount = 0;
    const unitList = thisTdf?.tdfs?.tutor?.unit;
    if (Array.isArray(unitList) && unitList.length) {
      unitCount = unitList.length;
    }
    if (unitCount > 0) {
      const unitIdx = Session.get('currentUnitNumber') || 0;
      unitsLeft = (unitCount - unitIdx);
      if (unitsLeft < 0) {
        unitsLeft = 0;
      }
    }
  }

  return unitsLeft;
}

// Called when users continues to next screen.
// SUPER-IMPORTANT: note that this can be called outside this template, so it
// must only reference visible from anywhere on the client AND we take great
// pains to not modify anything reactive until this function has returned
async function instructContinue() {
  if (!isLaunchLoadingActive()) {
    startLaunchLoading('Loading content...', 'instructions');
  }
  markLaunchLoadingTiming('instructionContinue:instructContinue:start');
  assertIdInvariants('instructions.instructContinue', { requireCurrentTdfId: true, requireStimuliSetId: false });
  try {
    Session.set(INSTRUCTIONS_LEAVING_KEY, true);
    $('#continueButton').prop('disabled', true);
    $('#continueBar').hide();
    const currentUnitNumber = Session.get('currentUnitNumber') || 0;
    const tdfFile = Session.get('currentTdfFile');
    const unitList = tdfFile?.tdfs?.tutor?.unit;
    let curUnit = Session.get('currentTdfUnit');
    if(!curUnit){
      markLaunchLoadingTiming('instructionContinue:getExperimentState:start');
      let experimentState: any = await getExperimentState();
      markLaunchLoadingTiming('instructionContinue:getExperimentState:complete');
      const stateUnitList = experimentState?.currentTdfFile?.tdfs?.tutor?.unit;
      if (!Array.isArray(stateUnitList)) {
        throw new Error(`[Instructions] Missing experimentState.currentTdfFile.tdfs.tutor.unit while resolving current unit (currentTdfId=${Session.get('currentTdfId')})`);
      }
      curUnit = stateUnitList[currentUnitNumber];
      if (!curUnit) {
        throw new Error(`[Instructions] Current unit ${currentUnitNumber} not found in experimentState unit list (currentTdfId=${Session.get('currentTdfId')}, unitCount=${stateUnitList.length})`);
      }
    }

    // Check if this is an instruction-only unit (has instructions but no session)
    const isInstructionOnly = !curUnit.assessmentsession && !curUnit.learningsession && !curUnit.videosession;
    const nextUnitNumber = currentUnitNumber + 1;
    Session.set('instructionClientStart', 0);

    let navigationTarget = '/card';

    if (isInstructionOnly) {
      if (nextUnitNumber < unitList.length) {
        const nextUnit = unitList[nextUnitNumber];
        Session.set('currentUnitNumber', nextUnitNumber);
        Session.set('currentTdfUnit', nextUnit);
        Session.set('curUnitInstructionsSeen', false);
        await createExperimentState({
          currentUnitNumber: nextUnitNumber,
          currentTdfUnit: nextUnit,
          lastUnitCompleted: currentUnitNumber,
          lastUnitStarted: nextUnitNumber,
        } as any);
      } else {
        await createExperimentState({
          currentUnitNumber: nextUnitNumber,
          lastUnitCompleted: currentUnitNumber,
          lastUnitStarted: currentUnitNumber,
        } as any);
        navigationTarget = '/learningDashboard';
      }
    } else {
      Session.set('currentUnitNumber', currentUnitNumber);
      Session.set('currentTdfUnit', curUnit);
      Session.set('curUnitInstructionsSeen', true);
    }

    if (navigationTarget === '/card') {
      setCardEntryIntent(CARD_ENTRY_INTENT.INSTRUCTION_CONTINUE, {
        source: 'instructions.instructContinue',
      });
    } else {
      finishLaunchLoading('instructions-complete-dashboard');
    }
    Session.set('fromInstructions', true);
    CardStore.setEnterKeyLock(false);
    clientConsole(2, 'releasing enterKeyLock in instructContinue');
    markLaunchLoadingTiming('instructionContinue:route', { navigationTarget });
    leavePage(navigationTarget);
  } catch (error) {
    finishLaunchLoading('instruction-continue-failed');
    throw error;
  }
}


Template.instructions.helpers({
  isExperiment: function() {
    return Meteor.user()?.loginParams?.loginMode === 'experiment';
  },

  isNormal: function() {
    return Meteor.user()?.loginParams?.loginMode !== 'experiment';
  },

  backgroundImage: function() {
    const currUnit = Session.get('currentTdfUnit');
    let img = '';

    if (currUnit && currUnit.picture) {
      img = currUnit.picture;
    }

    return img;
  },

  instructionText: function() {
    return checkForFileImage(Session.get('currentTdfUnit')?.unitinstructions);
  },

  instructionQuestion: function(){
    return checkForFileImage(Session.get('currentTdfUnit')?.unitinstructionsquestion);
  },

  islockout: function() {
    const lockoutMs = currLockOut();
    if (lockoutMs > 0) {
      return true;
    }
    if (checkForExistingLockout()) {
      return false;
    }
    return Number(getConfiguredLockoutMinutes() || 0) > 0;
  },

  lockoutminutes: function() {
    return currLockOut();
  },

  username: function() {
    if (!haveMeteorUser()) {
      leavePage(routeToSignin);
      return '';
    } else {
      return (Meteor.user() as any)?.email_canonical || Meteor.user().emails?.[0]?.address || Meteor.user().username;
    }
  },

  UISettings: function() {
    return UiSettingsStore.get() ;
  },

  isLeavingInstructions: function() {
    return !!Session.get(INSTRUCTIONS_LEAVING_KEY);
  },

  allowcontinue: function() {
    // If we're in experiment mode, they can only continue if there are
    // units left.
    if (Meteor.user()?.loginParams?.loginMode === 'experiment') {
      return getUnitsRemaining() > 0;
    } else {
      return true;
    }
  },
    'curTdfName': function(){
    const lessonname = Session.get('currentTdfFile')?.tdfs?.tutor?.setspec?.lessonname || '';
    clientConsole(2, "lessonname",lessonname);
    return lessonname;
  },
  'allowGoBack': function() {
    //check if this is allowed
    const deliveryParams = DeliveryParamsStore.get() || {};
    const currentTdfFile = Session.get('currentTdfFile');
    const allowRevisitFromTdf = currentTdfFile?.tdfs?.tutor?.setspec?.allowRevistUnit;
    const unitList = currentTdfFile?.tdfs?.tutor?.unit;
    if(deliveryParams.allowRevistUnit || allowRevisitFromTdf){
      //get the current unit number and decrement it by 1, and see if it exists
      let curUnitNumber = Session.get('currentUnitNumber');
      let newUnitNumber = curUnitNumber - 1;
      if(newUnitNumber >= 0 && Array.isArray(unitList) && unitList.length >= newUnitNumber){
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  },
  'UIsettings': function() {
    return UiSettingsStore.get();
  },
});

Template.instructions.created = function() {
  Session.set(INSTRUCTIONS_LEAVING_KEY, false);
};

Template.instructions.rendered = function() {
  clientConsole(2, '[Instructions Rendered] Template rendered callback fired');
  Session.set(INSTRUCTIONS_LEAVING_KEY, false);

  // Hide global loading spinner when instructions page is ready (handles startup units).
  finishLaunchLoading('instructions-rendered');

  // Make sure lockout interval timer is running
  lockoutKick();

  // Data for instructions can arrive after initial render; re-evaluate lockout reactively.
  if (lockoutDataWatcher) {
    lockoutDataWatcher.stop();
    lockoutDataWatcher = null;
  }
  lockoutDataWatcher = Tracker.autorun(() => {
    Session.get('currentTdfUnit');
    const user = Meteor.user();
    user?.lockouts;
    void lockoutKick();
  });

  // Add event handlers for inline audio elements after DOM is ready
  clientConsole(2, '[Instructions Rendered] Calling setupInlineAudioHandlers');
  setupInlineAudioHandlers();

  instructionShortcutHandler = async function(event: any) {
    const saveShortcutPressed =
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      String(event.key || '').toLowerCase() === 's';
    if (!saveShortcutPressed || event.repeat) {
      return;
    }
    if (!currentUserHasRole('admin,teacher')) {
      return;
    }

    event.preventDefault();
    try {
      await handleInstructionSkipUnitAction();
    } catch (error: any) {
      clientConsole(1, '[Instructions] Ctrl/Cmd+Shift+S skip-unit failed', error);
    }
  };
  document.addEventListener('keydown', instructionShortcutHandler);
};

Template.instructions.destroyed = function() {
  // Clean up when template is destroyed
  clearLockoutInterval();
  lockoutScopeKey = null;
  if (lockoutDataWatcher) {
    lockoutDataWatcher.stop();
    lockoutDataWatcher = null;
  }
  teardownInlineAudioHandlers();
  if (instructionShortcutHandler) {
    document.removeEventListener('keydown', instructionShortcutHandler);
    instructionShortcutHandler = null;
  }
};

// Function to set up inline audio click handlers
function setupInlineAudioHandlers() {
  if (inlineAudioClickHandler) {
    clientConsole(2, '[setupInlineAudioHandlers] Delegated click handler already attached');
    return;
  }

  inlineAudioClickHandler = function(e: any) {
    const button = e.target && e.target.closest ? e.target.closest('.inline-audio .play-btn') : null;
    if (!button) return;

    e.preventDefault();
    e.stopPropagation();

    const explicitAudioId = button.getAttribute('data-audio-id');
    const derivedAudioId = button.id && button.id.startsWith('play-')
      ? `${button.id.slice(5)}-audio`
      : null;
    const audioId = explicitAudioId || derivedAudioId;
    const audioElement = (audioId ? document.getElementById(audioId) : null) as any;

    clientConsole(2, '[Audio Click] Button clicked:', button.id || '(no-id)', '→ Audio:', audioId || '(none)');

    if (!audioElement) {
      clientConsole(1, '[Audio Error] Element not found for button:', button.id || '(no-id)', 'audioId:', audioId);
      return;
    }
    // Resolve dynamic asset path at click-time to avoid early-render subscription races.
    const sourceElement = audioElement.querySelector ? audioElement.querySelector('source') : null;
    const currentSrc = audioElement.getAttribute('src') ||
      audioElement.currentSrc ||
      (sourceElement ? sourceElement.getAttribute('src') : '') ||
      (sourceElement ? sourceElement.getAttribute('data-unresolved-src') : '') ||
      '';
    const resolvedSrc = resolveDynamicAssetPath(currentSrc, { logPrefix: '[Instructions ClickAudio]' });
    if (!resolvedSrc) {
      clientConsole(1, '[Audio Error] Unresolved audio source; hard-failing playback', {
        buttonId: button.id || '(no-id)',
        currentSrc,
        currentTdfId: Session.get('currentTdfId') || null,
        currentStimuliSetId: Session.get('currentStimuliSetId') || null,
      });
      return;
    }
    if (resolvedSrc !== currentSrc) {
      if (sourceElement) {
        sourceElement.setAttribute('src', resolvedSrc);
        sourceElement.removeAttribute('data-unresolved-src');
        audioElement.removeAttribute('src');
      } else {
        audioElement.setAttribute('src', resolvedSrc);
      }
      try {
        audioElement.load();
      } catch (_err: unknown) {
        // continue to play attempt below
      }
    }

    audioManager.pauseCurrentAudio();
    audioManager.setCurrentAudio(audioElement);
    const playFromStart = () => {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
      } catch (err: any) {
        clientConsole(1, '[Audio Error] Failed to reset to start:', audioId, err);
      }

      audioElement.play().then(() => {
        // Some browsers can begin slightly ahead on first decode; enforce true start once.
        if ((audioElement.currentTime || 0) > 0.15) {
          audioElement.pause();
          audioElement.currentTime = 0;
          audioElement.play().catch((err: any) => {
            clientConsole(1, '[Audio Error] Failed replay from start:', audioId, err);
          });
        }
        clientConsole(2, '[Audio Play] Successfully started:', audioId);
      }).catch((err: any) => {
        clientConsole(1, '[Audio Error] Failed to play:', audioId, err);
      });
    };

    // Wait until enough media is decoded to start immediately from frame 0.
    // loadedmetadata is often too early and can clip the first syllable on first click.
    if ((audioElement.readyState || 0) < 3) {
      const onCanPlay = () => {
        audioElement.removeEventListener('canplay', onCanPlay);
        playFromStart();
      };
      audioElement.addEventListener('canplay', onCanPlay, { once: true });
      try {
        audioElement.load();
      } catch (_err: any) {
        playFromStart();
      }
    } else {
      playFromStart();
    }
  };

  document.addEventListener('click', inlineAudioClickHandler, {passive: false});
  clientConsole(2, '[setupInlineAudioHandlers] Delegated click handler attached');
}

function teardownInlineAudioHandlers() {
  if (!inlineAudioClickHandler) return;
  document.removeEventListener('click', inlineAudioClickHandler);
  inlineAudioClickHandler = null;
  clientConsole(2, '[teardownInlineAudioHandlers] Delegated click handler removed');
}

// instructionlog 

function gatherInstructionLogRecord(trialEndTimeStamp: any, trialStartTimeStamp: any) {
  const meteorUser = Meteor.user();
  const loginParams = meteorUser?.loginParams || {};
  const currentTdfId = Session.get('currentTdfId');
  if (!currentTdfId) {
    logIdInvariantBreachOnce('instructions.gatherInstructionLogRecord:missing-currentTdfId');
  }

  // Figure out button trial entries
  const instructionLog = {
    'userId': Meteor.userId(),
    'TDFId': currentTdfId,
    'sectionId': Session.get('curSectionId'),
    'teacherId': Session.get('curTeacher')?._id,
    'anonStudentId': meteorUser?.username || '',
    'sessionID': Meteor.default_connection?._lastSessionId || Meteor.connection?._lastSessionId || null,
    'conditionNameA': 'tdf file',
    // Note: we use this to enrich the history record server side, change both places if at all
    'conditionTypeA': Session.get('currentTdfName'),
    'conditionNameB': 'xcondition',
    'conditionTypeB': Session.get('experimentXCond') || null,
    'conditionNameE': 'section',
    'conditionTypeE': loginParams.entryPoint &&
        loginParams.entryPoint !== 'direct' ? loginParams.entryPoint : null,
    'responseDuration': null,
    'levelUnit': Session.get('currentUnitNumber'),
    'levelUnitType': "Instruction",
    'time': trialEndTimeStamp,
    'problemStartTime': trialStartTimeStamp,
    'selection': 'instruction',
    'action': 'continue',
    'outcome': '',
    'eventType': 'instruct',
    'CFAudioInputEnabled': checkAudioInputMode(),
    'CFAudioOutputEnabled': Session.get('enableAudioPromptAndFeedback'),
    'CFResponseTime': trialEndTimeStamp,
    'feedbackType': '',
    'entryPoint': loginParams.entryPoint
  };
  return instructionLog;
}

async function recordCurrentInstructionContinue(trialStartTimeStamp: any = timeRendered) {
  //record the unit instructions if the unit setspec has the recordInstructions tag set to true
  // OR if the tdf setspec has the recordInstructions tag set to true
  // OR if the tdf setspec has the recordInstructions has an array of unit numbers that includes the current unit number
  const curUnitNumber = Session.get('currentUnitNumber');
  const curTdf = Session.get('currentTdfFile');
  const curUnit = Session.get('currentTdfUnit');
  const setSpec = curTdf?.tdfs?.tutor?.setspec;

  if (!curUnit) {
    clientConsole(1, '[Instructions] Missing currentTdfUnit on continue', {
      curUnitNumber,
      hasCurTdf: !!curTdf,
      hasSetSpec: !!setSpec,
      path: document?.location?.pathname,
    });
  }
  if (curUnit && typeof curUnit.recordInstructions === "undefined") {
    curUnit.recordInstructions = true;
  }
  if (setSpec && typeof setSpec.recordInstructions === "undefined") {
    setSpec.recordInstructions = true;
  }
  const recordInstructionsIncludesUnit = Array.isArray(setSpec?.recordInstructions)
    ? setSpec.recordInstructions.includes(curUnitNumber)
    : false;
  const recordInstructions = curUnit?.recordInstructions || recordInstructionsIncludesUnit ||
    setSpec?.recordInstructions === true || setSpec?.recordInstructions === "true";
  if(recordInstructions){
    const instructionLog = gatherInstructionLogRecord(Date.now(), trialStartTimeStamp);
    clientConsole(2, 'instructionLog', instructionLog);
    markLaunchLoadingTiming('instructionContinue:historyRecord:start');
    await (Meteor as any).callAsync('insertHistory', instructionLog)
    markLaunchLoadingTiming('instructionContinue:historyRecord:complete');
  }
}

async function handleInstructionContinueAction(forceBypassLockout = false) {
  if (forceBypassLockout) {
    // Prevent stale lockout config from bleeding into the next unit after manual bypass.
    Session.set('currentDeliveryParams', null);
    DeliveryParamsStore.set({});
  }
  if (!forceBypassLockout) {
    const lockoutRemainingMs = currLockOut();
    if (lockoutRemainingMs > 0) {
      clientConsole(2, '[Instructions] Continue blocked due to active lockout', lockoutRemainingMs);
      return;
    }
    const configuredLockout = getConfiguredLockoutMinutes();
    if (configuredLockout === null) {
      clientConsole(2, '[Instructions] Continue blocked while lockout config is unresolved');
      return;
    }
    // If lockout is configured but already expired, never re-block on
    // initialization race/missing persisted record.
    if (configuredLockout > 0 && lockoutRemainingMs <= 0) {
      clientConsole(2, '[Instructions] Continue allowed: lockout already expired');
    } else if (configuredLockout > 0 && !checkForExistingLockout()) {
      await lockoutKick();
      clientConsole(2, '[Instructions] Continue blocked while lockout initializes');
      return;
    }
  }

  startLaunchLoading('Loading content...', 'instructions');
  markLaunchLoadingTiming('instructionContinue:pressed', { forceBypassLockout });
  await recordCurrentInstructionContinue(timeRendered);
  await instructContinue();
}

async function handleInstructionSkipUnitAction() {
  // Manual admin skip should bypass any stale unit lockout state.
  Session.set('currentDeliveryParams', null);
  DeliveryParamsStore.set({});
  await unitIsFinished('Admin Teacher Shortcut Ctrl+Shift+S');
}

// //////////////////////////////////////////////////////////////////////////
// Template Events

Template.instructions.events({
  'click #continueButton': async function(event: any) {
    event.preventDefault();
    await handleInstructionContinueAction();
  },
  'click #stepBackButton': async function(event: any) {
    event.preventDefault();
    //get the current unit number and decrement it by 1
    let curUnit = Session.get('currentUnitNumber');
    let newUnitNumber = curUnit - 1;
    await revisitUnit(newUnitNumber);
  },
  'click #instructionQuestionAffrimative': function() {
    Session.set('instructionQuestionResults',true);
    $('#instructionQuestion').hide();
  },
  'click #instructionQuestionNegative': function() {
    Session.set('instructionQuestionResults',false);
    $('#instructionQuestion').hide();
  }
});






