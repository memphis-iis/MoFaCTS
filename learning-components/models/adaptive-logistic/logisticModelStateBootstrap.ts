export interface LogisticModelProbabilityState {
  readonly numQuestionsAnswered: number;
  readonly numQuestionsAnsweredCurrentSession: number;
  readonly numCorrectAnswers: number;
  readonly cards: any[];
  readonly [key: string]: any;
}

export function createEmptyLogisticModelProbabilityState(
  overrideData?: any,
): LogisticModelProbabilityState {
  const initialState: LogisticModelProbabilityState = {
    numQuestionsAnswered: 0,
    numQuestionsAnsweredCurrentSession: 0,
    numCorrectAnswers: 0,
    cards: [],
  };

  if (!overrideData) {
    return initialState;
  }

  return Object.assign(initialState, overrideData);
}

export function getStimParameterArrayFromCluster(params: {
  readonly cluster: any;
  readonly whichStim: any;
  readonly parseNumber: (source: any) => number;
}): number[] {
  return params.cluster.stims[params.whichStim].params.split(',').map((x: any) => params.parseNumber(x));
}

export function getStimParameterArray(params: {
  readonly getStimCluster: (clusterIndex: any) => any;
  readonly clusterIndex: any;
  readonly whichStim: any;
  readonly parseNumber: (source: any) => number;
}): number[] {
  const cluster = params.getStimCluster(params.clusterIndex);
  const stim = cluster.stims[params.whichStim];
  if (!stim) {
    throw new Error(`Params not found for cluster ${params.clusterIndex}, stim ${params.whichStim}`);
  }
  return getStimParameterArrayFromCluster({
    cluster,
    whichStim: params.whichStim,
    parseNumber: params.parseNumber,
  });
}
