import { Accounts } from 'meteor/accounts-base';
import { PARTICIPANT_TOKEN_PREFIX } from '../../common/participantPrivacy';
import { Meteor } from 'meteor/meteor';

const configuredStorage = Meteor.settings?.public?.packages?.accounts?.clientStorage;

if (configuredStorage !== 'session') {
  throw new Error('[AUTH] public.packages.accounts.clientStorage must be "session"');
}


// Accounts uses callLoginMethod for initial token login, reload and transport reconnect.
const accounts = Accounts as any;
const callLoginMethod = accounts.callLoginMethod.bind(accounts);
accounts.callLoginMethod = (options: any = {}) => {
  const token = options.methodArguments?.[0]?.resume;
  if ((!options.methodName || options.methodName === 'login') && typeof token === 'string' && token.startsWith(PARTICIPANT_TOKEN_PREFIX)) {
    return callLoginMethod({ ...options, methodName: 'reconnectExperimentParticipant', methodArguments: [token] });
  }
  return callLoginMethod(options);
};


// Accounts restores its ordinary storage key during package initialization, before app modules
// run. A separate tab-scoped key lets the app restore study tokens via their owning method.
const ordinaryTokenKey = accounts.LOGIN_TOKEN_KEY;
const studyTokenKey = ordinaryTokenKey + '.participant';
const storeToken = accounts._storeLoginToken.bind(accounts);
accounts._storeLoginToken = (userId: string, token: string, expires: Date) => {
  const key = token.startsWith(PARTICIPANT_TOKEN_PREFIX) ? studyTokenKey : ordinaryTokenKey;
  accounts.storageLocation.removeItem(key === studyTokenKey ? ordinaryTokenKey : studyTokenKey);
  accounts.LOGIN_TOKEN_KEY = key;
  storeToken(userId, token, expires);
};
if (accounts.storageLocation.getItem(studyTokenKey)) {
  accounts.LOGIN_TOKEN_KEY = studyTokenKey;
  accounts._unstoreLoginTokenIfExpiresSoon();
  const token = accounts._storedLoginToken();
  if (token) {
    accounts._lastLoginTokenWhenPolled = token;
    accounts.connection.setUserId(accounts._storedUserId());
    accounts.loginWithToken(token, (error?: Error) => {
      if (error) void accounts.makeClientLoggedOut();
    });
  }
}
