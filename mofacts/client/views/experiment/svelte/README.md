# Card Redesign: Svelte + XState Implementation

This directory contains the Svelte + XState replacement mounted from `card.ts` + `card.html`.

## Status

- ✅ **Phase 2 Complete:** XState machine implementation
- ✅ **Phase 3 Complete:** Svelte component architecture (10 components)
- ✅ **Phase 4 Complete:** UISettings validator (25 kept fields, 22 deprecated)
- ✅ **Phase 5 Integrated:** Meteor + Svelte build is active in the main card route (`Template.card` mounts `CardScreen.svelte`)
- ⏳ **Parity Hardening Ongoing:** see `svelte-app/mofacts/docs/SVELTE_VIDEO_SESSION_AUDIT.md` for remaining behavior-alignment work

## Directory Structure

```
svelte/
├── components/          # 10 Svelte components (Phase 3)
│   ├── CardScreen.svelte           # Main container
│   ├── VideoSessionMode.svelte     # Video session wrapper
│   ├── TrialContent.svelte         # Layout handler (over-under vs split)
│   ├── PerformanceArea.svelte      # Stats + timeout bar
│   ├── StimulusDisplay.svelte      # Question/stimulus display
│   ├── ResponseArea.svelte         # Input mode selector
│   ├── SRStatus.svelte             # Speech recognition indicator
│   ├── TextInput.svelte            # Text entry field
│   ├── MultipleChoice.svelte       # Button choices
│   ├── FeedbackDisplay.svelte      # Feedback messages
│   └── index.ts                    # Export barrel
│
├── machine/             # XState machine (Phase 2)
│   ├── cardMachine.ts              # Main state machine
│   ├── actions.ts                  # State machine actions
│   ├── guards.ts                   # State machine guards
│   ├── services.ts                 # Invoked services
│   ├── constants.ts                # Machine constants & defaults
│   ├── types.ts                    # Type definitions
│   └── index.ts                    # Export barrel
│
├── utils/               # Utilities (Phase 4)
│   ├── uiSettingsValidator.ts      # UISettings sanitization
│   └── uiSettingsValidator.test.ts # Validator tests
│
├── services/            # Runtime service layer (SR, TTS, init/resume, history, video, engine)
└── README.md            # This file
```

## Components

### 1. CardScreen (Main Container)
**File:** `components/CardScreen.svelte`
**Purpose:** Orchestrates all components and XState machine
**Features:**
- Initializes and manages XState machine
- Handles video vs non-video session modes
- Wires events between components and machine
- Debug state display (dev mode only)

**Props:**
- `sessionId` - Session ID
- `unitId` - Unit ID
- `tdfId` - TDF ID
- `engineIndices` - Initial engine state

### 2. VideoSessionMode (Video Wrapper)
**File:** `components/VideoSessionMode.svelte`
**Purpose:** Wraps video player with overlay content
**Features:**
- Plyr video player integration
- Position absolute overlay for trial content
- Video event handling (play, pause, timeupdate, etc.)
- Exposed control methods (play, pause, seek, rewind)

**Props:**
- `videoUrl` - Video source URL
- `isPlaying` - Whether video is playing
- `currentTime` - Current playback time
- `duration` - Video duration
- `showOverlay` - Whether to show overlay content

### 3. TrialContent (Layout Handler)
**File:** `components/TrialContent.svelte`
**Purpose:** Handles layout (over-under vs split) and positions stimulus/response
**Features:**
- Two layout modes: over-under (vertical) and split (left-right)
- Responsive breakpoints (mobile always stacks)
- Contains StimulusDisplay, ResponseArea, and FeedbackDisplay

**Props:**
- `layoutMode` - `'top'` (over-under) or `'left'` (split)
- All stimulus, response, and feedback props (passed through)

### 4. PerformanceArea (Stats + Timeout Bar)
**File:** `components/PerformanceArea.svelte`
**Purpose:** Time + correct stats + timeout bar
**Features:**
- Conditionally rendered based on UISettings
- Zero reserved height when hidden
- Switches between question timeout and feedback countdown
- Legacy time/correct formatting from `curStudentPerformance`

**Props:**
- `showTimeoutBar` - Whether to show timeout bar
- `totalTimeDisplay`, `percentCorrect`
- `cardsSeen`, `totalCards` (optional)
- `timeoutMode` - `'question'`, `'feedback'`, or `'none'`
- `timeoutProgress` - 0-100 percentage
- `remainingTime` - Seconds remaining

