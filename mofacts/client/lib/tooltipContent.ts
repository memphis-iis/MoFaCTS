/**
 * Tooltip Content for TDF and Stimulus Editors
 *
 * Each field has brief (1 sentence) and verbose (full explanation) versions.
 * Content sourced from MoFaCTS wiki documentation.
 *
 * Field paths use dot notation matching json-editor schema paths.
 * Array items use [] notation (e.g., 'unit[].unitname')
 */

import {
  createDeliveryParamTooltipMap,
  createStimTooltipMap,
  createTdfTooltipMap,
} from '../../common/fieldRegistry';

// =============================================================================
// TDF TOOLTIPS (~60 fields)
// =============================================================================

export const TDF_TOOLTIPS = {
  // ---------------------------------------------------------------------------
  // SETSPEC BASICS
  // ---------------------------------------------------------------------------
  'setspec.lessonname': {
    brief: 'Full display name for the lesson.',
    verbose: 'Full name of the lesson, punctuated as needed. This is displayed to students and in reports.'
  },
  'setspec.stimulusfile': {
    brief: 'Filename of the stimulus JSON file.',
    verbose: 'Filename for corresponding stimulus list. Must match a file uploaded in the same package (e.g., "ch9.10.selected-cloze.json").'
  },
  'setspec.name': {
    brief: 'Short internal name for the TDF.',
    verbose: 'Short name used internally for tracking. Usually a brief identifier without spaces.'
  },
  'setspec.experimentTarget': {
    brief: 'URL path for direct experiment access.',
    verbose: 'Location for no-login link to TDF directly for experiments. Format: the path after your domain (e.g., "myexperiment" creates mofacts.optimallearning.org/experiment/myexperiment).'
  },
  'setspec.userselect': {
    brief: 'Show on student Learning Dashboard.',
    verbose: 'When "true", the TDF is displayed on the main profile/Learning Dashboard page for students to select.'
  },
  'setspec.lfparameter': {
    brief: 'Fuzzy matching threshold (0-1).',
    verbose: 'Percentage of characters that must match for an answer to be correct. Example: 0.85 means 85% match required. If answer is "femur" and student types "feemure", edit distance is 2, max length is 7, so score is 5/7 = 71% which fails an 85% threshold.'
  },
  'setspec.hintsEnabled': {
    brief: 'Enable syllable-based hints.',
    verbose: 'When true, hints are generated on upload for 3+ syllable words, providing 1-2 syllables of support. Hint levels (0, 1, 2) produce different predictions in the learning session probability function.'
  },
  'setspec.tags': {
    brief: 'Searchable category tags.',
    verbose: 'Array of tags for categorizing content (e.g., ["Anatomy and Physiology", "A & P", "Holes"]). Used for filtering and organization.'
  },

  // ---------------------------------------------------------------------------
  // AUDIO / SPEECH SETTINGS
  // ---------------------------------------------------------------------------
  'setspec.speechAPIKey': {
    brief: 'Google Cloud Speech API key.',
    verbose: 'Google Cloud Speech-to-Text API key for speech recognition. Required for SR; without a key the microphone toggle is hidden. Keep this secure.'
  },
  'setspec.textToSpeechAPIKey': {
    brief: 'Google Cloud TTS API key.',
    verbose: 'Google Cloud Text-to-Speech API key. If set, server-side TTS is used; otherwise the browser\'s speechSynthesis API is used as fallback.'
  },
  'setspec.audioInputEnabled': {
    brief: 'Enable speech recognition.',
    verbose: 'When "true", enables speech recognition for the lesson. Must be true AND user must toggle the mic on in the UI for SR to work.'
  },
  'setspec.audioInputSensitivity': {
    brief: 'Speech detection threshold (20-80 dB).',
    verbose: 'Audio threshold used to decide when speech starts and stops. Lower values trigger more easily; higher values require louder speech. Adjustable by students via the profile slider.'
  },
  'setspec.audioPromptMode': {
    brief: 'Default TTS mode.',
    verbose: 'Default prompt mode when learner opens lesson. Options: "silent" (no audio), "question" (read questions), "feedback" (read feedback), "all" (read both). Users can toggle modes in Audio dialog.'
  },
  'setspec.enableAudioPromptAndFeedback': {
    brief: 'Enable text-to-speech.',
    verbose: 'When "true", advertises that the lesson supports audio prompts/feedback (shows headphone icon). Allows questions and feedback to be read aloud.'
  },
  'setspec.speechIgnoreOutOfGrammarResponses': {
    brief: 'Ignore unrecognized speech.',
    verbose: 'When "true", SR ignores transcripts that are not in the current answer set. When "false", all transcriptions are accepted for evaluation. Default: "false".'
  },
  'setspec.speechOutOfGrammarFeedback': {
    brief: 'Message for invalid speech input.',
    verbose: 'Message shown when an out-of-grammar transcript is discarded. Default: "Response not in answer set". Example: "Please say one of the possible answers".'
  },
  'setspec.audioPromptVoice': {
    brief: 'TTS voice for questions.',
    verbose: 'Google/SSML voice ID used for question prompts. Default: "en-US-Standard-A". See Google Cloud TTS documentation for available voices.'
  },
  'setspec.audioPromptFeedbackVoice': {
    brief: 'TTS voice for feedback.',
    verbose: 'Google/SSML voice ID used for feedback prompts. Default: "en-US-Standard-A". Can be different from question voice for variety.'
  },
  'setspec.audioPromptQuestionSpeakingRate': {
    brief: 'Question TTS speed (0.25-4.0).',
    verbose: 'Speed multiplier for question prompts. 1.0 = normal speed, 1.5 = 50% faster, 0.75 = 25% slower. Range: 0.25 to 4.0.'
  },
  'setspec.audioPromptFeedbackSpeakingRate': {
    brief: 'Feedback TTS speed (0.25-4.0).',
    verbose: 'Speed multiplier for feedback prompts. 1.0 = normal speed. Range: 0.25 to 4.0.'
  },
  'setspec.audioPromptSpeakingRate': {
    brief: 'Legacy overall TTS speed.',
    verbose: 'Legacy overall speaking rate. Used if voice-specific rates are omitted. Range: 0.25 to 4.0.'
  },

  // ---------------------------------------------------------------------------
  // CLUSTERING / LOAD BALANCING
  // ---------------------------------------------------------------------------
  'setspec.shuffleclusters': {
    brief: 'Shuffle cluster groups. WARNING: Breaking change!',
    verbose: 'Allows shuffling within groups of n clusters, specified as x-y ranges (e.g., "0-3 4-7"). Each range is shuffled as a unit and replaced in sequence. Ranges may overlap. WARNING: Changing this resets student progress!'
  },
  'setspec.swapclusters': {
    brief: 'Swap cluster group order. WARNING: Breaking change!',
    verbose: 'Allows shuffling of groups of clusters. Non-overlapping ranges are shuffled simultaneously (e.g., "0-3 4-6 7-9" = 3 groups, 6 possible orders). WARNING: Changing this resets student progress!'
  },
  'setspec.loadbalancing': {
    brief: 'Condition assignment mode.',
    verbose: 'Enables load balancing between experiment conditions. "max" selects from conditions with counts lower than the max. "min" selects the condition with the least participants.'
  },
  'setspec.countcompletion': {
    brief: 'When to count participants.',
    verbose: 'Sets where participant count increments. "beginning" = when condition selected, "end" = when all units completed. An integer increments when that unit number starts. Requires loadbalancing to be set.'
  },
  'setspec.condition': {
    brief: 'Experiment condition names.',
    verbose: 'Array of condition names for experiments with multiple conditions. Used with loadbalancing for random assignment.'
  },
  'setspec.randomizedDelivery': {
    brief: 'Number of retention interval conditions.',
    verbose: 'Count of retention interval conditions the TDF contains. Requires units to have lockoutminutes delivery params equal to this count.'
  },
  'setspec.prestimulusDisplay': {
    brief: 'Intertrial prompt text.',
    verbose: 'String displayed as the intertrial prompt before each trial. Duration specified in deliveryparams.prestimulusdisplaytime.'
  },

  // ---------------------------------------------------------------------------
  // PROGRESS REPORTING
  // ---------------------------------------------------------------------------
  'setspec.progressReporterParams': {
    brief: 'Progress report calculation parameters.',
    verbose: 'Array of 6 values: [OptimumDifficulty, trialsForDifficulty, minTrialsForMastery, trialsForMasteryRate, minTrialsForDuration, trialsForTimeEstimate]. Default: [0.7, 30, 60, 30, 90, 60].'
  },
  'setspec.disableProgressReport': {
    brief: 'Hide student progress report.',
    verbose: 'When "true", disables the student progress report display.'
  },

  // ---------------------------------------------------------------------------
  // SIMULATION (for testing)
  // ---------------------------------------------------------------------------
  'setspec.simTimeout': {
    brief: 'Simulation time per trial (ms).',
    verbose: 'How many milliseconds each simulated test takes. Used for automated testing of TDFs.'
  },
  'setspec.simCorrectProb': {
    brief: 'Simulation correct probability (0-1).',
    verbose: 'Chance that each simulated trial is correctly responded to. Range 0 to 1. Used for automated testing.'
  },

  // ---------------------------------------------------------------------------
  // UNIT FIELDS
  // ---------------------------------------------------------------------------
  'unit[].unitname': {
    brief: 'Name for tracking this unit.',
    verbose: 'Unit name used for data tracking and identification in reports.'
  },
  'unit[].unitinstructions': {
    brief: 'Instructions shown before unit.',
    verbose: 'HTML content displayed with a continue button before the unit begins. Can include formatting, images, and tips.'
  },
  'unit[].buttonorder': {
    brief: 'Button arrangement order.',
    verbose: '"fixed" or "random". Controls whether button trial options appear in fixed or randomized order for all trials in this unit.'
  },
  'unit[].buttontrial': {
    brief: 'Use button interface.',
    verbose: 'When "true", trials display as button choices instead of text input. Only applies to learning sessions.'
  },
  'unit[].buttonOptions': {
    brief: 'Button choice options.',
    verbose: 'Comma-delimited list of possible button options. Required if buttontrial is true.'
  },
  'unit[].instructionminseconds': {
    brief: 'Minimum instruction view time.',
    verbose: 'Minimum seconds student must view instructions before proceeding. Helps ensure students read instructions. 0 = no minimum.'
  },
  'unit[].instructionmaxseconds': {
    brief: 'Maximum instruction view time.',
    verbose: 'Maximum seconds allowed for viewing instructions. 0 = no maximum. Used to standardize instruction time across participants.'
  },
  'unit[].picture': {
    brief: 'Image with instructions.',
    verbose: 'Filename of image to display alongside unit instructions.'
  },
  'unit[].continueButtonText': {
    brief: 'Continue button label.',
    verbose: 'Text displayed on the continue button. Default: "Continue".'
  },
  'unit[].countcompletion': {
    brief: 'Count participant at this unit.',
    verbose: 'When true, increments participant count for the root TDF when this unit starts. Requires setspec.loadbalancing to be set.'
  },

  // ---------------------------------------------------------------------------
  // TURK SETTINGS
  // ---------------------------------------------------------------------------
  'unit[].turkemailsubject': {
    brief: 'MTurk reminder email subject.',
    verbose: 'Subject line for Amazon Mechanical Turk message reminding workers to return for subsequent units.'
  },
  'unit[].turkemail': {
    brief: 'MTurk reminder email body.',
    verbose: 'Content of the MTurk email reminder to return for practice.'
  },
  'unit[].turkbonus': {
    brief: 'MTurk bonus amount.',
    verbose: 'Dollar amount of Amazon Turk bonus triggered if this unit is reached.'
  },

  // ---------------------------------------------------------------------------
  // LEARNING SESSION
  // ---------------------------------------------------------------------------
  'unit[].learningsession.clusterlist': {
    brief: 'Range of clusters to use.',
    verbose: 'Consecutive list of x-y pairs indicating sequential chunks of clusters. Example: "0-6 12-17" uses first 7 items, then items 13-18. Must be sequential (12-17 0-6 is invalid).'
  },
  'unit[].learningsession.unitMode': {
    brief: 'Item selection algorithm.',
    verbose: 'Selection algorithm for next item. "distance" picks item closest to optimal probability (measured in logit units). "thresholdceiling" picks item closest to optimal but below threshold.'
  },
  'unit[].learningsession.calculateProbability': {
    brief: 'Custom probability function (JavaScript).',
    verbose: 'JavaScript code block that returns a probability value for item selection. Has access to variables like p.stimSecsSinceLastShown, p.questionSuccessCount, p.overallOutcomeHistory, and pFunc helper functions (logitdec, recency, etc.).'
  },
  'unit[].learningsession.displayminseconds': {
    brief: 'Minimum practice time.',
    verbose: 'Minimum seconds student must practice before they can skip to next unit. 0 = no minimum.'
  },
  'unit[].learningsession.displaymaxseconds': {
    brief: 'Maximum practice time.',
    verbose: 'Maximum seconds allowed for practice. 0 = no maximum. Used to standardize practice duration across participants.'
  },

  // ---------------------------------------------------------------------------
  // ASSESSMENT SESSION
  // ---------------------------------------------------------------------------
  'unit[].assessmentsession.clusterlist': {
    brief: 'Range of clusters to use.',
    verbose: 'Consecutive list of x-y pairs indicating clusters to include. Example: "0-7" uses clusters 0-7. If 10 clusters exist, only 0-7 will be used.'
  },
  'unit[].assessmentsession.randomizegroups': {
    brief: 'Randomize within groups.',
    verbose: 'When "true", randomizes item order within each group name.'
  },
  'unit[].assessmentsession.permutefinalresult': {
    brief: 'Permute final sequence.',
    verbose: 'Regions of schedule to randomly order. Example: "0-10" or "0-3 4-7 8-10" for partitioned permutations. Each region is shuffled individually, then pasted back in order.'
  },
  'unit[].assessmentsession.assignrandomclusters': {
    brief: 'Re-randomize cluster assignment.',
    verbose: 'When "true", re-randomizes clusters as first step of schedule creation. Needed when subsequent units require different randomization than initial units (e.g., pretest-learning-posttest designs).'
  },
  'unit[].assessmentsession.initialpositions': {
    brief: 'Starting positions for template repetitions.',
    verbose: 'Space-separated list of positions for stimuli repetitions (e.g., "A_1 A_2 A_3 B_1 B_2 B_3"). Key information is start location of each template repetition. Serves as logic checksum.'
  },
  'unit[].assessmentsession.randomchoices': {
    brief: 'Number of random stimulus choices.',
    verbose: 'Number of choices when stimulus is selected randomly (used with "r" index in group templates).'
  },
  'unit[].assessmentsession.conditiontemplatesbygroup.groupnames': {
    brief: 'Condition group letters.',
    verbose: 'Single-character group names for each set of templates A to K (e.g., "A B C"). Each letter represents a different condition or practice pattern.'
  },
  'unit[].assessmentsession.conditiontemplatesbygroup.clustersrepeated': {
    brief: 'Repetitions per cluster.',
    verbose: 'Space-separated integers for how many times each cluster repeats in each group. Example: "1 3 3" means clusters display once in group A, three times in B and C.'
  },
  'unit[].assessmentsession.conditiontemplatesbygroup.templatesrepeated': {
    brief: 'Template repetition counts.',
    verbose: 'Space-separated integers for how many times each template repeats. Example: "2 2 2" means groups A, B, and C are each presented twice.'
  },
  'unit[].assessmentsession.conditiontemplatesbygroup.group': {
    brief: 'Trial specifications per group.',
    verbose: 'Array of comma-separated trial specs: "stimIndex,displayMode,trialType,position". stimIndex: 0-indexed item (or "r" for random). displayMode: "f" for fill-in, "b" for button. trialType: "d" drill, "t" test, "s" study. position: 0-indexed location in template.'
  },

  // ---------------------------------------------------------------------------
  // VIDEO SESSION
  // ---------------------------------------------------------------------------
  'unit[].videosession.videosource': {
    brief: 'Video URL.',
    verbose: 'URL of the video to display. Should be a valid URI (e.g., YouTube embed URL or direct video file URL).'
  },
  'unit[].videosession.questions': {
    brief: 'Question cluster indices.',
    verbose: 'Array of cluster indices to display as questions during or after video.'
  },
  'unit[].videosession.questiontimes': {
    brief: 'Question display times.',
    verbose: 'Array of timestamps (in seconds) when each question should appear during video playback.'
  },

  // ---------------------------------------------------------------------------
  // DELIVERY PARAMS
  // ---------------------------------------------------------------------------
  'unit[].deliveryparams.drill': {
    brief: 'Answer timeout (ms).',
    verbose: 'Milliseconds before timeout. Timer resets on each keypress. Example: 30000 = 30 seconds. 0 = no timeout.'
  },
  'unit[].deliveryparams.correctprompt': {
    brief: 'Correct feedback duration (ms).',
    verbose: 'Milliseconds to display "correct" message before advancing. Example: 750 = 0.75 seconds.'
  },
  'unit[].deliveryparams.reviewstudy': {
    brief: 'Incorrect review duration (ms).',
    verbose: 'Milliseconds to display the item after incorrect response for review. Example: 6000 = 6 seconds.'
  },
  'unit[].deliveryparams.purestudy': {
    brief: 'Study trial duration (ms).',
    verbose: 'Milliseconds to display item during study-only trials. Example: 16000 = 16 seconds.'
  },
  'unit[].deliveryparams.lockoutminutes': {
    brief: 'Wait time before next unit.',
    verbose: 'Minutes student must wait before proceeding to next unit. Used for spaced retention intervals. Format: time string.'
  },
  'unit[].deliveryparams.forceCorrection': {
    brief: 'Require correct answer entry.',
    verbose: 'When "true", forces student to type the correct response after feedback before proceeding.'
  },
  'unit[].deliveryparams.skipstudy': {
    brief: 'Allow skipping study trials.',
    verbose: 'When "true", study trials can be skipped by pressing spacebar.'
  },
  'unit[].deliveryparams.showhistory': {
    brief: 'Show scrolling history.',
    verbose: 'When "true", enables scrolling history display during practice showing previous responses.'
  },
  'unit[].deliveryparams.fontsize': {
    brief: 'Display font size.',
    verbose: 'CSS font size for stimulus display. Default: 24.'
  },
  'unit[].deliveryparams.initialview': {
    brief: 'Initial stimulus duration (ms).',
    verbose: 'Milliseconds to show first of 2 stimulus parts before showing second part. Allows 2-part item display.'
  },
  'unit[].deliveryparams.readyPromptString': {
    brief: 'Between-trial prompt text.',
    verbose: 'Text displayed between trials (ready prompt).'
  },
  'unit[].deliveryparams.readyPromptStringDisplayTime': {
    brief: 'Ready prompt duration (ms).',
    verbose: 'Milliseconds to display the ready prompt between trials.'
  },
  'unit[].deliveryparams.practiceseconds': {
    brief: 'Total practice duration.',
    verbose: 'Total seconds for learning session practice. 0 = no limit.'
  },
  'unit[].deliveryparams.correctscore': {
    brief: 'Points for correct answer.',
    verbose: 'Score points added for each correct response. Default: 1.'
  },
  'unit[].deliveryparams.incorrectscore': {
    brief: 'Points for incorrect answer.',
    verbose: 'Score points deducted for each incorrect response. Default: 0 (no penalty).'
  },
  'unit[].deliveryparams.feedbackType': {
    brief: 'Feedback mode.',
    verbose: 'Feedback display type. Currently only "default" is supported. Reserved for future LLM-based feedback modes.'
  },
  'unit[].deliveryparams.falseAnswerLimit': {
    brief: 'Max incorrect attempts per button trial.',
    verbose: 'Maximum incorrect responses allowed for each button trial before moving on. Default: 9999999 (essentially unlimited).'
  },
  'unit[].deliveryparams.useSpellingCorrection': {
    brief: '[DEPRECATED] Use lfparameter instead.',
    verbose: 'DEPRECATED: SymSpell has been removed. Use "lfparameter" for edit distance matching or "allowPhoneticMatching" for phonetic matching instead.'
  },
  'unit[].deliveryparams.allowPhoneticMatching': {
    brief: 'Enable phonetic matching.',
    verbose: 'When "true", enables Double Metaphone phonetic matching for answer evaluation. Helpful for speech recognition.'
  },
  'unit[].deliveryparams.autostopTimeoutThreshold': {
    brief: 'Auto-stop after N timeouts.',
    verbose: 'Number of consecutive timeouts before automatically leaving the page. 0 = disabled. Example: 2 = leave after 2 timeouts in a row.'
  },
  'unit[].deliveryparams.optimalThreshold': {
    brief: 'Override optimal probability.',
    verbose: 'Overrides all stimulus file optimum values (p.stimParameters[1]) with this probability for learning session item selection.'
  },
  'unit[].deliveryparams.forceSpacing': {
    brief: 'Enforce minimum spacing.',
    verbose: 'When "true" (default), ensures minimum spacing of 2 in learning sessions regardless of model. When "false", unit can end gracefully when no available stimuli.'
  },
  'unit[].deliveryparams.resetStudentPerformance': {
    brief: 'Reset displayed progress.',
    verbose: 'When "true", resets user\'s displayed progress. Historical data is preserved, only the display is reset.'
  },
  'unit[].deliveryparams.scoringEnabled': {
    brief: 'Enable scoring display.',
    verbose: 'Enables or disables scoring in learning session. Default: true for learning sessions.'
  },
  'unit[].deliveryparams.timeuntilaudio': {
    brief: 'Delay before question audio (ms).',
    verbose: 'Milliseconds to wait before playing question audio/TTS. Default: 0.'
  },
  'unit[].deliveryparams.timeuntilaudiofeedback': {
    brief: 'Delay before feedback audio (ms).',
    verbose: 'Milliseconds to wait before playing feedback audio after response. Default: 0.'
  },

  // ---------------------------------------------------------------------------
  // UI SETTINGS (setspec level)
  // ---------------------------------------------------------------------------
  'setspec.uiSettings.displayCardTimeoutAsBarOrText': {
    brief: 'Countdown display format.',
    verbose: 'Controls countdown while prompt is visible. Options: "both" (bar and text), "bar", "text", or "false" (hide). Default: "both".'
  },
  'setspec.uiSettings.displayTimeOutDuringStudy': {
    brief: 'Show timer during study.',
    verbose: 'When true, shows the main prompt timer during study trials. Default: true.'
  },
  'setspec.uiSettings.displayPerformanceDuringStudy': {
    brief: 'Show performance during study.',
    verbose: 'When true, shows live performance indicators during study trials. Default: false.'
  },
  'setspec.uiSettings.displayPerformanceDuringTrial': {
    brief: 'Show performance during trials.',
    verbose: 'When true, shows live performance indicators during drill/test trials. Default: true.'
  },
  'setspec.uiSettings.stimuliPosition': {
    brief: 'Prompt placement.',
    verbose: 'Position of prompt relative to response area. Options: "top" or "left". Default: "top".'
  },
  'setspec.uiSettings.choiceButtonCols': {
    brief: 'Button columns.',
    verbose: 'Number of columns for multiple-choice button layout. Default: 1.'
  },
  'setspec.uiSettings.showStimuliBox': {
    brief: 'Show prompt frame.',
    verbose: 'When true, displays background frame around the prompt. Default: true.'
  },
  'setspec.uiSettings.stimuliBoxColor': {
    brief: 'Prompt frame color.',
    verbose: 'CSS color or Bootstrap class for prompt frame. Default: "alert-bg".'
  },
  'setspec.uiSettings.inputPlaceholderText': {
    brief: 'Input placeholder text.',
    verbose: 'Placeholder text in answer input field. Default: "Type your answer here...".'
  },
  'setspec.uiSettings.displayReadyPromptTimeoutAsBarOrText': {
    brief: 'Ready prompt countdown format.',
    verbose: 'How to display ready prompt countdown. Options: "text" or "false" (hide). Default: "false".'
  },
  'setspec.uiSettings.displayConfirmButton': {
    brief: 'Show confirm button.',
    verbose: 'When true, adds a confirm button that must be clicked before proceeding. Default: false.'
  },
  'setspec.uiSettings.continueButtonText': {
    brief: 'Continue button label.',
    verbose: 'Text on Continue/Confirm buttons. Default: "Continue".'
  },
  'setspec.uiSettings.skipStudyButtonText': {
    brief: 'Skip button label.',
    verbose: 'Label for Skip Study button when present. Default: "Skip".'
  },
  'setspec.uiSettings.instructionsTitleDisplay': {
    brief: 'Instructions header style.',
    verbose: 'Controls header on instruction screens. Options: "headerOnly", true (full header), false (no header). Default: "headerOnly".'
  },
  'setspec.uiSettings.lastVideoModalText': {
    brief: 'Final video modal message.',
    verbose: 'Message in modal before returning from final video. Default: "This is the last video, do not progress unless finished with this lesson."'
  },
  'setspec.uiSettings.displayReviewTimeoutAsBarOrText': {
    brief: 'Review countdown format.',
    verbose: 'How to show countdown after incorrect answers. Options: "both", "bar", "text", "false". Default: "both".'
  },
  'setspec.uiSettings.displayUserAnswerInFeedback': {
    brief: 'Show user answer in feedback.',
    verbose: 'When to show user\'s submitted answer in feedback. Options: "onCorrect", "onIncorrect", true (always), false (never). Default: "onIncorrect".'
  },
  'setspec.uiSettings.displayCorrectAnswerInCenter': {
    brief: 'Center correct answer.',
    verbose: 'When true, shows correct answer in dedicated center panel between prompt and response area. Default: false.'
  },
  'setspec.uiSettings.singleLineFeedback': {
    brief: 'Single-line feedback.',
    verbose: 'When true, keeps feedback on one line by stripping line breaks. When false, answer drops beneath Correct/Incorrect text. Default: false.'
  },
  'setspec.uiSettings.feedbackDisplayPosition': {
    brief: 'Feedback position.',
    verbose: 'Where feedback appears. Options: "top" (UserInteraction area), "middle" (feedbackOverride overlay), "bottom" (userLowerInteraction). Default: "middle".'
  },
  'setspec.uiSettings.onlyShowSimpleFeedback': {
    brief: 'Use simple feedback.',
    verbose: 'Replaces full feedback with just "Correct."/"Incorrect." Options: "onCorrect", "onIncorrect", true, false. Default: "onCorrect".'
  },
  'setspec.uiSettings.suppressFeedbackDisplay': {
    brief: 'Hide all feedback.',
    verbose: 'When true, hides feedback interface entirely and advances immediately after answer. Default: false.'
  },
  'setspec.uiSettings.incorrectColor': {
    brief: 'Incorrect label color.',
    verbose: 'HTML color for "Incorrect" labels in feedback. Default: "darkorange".'
  },
  'setspec.uiSettings.correctColor': {
    brief: 'Correct label color.',
    verbose: 'HTML color for "Correct" labels in feedback. Default: "green".'
  },
  'setspec.uiSettings.experimentLoginText': {
    brief: 'Experiment login prompt.',
    verbose: 'Prompt text on experiment login screen before units run. Default: "Amazon Turk ID". Only read from setspec level.'
  },

  // ---------------------------------------------------------------------------
  // UI SETTINGS (unit level - same fields as setspec, override lesson defaults)
  // ---------------------------------------------------------------------------
  'unit[].uiSettings.displayCardTimeoutAsBarOrText': {
    brief: 'Countdown display format.',
    verbose: 'Options: "both", "bar", "text", "false". Overrides setspec value for this unit.'
  },
  'unit[].uiSettings.displayTimeOutDuringStudy': {
    brief: 'Show timer during study.',
    verbose: 'Shows/hides timer during study trials for this unit.'
  },
  'unit[].uiSettings.displayPerformanceDuringStudy': {
    brief: 'Show performance during study.',
    verbose: 'Shows/hides performance indicators during study for this unit.'
  },
  'unit[].uiSettings.displayPerformanceDuringTrial': {
    brief: 'Show performance during trials.',
    verbose: 'Shows/hides performance indicators during drill/test for this unit.'
  },
  'unit[].uiSettings.stimuliPosition': {
    brief: 'Prompt placement.',
    verbose: 'Options: "top" or "left".'
  },
  'unit[].uiSettings.displayReadyPromptTimeoutAsBarOrText': {
    brief: 'Ready prompt countdown.',
    verbose: 'Options: "text" or "false".'
  },
  'unit[].uiSettings.displayReviewTimeoutAsBarOrText': {
    brief: 'Review countdown format.',
    verbose: 'Options: "both", "bar", "text", "false".'
  },
  'unit[].uiSettings.singleLineFeedback': {
    brief: 'Single-line feedback.',
    verbose: 'Keeps feedback on single line when true.'
  },
  'unit[].uiSettings.feedbackDisplayPosition': {
    brief: 'Feedback position.',
    verbose: 'Options: "top", "middle", "bottom".'
  },
  'unit[].uiSettings.displayUserAnswerAtTop': {
    brief: 'Show answer at top.',
    verbose: 'When true, displays user\'s answer at the top of the feedback area.'
  },
  'unit[].uiSettings.displayCorrectAnswerInCenter': {
    brief: 'Center correct answer.',
    verbose: 'Shows correct answer in center panel.'
  },
  'unit[].uiSettings.incorrectColor': {
    brief: 'Incorrect color.',
    verbose: 'HTML color for incorrect feedback.'
  },
  'unit[].uiSettings.correctColor': {
    brief: 'Correct color.',
    verbose: 'HTML color for correct feedback.'
  },
  'unit[].uiSettings.displayUserAnswerInFeedback': {
    brief: 'Show user answer.',
    verbose: 'Options: "onCorrect", "onIncorrect", true, false.'
  },
  'unit[].uiSettings.onlyShowSimpleFeedback': {
    brief: 'Simple feedback.',
    verbose: 'Options: "onCorrect", "onIncorrect", true, false.'
  },
  'unit[].uiSettings.stackChoiceButtons': {
    brief: 'Stack choice buttons.',
    verbose: 'When true, stacks choice buttons vertically instead of in columns.'
  },

  // ---------------------------------------------------------------------------
  // ADAPTIVE LOGIC
  // ---------------------------------------------------------------------------
  'unit[].adaptive': {
    brief: 'Adaptive unit selection.',
    verbose: 'Array of strings defining adaptive logic for selecting subsequent units based on performance.'
  },
  'unit[].adaptiveUnitTemplate': {
    brief: 'Adaptive unit template indices.',
    verbose: 'Array of integers pointing to unit templates for adaptive selection.'
  },
  'unit[].adaptiveLogic': {
    brief: 'Adaptive branching logic.',
    verbose: 'Object defining branching conditions. Keys are scores (e.g., "2", "3"), values are arrays of possible next unit indices.'
  },

  ...createTdfTooltipMap(),
  ...createDeliveryParamTooltipMap()
};

