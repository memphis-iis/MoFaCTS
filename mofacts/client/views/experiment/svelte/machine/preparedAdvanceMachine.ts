import { assign as xAssign } from 'xstate';
import { clientConsole } from '../../../../lib/clientLogger';
import type {
  CardMachineContext,
  CardSelectionDoneArgs,
  PreparedAdvanceDoneArgs,
  PreparedAdvanceResult,
} from './cardMachineTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches cardMachine's XState v5 assign typing workaround.
const assign: any = xAssign;

export type PreparedQuestionIndexRoute = 'schedule-live-index' | 'context-counter';

export function getPreparedTrial(context: CardMachineContext): PreparedAdvanceResult | null {
  return context.preparedTrial || null;
}

export function resolvePreparedQuestionIndexRoute(engine: { unitType?: string } | null | undefined): PreparedQuestionIndexRoute {
  return engine?.unitType === 'schedule'
    ? 'schedule-live-index'
    : 'context-counter';
}

export function isFeedbackAdvanceReady(context: CardMachineContext): boolean {
  clientConsole(2, '[CardMachine][FeedbackAdvanceReady]', {
    incomingPreparationComplete: context.incomingPreparationComplete,
    unitFinished: context.unitFinished,
    hasPreparedTrial: !!context.preparedTrial,
    incomingReady: context.incomingReady,
    preparedAdvanceMode: context.preparedAdvanceMode,
    testType: context.testType,
  });

  if (!context.incomingPreparationComplete) {
    return false;
  }
  if (context.unitFinished || !context.preparedTrial) {
    return true;
  }
  return context.incomingReady === true;
}

export const storePreparedIncomingTrial = assign({
  preparedTrial: ({ event }: PreparedAdvanceDoneArgs) => (
    event.output?.unitFinished === true ||
    event.output?.preparedAdvanceMode === 'none' ||
    !event.output?.currentDisplay
  )
    ? null
    : event.output || null,
  engine: ({ context, event }: PreparedAdvanceDoneArgs) => event.output?.engine || context.engine,
  unitFinished: ({ event }: PreparedAdvanceDoneArgs) => event.output?.unitFinished === true,
  preparedAdvanceMode: ({ event }: PreparedAdvanceDoneArgs) => event.output?.unitFinished === true
    ? 'none'
    : event.output?.preparedAdvanceMode || 'seamless',
  incomingPreparationComplete: () => true,
  incomingReady: () => false,
});

export const markIncomingPreparationFailed = assign({
  preparedTrial: () => null,
  incomingPreparationComplete: () => true,
  incomingReady: () => false,
  preparedAdvanceMode: () => 'none',
});

export const markIncomingReady = assign({
  incomingReady: () => true,
});

export function resolveSelectedQuestionIndex(
  context: CardMachineContext,
  event: CardSelectionDoneArgs['event'],
): number {
  const outputQuestionIndex = event.output?.questionIndex;
  const outputEngine = event.output?.engine as { unitType?: string } | undefined;
  const contextEngine = context.engine as { unitType?: string } | undefined;
  const route = resolvePreparedQuestionIndexRoute(outputEngine || contextEngine);

  if (route === 'schedule-live-index') {
    if (typeof outputQuestionIndex !== 'number' || !Number.isFinite(outputQuestionIndex)) {
      throw new Error('Schedule card selection must provide a live questionIndex');
    }
    return outputQuestionIndex;
  }

  return (typeof outputQuestionIndex === 'number' && Number.isFinite(outputQuestionIndex))
    ? outputQuestionIndex
    : (context.questionIndex || 1);
}

export function resolvePreparedQuestionIndex(context: CardMachineContext): number {
  const preparedQuestionIndex = getPreparedTrial(context)?.questionIndex;
  const preparedEngine = getPreparedTrial(context)?.engine as { unitType?: string } | undefined;
  const contextEngine = context.engine as { unitType?: string } | undefined;
  const route = resolvePreparedQuestionIndexRoute(preparedEngine || contextEngine);

  if (route === 'schedule-live-index') {
    if (typeof preparedQuestionIndex !== 'number' || !Number.isFinite(preparedQuestionIndex)) {
      throw new Error('Prepared schedule transition must provide a live questionIndex');
    }
    return preparedQuestionIndex;
  }

  return Number(preparedQuestionIndex || context.questionIndex || 1);
}
