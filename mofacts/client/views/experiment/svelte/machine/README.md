# Card State Machine (Phase 2)

**XState-based state machine for MoFaCTS card trial flow**

## Overview

The card state machine is the single source of truth for card trial logic. It replaces the complex imperative logic in `card.js` (8,700+ lines) with a declarative state machine that is easier to understand, test, and maintain.

## Architecture

### Files

```
machine/
├── cardMachine.js      # Main XState machine definition
├── types.js            # JSDoc type definitions
├── constants.js        # Timing values, trial types, defaults
├── guards.js           # Boolean predicates for transitions
├── actions.js          # Side effects (assign, log, etc.)
├── services.js         # Async operations (SR, TTS, timeouts)
├── index.js            # Module exports
└── README.md           # This file
```

### Supported Trial Types

- **`s` (Study)**: Display answer immediately, no input required
- **`d` (Drill)**: Require input, show feedback
- **`t` (Test)**: Require input, no feedback
- **`m` (Force Correct)**: Require exact-correct re-entry on incorrect attempt
- **`n` (Timed Prompt)**: Force-correct variant with timeout

**Note**: Unmapped trial codes (for example `i`, `f`) are unsupported and should trigger the machine error path until explicitly mapped.

## State Structure

### Top-Level States

```
idle → presenting → (study | feedback | transition) → idle or error
```

1. **`idle`**: Waiting for START event to begin session
2. **`presenting`**: Load and display trial card (hierarchical)
3. **`study`**: Study trial flow (show answer immediately)
4. **`feedback`**: Drill trial feedback display
5. **`transition`**: Clean up and prepare for next trial
6. **`error`**: Hard error stop state (final)

### Presenting Substates

```
presenting:
  loading → fadingIn → displaying → awaiting → (submitted | timedOut)
```

- **`loading`**: Invoke `selectNextCard` service to fetch next trial
- **`fadingIn`**: Fade-in animation
- **`displaying`**: Card visible, branch based on trial type
  - Study trial → go to `study` state
  - Drill/Test → go to `awaiting` state
- **`awaiting`**: Wait for user input (parallel state with SR and timeout)
  - **`inputMode`**: Handle text/button input
  - **`speechRecognition`**: SR service (if enabled)
  - **`mainTimeout`**: Trial timeout (pauses during SR processing)
- **`submitted`**: Answer submitted (not timed out)
- **`timedOut`**: Trial timed out before submission

### Transition Substates

```
transition:
  start → fadingOut → clearing → (loop to presenting | finish to idle)
```

- **`start`**: Log history, track performance
- **`fadingOut`**: Fade-out animation
- **`clearing`**: Clear feedback, reset timers
- Branch: Check if unit finished, loop or finish

### Speech Recognition Flow

When SR is enabled (`srEnabled` guard):

```
awaiting.speechRecognition:
  checking → active → (ready → recording → processing → success | error)
```

- **`ready`**: Start recording, listen for voice
- **`recording`**: Voice detected, recording in progress
- **`processing`**: Voice stopped, waiting for transcription
- **`success`**: Transcription received, auto-submit
- **`error`**: Transcription failed, retry if attempts remain
- **`exhausted`**: Max attempts reached, submit empty answer

SR attempts are limited to 3 (configurable in `SR_CONFIG.MAX_ATTEMPTS`).

## Events

### Lifecycle Events

- **`START`**: Begin session
  - Payload: `{ sessionId, unitId, tdfId }`
- **`CARD_SELECTED`**: Next card loaded
  - Payload: `{ display, answer, testType, buttonTrial, buttonList, deliveryParams, uiSettings, engineIndices }`
- **`ENABLE_INPUT`**: Enable input field
- **`SUBMIT`**: User submitted answer
  - Payload: `{ userAnswer, timestamp }`
- **`TIMEOUT`**: Main trial timeout fired
- **`FEEDBACK_TIMEOUT`**: Feedback display timeout
- **`UNIT_FINISHED`**: Unit completed
- **`TRANSITION_COMPLETE`**: Transition animation finished

### Speech Recognition Events

- **`ENABLE_SR`**: Enable SR for this trial
- **`VOICE_START`**: Voice activity detected
- **`VOICE_STOP`**: Voice activity stopped
- **`TRANSCRIPTION_SUCCESS`**: SR succeeded
  - Payload: `{ transcript }`
