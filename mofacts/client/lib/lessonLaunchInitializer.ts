import { Session } from 'meteor/session';
import { restoreAdaptiveUnitSequence } from '../../common/adaptiveUnitSequence';
import { getExperimentState, createExperimentState } from '../views/experiment/svelte/services/experimentState';
import { applyMappingRecordToSession } from '../views/experiment/svelte/services/mappingRecordService';
import { ensureCurrentStimuliSetId } from '../views/experiment/svelte/services/mediaResolver';
import { setIgnoreOutOfGrammarResponses } from '../views/experiment/svelte/services/audioRuntimeState';
import { clearConditionResolutionContext, setActiveTdfContext } from './idContext';
import { loadLaunchReadyTdf } from './launchReadyTdf';
import { clientConsole } from './clientLogger';
import { resolveCardLaunchProgress, type CardLaunchProgress } from './cardEntryIntent';
import { resolveSpeechIgnoreOutOfGrammarResponses } from './speechRecognitionConfig';
import { translatePlatformString } from './interfaceI18n';
import { getActiveUiLocale } from './interfaceLocaleState';
import type { CourseAssignmentHistoryContext } from '../../common/courseAssignments.contracts';
import { initializeLessonLaunchEntry, resolveLessonLaunchEntryRoute, type LessonLaunchEntryRoute } from './lessonLaunchEntryRoute';
import { prepareInstructionLaunchMapping } from './instructionLaunchMapping';

type LessonLaunchTimingLogger = (eventName: string, payload?: Record<string, unknown>) => void;
type LessonLaunchMessageSetter = (message: string) => void;

type PrepareLessonLaunchParams = {
  currentTdfId: unknown;
  currentStimuliSetId: unknown;
  ignoreOutOfGrammarResponses: unknown;
  speechOutOfGrammarFeedback: unknown;
  source: string;
  courseAssignment?: CourseAssignmentHistoryContext | null;
  setLaunchLoadingMessage?: LessonLaunchMessageSetter;
  markLaunchLoadingTiming?: LessonLaunchTimingLogger;
};

type PreparedLessonLaunch = {
  tdfDoc: any;
  content: any;
  unitCount: number;
  launchProgress: CardLaunchProgress;
  entryRoute: LessonLaunchEntryRoute | null;
};

export async function prepareLessonLaunchContext(params: PrepareLessonLaunchParams): Promise<PreparedLessonLaunch> {
  const {
    currentTdfId,
    currentStimuliSetId,
    source,
    setLaunchLoadingMessage,
    markLaunchLoadingTiming,
  } = params;

  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId,
    currentStimuliSetId,
  }, `${source}.start`);
  clearConditionResolutionContext(`${source}.start`);

  setLaunchLoadingMessage?.(translatePlatformString(getActiveUiLocale(), 'common.loadingContent'));
  markLaunchLoadingTiming?.('loadLaunchReadyTdf:start', { currentTdfId });
  const launchTdf = await loadLaunchReadyTdf(currentTdfId, {
    allowConditionRoot: true,
    courseAssignment: params.courseAssignment ?? null,
    source,
  });
  markLaunchLoadingTiming?.('loadLaunchReadyTdf:complete', { currentTdfId });

  const tdfDoc = launchTdf.tdfDoc;
  const content = launchTdf.content;
  if (launchTdf.isConditionRoot) {
    clientConsole(2, `[${source}] Selected root condition TDF without unit array; continuing via condition-resolve flow:`, currentTdfId);
  }

  const setspec = content?.tdfs?.tutor?.setspec || {};
  const ignoreOutOfGrammarResponses = params.ignoreOutOfGrammarResponses
    ?? resolveSpeechIgnoreOutOfGrammarResponses(setspec);
  const speechOutOfGrammarFeedback = params.speechOutOfGrammarFeedback
    ?? setspec.speechOutOfGrammarFeedback
    ?? translatePlatformString(getActiveUiLocale(), 'speech.outOfGrammarFeedback');

  const hasConditionPool = Array.isArray(content?.tdfs?.tutor?.setspec?.condition)
    && content.tdfs.tutor.setspec.condition.length > 0;
  Session.set('tdfLaunchMode', hasConditionPool ? 'root-random' : 'condition-fixed');
  Session.set('tdfFamilyRootTdfId', hasConditionPool ? currentTdfId : null);
  Session.set('currentTdfDoc', tdfDoc);
  Session.set('currentTdfFile', content);
  Session.set('currentTdfName', content?.fileName);
  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId,
    currentStimuliSetId,
  }, `${source}.loaded`);
  ensureCurrentStimuliSetId(currentStimuliSetId || tdfDoc?.stimuliSetId);
  setIgnoreOutOfGrammarResponses(ignoreOutOfGrammarResponses);
  Session.set('speechOutOfGrammarFeedback', speechOutOfGrammarFeedback);

  setLaunchLoadingMessage?.(translatePlatformString(getActiveUiLocale(), 'dashboard.restoringProgress'));
  markLaunchLoadingTiming?.('getExperimentState:start', { source });
  const persistedExperimentState = await getExperimentState();
  restoreAdaptiveUnitSequence(content, persistedExperimentState, currentTdfId);
  Session.set('currentTdfFile', content);
  Session.set('currentTdfDoc', tdfDoc);
  const unitCount = Array.isArray(content?.tdfs?.tutor?.unit) ? content.tdfs.tutor.unit.length : 0;
  markLaunchLoadingTiming?.('getExperimentState:complete', { source });
  const launchProgress = resolveCardLaunchProgress(persistedExperimentState, unitCount);
  const resumedUnitNumber = launchProgress.persistedUnitNumber;
  if (!launchProgress.moduleCompleted && resumedUnitNumber !== null && content?.tdfs?.tutor?.unit?.[resumedUnitNumber]?.gazecalibrationsession) {
    Session.set('currentUnitNumber', resumedUnitNumber);
    Session.set('currentTdfUnit', content.tdfs.tutor.unit[resumedUnitNumber]);
  }
  // Initialization belongs to preparation, not navigation: cold routes need the
  // same instruction identity as dashboard entry even when navigation is deferred.
  const entryRoute = launchProgress.moduleCompleted ? null : resolveLessonLaunchEntryRoute({
    content,
    intent: launchProgress.intent,
  });
  if (entryRoute?.route === '/instructions') {
    const mapping = await prepareInstructionLaunchMapping({
      content, tdfDoc, currentTdfId, experimentState: persistedExperimentState,
      persist: createExperimentState,
    });
    if (mapping) applyMappingRecordToSession({ mappingTable: mapping, createdAt: Date.now() });
  }
  if (entryRoute) initializeLessonLaunchEntry(entryRoute, (key, value) => Session.set(key, value));

  return {
    tdfDoc,
    content,
    unitCount,
    launchProgress,
    entryRoute,
  };
}