### 5. StimulusDisplay (Question Display)
**File:** `components/StimulusDisplay.svelte`
**Purpose:** Displays question/stimulus with support for multiple formats
**Features:**
- Supports text, cloze, image, video, and audio
- Markdown rendering with DOMPurify sanitization
- Fade-in transitions
- Optional question number display

**Props:**
- `display` - Object with `{ text?, clozeText?, imgSrc?, videoSrc?, audioSrc? }`
- `fadeInDuration` - Fade-in duration in ms
- `visible` - Whether to show the display
- `showQuestionNumber` - Whether to show question number
- `questionNumber` - Current question number

### 6. ResponseArea (Input Mode Selector)
**File:** `components/ResponseArea.svelte`
**Purpose:** Renders exactly one input mode at a time
**Features:**
- Selects between TextInput, MultipleChoice, or SRStatus
- Based on machine state/flags
- Consistent min-height to avoid layout shift

**Props:**
- `inputMode` - `'text'`, `'buttons'`, or `'sr'`
- `enabled` - Whether input is enabled
- TextInput props: `userAnswer`, `showSubmitButton`, `inputPlaceholder`
- MultipleChoice props: `buttonList`, `showButtons`, `buttonColumns`
- SRStatus props: `srStatus`, `srAttempt`, `srMaxAttempts`, `srError`, `srTranscript`

### 7. TextInput (Text Entry)
**File:** `components/TextInput.svelte`
**Purpose:** Text entry field with submit button
**Features:**
- Auto-focus on mount
- Enter key submission
- First keypress tracking
- Input event dispatching
- Disabled state styling

**Props:**
- `value` - User's current answer (bindable)
- `enabled` - Whether input is enabled
- `showSubmitButton` - Whether to show submit button
- `placeholder` - Placeholder text
- `autoFocus` - Auto-focus on mount

**Events:**
- `submit` - User submitted answer `{ answer, timestamp }`
- `input` - Input value changed `{ value }`
- `firstKeypress` - First keypress detected `{ timestamp }`

### 8. MultipleChoice (Button Choices)
**File:** `components/MultipleChoice.svelte`
**Purpose:** Displays multiple choice buttons in a grid
**Features:**
- Responsive grid layout (1-4 columns)
- Image or text buttons
- DOMPurify sanitization
- Mobile-responsive (always 1 column on mobile)

**Props:**
- `buttonList` - Array of `{ verbalChoice, buttonName, buttonValue, isImage }`
- `enabled` - Whether buttons are enabled
- `columns` - Number of columns (1-4)
- `showButtons` - Whether to show buttons

**Events:**
- `choice` - User selected choice `{ answer, buttonName, timestamp }`

### 9. SRStatus (Speech Recognition Indicator)
**File:** `components/SRStatus.svelte`
**Purpose:** Lightweight speech recognition status indicator
**Features:**
- Visual status indicators (idle, ready, recording, processing, error)
- Recording pulse animation
- Processing spinner
- Transcript display
- Attempt counter

**Props:**
- `status` - `'idle'`, `'ready'`, `'recording'`, `'processing'`, `'error'`
- `attempt` - Current attempt number
- `maxAttempts` - Maximum attempts
- `errorMessage` - Error message (if status is error)
- `transcript` - Last transcript

**Note:** SR is machine-driven; this component only displays status.

### 10. FeedbackDisplay (Feedback Messages)
**File:** `components/FeedbackDisplay.svelte`
**Purpose:** Displays feedback messages (correct/incorrect)
**Features:**
- Color-coded feedback (correct/incorrect/timeout)
- Single centered HTML feedback block
- User answer display (configurable)
- Correct answer line (suppressed by simple feedback)
- DOMPurify sanitization
- Conditional display based on settings

**Props:**
- `visible` - Whether feedback is visible
- `isCorrect` - Whether answer was correct
- `isTimeout` - Whether answer timed out
- `userAnswer` - User's answer
- `correctAnswer` - Correct answer
- `correctAnswerImageSrc` - Correct answer image URL (button trials)
- `correctMessage`, `incorrectMessage`
- `correctColor`, `incorrectColor`
- `displayCorrectFeedback`, `displayIncorrectFeedback`
- `displayUserAnswerInFeedback`, `singleLineFeedback`, `onlyShowSimpleFeedback`
- `fadeInDuration` - Fade-in duration in ms

## XState Machine

### Top-Level States
```
idle → presenting → (study | feedback | transition) → idle or error
```

### Presenting Substates
```
loading → fadingIn → displaying → awaiting → exit
```

