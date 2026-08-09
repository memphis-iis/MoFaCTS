import { applyLearnerTdfConfig, type LearnerTdfConfig } from '../../common/lib/learnerTdfConfig';
import { reconstructLearningStateFromHistory } from '../../common/lib/historyReconstruction';
import type {
  LearnerAnalyticsHistogramBin,
  LearnerAnalyticsModelProgress,
} from '../../common/learnerAnalytics.contracts';
import { legacyFloat } from '../../common/underscoreCompat';
import { interpretRuntimeStimulusClusters } from '../../../learning-components/content/tdf/runtimeStimulusInterpretation';
import { displayResponseAnswer } from '../../../learning-components/content/response-assessment/responseAssessment';
import { stripSpacesAndLowerCase } from '../../../learning-components/content/response-normalization/responseKey';
import { parseUnitClusterList } from '../../../learning-components/content/tdf/clusterListParser';
import { createInitialModelState } from '../../../learning-components/models/adaptive-logistic/modelStateFactory';
import { applyStimulusCrowdStatsToCards, type StimulusCrowdStat } from '../../../learning-components/models/adaptive-logistic/stimulusCrowdStatsModel';
import { applyResumeModelState } from '../../../learning-components/models/adaptive-logistic/resumeModelState';
import { calculateCardProbabilities } from '../../../learning-components/models/adaptive-logistic/probabilityCalculation';
import { createTdfProbabilityFunction } from '../../../learning-components/models/adaptive-logistic/tdfProbabilityFunction';
import { buildAdaptiveLogisticModelProgressItems } from '../../../learning-components/models/adaptive-logistic/modelProgressProvider';
import {
  resolveLearningSessionModelPreparationClusterListSource,
  resolveLearningSessionProbabilitySource,
} from '../../../learning-components/units/learning-session/learningSessionRuntimeConfig';
import { getHistoryResponseKey } from '../../../learning-components/content/response-normalization/historyResponseKey';

type HistoryRow = Record<string, any>;

export type LearnerUnitModelSnapshot = {
  unitIndex: number;
  challengeTarget: number;
  itemProbabilities: number[];
};

function selectedDeliverySettings(source: unknown): Record<string, unknown> {
  const selected = Array.isArray(source) ? source[0] : source;
  return selected && typeof selected === 'object' && !Array.isArray(selected)
    ? selected as Record<string, unknown>
    : {};
}

function deliverySettingsForUnit(tutor: any, unit: any): Record<string, unknown> {
  return {
    ...selectedDeliverySettings(tutor?.deliverySettings),
    ...selectedDeliverySettings(unit?.deliverySettings),
  };
}

function challengeTarget(settings: Record<string, unknown>): number {
  const value = Number(settings.optimalThreshold);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : 0.8;
}

function histogram(probabilities: number[]): LearnerAnalyticsHistogramBin[] {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    start: index / 10,
    end: (index + 1) / 10,
    count: 0,
  }));
  for (const probability of probabilities) {
    const index = Math.min(9, Math.floor(probability * 10));
    const bin = bins[index];
    if (bin) bin.count += 1;
  }
  return bins;
}

function hiddenStimulusKeys(rows: HistoryRow[]): Set<string> {
  return new Set(rows
    .filter((row) => row.levelUnitType === 'model' && row.CFItemRemoved === true)
    .map((row) => String(row.stimulusKC ?? ''))
    .filter(Boolean));
}

