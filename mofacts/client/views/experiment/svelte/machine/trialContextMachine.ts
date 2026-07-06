import { assign as xAssign } from 'xstate';
import { DEFAULT_DELIVERY_SETTINGS } from './constants';
import type { CardSelectionDoneArgs, MachineArgs } from './contentRuntimeMachineTypes';
import {
  getPreparedTrial,
  resolvePreparedQuestionIndex,
  resolveSelectedQuestionIndex,
} from './preparedAdvanceMachine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches contentRuntimeMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

function resetTrialResponseState() {
  return {
    userAnswer: '',
    feedbackMessage: '',
    feedbackText: '',
    feedbackRevealStarted: false,
    feedbackSuppressed: false,
    h5pResult: null,
    sparcResult: null,
    sparcNodeValues: {},
    isCorrect: false,
    isTimeout: false,
    feedbackTimeoutMs: undefined,
    srGrammarMatch: null,
    reviewEntry: '',
    source: 'keyboard',
    timestamps: {
      trialStart: 0,
      trialEnd: undefined,
      firstKeypress: undefined,
      timeoutStart: undefined,
      inputEnabled: undefined,
      feedbackStart: undefined,
      feedbackEnd: undefined,
    },
  };
}

export const loadSelectedTrialIntoActiveContext = assign({
  currentDisplay: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentDisplay || context.currentDisplay,
  questionDisplay: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentDisplay || context.questionDisplay,
  currentAnswer: ({ context, event }: CardSelectionDoneArgs) => event.output?.currentAnswer || context.currentAnswer,
  originalAnswer: ({ context, event }: CardSelectionDoneArgs) => event.output?.originalAnswer || context.originalAnswer,
  buttonTrial: ({ context, event }: CardSelectionDoneArgs) => event.output?.buttonTrial ?? context.buttonTrial,
  buttonList: ({ context, event }: CardSelectionDoneArgs) => event.output?.buttonList || context.buttonList || [],
  testType: ({ context, event }: CardSelectionDoneArgs) => event.output?.testType || context.testType,
  deliverySettings: ({ context, event }: CardSelectionDoneArgs) => ({
    ...DEFAULT_DELIVERY_SETTINGS,
    ...(context.deliverySettings || {}),
    ...(event.output?.deliverySettings || {}),
  }),
  setspec: ({ context, event }: CardSelectionDoneArgs) => event.output?.setspec || context.setspec,
  engineIndices: ({ context, event }: CardSelectionDoneArgs) => event.output?.engineIndices || context.engineIndices,
  engine: ({ context, event }: CardSelectionDoneArgs) => event.output?.engine || context.engine,
  unitFinished: ({ event }: CardSelectionDoneArgs) => event.output?.unitFinished || false,
  questionIndex: ({ context, event }: CardSelectionDoneArgs) => resolveSelectedQuestionIndex(context, event),
  preparedAdvanceMode: () => 'none',
  preparedTrial: () => null,
  incomingPreparationComplete: () => false,
  incomingReady: () => false,
  ...resetTrialResponseState(),
});

export const commitPreparedTrialToActiveContext = assign({
  currentDisplay: ({ context }: MachineArgs) => getPreparedTrial(context)?.currentDisplay || context.currentDisplay,
  questionDisplay: ({ context }: MachineArgs) => getPreparedTrial(context)?.currentDisplay || context.questionDisplay,
  currentAnswer: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.currentAnswer || context.currentAnswer || ''),
  originalAnswer: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.originalAnswer || context.originalAnswer || ''),
  buttonTrial: ({ context }: MachineArgs) => getPreparedTrial(context)?.buttonTrial ?? context.buttonTrial,
  buttonList: ({ context }: MachineArgs) => getPreparedTrial(context)?.buttonList || context.buttonList || [],
  testType: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.testType || context.testType || 'd'),
  deliverySettings: ({ context }: MachineArgs) => ({
    ...DEFAULT_DELIVERY_SETTINGS,
    ...(context.deliverySettings || {}),
    ...(getPreparedTrial(context)?.deliverySettings || {}),
  }),
  setspec: ({ context }: MachineArgs) => getPreparedTrial(context)?.setspec || context.setspec,
  engineIndices: ({ context }: MachineArgs) => getPreparedTrial(context)?.engineIndices || context.engineIndices,
  engine: ({ context }: MachineArgs) => getPreparedTrial(context)?.engine || context.engine,
  unitFinished: () => false,
  questionIndex: ({ context }: MachineArgs) => resolvePreparedQuestionIndex(context),
  preparedAdvanceMode: ({ context }: MachineArgs) => getPreparedTrial(context)?.preparedAdvanceMode || context.preparedAdvanceMode || 'none',
  preparedTrial: () => null,
  incomingPreparationComplete: () => false,
  incomingReady: () => false,
  speechHintExclusionList: ({ context }: MachineArgs) => String(getPreparedTrial(context)?.speechHintExclusionList || context.speechHintExclusionList || ''),
  ...resetTrialResponseState(),
});

export const clearIncomingPreparationState = assign({
  preparedTrial: () => null,
  incomingPreparationComplete: () => false,
  incomingReady: () => false,
});

export const markUnitFinishedAfterEngineUpdate = assign({
  unitFinished: true,
  preparedTrial: () => null,
  incomingPreparationComplete: () => false,
  incomingReady: () => false,
});
