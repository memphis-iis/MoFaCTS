import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

export type MeteorPasswordValue = string | {
  digest: string;
  algorithm: 'sha-256';
};

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  timeCost: 2,
  memoryCost: 19456,
  parallelism: 1,
});

export function formatMeteorPasswordForVerification(password: MeteorPasswordValue): string {
  if (typeof password === 'string') {
    return createHash('sha256').update(password, 'utf8').digest('hex');
  }
  if (password.algorithm !== 'sha-256') {
    throw new Error('Invalid password hash algorithm. Only sha-256 is allowed.');
  }
  return password.digest;
}

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

export async function createPasswordTimingDefense() {
  const decoyPassword = randomBytes(32).toString('hex');
  const decoyHash = await argon2.hash(decoyPassword, ARGON2_OPTIONS);

  return Object.freeze({
    async verifyUnknownPasswordAttempt(password: MeteorPasswordValue): Promise<void> {
      await argon2.verify(decoyHash, formatMeteorPasswordForVerification(password));
    },
  });
}
