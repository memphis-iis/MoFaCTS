/**
 * @fileoverview Type definitions for card XState machine
 * Types are defined using JSDoc for compatibility with existing Meteor codebase
 */

// =============================================================================
// TRIAL TYPES & ENUMS
// =============================================================================

/**
 * @typedef {'s' | 'd' | 't' | 'm' | 'n'} TestType
 * Trial type codes:
 * - 's': Study trial (display answer immediately, no input)
 * - 'd': Drill trial (require input, show feedback)
 * - 't': Test trial (require input, no feedback)
 * - 'm': Force-correct trial (must type exact answer)
 * - 'n': Timed-prompt trial
 */

/**
 * @typedef {'top' | 'left'} StimulusPosition
 * Layout position for stimulus:
 * - 'top': Over-under (vertical) layout
 * - 'left': Left-right (split) layout
 */

/**
 * @typedef {'textEntry' | 'multipleChoice'} InputMode
 * Type of response input for the trial
 */

// =============================================================================
// DISPLAY & CONTENT
// =============================================================================

/**
 * @typedef {Object} CurrentDisplay
 * Content to display for the current trial
 * @property {string} [text] - Plain text stimulus
 * @property {string} [clozeText] - Cloze (fill-in-blank) formatted text
 * @property {string} [imgSrc] - Image URL
 * @property {string} [videoSrc] - Video URL
 * @property {string} [audioSrc] - Audio URL
 * @property {{ creatorName?: string, sourceName?: string, sourceUrl?: string, licenseName?: string, licenseUrl?: string }} [attribution] - Optional media attribution metadata
 */

/**
 * @typedef {Object} ButtonChoice
 * A single multiple choice button option
 * @property {string} verbalChoice - The answer text/value
 * @property {string} buttonName - Display name for button
 * @property {string} buttonValue - Value submitted when clicked
 * @property {boolean} isImage - Whether button shows an image
 */

// =============================================================================
// DELIVERY PARAMS & UI SETTINGS
// =============================================================================

/**
 * @typedef {Object} DeliveryParams
 * Per-trial delivery parameters from TDF
 * @property {string|number} [readyPromptStringDisplayTime] - Ready prompt delay
 * @property {string|number} [prestimulusdisplaytime] - Prestimulus delay
 * @property {string|number} [timeuntilaudio] - Delay before question audio
 * @property {string|number} [forcecorrecttimeout] - Force-correct timeout
 * @property {boolean|string} [forceCorrection] - Force-correct enable flag
 * @property {number} [falseAnswerLimit] - Wrong-option pruning limit
 * @property {string} [feedbackType] - Legacy feedback mode label
 */

/**
 * @typedef {Record<string, unknown>} SetSpec
 */

/**
 * @typedef {Object} UiSettings
 * UI configuration from the canonical field registry.
 *
 * Layout & Display (5)
 * @property {StimulusPosition} stimuliPosition - Layout: 'top' or 'left'
 * @property {boolean} isVideoSession - Video overlay mode
 * @property {string} [videoUrl] - Video URL for video session
 *
 * Feedback Settings
 * @property {boolean} displayCorrectFeedback - Show "Correct!" message
 * @property {boolean} displayIncorrectFeedback - Show "Incorrect" message
 * @property {string} correctMessage - Custom correct feedback text
 * @property {string} incorrectMessage - Custom incorrect feedback text
 * @property {string} correctColor - Correct feedback color (CSS hex)
 * @property {string} incorrectColor - Incorrect feedback color (CSS hex)
 * @property {'onCorrect' | 'onIncorrect' | boolean} displayUserAnswerInFeedback - Show user answer rules
 * @property {boolean} singleLineFeedback - Render feedback in a single line
 * @property {'onCorrect' | 'onIncorrect' | boolean} onlyShowSimpleFeedback - Show only "Correct."/"Incorrect."
 * @property {boolean} [displayCorrectAnswerInIncorrectFeedback] - Show the correct answer after incorrect feedback
 *
 * Performance & Timeouts
 * @property {boolean} displayPerformance - Show performance area
 * @property {boolean} displayTimeoutBar - Show timeout countdown
 *
 * Multiple Choice Settings
 * @property {number} choiceButtonCols - Number of columns for MC buttons (1-4)
 *
 * Text Input Settings
 * @property {boolean} displaySubmitButton - Show submit button
 * @property {string} inputPlaceholderText - Placeholder text for input field
 * @property {boolean} [displayConfirmButton] - Require a confirm action before submission
 * @property {string} [continueButtonText] - Continue or confirm button text
 * @property {string} [skipStudyButtonText] - Skip-study button text
 *
 * Miscellaneous
 * @property {boolean} caseSensitive - Case-sensitive answer checking
 * @property {boolean} displayQuestionNumber - Show the current question number
 */

// =============================================================================
// AUDIO & SPEECH RECOGNITION
// =============================================================================