// =============================================================================
// STIMULUS TOOLTIPS (~12 fields)
// =============================================================================

export const STIM_TOOLTIPS = {
  // ---------------------------------------------------------------------------
  // DISPLAY FIELDS
  // ---------------------------------------------------------------------------
  '[].stims[].display.text': {
    brief: 'Question/stimulus text.',
    verbose: 'Main question or stimulus text displayed to the student. HTML is supported for formatting.'
  },
  '[].stims[].display.clozeText': {
    brief: 'Fill-in-the-blank text.',
    verbose: 'Question text with a blank for fill-in. Only matters for partial answers when hints are present. Use with clozeStimulus for the answer word.'
  },
  '[].stims[].display.clozeStimulus': {
    brief: 'Cloze answer word.',
    verbose: 'The answer word to insert in the clozeText blank. Paired with clozeText for fill-in-the-blank questions.'
  },
  '[].stims[].display.imgSrc': {
    brief: 'Image filename.',
    verbose: 'Filename of image to display as the stimulus. Accepted formats: JPEG, PNG, GIF, WebP, SVG. Must be uploaded in the same package.'
  },
  '[].stims[].display.audioSrc': {
    brief: 'Audio filename.',
    verbose: 'Filename of audio to play as the stimulus. Accepted formats: MP3, WAV, OGG, M4A. Must be uploaded in the same package.'
  },
  '[].stims[].display.videoSrc': {
    brief: 'Video URL or filename.',
    verbose: 'URL or filename of video to display. Accepted formats: MP4, WebM, OGG. Can be a URL (e.g., YouTube) or local file.'
  },

  // ---------------------------------------------------------------------------
  // RESPONSE FIELDS
  // ---------------------------------------------------------------------------
  '[].stims[].response.correctResponse': {
    brief: 'Expected correct answer.',
    verbose: 'The exact answer the student should provide. Used for answer evaluation and feedback.'
  },
  '[].stims[].response.incorrectResponses': {
    brief: 'Common wrong answers.',
    verbose: 'Array of common incorrect answers. Optional - helps with speech recognition grammar by defining expected responses.'
  },

  // ---------------------------------------------------------------------------
  // ADVANCED FIELDS
  // ---------------------------------------------------------------------------
  '[].stims[].parameter': {
    brief: 'Optional metadata.',
    verbose: 'Comma-separated optional parameters for advanced scoring algorithms. Second value is reserved for item-specific optimal difficulty threshold.'
  },
  '[].stims[].speechHintExclusionList': {
    brief: 'Speech exclusion words.',
    verbose: 'Words to exclude from speech recognition matching. Helps prevent false positives for common words.'
  },
  '[].stims[].alternateDisplays': {
    brief: 'Additional question variants.',
    verbose: 'Array of alternate display objects (clozeText/clozeStimulus pairs). Provides additional question variations for the same item.'
  },

  ...createStimTooltipMap()

  // NOTE: responseType tooltip removed - image detection is now automatic via isImagePath()
  // The system auto-detects if a response value is an image file path based on extension
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get tooltip mode from localStorage
 * @returns {'none' | 'brief' | 'verbose'} Current tooltip mode
 */
export function getTooltipMode() {
  return localStorage.getItem('tooltipMode') || 'none';
}

/**
 * Set tooltip mode in localStorage
 * @param {'none' | 'brief' | 'verbose'} mode - The tooltip mode to set
 */
export function setTooltipMode(mode: 'none' | 'brief' | 'verbose'): void {
  localStorage.setItem('tooltipMode', mode);
}

/**
 * Inject descriptions into a schema based on tooltip mode
 * @param {Object} schema - JSON schema object to modify
 * @param {Object} tooltips - Tooltip definitions (TDF_TOOLTIPS or STIM_TOOLTIPS)
 * @param {'none' | 'brief' | 'verbose'} mode - Which description to use ('none' uses 'brief' so elements exist, CSS hides them)
 * @returns {Object} Modified schema with descriptions
 */
type TooltipEntry = {
  brief?: string;
  verbose?: string;
  [mode: string]: string | undefined;
};
type TooltipMap = Record<string, TooltipEntry>;

export function injectDescriptions(schema: Record<string, unknown>, tooltips: TooltipMap, mode: 'none' | 'brief' | 'verbose'): Record<string, unknown> {
  const schemaClone = JSON.parse(JSON.stringify(schema));

  // Always inject descriptions so DOM elements exist (CSS hides when mode is 'none')
  // Use 'brief' as fallback when mode is 'none' so elements are created
  const effectiveMode = mode === 'none' ? 'brief' : mode;

  const inject = (obj: Record<string, unknown> | null, path = ''): void => {
    if (!obj || typeof obj !== 'object') return;

    // Handle properties
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties as Record<string, Record<string, unknown>>)) {
        const fieldPath = path ? `${path}.${key}` : key;
        if (tooltips[fieldPath]) {
          (value as { description?: string }).description = tooltips[fieldPath][effectiveMode] ?? '';
        }
        inject(value, fieldPath);
      }
    }

    // Handle array items
    if (obj.items) {
      inject(obj.items as Record<string, unknown>, path + '[]');
    }
  };

  inject(schemaClone);
  return schemaClone;
}

