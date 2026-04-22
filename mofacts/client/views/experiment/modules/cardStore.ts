import { ReactiveDict } from 'meteor/reactive-dict';
/** @typedef {import('../../../../common/types/card').CardRuntimeState} CardRuntimeState */
/** @typedef {'waitingForTranscription' | 'audioInputModeEnabled'} SrStateKey */
/** @typedef {'current'} TrialStateKey */
/** @typedef {'name'} TimeoutStateKey */
/** @typedef {string} CardStateKey */

const cardStateDict = new ReactiveDict('cardState');
const srStateDict = new ReactiveDict('speechRecognition');
const trialStateDict = new ReactiveDict('trialStateMachine');
const timeoutStateDict = new ReactiveDict('timeouts');

const CardKeys = Object.freeze({
  BUTTON_TRIAL: 'buttonTrial',
  BUTTON_LIST: 'buttonList',
  DISPLAY_FEEDBACK: 'displayFeedback',
  RECORDING: 'recording',
  RECORDING_LOCKED: 'recordingLocked',
  IN_FEEDBACK: 'inFeedback',
  DISPLAY_READY: 'displayReady',
  INPUT_READY: 'inputReady',
  TRIAL_START_TIMESTAMP: 'trialStartTimestamp',
  TRIAL_END_TIMESTAMP: 'trialEndTimeStamp',
  CARD_START_TIMESTAMP: 'cardStartTimestamp',
  AUDIO_RECORDER_INITIALIZED: 'audioRecorderInitialized',
  ENTER_KEY_LOCK: 'enterKeyLock',
  DEBUG_TRIAL_STATE: '_debugTrialState',
  DEBUG_PARMS: 'debugParms',
  WAS_REPORTED_FOR_REMOVAL: 'wasReportedForRemoval',
  NUM_VISIBLE_CARDS: 'numVisibleCards',
  SCROLL_LIST_COUNT: 'scrollListCount',
  SUBMISSION_LOCK: 'submmissionLock',
  PAUSED_LOCKS: 'pausedLocks',
  FEEDBACK_UNSET: 'feedbackUnset',
  BUTTON_ENTRIES_TEMP: 'buttonEntriesTemp',
  CUR_TIMEOUT_ID: 'CurTimeoutId',
  CUR_INTERVAL_ID: 'CurIntervalId',
  VAR_LEN_TIMEOUT_NAME: 'varLenTimeoutName',
  MAIN_CARD_TIMEOUT_START: 'mainCardTimeoutStart',
  QUESTION_INDEX: 'questionIndex',
  HIDDEN_ITEMS: 'hiddenItems',
  REVIEW_STUDY_COUNTDOWN: 'ReviewStudyCountdown',
  CURRENT_SCORE: 'currentScore',
  CURRENT_DISPLAY: 'currentDisplay',
  USER_ANSWER: 'userAnswer',
  CURRENT_ANSWER: 'currentAnswer',
  CURRENT_VIDEO_SOURCE: 'videoSource',
  TTS_WARMED_UP: 'ttsWarmedUp',
  SR_WARMED_UP: 'srWarmedUp',
  AUDIO_WARMUP_IN_PROGRESS: 'audioWarmupInProgress',
  TTS_REQUESTED: 'ttsRequested',
  IS_TIMEOUT: 'isTimeout',
  IS_CORRECT_ACCUMULATOR: 'isCorrectAccumulator',
  FEEDBACK_FOR_ANSWER: 'feedbackForAnswer',
  SKIP_TIMEOUT: 'skipTimeout',
  FEEDBACK_TIMEOUT_BEGINS: 'feedbackTimeoutBegins',
  FEEDBACK_TIMEOUT_ENDS: 'feedbackTimeoutEnds',
  FEEDBACK_TYPE_FROM_HISTORY: 'feedbackTypeFromHistory',
  ALTERNATE_DISPLAY_INDEX: 'alternateDisplayIndex',
  ORIGINAL_QUESTION: 'originalQuestion',
  IGNORE_OUT_OF_GRAMMAR_RESPONSES: 'ignoreOutOfGrammarResponses',
  SAMPLE_RATE: 'sampleRate',
  SCORING_ENABLED: 'scoringEnabled',
  CLUSTER_STATE: 'clusterState',
  STIMULUS_STATE: 'stimulusState',
  RESPONSE_STATE: 'responseState',
  NUM_QUESTIONS_ANSWERED: 'numQuestionsAnswered',
  NUM_QUESTIONS_ANSWERED_CURRENT_UNIT: 'numQuestionsAnsweredCurrentUnit',
  NUM_CORRECT_ANSWERS: 'numCorrectAnswers',
});