/**
 * @typedef {Object} AudioState
 * Audio/TTS/SR state flags
 * @property {boolean} ttsRequested - TTS playback requested
 * @property {boolean} recordingLocked - SR locked (e.g., during TTS)
 * @property {boolean} waitingForTranscription - Waiting for SR result
 * @property {number} srAttempts - Current SR attempt count
 * @property {number} maxSrAttempts - Max SR retries (default: 3)
 */

// =============================================================================
// TIMESTAMPS
// =============================================================================

/**
 * @typedef {Object} Timestamps
 * Trial timing data
 * @property {number} trialStart - Trial start timestamp (ms)
 * @property {number} [trialEnd] - Trial end timestamp (ms)
 * @property {number} [firstKeypress] - First keypress timestamp (ms)
 * @property {number} [inputEnabled] - Input enabled timestamp (ms)
 * @property {number} [feedbackStart] - Feedback display start (ms)
 * @property {number} [feedbackEnd] - Feedback display end (ms)
 */

/**
 * @typedef {Object} EngineIndices
 * @property {number} [clusterIndex]
 * @property {number} [stimIndex]
 * @property {number} [whichStim]
 * @property {number} [probabilityEstimate]
 * @property {number} [questionIndex]
 */

/**
 * @typedef {Object} VideoSessionState
 * @property {boolean} isActive
 * @property {Array<unknown>} checkpoints
 * @property {number} currentCheckpointIndex
 * @property {number|null} pendingQuestionIndex
 * @property {boolean} ended
 */

// =============================================================================
// MACHINE CONTEXT
// =============================================================================

/**
 * @typedef {Object} CardMachineContext
 * XState machine context (state data)
 * @property {CurrentDisplay} currentDisplay - Content to display
 * @property {CurrentDisplay} [questionDisplay] - Stored question display for prestimulus swap
 * @property {string} currentAnswer - Correct answer
 * @property {string} originalAnswer - Original answer before processing
 * @property {string} userAnswer - User's submitted answer
 * @property {string} [feedbackMessage] - Feedback text from answer evaluation
 * @property {string} [reviewEntry] - Force-correct review entry (if applicable)
 * @property {boolean} isCorrect - Whether answer was correct
 * @property {boolean} isTimeout - Whether trial timed out
 * @property {boolean} buttonTrial - Multiple choice trial
 * @property {ButtonChoice[]} buttonList - MC button options
 * @property {TestType} testType - Trial type code
 * @property {DeliveryParams} deliveryParams - Delivery parameters
 * @property {UiSettings} uiSettings - UI configuration
 * @property {SetSpec} [setspec] - Active setspec configuration
 * @property {AudioState} audio - Audio/SR state
 * @property {EngineIndices | null} engineIndices - Unit engine indices
 * @property {unknown} [engine] - Unit engine instance
 * @property {boolean} [unitFinished] - Unit completion flag
 * @property {boolean|null} [srGrammarMatch] - SR grammar-match result
 * @property {Record<string, unknown>|null} [preparedTrial] - Machine-owned prepared next-trial payload
 * @property {number} consecutiveTimeouts - Timeout streak counter
 * @property {number} timeoutResetCounter - Main timeout reset counter
  * @property {string} [errorMessage] - Error message when present
 * @property {string} [source] - Answer source ('keyboard', 'button', etc.)
  * @property {Timestamps} timestamps - Trial timing data
  * @property {string} [sessionId] - Current session ID
  * @property {string} [unitId] - Current unit ID
  * @property {string} [tdfId] - Current TDF ID
 * @property {string} [speechHintExclusionList] - SR phrase-hint exclusion list
 * @property {VideoSessionState} [videoSession] - Video session state
 */

// =============================================================================
// MACHINE EVENTS
// =============================================================================

/**
 * @typedef {Object} StartEvent
 * @property {'START'} type
 * @property {string} sessionId - Session ID
 * @property {string} unitId - Unit ID
 * @property {string} tdfId - TDF ID
 */

/**
 * @typedef {Object} CardSelectedEvent
 * @property {'CARD_SELECTED'} type
 * @property {CurrentDisplay} display - Display content
 * @property {string} answer - Correct answer
 * @property {TestType} testType - Trial type
 * @property {boolean} buttonTrial - Is multiple choice
 * @property {ButtonChoice[]} buttonList - MC options
 * @property {DeliveryParams} deliveryParams - Delivery params
 * @property {UiSettings} uiSettings - UI settings
 * @property {SetSpec} [setspec] - Active setspec configuration
 * @property {EngineIndices} engineIndices - Engine indices
 * @property {boolean} [unitFinished] - Unit completion flag
 */

/**
 * @typedef {Object} EnableInputEvent
 * @property {'ENABLE_INPUT'} type
 */

/**
 * @typedef {Object} SubmitEvent
 * @property {'SUBMIT'} type
 * @property {string} userAnswer - User's answer
 * @property {number} timestamp - Submission timestamp
 * @property {string} [source] - Answer source ('keyboard', 'button', etc.)
 */

/**
 * @typedef {Object} TimeoutEvent
 * @property {'TIMEOUT'} type
 */

/**
 * @typedef {Object} FeedbackTimeoutEvent
 * @property {'FEEDBACK_TIMEOUT'} type
 */