/**
 * Build description cache by storing brief/verbose text as data attributes
 * Call this once after editor is ready - makes subsequent toggles instant
 * @param {HTMLElement} container - The editor container element
 * @param {Object} tooltips - Tooltip definitions (TDF_TOOLTIPS or STIM_TOOLTIPS)
 */
export function buildDescriptionCache(container: HTMLElement, tooltips: TooltipMap): void {
  if (!container) return;

  // Include plain <p> tags that are direct children of schema-path elements (array field descriptions)
  const descElements = container.querySelectorAll('.form-text, .je-desc, p.help-block, small.text-muted, [data-schemapath] > p');

  descElements.forEach((descEl) => {
    const desc = descEl as HTMLElement;
    // Skip if already cached
    if (desc.dataset.descCached) return;

    const schemaPathEl = desc.closest('[data-schemapath]');
    if (!schemaPathEl) return;

    const schemaPath = schemaPathEl.getAttribute('data-schemapath');
    if (!schemaPath) return;

    // Convert json-editor path to tooltip path (done once, stored as attributes)
    const tooltipPath = schemaPath
      .replace(/^root\.?/, '')
      .replace(/\.\d+\./g, '[].')
      .replace(/\.\d+$/g, '[]')
      .replace(/^\d+\./, '[].');

    const tooltip = tooltips[tooltipPath];
    if (tooltip) {
      // Store both versions as data attributes
      desc.dataset.descBrief = tooltip.brief || '';
      desc.dataset.descVerbose = tooltip.verbose || '';
      desc.dataset.descCached = 'true';
    }
  });
}

/**
 * Update descriptions in place - uses cached data attributes for instant switching
 * @param {HTMLElement} container - The editor container element
 * @param {Object} tooltips - Tooltip definitions (used only if cache miss)
 * @param {'none' | 'brief' | 'verbose'} mode - Which description to show
 */
export function updateDescriptionsInPlace(container: HTMLElement, tooltips: TooltipMap, mode: 'none' | 'brief' | 'verbose'): void {
  if (!container) return;

  // CSS class handles 'none' mode instantly
  if (mode === 'none') {
    container.classList.add('hide-descriptions');
    return;
  }
  container.classList.remove('hide-descriptions');

  // Use cached data attributes for brief/verbose (no lookup needed)
  const descElements = container.querySelectorAll('[data-desc-cached="true"]');

  descElements.forEach((descEl) => {
    const desc = descEl as HTMLElement;
    const text = mode === 'brief' ? desc.dataset.descBrief : desc.dataset.descVerbose;
    if (text) {
      desc.textContent = text;
    }
  });
}





