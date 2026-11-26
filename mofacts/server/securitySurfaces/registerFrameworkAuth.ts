import type { Accounts } from 'meteor/accounts-base';
import { FRAMEWORK_AUTH_PACKAGE_PINS } from '../../common/securityAudit/frameworkAuthPackages.ts';
import { FRAMEWORK_AUTH_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';

const hooks = {
  onLogin: { policy: 'allowed-login-lifecycle', dataEgress: 'none' },
  validateLoginAttempt: { policy: 'login-admission', dataEgress: 'login-admission-result' },
  onCreateUser: { policy: 'canonical-account-creation', dataEgress: 'framework-account-document' },
  setAdditionalFindUserOnExternalLogin: { policy: 'verified-configured-google-owner-link', dataEgress: 'framework-account-document' },
} as const;

type HookName = keyof typeof hooks;
type HookCallback<Name extends HookName> = Parameters<typeof Accounts[Name]>[0];
type RegistrationName = keyof typeof FRAMEWORK_AUTH_VERIFICATIONS;
type LoginHandlers = Record<string, unknown> | undefined;
type OAuthAccounts = { oauth?: { registerService?: (name: string) => void; serviceNames?: () => string[] } };

const installedHooks = new Map<HookName, number>();
let loginOwner: { handler: unknown; read: () => LoginHandlers } | undefined;
let duplicateLoginOwner = false;
let oauthOwner: OAuthAccounts | undefined;
let duplicateOAuthOwner = false;

export function registerAccountLifecycleHook<Name extends HookName>(
  accounts: { [Key in Name]: (callback: HookCallback<Key>) => unknown },
  name: Name, callback: HookCallback<NoInfer<Name>>,
): void {
  accounts[name](callback);
  installedHooks.set(name, (installedHooks.get(name) ?? 0) + 1);
}

// The timing envelope remains installed by startup at the existing point. Check
// its identity on read so a different registered handler cannot inherit proof.
export function bindNativeAccountMethods(handler: unknown, read: () => LoginHandlers) {
  if (loginOwner) duplicateLoginOwner = true;
  else loginOwner = { handler, read };
}

export function bindAccountServiceOwner(accounts: OAuthAccounts) {
  if (oauthOwner) duplicateOAuthOwner = true;
  else oauthOwner = accounts;
}

export function registerMemphisAccountService(accounts: OAuthAccounts, name: 'memphisSaml') {
  const service = accounts.oauth;
  if (!service?.serviceNames?.().includes(name)) service?.registerService?.(name);
}

type PackageName = keyof typeof FRAMEWORK_AUTH_PACKAGE_PINS;

function surface(name: RegistrationName, owners: readonly PackageName[], policy: string, dataEgress: string) {
  const verification = FRAMEWORK_AUTH_VERIFICATIONS[name];
  const packagePins = owners.map(owner => owner + '@' + FRAMEWORK_AUTH_PACKAGE_PINS[owner]);
  return Object.freeze({ packagePins: Object.freeze(packagePins), surfaceId: verification.surfaceId, policy, dataEgress, verification });
}

export function registeredFrameworkAuthSurfaces() {
  for (const name of Object.keys(hooks) as HookName[]) {
    if (installedHooks.get(name) !== 1) return { state: 'unavailable', reason: 'account-lifecycle-hooks' } as const;
  }
  const methods = loginOwner?.read();
  if (duplicateLoginOwner || typeof loginOwner?.handler !== 'function' ||
      methods?.login !== loginOwner.handler || typeof methods?.logout !== 'function') {
    return { state: 'unavailable', reason: 'native-account-method-owner' } as const;
  }
  const services = oauthOwner?.oauth?.serviceNames?.();
  if (duplicateOAuthOwner || !services || !['google', 'microsoft', 'memphisSaml'].every(name => services.includes(name))) {
    return { state: 'unavailable', reason: 'accounts-oauth-service-owner' } as const;
  }
  return Object.freeze({
    state: 'observed',
    surfaces: Object.freeze([
      ...Object.entries(hooks).map(([name, row]) => surface(name as HookName, ['accounts-base'], row.policy, row.dataEgress)),
      surface('password', ['accounts-base', 'accounts-password'], 'password-verification-and-throttle', 'authenticated-session'),
      surface('resume', ['accounts-base'], 'valid-current-resume-token', 'authenticated-session'),
      surface('logout', ['accounts-base'], 'revoke-current-session', 'none'),
      surface('google', ['accounts-oauth', 'oauth', 'accounts-google', 'google-oauth'], 'registered-provider', 'provider-account-session'),
      surface('microsoft', ['accounts-oauth', 'oauth', 'mofacts:accounts-microsoft', 'mofacts:microsoft-oauth'], 'registered-provider', 'provider-account-session'),
      surface('memphisSaml', ['accounts-oauth', 'oauth'], 'registered-provider', 'provider-account-session'),
    ]),
  } as const);
}