### Transition Substates
```
start → fadingOut → clearing → loop or finish
```

### Trial Types Supported
- `s` (study) - Display → auto-advance
- `d` (drill) - Display → await input → show feedback → advance
- `t` (test) - Display → await input → advance (no feedback)

Other trial types (`m`, `n`, `i`, `f`) trigger error state.

### Context Structure
```javascript
{
  currentDisplay: { text?, clozeText?, imgSrc?, videoSrc?, audioSrc? },
  currentAnswer: string,
  originalAnswer: string,
  userAnswer: string,
  isCorrect: boolean,
  isTimeout: boolean,
  buttonTrial: boolean,
  buttonList: Array,
  testType: 's' | 'd' | 't',
  deliveryParams: DeliveryParams,
  uiSettings: UiSettings,
  audio: {
    ttsRequested: boolean,
    recordingLocked: boolean,
    waitingForTranscription: boolean,
    srAttempts: number,
    maxSrAttempts: number
  },
  engineIndices: any,
  sessionId: string,
  unitId: string,
  tdfId: string,
  consecutiveTimeouts: number,
  errorMessage?: string,
  timestamps: { trialStart, trialEnd, firstKeypress, inputEnabled, feedbackStart }
}
```

## UISettings (Phase 4)

### Kept Fields (25)
**Layout & Display (5):**
- `stimuliPosition` - `'top'` or `'left'`
- `isVideoSession` - boolean
- `videoUrl` - string
- `fadeInDuration` - number (ms)
- `fadeOutDuration` - number (ms)

**Feedback Settings (10):**
- `displayFeedback` - boolean
- `displayCorrectFeedback` - boolean
- `displayIncorrectFeedback` - boolean
- `correctMessage` - string
- `incorrectMessage` - string
- `correctColor` - hex color
- `incorrectColor` - hex color
- `displayUserAnswerInFeedback` - `true`/`false`/`onCorrect`/`onIncorrect`
- `singleLineFeedback` - boolean
- `onlyShowSimpleFeedback` - `true`/`false`/`onCorrect`/`onIncorrect`

**Performance & Timeouts:**
- `displayPerformance` - boolean
- `displayTimeoutBar` - boolean
- `timeoutThreshold` - number

**Multiple Choice Settings (2):**
- `displayMultipleChoiceButtons` - boolean
- `choiceButtonCols` - number (1-4)

**Text Input Settings (3):**
- `displayTextInput` - boolean
- `displaySubmitButton` - boolean
- `inputPlaceholderText` - string

**Audio & SR Settings (2):**
- `enableAudio` - boolean
- `enableSpeechRecognition` - boolean

**Miscellaneous (2):**
- `caseSensitive` - boolean
- `displayQuestionNumber` - boolean

### Removed Fields (14)
See `utils/uiSettingsValidator.js` for full list of deprecated fields and migration guidance.

## Next Steps (Phase 5)

1. **Meteor + Svelte Build Setup**
   - Install `svelte:compiler` Meteor package
   - Add npm dependencies: `svelte`, `@xstate/svelte`, `xstate@^5`
   - Configure Meteor to compile `.svelte` files

2. **FlowRouter Integration**
   - Create mount helper for CardScreen
   - Add admin-first gating logic
   - Query param override for testing (`?newCard=1`)

3. **Lifecycle/Cleanup**
   - Stop timers on unmount
   - Cancel SR, stop TTS
   - Dispose Plyr, unsubscribe Meteor subscriptions
   - Clear image cache

4. **Keep Blaze Fallback**
   - Rename existing files to `card_old.*`
   - Feature flag per-user/server
   - Quick rollback capability

## Development Notes

- All components use DOMPurify for XSS prevention
- Markdown rendering via `marked` package
- Components are mobile-responsive (breakpoints at 768px and 992px)
- Video mode uses Plyr (loaded via CDN, see `public/` for CSS)
- Debug state display available in dev mode (see CardScreen)

## Testing

Test files to be added in Phase 7:
- Unit tests for XState machine transitions
- Component render tests (Svelte testing library)
- Integration tests for canonical resume from experiment state + history
- E2E smoke tests for trial flows

## Documentation

See also:
- `docs/CARD_REDESIGN_PLAN.md` - Full redesign plan (all phases)
- `machine/README.md` - XState machine documentation (to be created)
- Phase 6-8 implementation details (coming soon)

---

**Last Updated:** 2024-12-16
**Phase 3 Status:** ✅ COMPLETE
