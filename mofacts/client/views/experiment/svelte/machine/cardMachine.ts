/**
 * @fileoverview Card XState Machine (Phase 2)
 * Single source of truth for card trial flow
 *
 * Top-level states: idle → presenting → (study | feedback | transition) → idle or error
 *
 * Substates:
 * - presenting: loading → fadingIn → displaying → awaiting → exit
 * - transition: start → fadingOut → clearing → loop or finish
 *
 * Trial types supported: s (study), d (drill), t (test)
 * Other trial types trigger error state
 */

import { createMachine as xCreateMachine } from 'xstate';
import { EVENTS, STATES } from './constants';
import {
  initialContext,
} from './cardMachineTypes';
import { cardMachineOptions } from './cardMachineOptions';
import { cardMachineGlobalHandlers } from './cardMachineGlobalHandlers';
import {
  activateVideoSessionAtStart,
} from './videoSessionMachine';
import { cardMachinePresentingState } from './cardMachinePresentingState';
import { cardMachineVideoStates } from './cardMachineVideoStates';
import { cardMachineReviewStates } from './cardMachineReviewStates';
import { cardMachineTransitionState } from './cardMachineTransitionState';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Narrow exception: current XState v5 config/actor typings in this file are not modeled well enough yet, but we can still type the machine callback payloads locally.
const createMachine: any = xCreateMachine;

// =============================================================================
// MACHINE DEFINITION
// =============================================================================

/**
 * Card state machine
 */
export const cardMachine = createMachine(
  {
    id: 'cardMachine',
    initial: STATES.IDLE,
    context: initialContext,
    states: {
      /**
       * IDLE STATE
       * Wait for START event
       */
      [STATES.IDLE]: {
        initial: 'ready',
        states: {
          /**
           * READY SUBSTATE
           * Ready to start fresh session
           */
          ready: {
            entry: ['logStateTransition'],
            on: {
              [EVENTS.START]: [
                {
                  target: '#cardMachine.videoWaiting',
                  guard: 'isVideoSession',
                  actions: [
                    'initializeSession',
                    activateVideoSessionAtStart,
                    'logStateTransition',
                  ],
                },
                {
                  target: `#cardMachine.${STATES.PRESENTING}`,
                  actions: ['initializeSession', 'logStateTransition'],
                },
              ],
            },
          },
        },
      },

      [STATES.PRESENTING]: cardMachinePresentingState,

      ...cardMachineReviewStates,

      [STATES.TRANSITION]: cardMachineTransitionState,

      ...cardMachineVideoStates,

      /**
       * ERROR STATE
       * Hard errors that stop the machine
       */
      [STATES.ERROR]: {
        entry: ['setErrorMessage', 'logError', 'disableInput', 'stopRecording', 'stopTTS'],
        type: 'final',
      },
    },

    on: cardMachineGlobalHandlers,
  },
  cardMachineOptions
);

