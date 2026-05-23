import { Session } from 'meteor/session';
import { LOG_PREFIXES } from './constants';
import { deliverySettingsStore } from '../../../../lib/state/deliverySettingsStore';
import { clientConsole } from '../../../../lib/clientLogger';
import { CardStore } from '../../modules/cardStore';
import { assign, type ActionArgs } from './cardMachineActionTypes';

export const initializeSession = assign({
  sessionId: ({ event }: ActionArgs) => event?.sessionId,
  unitId: ({ event }: ActionArgs) => event?.unitId,
  tdfId: ({ event }: ActionArgs) => event?.tdfId,
  consecutiveTimeouts: () => 0,
  errorMessage: () => undefined,
  deliverySettings: () => deliverySettingsStore.get(),
});

export const syncDeliverySettings = ({ context }: ActionArgs) => {
  if (context.deliverySettings) {
    Session.set('currentDeliverySettings', context.deliverySettings);
    deliverySettingsStore.set(context.deliverySettings as Parameters<typeof deliverySettingsStore.set>[0]);
  }
};

export const syncCardStore = ({ context, event }: ActionArgs) => {
  const buttonTrial = event?.output?.buttonTrial ?? context.buttonTrial;
  const buttonList = event?.output?.buttonList || context.buttonList || [];
  CardStore.setButtonTrial(!!buttonTrial);
  CardStore.setButtonList(buttonList);
};

export function syncSessionIndices({ context }: ActionArgs) {
  const indices = context.engineIndices || {};
  if (Number.isFinite(indices.clusterIndex)) {
    Session.set('clusterIndex', indices.clusterIndex);
  }
  if (Number.isFinite(indices.stimIndex) || Number.isFinite(indices.whichStim)) {
    Session.set('engineIndices', {
      ...indices,
      stimIndex: Number.isFinite(indices.stimIndex) ? indices.stimIndex : indices.whichStim,
    });
  }
  CardStore.setQuestionIndex(context.questionIndex || 1);
}

export const incrementQuestionIndex = assign({
  questionIndex: ({ context }: ActionArgs) => {
    const current = Number(context.questionIndex);
    return Number.isFinite(current) ? current + 1 : 1;
  },
});

export const syncCurrentAnswer = ({ context }: ActionArgs) => {
  const currentAnswer = context.currentAnswer || '';
  Session.set('currentAnswer', currentAnswer);
};

export function handleUnitCompletion({ context: _context, event: _event }: ActionArgs) {
  import('../services/unitProgression').then(({ unitIsFinished }) => {
    unitIsFinished('Unit Engine');
  }).catch((error) => {
    clientConsole(1, LOG_PREFIXES.ERROR, 'Failed to handle unit completion:', error);
  });
}
