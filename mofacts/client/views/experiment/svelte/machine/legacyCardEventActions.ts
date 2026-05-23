import { assign, type ActionArgs } from './cardMachineActionTypes';

export const loadCardData = assign({
  currentDisplay: ({ event }: ActionArgs) => event?.display,
  questionDisplay: ({ event }: ActionArgs) => event?.display,
  currentAnswer: ({ event }: ActionArgs) => event?.answer,
  originalAnswer: ({ event }: ActionArgs) => event?.answer,
  buttonTrial: ({ event }: ActionArgs) => event?.buttonTrial,
  buttonList: ({ event }: ActionArgs) => event?.buttonList || [],
  testType: ({ event }: ActionArgs) => event?.testType,
  deliverySettings: ({ context, event }: ActionArgs) => ({
    ...(context.deliverySettings || {}),
    ...(event?.deliverySettings || {}),
  }),
  setspec: ({ event }: ActionArgs) => event?.setspec,
  engineIndices: ({ event }: ActionArgs) => event?.engineIndices,
  speechHintExclusionList: ({ event }: ActionArgs) => event?.speechHintExclusionList || '',
  userAnswer: () => '',
  isCorrect: () => false,
  isTimeout: () => false,
  srGrammarMatch: () => null,
  timeoutResetCounter: () => 0,
  timestamps: ({ context }: ActionArgs) => ({
    ...context.timestamps,
    trialStart: 0,
    trialEnd: undefined,
    firstKeypress: undefined,
    timeoutStart: undefined,
    inputEnabled: undefined,
    feedbackStart: undefined,
    feedbackEnd: undefined,
  }),
});
