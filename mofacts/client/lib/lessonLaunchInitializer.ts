import { Session } from 'meteor/session';
import { getExperimentState } from '../views/experiment/svelte/services/experimentState';
import { ensureCurrentStimuliSetId } from '../views/experiment/svelte/services/mediaResolver';
import { setIgnoreOutOfGrammarResponses } from '../views/experiment/svelte/services/audioRuntimeState';
import { clearConditionResolutionContext, setActiveTdfContext } from './idContext';
import { loadLaunchReadyTdf } from './launchReadyTdf';
import { clientConsole } from './clientLogger';
import { resolveCardLaunchProgress, type CardLaunchProgress } from './cardEntryIntent';
import { resolveSpeechIgnoreOutOfGrammarResponses } from './speechRecognitionConfig';
import type { CourseAssignmentHistoryContext } from '../../common/courseAssignments.contracts';

type LessonLaunchTimingLogger = (eventName: string, payload?: Record<string, unknown>) => void;
type LessonLaunchMessageSetter = (message: string) => void;

type PrepareLessonLaunchParams = {
  currentTdfId: unknown;
  currentStimuliSetId: unknown;
  ignoreOutOfGrammarResponses: unknown;
  speechOutOfGrammarFeedback: unknown;
  source: string;
  courseAssignment?: CourseAssignmentHistoryContext | null;
  applyContent?: (content: any) => any;
  setLaunchLoadingMessage?: LessonLaunchMessageSetter;
  markLaunchLoadingTiming?: LessonLaunchTimingLogger;
};

type PreparedLessonLaunch = {
  tdfDoc: any;
  content: any;
  unitCount: number;
  launchProgress: CardLaunchProgress;
};

export async function prepareLessonLaunchContext(params: PrepareLessonLaunchParams): Promise<PreparedLessonLaunch> {
  const {
    currentTdfId,
    currentStimuliSetId,
    source,
    applyContent,
    setLaunchLoadingMessage,
    markLaunchLoadingTiming,
  } = params;

  setActiveTdfContext({
    currentRootTdfId: currentTdfId,
    currentTdfId,
    currentStimuliSetId,
  }, `${source}.start`);
  clearConditionResolutionContext(`${source}.start`);

  setLaunchLoadingMessage?.('Loading lesson...');
  markLaunchLoadingTiming?.('loadLaunchReadyTdf:start', { currentTdfId });
  const launchTdf = await loadLaunchReadyTdf(currentTdfId, {
    allowConditionRoot: true,
    courseAssignment: params.courseAssignment ?? null,
    source,
  });
  markLaunchLoadingTiming?.('loadLaunchReadyTdf:complete', { currentTdfId });

  const tdfDoc = launchTdf.tdfDoc;
  let content = launchTdf.content;
  if (launchTdf.isConditionRoot) {
    clientConsole(2, `[${source}] Selected root condition TDF without unit array; continuing via condition-resolve flow:`, currentTdfId);
  }
  if (applyContent) {
    content = applyContent(content);
  }

  const setspec = content?.tdfs?.tutor?.setspec || {};
  const ignoreOutOfGrammarResponses = params.ignoreOutOfGrammarResponses
    ?? resolveSpeechIgnoreOutOfGrammarResponses(setspec);
  const speechOutOfGrammarFeedback = params.speechOutOfGrammarFeedback
    ?? setspec.speechOutOfGrammarFeedback
    ?? 'Response not in answer set';

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

  const unitCount = Array.isArray(content?.tdfs?.tutor?.unit) ? content.tdfs.tutor.unit.length : 0;
  setLaunchLoadingMessage?.('Restoring progress...');
  markLaunchLoadingTiming?.('getExperimentState:start', { source });
  const persistedExperimentState = await getExperimentState();
  markLaunchLoadingTiming?.('getExperimentState:complete', { source });
  const launchProgress = resolveCardLaunchProgress(persistedExperimentState, unitCount);

  return {
    tdfDoc,
    content,
    unitCount,
    launchProgress,
  };
}
