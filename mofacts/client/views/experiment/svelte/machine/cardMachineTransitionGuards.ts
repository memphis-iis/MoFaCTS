import * as guards from './guards';
import type {
  CardMachineContext,
  MachineArgs,
  PreparedAdvanceDoneArgs,
  UpdateEngineDoneArgs,
} from './cardMachineTypes';
import { isFeedbackAdvanceReady } from './preparedAdvanceMachine';

export function hasQuestionAudioFromContext(context: CardMachineContext): boolean {
  return guards.hasQuestionAudio({ context, event: { type: '__machine_internal__' } });
}

export function isDrillOrTestTrial(context: CardMachineContext): boolean {
  const event = { type: '__machine_internal__' };
  return guards.isDrillTrial({ context, event }) || guards.isTestTrial({ context, event });
}

export function questionAudioIsAvailable({ context }: MachineArgs): boolean {
  return hasQuestionAudioFromContext(context);
}

export function activeTrialIsDrillOrTest({ context }: MachineArgs): boolean {
  return isDrillOrTestTrial(context);
}

export function feedbackAdvanceIsReady({ context }: MachineArgs): boolean {
  return isFeedbackAdvanceReady(context);
}

export function incomingPreparationAlreadyComplete({ context }: MachineArgs): boolean {
  return context.incomingPreparationComplete === true;
}

export function engineUpdateFinishedUnit({ event }: UpdateEngineDoneArgs): boolean {
  return event.output?.unitFinished === true;
}

export function preparedResultFinishedUnit({ event }: PreparedAdvanceDoneArgs): boolean {
  return event.output?.unitFinished === true;
}

export function preparedResultHasNoAdvance({ event }: PreparedAdvanceDoneArgs): boolean {
  return event.output?.preparedAdvanceMode === 'none';
}

export function preparedResultUsesDirectAdvance({ event }: PreparedAdvanceDoneArgs): boolean {
  return event.output?.preparedAdvanceMode === 'direct';
}