- **`TRANSCRIPTION_ERROR`**: SR failed
  - Payload: `{ error }`
- **`MAX_ATTEMPTS_REACHED`**: SR exhausted all retries

### TTS Events

- **`TTS_COMPLETE`**: TTS playback finished

### Error Events

- **`ERROR`**: Error occurred
  - Payload: `{ source, error }`
  - Severity determined by `ERROR_SEVERITY_MAP`
  - **Soft errors**: Log and continue to next trial
  - **Hard errors**: Stop machine in error state

## Guards

Guards are boolean predicates that determine whether transitions should occur.

### Trial Type Guards

- `isStudyTrial`, `isDrillTrial`, `isTestTrial`
- `isSupportedTrialType`, `isUnsupportedTrialType`

### Input Mode Guards

- `isButtonTrial`, `isTextTrial`

### SR Guards

- `srEnabled`, `srDisabled`
- `recordingLocked`, `recordingUnlocked`
- `hasAttemptsRemaining`, `attemptsExhausted`
- `waitingForTranscription`, `notWaitingForTranscription`

### TTS Guards

- `ttsEnabled`, `ttsDisabled`

### Feedback Guards

- `needsFeedback`, `noFeedback`
- `answerCorrect`, `answerIncorrect`

### Timeout Guards

- `didTimeout`, `didNotTimeout`
- `hitTimeoutThreshold` (consecutive timeouts warning)

### Unit/Session Guards

- `unitFinished`, `unitNotFinished`

### Error Guards

- `isHardError`, `isSoftError`

See [guards.js](./guards.js) for full list and implementations.

## Actions

Actions are side effects that occur during state transitions.

### Context Assignment Actions

- `initializeSession`: Load session IDs from START event
- `loadCardData`: Load card data from service result
- `captureAnswer`: Save user's answer
- `captureTranscription`: Save SR transcript
- `markTimeout`: Mark trial as timed out
- `validateAnswer`: Check if answer is correct

### Side Effect Actions

- `logStateTransition`: Log state changes to console
- `logError`: Log errors to console and error reporting
- `logHistory`: Save trial to Histories collection
- `trackPerformance`: Update performance metrics
- `focusInput`, `enableInput`, `disableInput`: Input control
- `startRecording`, `stopRecording`: SR control
- `playTTS`, `stopTTS`: TTS control
- `displayAnswer`, `displayFeedback`, `clearFeedback`: Display control
- `announceToScreenReader`: Accessibility announcements

See [actions.js](./actions.js) for full list and implementations.

## Services

Services are async operations invoked by the machine.

- **`selectNextCard`**: Fetch next trial from unit engine
  - Returns: `CardSelectionResult`
- **`prefetchImage`**: Preload image to browser cache
- **`mainCardTimeout`**: Main trial timeout
  - Duration from `deliveryParams.mainTimeout`
- **`feedbackTimeout`**: Feedback display timeout
  - Duration from `deliveryParams.feedbackTimeout`
- **`ttsPlayback`**: Play TTS audio
- **`speechRecognition`**: SR service (callback-based)
  - Sends events: `VOICE_START`, `VOICE_STOP`, `TRANSCRIPTION_SUCCESS`, `TRANSCRIPTION_ERROR`
- **`videoPlayer`**: Video session player (not yet implemented)

See [services.js](./services.js) for implementations.

## Usage

### Basic Usage (from Svelte component)

```javascript
import { useMachine } from '@xstate/svelte';
import { cardMachine } from './machine';

// In Svelte component
const { state, send } = useMachine(cardMachine);

// Start session
send({ type: 'START', sessionId: '...', unitId: '...', tdfId: '...' });

// Submit answer
send({ type: 'SUBMIT', userAnswer: 'answer', timestamp: Date.now() });

// Access state
$: currentState = $state.value;
$: context = $state.context;
$: isCorrect = context.isCorrect;
```

### State Matching

```javascript
// Check if in a specific state
$: isAwaiting = $state.matches('presenting.awaiting');
$: isStudy = $state.matches('study');
$: isError = $state.matches('error');

// Nested state matching
$: isRecording = $state.matches('presenting.awaiting.speechRecognition.active.recording');
```