const CARD_DEFAULTS = Object.freeze({
  [CardKeys.BUTTON_TRIAL]: false,
  [CardKeys.BUTTON_LIST]: [],
  [CardKeys.SCROLL_LIST_COUNT]: 0,
  [CardKeys.WAS_REPORTED_FOR_REMOVAL]: false,
  [CardKeys.NUM_VISIBLE_CARDS]: 0,
  [CardKeys.RECORDING_LOCKED]: false,
  [CardKeys.RECORDING]: false,
  [CardKeys.TRIAL_START_TIMESTAMP]: 0,
  [CardKeys.TRIAL_END_TIMESTAMP]: 0,
  [CardKeys.CARD_START_TIMESTAMP]: 0,
  [CardKeys.AUDIO_RECORDER_INITIALIZED]: false,
  [CardKeys.ENTER_KEY_LOCK]: false,
  [CardKeys.DEBUG_TRIAL_STATE]: undefined,
  [CardKeys.DEBUG_PARMS]: undefined,
  [CardKeys.IN_FEEDBACK]: false,
  [CardKeys.DISPLAY_FEEDBACK]: false,
  [CardKeys.DISPLAY_READY]: false,
  [CardKeys.INPUT_READY]: false,
  [CardKeys.SUBMISSION_LOCK]: false,
  [CardKeys.PAUSED_LOCKS]: 0,
  [CardKeys.FEEDBACK_UNSET]: false,
  [CardKeys.BUTTON_ENTRIES_TEMP]: undefined,
  [CardKeys.CUR_TIMEOUT_ID]: undefined,
  [CardKeys.CUR_INTERVAL_ID]: undefined,
  [CardKeys.VAR_LEN_TIMEOUT_NAME]: null,
  [CardKeys.MAIN_CARD_TIMEOUT_START]: undefined,
  [CardKeys.QUESTION_INDEX]: 0,
  [CardKeys.HIDDEN_ITEMS]: [],
  [CardKeys.REVIEW_STUDY_COUNTDOWN]: undefined,
  [CardKeys.CURRENT_SCORE]: 0,
  [CardKeys.CURRENT_DISPLAY]: {},
  [CardKeys.USER_ANSWER]: undefined,
  [CardKeys.CURRENT_ANSWER]: undefined,
  [CardKeys.CURRENT_VIDEO_SOURCE]: undefined,
  [CardKeys.TTS_WARMED_UP]: false,
  [CardKeys.SR_WARMED_UP]: false,
  [CardKeys.AUDIO_WARMUP_IN_PROGRESS]: false,
  [CardKeys.TTS_REQUESTED]: false,
  [CardKeys.IS_TIMEOUT]: false,
  [CardKeys.IS_CORRECT_ACCUMULATOR]: false,
  [CardKeys.FEEDBACK_FOR_ANSWER]: undefined,
  [CardKeys.SKIP_TIMEOUT]: false,
  [CardKeys.FEEDBACK_TIMEOUT_BEGINS]: undefined,
  [CardKeys.FEEDBACK_TIMEOUT_ENDS]: undefined,
  [CardKeys.FEEDBACK_TYPE_FROM_HISTORY]: undefined,
  [CardKeys.ALTERNATE_DISPLAY_INDEX]: undefined,
  [CardKeys.ORIGINAL_QUESTION]: undefined,
  [CardKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES]: false,
  [CardKeys.SAMPLE_RATE]: undefined,
  [CardKeys.SCORING_ENABLED]: undefined,
});

const SR_DEFAULTS = Object.freeze({
  waitingForTranscription: false,
  audioInputModeEnabled: false,
});

