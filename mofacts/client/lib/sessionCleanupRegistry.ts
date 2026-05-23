export const USER_ADMIN_DEFAULT_FILTER = '@gmail.com';

// Historical typo used by existing runtime code. Do not silently rename; add a
// migration/alias plan first if this key is ever replaced with submissionLock.
export const LEGACY_SUBMISSION_LOCK_KEY = 'submmissionLock';

type SessionDefaultValue = unknown | (() => unknown);

export type SessionCleanupEntry = {
  readonly key: string;
  readonly value: SessionDefaultValue;
  readonly domain: string;
  readonly reason: string;
};

export const CARD_RUNTIME_SESSION_DEFAULTS: readonly SessionCleanupEntry[] = [
  { key: 'alternateDisplayIndex', value: undefined, domain: 'card-display', reason: 'Clear alternate display state between card launches.' },
  { key: 'buttonTrial', value: false, domain: 'card-display', reason: 'Default new cards to text input unless trial payload says otherwise.' },
  { key: 'showPageNumbers', value: false, domain: 'card-display', reason: 'Hide page numbering unless a unit explicitly enables it.' },
  { key: 'schedule', value: undefined, domain: 'assessment', reason: 'Assessment engines must create or restore their own durable schedule.' },
  { key: 'wasReportedForRemoval', value: false, domain: 'card-display', reason: 'Reset per-card removal reporting flag.' },
  { key: 'numVisibleCards', value: 0, domain: 'card-display', reason: 'Reset card visibility count derived by runtime display code.' },
  { key: 'currentStimuliSet', value: undefined, domain: 'content', reason: 'Force unit bootstrap to resolve the active stimuli set.' },
  { key: LEGACY_SUBMISSION_LOCK_KEY, value: false, domain: 'input', reason: 'Unlock answer submission for the next launch; key spelling is legacy.' },
  { key: 'clusterIndex', value: undefined, domain: 'mapping', reason: 'Clear active cluster cursor before engine selection.' },
  { key: 'displayReady', value: undefined, domain: 'card-readiness', reason: 'Card display readiness is owned by card runtime.' },
  { key: 'currentDisplay', value: undefined, domain: 'card-display', reason: 'Clear previous card display payload.' },
  { key: 'originalQuestion', value: undefined, domain: 'card-display', reason: 'Clear previous question text.' },
  { key: 'engineIndices', value: undefined, domain: 'unit-engine', reason: 'Engine must publish fresh indices for the next card.' },
  { key: 'enableAudioPromptAndFeedback', value: false, domain: 'audio', reason: 'Disable prompt/feedback audio until delivery settings enable it.' },
  { key: 'errorReportStart', value: undefined, domain: 'diagnostics', reason: 'Reset per-launch error report timing.' },
  { key: 'mainCardTimeoutStart', value: undefined, domain: 'timing', reason: 'Reset per-card timeout timing.' },
  { key: 'pausedLocks', value: 0, domain: 'timing', reason: 'Clear pause lock count for new card runtime.' },
  { key: 'experimentPasswordRequired', value: false, domain: 'launch-auth', reason: 'Password prompts are resolved per experiment launch.' },
  { key: 'filter', value: USER_ADMIN_DEFAULT_FILTER, domain: 'user-admin', reason: 'Legacy user admin default filter, preserved for behavior compatibility.' },
  { key: 'ignoreOutOfGrammarResponses', value: false, domain: 'speech', reason: 'Speech grammar filtering is reloaded from delivery settings.' },
  { key: 'inResume', value: false, domain: 'resume', reason: 'Clear resume marker after cleanup.' },
  { key: 'resumeInProgress', value: false, domain: 'resume', reason: 'Clear active resume marker after cleanup.' },
  { key: 'recording', value: false, domain: 'speech', reason: 'Stop any active recording marker.' },
  { key: 'sampleRate', value: undefined, domain: 'speech', reason: 'Speech service re-detects sample rate.' },
  { key: 'speechOutOfGrammarFeedback', value: undefined, domain: 'speech', reason: 'Feedback text is delivery-settings scoped.' },
  { key: 'subTdfIndex', value: undefined, domain: 'multi-tdf', reason: 'Sub-TDF selection is launch scoped.' },
  { key: 'testType', value: undefined, domain: 'card-display', reason: 'Trial type belongs to the selected card.' },
  { key: 'scoringEnabled', value: undefined, domain: 'scoring', reason: 'Scoring policy is unit scoped.' },
  { key: 'feedbackParamsSet', value: undefined, domain: 'feedback', reason: 'Feedback parameters are recomputed per unit/card.' },
  { key: 'instructionQuestionResult', value: undefined, domain: 'instructions', reason: 'Instruction question result is per instruction screen.' },
  { key: 'curTdfTips', value: undefined, domain: 'content', reason: 'Tips are reloaded from the active TDF.' },
  { key: 'recordingLocked', value: false, domain: 'speech', reason: 'Clear recording lock after stopping audio/SR.' },
  { key: 'selectedTdfDueDate', value: undefined, domain: 'reporting', reason: 'Due-date selection is page scoped.' },
  { key: 'currentStimProbFunctionParameters', value: undefined, domain: 'unit-engine', reason: 'Probability function parameters are engine scoped.' },
];