### Subscribing to State Changes

```javascript
const { state } = useMachine(cardMachine);

// React to state changes
$: {
  if ($state.matches('presenting.awaiting')) {
    // Enable input UI
  }
  if ($state.matches('feedback.showing')) {
    // Display feedback UI
  }
  if ($state.matches('error')) {
    // Show error message: $state.context.errorMessage
  }
}
```

### Sending Events

```javascript
// From user action
function handleSubmit() {
  send({
    type: 'SUBMIT',
    userAnswer: inputValue,
    timestamp: Date.now(),
  });
}

// From SR component
function handleTranscription(transcript) {
  send({
    type: 'TRANSCRIPTION_SUCCESS',
    transcript,
  });
}
```

### Accessing Context

```javascript
$: display = $state.context.currentDisplay;
$: isCorrect = $state.context.isCorrect;
$: uiSettings = $state.context.uiSettings;
$: testType = $state.context.testType;
$: timestamps = $state.context.timestamps;
```

## Integration Points

### Unit Engine Integration

The machine invokes `selectNextCard` service to fetch the next trial. This service must integrate with `unitEngine.js`:

```javascript
// In services.js
export async function selectNextCard(context, event) {
  // Call unit engine
  const result = await window.unitEngine.selectNextCard({
    sessionId: context.sessionId,
    unitId: context.unitId,
    tdfId: context.tdfId,
    previousIndices: context.engineIndices,
  });

  return result; // CardSelectionResult
}
```

### Answer Assessment Integration

The `validateAnswer` action currently uses simple string comparison. It should integrate with `answerAssess.js`:

```javascript
// In actions.js
export const validateAnswer = assign({
  isCorrect: (context) => {
    return window.answerAssess.checkAnswer(
      context.userAnswer,
      context.currentAnswer,
      context.uiSettings.caseSensitive
    );
  },
});
```

### Speech Recognition Integration

The `speechRecognition` service is a placeholder. It must integrate with Google Cloud Speech API (see `card.js` for existing implementation):

```javascript
// In services.js
export function speechRecognition(context, event) {
  return (callback, onReceive) => {
    // Initialize Google Cloud Speech
    const recognition = window.googleSpeechRecognition.start({
      onVoiceStart: () => callback({ type: 'VOICE_START' }),
      onVoiceStop: () => callback({ type: 'VOICE_STOP' }),
      onTranscript: (transcript) => callback({
        type: 'TRANSCRIPTION_SUCCESS',
        transcript,
      }),
      onError: (error) => callback({
        type: 'TRANSCRIPTION_ERROR',
        error,
      }),
    });

    return () => recognition.stop();
  };
}
```

### History Logging

The `logHistory` action currently just logs to console. It must call Meteor method to save to Histories collection:

```javascript
// In actions.js
export function logHistory(context, event) {
  Meteor.callAsync('logTrialHistory', {
    sessionId: context.sessionId,
    tdfId: context.tdfId,
    unitId: context.unitId,
    testType: context.testType,
    userAnswer: context.userAnswer,
    correctAnswer: context.currentAnswer,
    isCorrect: context.isCorrect,
    isTimeout: context.isTimeout,
    timestamps: context.timestamps,
    engineIndices: context.engineIndices,
  });
}
```

## Testing

### Unit Testing (Guards)

```javascript
import { isStudyTrial, isDrillTrial } from './guards.js';

// Test guards
const studyContext = { testType: 's' };
const drillContext = { testType: 'd' };

assert(isStudyTrial(studyContext) === true);
assert(isDrillTrial(drillContext) === true);
```

### Machine Testing (XState Test)

```javascript
import { createMachine } from 'xstate';
import { createModel } from '@xstate/test';
import { cardMachine } from './cardMachine.js';

// Create test model
const testModel = createModel(cardMachine).withEvents({
  START: { sessionId: '123', unitId: '456', tdfId: '789' },
  SUBMIT: { userAnswer: 'test', timestamp: Date.now() },
  // ... other events
});

// Generate test paths
const testPlans = testModel.getSimplePathPlans();

// Run tests
testPlans.forEach((plan) => {
  plan.paths.forEach((path) => {
    it(path.description, async () => {
      await path.test(/* ... */);
    });
  });
});
```

## State Diagram

