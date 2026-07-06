/**
 * @fileoverview Content runtime XState machine (Phase 2)
 * Single source of truth for content runtime flow
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
} from './contentRuntimeMachineTypes';
import { contentRuntimeMachineOptions } from './contentRuntimeMachineOptions';
import { contentRuntimeMachineGlobalHandlers } from './contentRuntimeMachineGlobalHandlers';
import {
  activateVideoSessionAtStart,
} from './videoSessionMachine';
import { contentRuntimeMachinePresentingState } from './contentRuntimeMachinePresentingState';
import { contentRuntimeMachineVideoStates } from './contentRuntimeMachineVideoStates';
import { contentRuntimeMachineReviewStates } from './contentRuntimeMachineReviewStates';
import { contentRuntimeMachineTransitionState } from './contentRuntimeMachineTransitionState';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Narrow exception: current XState v5 config/actor typings in this file are not modeled well enough yet, but we can still type the machine callback payloads locally.
const createMachine: any = xCreateMachine;

// =============================================================================
// MACHINE DEFINITION
// =============================================================================

/**
 * Content runtime state machine
 */
export const contentRuntimeMachine = createMachine(
  {
    id: 'contentRuntimeMachine',
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
                  target: '#contentRuntimeMachine.videoWaiting',
                  guard: 'isVideoSession',
                  actions: [
                    'initializeSession',
                    activateVideoSessionAtStart,
                    'logStateTransition',
                  ],
                },
                {
                  target: `#contentRuntimeMachine.${STATES.PRESENTING}`,
                  actions: ['initializeSession', 'logStateTransition'],
                },
              ],
            },
          },
        },
      },

      [STATES.PRESENTING]: contentRuntimeMachinePresentingState,

      ...contentRuntimeMachineReviewStates,

      [STATES.TRANSITION]: contentRuntimeMachineTransitionState,

      ...contentRuntimeMachineVideoStates,

      /**
       * ERROR STATE
       * Hard errors that stop the machine
       */
      [STATES.ERROR]: {
        entry: ['setErrorMessage', 'logError', 'disableInput', 'stopRecording', 'stopTTS'],
        type: 'final',
      },
    },

    on: contentRuntimeMachineGlobalHandlers,
  },
  contentRuntimeMachineOptions
);

