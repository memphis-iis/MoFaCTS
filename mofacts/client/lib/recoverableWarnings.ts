import { participantActivity } from './participantPrivacy';
import { Meteor } from 'meteor/meteor';
import type { RecoverableWarning } from '../../common/recoverableWarnings';

// The scoring provider owns failure isolation: diagnostic delivery cannot fail a turn.
export async function reportRecoverableWarning(warning: RecoverableWarning): Promise<void> {
  if (participantActivity()) return;
  await Meteor.callAsync('reportRecoverableWarning', warning);
}