```
                  ┌─────────────────────────────┐
                  │                             │
                  │           IDLE              │
                  │                             │
                  └──────────────┬──────────────┘
                                 │ START
                                 │
                  ┌──────────────▼──────────────┐
                  │                             │
                  │        PRESENTING           │
                  │                             │
                  │  ┌──────────────────────┐   │
                  │  │  loading             │   │
                  │  └──────┬───────────────┘   │
                  │         │                    │
                  │  ┌──────▼───────────────┐   │
                  │  │  fadingIn            │   │
                  │  └──────┬───────────────┘   │
                  │         │                    │
                  │  ┌──────▼───────────────┐   │
                  │  │  displaying          │   │
                  │  └──────┬───────────────┘   │
                  │         │                    │
                  │         ├─ study? ────────────────────┐
                  │         │                              │
                  │  ┌──────▼───────────────┐             │
                  │  │  awaiting            │             │
                  │  │  (parallel)          │             │
                  │  │  - inputMode         │             │
                  │  │  - speechRecognition │             │
                  │  │  - mainTimeout       │             │
                  │  └──────┬───────────────┘             │
                  │         │                              │
                  │         ├─ SUBMIT ─────────┐          │
                  │         ├─ TIMEOUT ────────┤          │
                  │         │                   │          │
                  │  ┌──────▼───────────────┐  │          │
                  │  │  submitted/timedOut  │  │          │
                  │  └──────┬───────────────┘  │          │
                  │         │                   │          │
                  └─────────┼───────────────────┘          │
                            │                              │
                ┌───────────▼────────┐         ┌───────────▼────────┐
                │                    │         │                    │
                │      FEEDBACK      │         │       STUDY        │
                │  (drill only)      │         │                    │
                └───────────┬────────┘         └───────────┬────────┘
                            │                              │
                            │                              │
                            │                              │
                  ┌─────────▼──────────────────────────────▼────┐
                  │                                             │
                  │             TRANSITION                      │
                  │                                             │
                  │  start → fadingOut → clearing               │
                  │                                             │
                  └─────────┬───────────────────────────────────┘
                            │
                            ├─ unit finished? → IDLE
                            │
                            └─ continue? → PRESENTING
```

## Error Handling

### Error Severity

Errors are classified as **soft** or **hard** based on `ERROR_SEVERITY_MAP`:

- **Soft errors** (continue to next trial):
  - `ttsPlayback`, `speechRecognition`, `prefetchImage`, `videoPlayer`
- **Hard errors** (stop machine):
  - `selectNextCard`, `logHistory`, `unknown`

### Error Flow

1. Service throws error
2. Machine receives `ERROR` event with `{ source, error }`
3. Guard checks severity via `isHardError` / `isSoftError`
4. **Soft**: Log error, transition to `transition` state (next trial)
5. **Hard**: Log error, transition to `error` state (final)

### Error Message

Error message is stored in `context.errorMessage`:

```javascript
$: errorMessage = $state.context.errorMessage;

{#if $state.matches('error')}
  <div class="error-message">{errorMessage}</div>
{/if}
```

## Performance Considerations

- **Code size**: ~2,500 LOC total for machine + modules (vs 8,700 in old card.js)
- **Complexity**: Reduced cyclomatic complexity with declarative state machine
- **Testability**: Easy to unit test guards, actions, and machine transitions
- **Debuggability**: XState DevTools integration, state transition logging

## Next Steps (Phase 3)

Phase 3 will build the Svelte component architecture:

1. `CardScreen.svelte` - Top-level container
2. `TrialContent.svelte` - Layout handler (over-under vs split)
3. `StimulusDisplay.svelte` - Question/stimulus display
4. `ResponseArea.svelte` - Input area (text/button/SR)
5. `FeedbackDisplay.svelte` - Feedback messages
6. `PerformanceArea.svelte` - Stats + timeout bar

These components will subscribe to the machine state and send events.

## References

- **XState docs**: https://xstate.js.org/docs/
- **@xstate/svelte**: https://xstate.js.org/docs/recipes/svelte.html
- **Phase 1 Plan**: [CARD_REDESIGN_PLAN.md](../../../../../../docs/CARD_REDESIGN_PLAN.md)
- **Original card.js**: [client/views/experiment/card.js](../../card.js)