export const FULL_LAUNCH_SESSION_DEFAULTS: readonly SessionCleanupEntry[] = [
  { key: 'currentTdfName', value: undefined, domain: 'launch', reason: 'Full cleanup leaves no active TDF name.' },
  { key: 'currentTdfId', value: undefined, domain: 'launch', reason: 'Full cleanup leaves no active TDF id.' },
  { key: 'currentUnitNumber', value: undefined, domain: 'launch', reason: 'Full cleanup leaves no active unit number.' },
  { key: 'currentTdfUnit', value: undefined, domain: 'launch', reason: 'Full cleanup leaves no active unit payload.' },
  { key: 'curStudentPerformance', value: undefined, domain: 'analytics', reason: 'Full launch resets current learner performance cache.' },
  { key: 'currentRootTdfId', value: undefined, domain: 'launch', reason: 'Full cleanup clears root TDF identity.' },
  { key: 'conditionTdfId', value: undefined, domain: 'launch', reason: 'Full cleanup clears condition TDF identity.' },
  { key: 'currentUnitStartTime', value: () => Date.now(), domain: 'timing', reason: 'New launch gets a fresh unit start timestamp.' },
  { key: 'currentScore', value: 0, domain: 'scoring', reason: 'New launch resets current score.' },
  { key: 'overallOutcomeHistory', value: () => [], domain: 'history', reason: 'New launch resets reconstructed outcome history.' },
  { key: 'overallStudyHistory', value: () => [], domain: 'history', reason: 'New launch resets reconstructed study history.' },
  { key: 'unitType', value: undefined, domain: 'unit-engine', reason: 'New launch resolves unit type during bootstrap.' },
  { key: 'furthestUnit', value: undefined, domain: 'progress', reason: 'New launch resets in-session furthest unit progress.' },
  { key: 'curUnitInstructionsSeen', value: false, domain: 'instructions', reason: 'New launch should show unit instructions unless set later.' },
  { key: 'ownerDashboardLaunch', value: false, domain: 'launch', reason: 'Owner dashboard launch is a per-launch flag.' },
];

export const CARD_LAUNCH_PRESERVED_UNIT_KEYS = [
  'currentTdfName',
  'currentTdfId',
  'currentUnitNumber',
  'currentTdfUnit',
  'curStudentPerformance',
  'currentRootTdfId',
  'currentUnitStartTime',
  'currentScore',
  'overallOutcomeHistory',
  'overallStudyHistory',
  'unitType',
  'furthestUnit',
  'curUnitInstructionsSeen',
] as const;

export function applySessionCleanupEntries(
  session: { set: (key: string, value: unknown) => void },
  entries: readonly SessionCleanupEntry[],
): void {
  for (const entry of entries) {
    session.set(entry.key, typeof entry.value === 'function' ? entry.value() : entry.value);
  }
}
