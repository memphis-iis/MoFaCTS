import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

const MEMPHIS_SAML_SERVICE_NAME = 'memphisSaml';
const MEMPHIS_SAML_LOGIN_PATH = '/auth/saml/memphis/login';

type MemphisSamlLoginOptions = {
  loginStyle?: 'popup' | 'redirect';
  redirectUrl?: string;
};

const MeteorAny = Meteor as any;
const AccountsAny = Accounts as any;
const PackageAny = (globalThis as unknown as { Package?: Record<string, any> }).Package || {};
const OAuthAny = PackageAny.oauth?.OAuth as {
  _loginStyle: (service: string, config: Record<string, unknown>, options: MemphisSamlLoginOptions) => 'popup' | 'redirect';
  _stateParam: (loginStyle: 'popup' | 'redirect', credentialToken: string, redirectUrl?: string) => string;
  launchLogin: (options: {
    loginService: string;
    loginStyle: 'popup' | 'redirect';
    loginUrl: string;
    credentialRequestCompleteCallback: (credentialTokenOrError?: unknown) => void;
    credentialToken: string;
    popupOptions?: { width: number; height: number };
  }) => void;
} | undefined;

function loginWithMemphisSaml(options?: MemphisSamlLoginOptions, callback?: (error?: unknown) => void) {
  if (!callback && typeof options === 'function') {
    callback = options as unknown as (error?: unknown) => void;
    options = {};
  }

  const safeOptions = options || {};

  const reportClientSetupError = (message: string) => {
    const error = new Error(message);
    if (callback) {
      callback(error);
      return;
    }
    throw error;
  };

  if (typeof AccountsAny.oauth?.credentialRequestCompleteHandler !== 'function') {
    reportClientSetupError('Meteor Accounts OAuth completion helpers are unavailable for Memphis SAML.');
    return;
  }

  const credentialRequestCompleteCallback = AccountsAny.oauth.credentialRequestCompleteHandler(callback);

  if (!OAuthAny || typeof OAuthAny.launchLogin !== 'function' || typeof OAuthAny._loginStyle !== 'function' || typeof OAuthAny._stateParam !== 'function') {
    credentialRequestCompleteCallback(new Error('Meteor OAuth client helpers are unavailable for Memphis SAML.'));
    return;
  }

  const credentialToken = Random.secret();
  const loginStyle = OAuthAny._loginStyle(MEMPHIS_SAML_SERVICE_NAME, { loginStyle: 'popup' }, safeOptions);
  const state = OAuthAny._stateParam(loginStyle, credentialToken, safeOptions.redirectUrl);
  const loginUrl = `${MEMPHIS_SAML_LOGIN_PATH}?state=${encodeURIComponent(state)}`;

  OAuthAny.launchLogin({
    loginService: MEMPHIS_SAML_SERVICE_NAME,
    loginStyle,
    loginUrl,
    credentialRequestCompleteCallback,
    credentialToken,
    popupOptions: { width: 560, height: 700 },
  });
}

if (typeof AccountsAny.registerClientLoginFunction === 'function') {
  AccountsAny.registerClientLoginFunction(MEMPHIS_SAML_SERVICE_NAME, loginWithMemphisSaml);
}

MeteorAny.loginWithMemphisSaml = (...args: unknown[]) => {
  if (typeof AccountsAny.applyLoginFunction === 'function') {
    return AccountsAny.applyLoginFunction(MEMPHIS_SAML_SERVICE_NAME, args);
  }
  return loginWithMemphisSaml(
    args[0] as MemphisSamlLoginOptions | undefined,
    args[1] as ((error?: unknown) => void) | undefined
  );
};
