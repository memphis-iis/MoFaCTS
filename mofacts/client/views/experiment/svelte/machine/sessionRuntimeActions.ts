import { LOG_PREFIXES } from './constants';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { clientConsole } from '../../../../lib/clientLogger';
import {
  type EngineIndices,
  publishEngineIndices,
  setCurrentAnswer,
  setCurrentDeliverySettings,
  setEngineIndices,
} from '../services/cardRuntimeState';
import {
  setButtonList,
  setButtonTrial,
} from '../services/activeTrialDisplayRuntimeState';
import { setQuestionIndex } from '../services/trialProgressionState';
import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

export const initializeSession = assign({
  userId: ({ event }: ActionArgs) => event?.userId,
  attemptId: ({ event }: ActionArgs) => event?.attemptId,
  unitId: ({ event }: ActionArgs) => event?.unitId,
  tdfId: ({ event }: ActionArgs) => event?.tdfId,
  consecutiveTimeouts: () => 0,
  errorMessage: () => undefined,
  deliverySettings: () => deliverySettingsStore.get(),
});

export const syncDeliverySettings = ({ context }: ActionArgs) => {
  if (context.deliverySettings) {
    setCurrentDeliverySettings(context.deliverySettings);
    deliverySettingsStore.set(context.deliverySettings as Parameters<typeof deliverySettingsStore.set>[0]);
  }
};

export const syncActiveTrialChoiceState = ({ context, event }: ActionArgs) => {
  const buttonTrial = event?.output?.buttonTrial ?? context.buttonTrial;
  const buttonList = event?.output?.buttonList || context.buttonList || [];
  setButtonTrial(!!buttonTrial);
  setButtonList(buttonList);
};

export function syncSessionIndices({ context }: ActionArgs) {
  const indices = context.engineIndices || {};
  publishEngineIndices(indices);
  if (Number.isFinite(indices.stimIndex) || Number.isFinite(indices.whichStim)) {
    const nextIndices: EngineIndices = {};
    if (typeof indices.clusterIndex === 'number') {
      nextIndices.clusterIndex = indices.clusterIndex;
    }
    if (typeof indices.whichStim === 'number') {
      nextIndices.whichStim = indices.whichStim;
    }
    const nextStimIndex = Number.isFinite(indices.stimIndex) ? indices.stimIndex : indices.whichStim;
    if (typeof nextStimIndex === 'number') {
      nextIndices.stimIndex = nextStimIndex;
      setEngineIndices(nextIndices);
    }
  }
  setQuestionIndex(context.questionIndex || 1);
}

export const incrementQuestionIndex = assign({
  questionIndex: ({ context }: ActionArgs) => {
    const current = Number(context.questionIndex);
    return Number.isFinite(current) ? current + 1 : 1;
  },
});

export const syncCurrentAnswer = ({ context }: ActionArgs) => {
  const currentAnswer = context.currentAnswer || '';
  setCurrentAnswer(currentAnswer);
};

export function handleUnitCompletion({ context: _context, event: _event }: ActionArgs) {
  import('../services/unitProgression').then(({ unitIsFinished }) => {
    unitIsFinished('Unit Engine');
  }).catch((error) => {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Failed to handle unit completion:', error);
  });
}