/**
 * @typedef {Object} SkipStudyEvent
 * @property {'SKIP_STUDY'} type
 */

/**
 * @typedef {Object} UnitFinishedEvent
 * @property {'UNIT_FINISHED'} type
 */

/**
 * @typedef {Object} EnableSrEvent
 * @property {'ENABLE_SR'} type
 */

/**
 * @typedef {Object} VoiceStartEvent
 * @property {'VOICE_START'} type
 */

/**
 * @typedef {Object} VoiceStopEvent
 * @property {'VOICE_STOP'} type
 */

/**
 * @typedef {Object} TranscriptionSuccessEvent
 * @property {'TRANSCRIPTION_SUCCESS'} type
 * @property {string} transcript - Transcribed text
 * @property {boolean} [isCorrect] - Whether transcript matched grammar
 */

/**
 * @typedef {Object} TranscriptionErrorEvent
 * @property {'TRANSCRIPTION_ERROR'} type
 * @property {unknown} error - Error payload
 * @property {boolean} [silence] - True for no-result/silence cases
 * @property {string} [feedback] - Optional user-facing retry text
 */

/**
 * @typedef {Object} MaxAttemptsReachedEvent
 * @property {'MAX_ATTEMPTS_REACHED'} type
 */

/**
 * @typedef {Object} ErrorEvent
 * @property {'ERROR'} type
 * @property {string} [source] - Error source (service name)
 * @property {unknown} error - Error payload
 * @property {boolean} [silence] - Optional soft-error hint
 */

/**
 * @typedef {Object} TtsCompleteEvent
 * @property {'TTS_COMPLETE'} type
 */

/**
 * @typedef {Object} IncomingReadyEvent
 * @property {'INCOMING_READY'} type
 */

/**
 * @typedef {Object} TransitionCompleteEvent
 * @property {'TRANSITION_COMPLETE'} type
 */

/**
 * @typedef {Object} FirstKeypressEvent
 * @property {'FIRST_KEYPRESS'} type
 * @property {number} timestamp - Keypress timestamp
 */

/**
 * @typedef {Object} InputActivityEvent
 * @property {'INPUT_ACTIVITY'} type
 * @property {number} timestamp - Activity timestamp
 */

/**
 * @typedef {Object} VideoCheckpointEvent
 * @property {'VIDEO_CHECKPOINT'} type
 * @property {number} [checkpointIndex]
 * @property {number} [questionIndex]
 */

/**
 * @typedef {Object} VideoEndedEvent
 * @property {'VIDEO_ENDED'} type
 */

/**
 * @typedef {Object} VideoContinueEvent
 * @property {'VIDEO_CONTINUE'} type
 */

/**
 * @typedef {Object} ResumeVideoEvent
 * @property {'RESUME_VIDEO'} type
 */

/**
 * @typedef {(
 *   StartEvent |
 *   CardSelectedEvent |
 *   EnableInputEvent |
 *   SubmitEvent |
 *   TimeoutEvent |
 *   FeedbackTimeoutEvent |
 *   SkipStudyEvent |
 *   UnitFinishedEvent |
 *   IncomingReadyEvent |
 *   EnableSrEvent |
 *   VoiceStartEvent |
 *   VoiceStopEvent |
 *   TranscriptionSuccessEvent |
 *   TranscriptionErrorEvent |
 *   MaxAttemptsReachedEvent |
 *   ErrorEvent |
 *   TtsCompleteEvent |
 *   TransitionCompleteEvent |
 *   FirstKeypressEvent |
 *   InputActivityEvent |
 *   VideoCheckpointEvent |
 *   VideoEndedEvent |
 *   VideoContinueEvent |
 *   ResumeVideoEvent
 * )} CardMachineEvent
 * Union type of all possible machine events
 */

/**
 * @typedef {Object} CardMachineActorArgs
 * @property {CardMachineContext} context
 * @property {CardMachineEvent} event
 * @property {{ getSnapshot?: () => { value?: unknown, matches?: (stateValue: string) => boolean } }} [self]
 */

// =============================================================================
// SERVICE RESULTS
// =============================================================================

/**
 * @typedef {Object} CardSelectionResult
 * Result from selectNextCard service
 * @property {CurrentDisplay} currentDisplay
 * @property {string} currentAnswer
 * @property {string} originalAnswer
 * @property {TestType} testType
 * @property {boolean} buttonTrial
 * @property {ButtonChoice[]} buttonList
 * @property {DeliveryParams} deliveryParams
 * @property {UiSettings} uiSettings
 * @property {SetSpec} [setspec]
 * @property {EngineIndices} engineIndices
 * @property {boolean} [unitFinished] - If unit is complete
 * @property {number} [questionIndex]
 * @property {unknown} [engine]
 */

/**
 * @typedef {Object} SpeechRecognitionResult
 * Result from speech recognition service
 * @property {string} transcript - Recognized text
 * @property {number} confidence - Recognition confidence (0-1)
 */

// =============================================================================
// EXPORTS (for JSDoc import)
// =============================================================================

export {};





