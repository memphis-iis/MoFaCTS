import { stripSpacesAndLowerCase } from '../../content/response-normalization/responseKey';
import {
  applyClusterListAvailability,
  parseUnitClusterList,
  resolveModelClusterList,
} from '../../content/tdf/clusterListParser';
import { calculateCardProbabilities as runCalculateCardProbabilities } from './probabilityCalculation';

export interface LearningSessionModelPreparationDeps {
  readonly getSessionValue: (key: string) => any;
  readonly getDeliverySettings: () => Record<string, any>;
  readonly getDisplayAnswerText: (answer: any) => string;
  readonly findTdfById: (tdfId: any) => any;
  readonly extractDelimFields: (source: any, target: any[]) => void;
  readonly rangeVal: (source: any) => any[];
  readonly legacyFloat: (source: any) => number;
  readonly legacyInt: (source: any) => number;
  readonly resolveUnitClusterListSource: (unit: any, activeVideoSession: boolean) => unknown;
  readonly resolveModelPreparationClusterListSource: (unit: any) => unknown;
  readonly log: (level: number, ...args: unknown[]) => void;
}

export function calculateLearningSessionCardProbabilities(params: {
  readonly cardProbabilities: any;
  readonly stimClusters: any[];
  readonly probabilityFunction: (...args: any[]) => any;
  readonly deps: LearningSessionModelPreparationDeps;
}) {
  const unitNumber = params.deps.getSessionValue('currentUnitNumber');
  const curTdf = params.deps.findTdfById(params.deps.getSessionValue('currentTdfId'));
  const unit = curTdf.content.tdfs.tutor.unit[unitNumber];
  const clusterList = params.deps.resolveModelPreparationClusterListSource(unit);
  if (!clusterList) {
    params.deps.log(2, 'no clusterlist found for unit ' + unitNumber);
  }
  const unitClusterList = parseUnitClusterList(clusterList);

  runCalculateCardProbabilities({
    cardProbabilities: params.cardProbabilities,
    stimClusters: params.stimClusters,
    unitClusterList,
    probabilityFunction: params.probabilityFunction,
    deliverySettings: params.deps.getDeliverySettings(),
    overallOutcomeHistory: params.deps.getSessionValue('overallOutcomeHistory'),
    overallStudyHistory: params.deps.getSessionValue('overallStudyHistory'),
    getDisplayAnswerText: params.deps.getDisplayAnswerText,
    normalizeResponseText: (answer: any) => stripSpacesAndLowerCase(answer),
    legacyFloat: params.deps.legacyFloat,
    log: (...args: unknown[]) => params.deps.log(2, ...args),
  });
}

export function setUpLearningSessionClusterList(params: {
  readonly cards: any;
  readonly curUnit: any;
  readonly deps: LearningSessionModelPreparationDeps;
}) {
  const clusterList = resolveModelClusterList({
    currentTdfFile: params.deps.getSessionValue('currentTdfFile'),
    currentUnitNumber: params.deps.getSessionValue('currentUnitNumber'),
    subTdfIndex: params.deps.getSessionValue('subTdfIndex'),
    unitClusterListSource: params.deps.resolveUnitClusterListSource(
      params.curUnit,
      params.deps.getSessionValue('isVideoSession') === true,
    ),
    extractDelimFields: params.deps.extractDelimFields,
    log: params.deps.log,
  });
  params.deps.log(2, 'clusterList', clusterList);
  applyClusterListAvailability(params.cards, clusterList, params.deps.rangeVal, params.deps.legacyInt);
  params.deps.log(1, 'setupClusterList,cards:', params.cards);
}
