export type MeteorPasswordValue = string | {
  digest: string;
  algorithm: 'sha-256';
};

type MeteorPasswordVerifier = (
  user: { _id: string; services: { password: { bcrypt?: string; argon2?: string } } },
  password: MeteorPasswordValue,
) => Promise<unknown>;

export type MeteorPasswordLoginQuery = { email: string } | { username: string };

type CaseInsensitivePasswordUserLookup = (query: MeteorPasswordLoginQuery) => Promise<void>;

export type MeteorPasswordAttemptUser = {
  _id?: string;
  services?: { password?: { bcrypt?: string; argon2?: string } };
};

// These are deliberately not credentials. Together they let every failed
// password attempt traverse one bcrypt and one Argon2 verification regardless
// of whether the account is missing or stores either supported hash generation.
const DECOY_ARGON2_HASH = '$argon2id$v=19$m=19456,t=2,p=1$lh2Wz5zkGQzo1oYKM+jiSg$10tMEfN3SL49/GK6UMPbauINBZQPAFxV7kJTt3DfG3k';
const DECOY_ARGON2_USER = Object.freeze({
  _id: 'password-timing-decoy-argon2',
  services: Object.freeze({
    password: Object.freeze({ argon2: DECOY_ARGON2_HASH }),
  }),
});
const DECOY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const DECOY_BCRYPT_USER = Object.freeze({
  _id: 'password-timing-decoy-bcrypt',
  services: Object.freeze({
    password: Object.freeze({ bcrypt: DECOY_BCRYPT_HASH }),
  }),
});

export function extractPasswordFromLoginArguments(methodArguments: unknown[] | undefined): MeteorPasswordValue | null {
  const loginOptions = methodArguments?.[0];
  if (!loginOptions || typeof loginOptions !== 'object' || !('password' in loginOptions)) {
    return null;
  }
  const password = (loginOptions as { password?: unknown }).password;
  if (typeof password === 'string') {
    return password;
  }
  if (
    password &&
    typeof password === 'object' &&
    (password as { algorithm?: unknown }).algorithm === 'sha-256' &&
    typeof (password as { digest?: unknown }).digest === 'string'
  ) {
    return password as MeteorPasswordValue;
  }
  return null;
}

export function extractPasswordLoginQuery(
  methodArguments: unknown[] | undefined,
): MeteorPasswordLoginQuery | null {
  const loginOptions = methodArguments?.[0];
  if (!loginOptions || typeof loginOptions !== 'object') {
    return null;
  }
  const user = (loginOptions as { user?: unknown }).user;
  if (!user || typeof user !== 'object') {
    return null;
  }
  const email = (user as { email?: unknown }).email;
  if (typeof email === 'string' && email.length > 0) {
    return { email };
  }
  const username = (user as { username?: unknown }).username;
  if (typeof username === 'string' && username.length > 0) {
    return { username };
  }
  return null;
}

export function createPasswordTimingDefense(
  checkPasswordAsync: MeteorPasswordVerifier,
  runCaseInsensitivePasswordUserLookup: CaseInsensitivePasswordUserLookup,
) {
  return Object.freeze({
    async equalizeFailedPasswordAttempt(
      user: MeteorPasswordAttemptUser | null | undefined,
      password: MeteorPasswordValue,
      loginQuery: MeteorPasswordLoginQuery | null,
    ): Promise<void> {
      // Meteor's password handler performs a second, case-insensitive lookup
      // only when its initial exact lookup finds no user. Repeat that candidate
      // query for an exact-match account so failed existing and missing account
      // paths perform the same database lookup classes.
      if (user && loginQuery) {
        await runCaseInsensitivePasswordUserLookup(loginQuery);
      }
      const passwordService = user?.services?.password;
      const hasBcrypt = typeof passwordService?.bcrypt === 'string';
      const hasArgon2 = typeof passwordService?.argon2 === 'string';
      if (!hasBcrypt || hasArgon2) {
        await checkPasswordAsync(DECOY_BCRYPT_USER, password);
      }
      if (!hasArgon2 || hasBcrypt) {
        await checkPasswordAsync(DECOY_ARGON2_USER, password);
      }
    },
  });
}
