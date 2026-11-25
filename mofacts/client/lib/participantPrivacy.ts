import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { Accounts } from 'meteor/accounts-base';
import { PARTICIPANT_TOKEN_PREFIX, studyOnlyAccount } from '../../common/participantPrivacy';

export function participantActivity(): boolean {
  const user = Meteor.user();
  if (user?.profile?.createdBy === 'publicDemo') return false;
  return studyOnlyAccount(user) || Session.get('loginMode') === 'experiment'
    || (Accounts as any)._storedLoginToken()?.startsWith(PARTICIPANT_TOKEN_PREFIX) === true;
}