const TimeoutKeys = Object.freeze({
  ACTIVE_TIMEOUT_HANDLE: 'name',
});

const TIMEOUT_DEFAULTS = Object.freeze({
  [TimeoutKeys.ACTIVE_TIMEOUT_HANDLE]: null,
});

const TrialStateKeys = Object.freeze({
  CURRENT: 'current',
});

const TRIAL_DEFAULTS = Object.freeze({
  [TrialStateKeys.CURRENT]: null,
});

function cloneValue(value: any): any {
  if (Array.isArray(value)) {
    return value.slice();
  }
  if (value && typeof value === 'object') {
    return { ...value };
  }
  return value;
}

/**
 * @param {ReactiveDict} dict
 * @param {Record<string, unknown>} defaults
 */
function seedDefaults(dict: any, defaults: Record<string, any>): void {
  Object.entries(defaults).forEach(([key, value]) => {
    dict.set(key, cloneValue(value));
  });
}

const CardStore: any = {
  /** @returns {void} */
  initialize() {
    seedDefaults(cardStateDict, CARD_DEFAULTS);
    seedDefaults(srStateDict, SR_DEFAULTS);
    seedDefaults(trialStateDict, TRIAL_DEFAULTS);
    seedDefaults(timeoutStateDict, TIMEOUT_DEFAULTS);
  },

  /** @returns {void} */
  destroy() {
    cardStateDict.clear();
    srStateDict.clear();
    timeoutStateDict.clear();
    trialStateDict.clear();
  },

  /** @returns {void} */
  resetReactiveDefaults() {
    seedDefaults(cardStateDict, CARD_DEFAULTS);
    seedDefaults(srStateDict, SR_DEFAULTS);
    seedDefaults(trialStateDict, TRIAL_DEFAULTS);
    seedDefaults(timeoutStateDict, TIMEOUT_DEFAULTS);
  },

  /**
   * @param {CardStateKey} key
   * @returns {unknown}
   */
  getCardValue(key: any) {
    return cardStateDict.get(key);
  },

  /**
   * @param {CardStateKey} key
   * @param {unknown} value
   * @returns {void}
   */
  setCardValue(key: any, value: any) {
    cardStateDict.set(key, value);
  },

  /**
   * @param {SrStateKey} key
   * @returns {unknown}
   */
  getSrValue(key: any) {
    return srStateDict.get(key);
  },

  /**
   * @param {SrStateKey} key
   * @param {unknown} value
   * @returns {void}
   */
  setSrValue(key: any, value: any) {
    srStateDict.set(key, value);
  },

  /** @returns {void} */
  resetTrialStateDefaults() {
    seedDefaults(trialStateDict, TRIAL_DEFAULTS);
  },

  /**
   * @param {TrialStateKey} [key='current']
   * @returns {unknown}
   */
  getTrialStateValue(key: any = TrialStateKeys.CURRENT) {
    return trialStateDict.get(key);
  },

  /**
   * @param {TrialStateKey} key
   * @param {unknown} value
   * @returns {void}
   */
  setTrialStateValue(key: any, value: any) {
    trialStateDict.set(key, value);
  },

  /**
   * @returns {CardRuntimeState | null}
   */
  getCurrentTrialState() {
    return trialStateDict.get(TrialStateKeys.CURRENT);
  },

  /**
   * @param {CardRuntimeState | null} value
   * @returns {void}
   */
  setCurrentTrialState(value: any) {
    trialStateDict.set(TrialStateKeys.CURRENT, value);
  },

  /** @returns {boolean} */
  isTtsWarmedUp() {
    return !!cardStateDict.get(CardKeys.TTS_WARMED_UP);
  },

  /** @param {unknown} value @returns {void} */
  setTtsWarmedUp(value: any) {
    cardStateDict.set(CardKeys.TTS_WARMED_UP, !!value);
  },

  /** @returns {boolean} */
  isSrWarmedUp() {
    return !!cardStateDict.get(CardKeys.SR_WARMED_UP);
  },

  /** @param {unknown} value @returns {void} */
  setSrWarmedUp(value: any) {
    cardStateDict.set(CardKeys.SR_WARMED_UP, !!value);
  },

  /** @returns {boolean} */
  isAudioInputModeEnabled() {
    return !!srStateDict.get('audioInputModeEnabled');
  },

  /** @param {unknown} value @returns {void} */
  setAudioInputModeEnabled(value: any) {
    srStateDict.set('audioInputModeEnabled', !!value);
  },

  /** @returns {boolean} */
  isWaitingForTranscription() {
    return !!srStateDict.get('waitingForTranscription');
  },

  /** @param {unknown} value @returns {void} */
  setWaitingForTranscription(value: any) {
    srStateDict.set('waitingForTranscription', !!value);
  },

  /** @returns {boolean} */
  isAudioWarmupInProgress() {
    return !!cardStateDict.get(CardKeys.AUDIO_WARMUP_IN_PROGRESS);
  },

  /** @param {unknown} value @returns {void} */
  setAudioWarmupInProgress(value: any) {
    cardStateDict.set(CardKeys.AUDIO_WARMUP_IN_PROGRESS, !!value);
  },

  /** @returns {boolean} */
  isTtsRequested() {
    return !!cardStateDict.get(CardKeys.TTS_REQUESTED);
  },

  /** @param {unknown} value @returns {void} */
  setTtsRequested(value: any) {
    cardStateDict.set(CardKeys.TTS_REQUESTED, !!value);
  },

  /** @returns {boolean} */
  isAudioRecorderInitialized() {
    return !!cardStateDict.get(CardKeys.AUDIO_RECORDER_INITIALIZED);
  },

  /** @param {unknown} value @returns {void} */
  setAudioRecorderInitialized(value: any) {
    cardStateDict.set(CardKeys.AUDIO_RECORDER_INITIALIZED, !!value);
  },

  /** @returns {boolean} */
  isButtonTrial() {
    return !!cardStateDict.get(CardKeys.BUTTON_TRIAL);
  },

  /** @param {unknown} value @returns {void} */
  setButtonTrial(value: any) {
    cardStateDict.set(CardKeys.BUTTON_TRIAL, !!value);
  },

  /** @returns {unknown[]} */
  getButtonList() {
    return cardStateDict.get(CardKeys.BUTTON_LIST) || [];
  },

  /** @param {unknown[] | null | undefined} value @returns {void} */
  setButtonList(value: any) {
    cardStateDict.set(CardKeys.BUTTON_LIST, value || []);
  },

  /** @returns {boolean} */
  getDisplayFeedback() {
    return !!cardStateDict.get(CardKeys.DISPLAY_FEEDBACK);
  },

  /** @param {unknown} value @returns {void} */
  setDisplayFeedback(value: any) {
    cardStateDict.set(CardKeys.DISPLAY_FEEDBACK, !!value);
  },

  /** @returns {boolean} */
  isRecording() {
    return !!cardStateDict.get(CardKeys.RECORDING);
  },

  /** @param {unknown} value @returns {void} */
  setRecording(value: any) {
    cardStateDict.set(CardKeys.RECORDING, !!value);
  },

  /** @returns {boolean} */
  isRecordingLocked() {
    return !!cardStateDict.get(CardKeys.RECORDING_LOCKED);
  },

  /** @param {unknown} value @returns {void} */
  setRecordingLocked(value: any) {
    cardStateDict.set(CardKeys.RECORDING_LOCKED, !!value);
  },

  /** @returns {boolean} */
  isSubmissionLocked() {
    return !!cardStateDict.get(CardKeys.SUBMISSION_LOCK);
  },

  /** @param {unknown} value @returns {void} */
  setSubmissionLocked(value: any) {
    cardStateDict.set(CardKeys.SUBMISSION_LOCK, !!value);
  },

  /** @returns {boolean} */
  isEnterKeyLocked() {
    return !!cardStateDict.get(CardKeys.ENTER_KEY_LOCK);
  },

  /** @param {unknown} value @returns {void} */
  setEnterKeyLock(value: any) {
    cardStateDict.set(CardKeys.ENTER_KEY_LOCK, !!value);
  },

  /** @returns {number} */
  getPausedLocks() {
    return cardStateDict.get(CardKeys.PAUSED_LOCKS) || 0;
  },

  /** @param {number} value @returns {void} */
  setPausedLocks(value: any) {
    cardStateDict.set(CardKeys.PAUSED_LOCKS, value);
  },

  /** @param {number} [delta=1] @returns {void} */
  incrementPausedLocks(delta: number = 1) {
    const current = Number(cardStateDict.get(CardKeys.PAUSED_LOCKS) || 0);
    cardStateDict.set(CardKeys.PAUSED_LOCKS, current + delta);
  },

  /** @param {number} [delta=1] @returns {void} */
  decrementPausedLocks(delta: number = 1) {
    const current = Number(cardStateDict.get(CardKeys.PAUSED_LOCKS) || 0);
    cardStateDict.set(CardKeys.PAUSED_LOCKS, Math.max(0, current - delta));
  },

  /** @returns {boolean} */
  isInFeedback() {
    return !!cardStateDict.get(CardKeys.IN_FEEDBACK);
  },

  /** @param {unknown} value @returns {void} */
  setInFeedback(value: any) {
    cardStateDict.set(CardKeys.IN_FEEDBACK, !!value);
  },

  /** @returns {boolean} */
  isDisplayReady() {
    return !!cardStateDict.get(CardKeys.DISPLAY_READY);
  },

  /** @param {unknown} value @returns {void} */
  setDisplayReady(value: any) {
    cardStateDict.set(CardKeys.DISPLAY_READY, !!value);
  },

  /** @returns {boolean} */
  isInputReady() {
    return !!cardStateDict.get(CardKeys.INPUT_READY);
  },

  /** @param {unknown} value @returns {void} */
  setInputReady(value: any) {
    cardStateDict.set(CardKeys.INPUT_READY, !!value);
  },

  /** @returns {boolean} */
  isFeedbackUnset() {
    return !!cardStateDict.get(CardKeys.FEEDBACK_UNSET);
  },

  /** @param {unknown} value @returns {void} */
  setFeedbackUnset(value: any) {
    cardStateDict.set(CardKeys.FEEDBACK_UNSET, !!value);
  },

  /** @returns {boolean} */
  wasReportedForRemoval() {
    return !!cardStateDict.get(CardKeys.WAS_REPORTED_FOR_REMOVAL);
  },

  /** @param {unknown} value @returns {void} */
  setWasReportedForRemoval(value: any) {
    cardStateDict.set(CardKeys.WAS_REPORTED_FOR_REMOVAL, !!value);
  },

  /** @returns {number} */
  getNumVisibleCards() {
    return cardStateDict.get(CardKeys.NUM_VISIBLE_CARDS) || 0;
  },

  /** @param {number} value @returns {void} */
  setNumVisibleCards(value: any) {
    cardStateDict.set(CardKeys.NUM_VISIBLE_CARDS, value);
  },

  /** @param {number} delta @returns {void} */
  adjustNumVisibleCards(delta: any) {
    const current = cardStateDict.get(CardKeys.NUM_VISIBLE_CARDS) || 0;
    cardStateDict.set(CardKeys.NUM_VISIBLE_CARDS, current + delta);
  },

  /** @returns {number} */
  getScrollListCount() {
    return cardStateDict.get(CardKeys.SCROLL_LIST_COUNT) || 0;
  },

  /** @param {number} value @returns {void} */
  setScrollListCount(value: any) {
    cardStateDict.set(CardKeys.SCROLL_LIST_COUNT, value || 0);
  },

  /** @returns {number} */
  getTrialStartTimestamp() {
    return cardStateDict.get(CardKeys.TRIAL_START_TIMESTAMP) || 0;
  },

  /** @param {number} value @returns {void} */
  setTrialStartTimestamp(value: any) {
    cardStateDict.set(CardKeys.TRIAL_START_TIMESTAMP, value || 0);
  },

  /** @returns {number} */
  getTrialEndTimestamp() {
    return cardStateDict.get(CardKeys.TRIAL_END_TIMESTAMP) || 0;
  },

  /** @param {number} value @returns {void} */
  setTrialEndTimestamp(value: any) {
    cardStateDict.set(CardKeys.TRIAL_END_TIMESTAMP, value || 0);
  },

  /** @returns {number} */
  getCardStartTimestamp() {
    return cardStateDict.get(CardKeys.CARD_START_TIMESTAMP) || 0;
  },

  /** @param {number} value @returns {void} */
  setCardStartTimestamp(value: any) {
    cardStateDict.set(CardKeys.CARD_START_TIMESTAMP, value || 0);
  },

  /** @returns {unknown} */
  getButtonEntriesTemp() {
    return cardStateDict.get(CardKeys.BUTTON_ENTRIES_TEMP);
  },

  /** @param {unknown} value @returns {void} */
  setButtonEntriesTemp(value: any) {
    cardStateDict.set(CardKeys.BUTTON_ENTRIES_TEMP, value);
  },

  /** @returns {number} */
  getQuestionIndex() {
    return cardStateDict.get(CardKeys.QUESTION_INDEX) || 0;
  },

  /** @param {number} value @returns {void} */
  setQuestionIndex(value: any) {
    cardStateDict.set(CardKeys.QUESTION_INDEX, value || 0);
  },

  /** @param {number} [delta=1] @returns {void} */
  incrementQuestionIndex(delta: number = 1) {
    const current = Number(cardStateDict.get(CardKeys.QUESTION_INDEX) || 0);
    cardStateDict.set(CardKeys.QUESTION_INDEX, current + delta);
  },

  /** @returns {void} */
  resetQuestionIndex() {
    cardStateDict.set(CardKeys.QUESTION_INDEX, 0);
  },

  /** @returns {unknown} */
  getCurTimeoutId() {
    return cardStateDict.get(CardKeys.CUR_TIMEOUT_ID);
  },

  /** @param {unknown} value @returns {void} */
  setCurTimeoutId(value: any) {
    cardStateDict.set(CardKeys.CUR_TIMEOUT_ID, value);
  },

  /** @returns {unknown} */
  getCurIntervalId() {
    return cardStateDict.get(CardKeys.CUR_INTERVAL_ID);
  },

  /** @param {unknown} value @returns {void} */
  setCurIntervalId(value: any) {
    cardStateDict.set(CardKeys.CUR_INTERVAL_ID, value);
  },

  /** @returns {unknown} */
  getVarLenTimeoutName() {
    return cardStateDict.get(CardKeys.VAR_LEN_TIMEOUT_NAME);
  },

  /** @param {unknown} value @returns {void} */
  setVarLenTimeoutName(value: any) {
    cardStateDict.set(CardKeys.VAR_LEN_TIMEOUT_NAME, value);
  },

  /** @returns {unknown[]} */
  getHiddenItems() {
    return cardStateDict.get(CardKeys.HIDDEN_ITEMS) || [];
  },

  /** @param {unknown[] | undefined} [value=[]] @returns {void} */
  setHiddenItems(value = []) {
    const next = Array.isArray(value) ? value.slice() : [];
    cardStateDict.set(CardKeys.HIDDEN_ITEMS, next);
  },

  /** @param {unknown} item @returns {void} */
  addHiddenItem(item: any) {
    const current = this.getHiddenItems();
    if (current.includes(item)) return;
    this.setHiddenItems([...current, item]);
  },

  /** @returns {void} */
  resetHiddenItems() {
    this.setHiddenItems([]);
  },

  /** @returns {unknown} */
  getMainCardTimeoutStart() {
    return cardStateDict.get(CardKeys.MAIN_CARD_TIMEOUT_START);
  },

  /** @param {unknown} value @returns {void} */
  setMainCardTimeoutStart(value: any) {
    cardStateDict.set(CardKeys.MAIN_CARD_TIMEOUT_START, value);
  },

  /** @returns {number} */
  getCurrentScore() {
    return cardStateDict.get(CardKeys.CURRENT_SCORE) || 0;
  },

  /** @param {number} value @returns {void} */
  setCurrentScore(value: any) {
    cardStateDict.set(CardKeys.CURRENT_SCORE, value);
  },

  /** @returns {unknown} */
  getScoringEnabled() {
    return cardStateDict.get(CardKeys.SCORING_ENABLED);
  },

  /** @param {unknown} value @returns {void} */
  setScoringEnabled(value: any) {
    cardStateDict.set(CardKeys.SCORING_ENABLED, value);
  },

  /** @returns {Record<string, unknown>} */
  getCurrentDisplay() {
    return cardStateDict.get(CardKeys.CURRENT_DISPLAY);
  },

  /** @param {Record<string, unknown>} value @returns {void} */
  setCurrentDisplay(value: any) {
    cardStateDict.set(CardKeys.CURRENT_DISPLAY, value);
  },

  /** @returns {unknown} */
  getAlternateDisplayIndex() {
    return cardStateDict.get(CardKeys.ALTERNATE_DISPLAY_INDEX);
  },

  /** @param {unknown} value @returns {void} */
  setAlternateDisplayIndex(value: any) {
    cardStateDict.set(CardKeys.ALTERNATE_DISPLAY_INDEX, value);
  },

  /** @returns {unknown} */
  getOriginalQuestion() {
    return cardStateDict.get(CardKeys.ORIGINAL_QUESTION);
  },

  /** @param {unknown} value @returns {void} */
  setOriginalQuestion(value: any) {
    cardStateDict.set(CardKeys.ORIGINAL_QUESTION, value);
  },

  /** @returns {unknown} */
  getUserAnswer() {
    return cardStateDict.get(CardKeys.USER_ANSWER);
  },

  /** @param {unknown} value @returns {void} */
  setUserAnswer(value: any) {
    cardStateDict.set(CardKeys.USER_ANSWER, value);
  },

  /** @returns {boolean | undefined} */
  getIgnoreOutOfGrammarResponses() {
    const value = cardStateDict.get(CardKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES);
    // Return undefined if not explicitly set, so fallback TDF check can trigger
    return value === undefined ? undefined : !!value;
  },

  /** @param {unknown} value @returns {void} */
  setIgnoreOutOfGrammarResponses(value: any) {
    cardStateDict.set(CardKeys.IGNORE_OUT_OF_GRAMMAR_RESPONSES, !!value);
  },

  /** @returns {unknown} */
  getSampleRate() {
    return cardStateDict.get(CardKeys.SAMPLE_RATE);
  },

  /** @param {unknown} value @returns {void} */
  setSampleRate(value: any) {
    cardStateDict.set(CardKeys.SAMPLE_RATE, value);
  },

  /** @param {unknown} value @returns {void} */
  setCurrentAnswer(value: any) {
    cardStateDict.set(CardKeys.CURRENT_ANSWER, value);
  },

  /** @returns {unknown} */
  getCurrentAnswer() {
    return cardStateDict.get(CardKeys.CURRENT_ANSWER);
  },

  /** @param {unknown} value @returns {void} */
  setVideoSource(value: any) {
    cardStateDict.set(CardKeys.CURRENT_VIDEO_SOURCE, value);
  },

  /** @returns {unknown} */
  getVideoSource() {
    return cardStateDict.get(CardKeys.CURRENT_VIDEO_SOURCE);
  },

  /** @returns {unknown} */
  getDebugTrialState() {
    return cardStateDict.get(CardKeys.DEBUG_TRIAL_STATE);
  },

  /** @param {unknown} value @returns {void} */
  setDebugTrialState(value: any) {
    cardStateDict.set(CardKeys.DEBUG_TRIAL_STATE, value);
  },

  /** @returns {unknown} */
  getDebugParms() {
    return cardStateDict.get(CardKeys.DEBUG_PARMS);
  },

  /** @param {unknown} value @returns {void} */
  setDebugParms(value: any) {
    cardStateDict.set(CardKeys.DEBUG_PARMS, value);
  },

  /** @returns {boolean} */
  isTimeout() {
    return !!cardStateDict.get(CardKeys.IS_TIMEOUT);
  },

  /** @param {unknown} value @returns {void} */
  setIsTimeout(value: any) {
    cardStateDict.set(CardKeys.IS_TIMEOUT, !!value);
  },

  /** @returns {boolean} */
  getIsCorrectAccumulator() {
    return !!cardStateDict.get(CardKeys.IS_CORRECT_ACCUMULATOR);
  },

  /** @param {unknown} value @returns {void} */
  setIsCorrectAccumulator(value: any) {
    cardStateDict.set(CardKeys.IS_CORRECT_ACCUMULATOR, !!value);
  },

  /** @returns {unknown} */
  getFeedbackForAnswer() {
    return cardStateDict.get(CardKeys.FEEDBACK_FOR_ANSWER);
  },

  /** @param {unknown} value @returns {void} */
  setFeedbackForAnswer(value: any) {
    cardStateDict.set(CardKeys.FEEDBACK_FOR_ANSWER, value);
  },

  /** @returns {boolean} */
  shouldSkipTimeout() {
    return !!cardStateDict.get(CardKeys.SKIP_TIMEOUT);
  },

  /** @param {unknown} value @returns {void} */
  setSkipTimeout(value: any) {
    cardStateDict.set(CardKeys.SKIP_TIMEOUT, !!value);
  },

  /** @returns {unknown} */
  getFeedbackTimeoutBegins() {
    return cardStateDict.get(CardKeys.FEEDBACK_TIMEOUT_BEGINS);
  },

  /** @param {unknown} value @returns {void} */
  setFeedbackTimeoutBegins(value: any) {
    cardStateDict.set(CardKeys.FEEDBACK_TIMEOUT_BEGINS, value);
  },

  /** @returns {unknown} */
  getFeedbackTimeoutEnds() {
    return cardStateDict.get(CardKeys.FEEDBACK_TIMEOUT_ENDS);
  },

  /** @param {unknown} value @returns {void} */
  setFeedbackTimeoutEnds(value: any) {
    cardStateDict.set(CardKeys.FEEDBACK_TIMEOUT_ENDS, value);
  },

  /** @returns {unknown} */
  getFeedbackTypeFromHistory() {
    return cardStateDict.get(CardKeys.FEEDBACK_TYPE_FROM_HISTORY);
  },

  /** @param {unknown} value @returns {void} */
  setFeedbackTypeFromHistory(value: any) {
    cardStateDict.set(CardKeys.FEEDBACK_TYPE_FROM_HISTORY, value);
  },

  /** @param {unknown} value @returns {void} */
  setReviewStudyCountdown(value: any) {
    cardStateDict.set(CardKeys.REVIEW_STUDY_COUNTDOWN, value);
  },

  /** @returns {unknown} */
  getReviewStudyCountdown() {
    return cardStateDict.get(CardKeys.REVIEW_STUDY_COUNTDOWN);
  },

  /**
   * @returns {unknown}
   */
  getActiveTimeoutHandle() {
    return timeoutStateDict.get(TimeoutKeys.ACTIVE_TIMEOUT_HANDLE);
  },

  /**
   * @param {unknown} value
   * @returns {void}
   */
  setActiveTimeoutHandle(value: any) {
    timeoutStateDict.set(TimeoutKeys.ACTIVE_TIMEOUT_HANDLE, value);
  },

  /** @returns {void} */
  clearActiveTimeoutHandle() {
    timeoutStateDict.set(TimeoutKeys.ACTIVE_TIMEOUT_HANDLE, null);
  },

  /**
   * Apply history-derived aggregates to the store.
   * Part of the history-first resume design.
   */
  setReconstructedLearningState(reconstruction: any) {
    if (!reconstruction) return;
    cardStateDict.set(CardKeys.CLUSTER_STATE, reconstruction.clusterState || {});
    cardStateDict.set(CardKeys.STIMULUS_STATE, reconstruction.stimulusState || {});
    cardStateDict.set(CardKeys.RESPONSE_STATE, reconstruction.responseState || {});
    cardStateDict.set(CardKeys.NUM_QUESTIONS_ANSWERED, reconstruction.numQuestionsAnswered || 0);
    cardStateDict.set(CardKeys.NUM_QUESTIONS_ANSWERED_CURRENT_UNIT, reconstruction.numQuestionsAnsweredCurrentUnit || 0);
    cardStateDict.set(CardKeys.NUM_CORRECT_ANSWERS, reconstruction.numCorrectAnswers || 0);
  },
};

export {
  CardStore,
};