export function buildLearnerUnitModelSnapshots(params: {
  tdfDoc: any;
  flatStimuli: any[];
  historyRows: HistoryRow[];
  learnerConfig?: LearnerTdfConfig | null;
  responseKCMap: Record<string, unknown>;
  crowdStats: StimulusCrowdStat[];
  nowMs: number;
}): LearnerUnitModelSnapshot[] {
  const configuredContent = applyLearnerTdfConfig(
    params.tdfDoc?.content,
    params.learnerConfig || undefined,
  ).tdf as any;
  const tutor = configuredContent?.tdfs?.tutor;
  const units = Array.isArray(tutor?.unit) ? tutor.unit : [];
  if (Array.isArray(tutor?.setspec?.condition) && tutor.setspec.condition.length > 0) {
    return [];
  }

  const tdfFile = {
    ...configuredContent,
    stimuliSetId: params.tdfDoc?.stimuliSetId,
  };
  const stimClusters = interpretRuntimeStimulusClusters({
    tdfFile,
    currentStimuliSet: params.flatStimuli,
    currentStimuliSetId: params.tdfDoc?.stimuliSetId,
    currentTdfId: params.tdfDoc?._id,
    currentTdfDoc: params.tdfDoc,
  });
  const hiddenKeys = hiddenStimulusKeys(params.historyRows);
  const snapshots: LearnerUnitModelSnapshot[] = [];

  units.forEach((unit: any, unitIndex: number) => {
    if (!unit?.learningsession) return;
    const clusterListSource = resolveLearningSessionModelPreparationClusterListSource(unit);
    if (typeof clusterListSource !== 'string' || !clusterListSource.trim()) return;
    const unitClusterList = parseUnitClusterList(clusterListSource);
    if (unitClusterList.some((index) => !Number.isInteger(index) || index < 0 || index >= stimClusters.length)) {
      throw new Error(`Learning analytics encountered an invalid cluster list in unit ${unitIndex}`);
    }

    const initial = createInitialModelState({
      stimClusters,
      responseKCMap: params.responseKCMap,
      getStimParameterArrayFromCluster: (cluster, stimIndex) => {
        const raw = cluster?.stims?.[stimIndex]?.params;
        if (typeof raw !== 'string') {
          throw new Error(`Learning analytics requires stimulus parameters for unit ${unitIndex}`);
        }
        return raw.split(',').map((value: unknown) => legacyFloat(value));
      },
      normalizeResponseText: (answer) => stripSpacesAndLowerCase(displayResponseAnswer(String(answer ?? ''), false)),
    });
    for (const index of unitClusterList) {
      const card = initial.cards[index];
      if (card) card.canUse = true;
    }
    applyStimulusCrowdStatsToCards({ cards: initial.cards, crowdStats: params.crowdStats });
    const cardProbabilities: any = {
      numQuestionsAnswered: 0,
      numQuestionsAnsweredCurrentSession: 0,
      numCorrectAnswers: 0,
      cards: initial.cards,
      responses: initial.responses,
    };
    const unitRows = params.historyRows.filter((row) => (
      Number(row.levelUnit) === unitIndex
      && row.levelUnitType === 'model'
      && row.modelEvidenceSource !== 'assessment'
    ));
    const reconstructed = reconstructLearningStateFromHistory(unitRows, {
      allowResponseLessSparcModelPractice: false,
    });
    applyResumeModelState({
      cardProbabilities,
      stimClusters,
      reconstructed,
      getHistoryResponseKey: (answer) => getHistoryResponseKey(
        answer,
        (value) => displayResponseAnswer(String(value ?? ''), false),
        stripSpacesAndLowerCase,
      ),
    });
    const settings = deliverySettingsForUnit(tutor, unit);
    calculateCardProbabilities({
      cardProbabilities,
      stimClusters,
      unitClusterList,
      probabilityFunction: createTdfProbabilityFunction(resolveLearningSessionProbabilitySource(unit)),
      deliverySettings: settings,
      overallOutcomeHistory: reconstructed.overallOutcomeHistory,
      overallStudyHistory: reconstructed.overallStudyHistory,
      getDisplayAnswerText: (answer) => displayResponseAnswer(String(answer ?? ''), Boolean(settings.branchingEnabled)),
      normalizeResponseText: stripSpacesAndLowerCase,
      legacyFloat,
      log: () => undefined,
      nowMs: params.nowMs,
    });
    const probabilities = buildAdaptiveLogisticModelProgressItems({ cardProbabilities })
      .filter((item) => item.canUse !== false && !hiddenKeys.has(String(item.stimulusKC)))
      .map((item) => item.probability);
    if (probabilities.length > 0) {
      snapshots.push({
        unitIndex,
        challengeTarget: challengeTarget(settings),
        itemProbabilities: probabilities,
      });
    }
  });

  return snapshots;
}

export function consolidateLearnerModelProgress(
  snapshots: LearnerUnitModelSnapshot[],
): { progress?: LearnerAnalyticsModelProgress; reason?: 'not-supported' | 'multiple-challenge-targets' | 'not-ready' } {
  if (snapshots.length === 0) return { reason: 'not-supported' };
  const targets = new Set(snapshots.map((snapshot) => snapshot.challengeTarget));
  if (targets.size !== 1) return { reason: 'multiple-challenge-targets' };
  const target = snapshots[0]?.challengeTarget;
  if (target === undefined) return { reason: 'not-ready' };
  const itemProbabilities = snapshots.flatMap((snapshot) => snapshot.itemProbabilities);
  if (itemProbabilities.length === 0) return { reason: 'not-ready' };
  const reached = itemProbabilities.filter((probability) => probability >= target).length;
  return {
    progress: {
      meanProbability: itemProbabilities.reduce((sum, value) => sum + value, 0) / itemProbabilities.length,
      challengeTarget: target,
      reachedChallengeTargetCount: reached,
      belowChallengeTargetCount: itemProbabilities.length - reached,
      histogramBins: histogram(itemProbabilities),
      itemProbabilities,
    },
  };
}
