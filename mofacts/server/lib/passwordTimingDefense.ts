export type MeteorPasswordValue = string | {
  digest: string;
  algorithm: 'sha-256';
};

type MeteorPasswordVerifier = (
  user: { _id: string; services: { password: { argon2: string } } },
  password: MeteorPasswordValue,
) => Promise<unknown>;

// This is deliberately not a credential. It is a fixed decoy hash whose only
// purpose is to make an unknown-account attempt traverse Meteor's existing
// Argon2 verifier with the same parameters as a real password account.
const DECOY_ARGON2_HASH = '$argon2id$v=19$m=19456,t=2,p=1$lh2Wz5zkGQzo1oYKM+jiSg$10tMEfN3SL49/GK6UMPbauINBZQPAFxV7kJTt3DfG3k';
const DECOY_USER = Object.freeze({
  _id: 'password-timing-decoy',
  services: Object.freeze({
    password: Object.freeze({ argon2: DECOY_ARGON2_HASH }),
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

export function createPasswordTimingDefense(checkPasswordAsync: MeteorPasswordVerifier) {
  return Object.freeze({
    async verifyUnknownPasswordAttempt(password: MeteorPasswordValue): Promise<void> {
      await checkPasswordAsync(DECOY_USER, password);
    },
  });
}
