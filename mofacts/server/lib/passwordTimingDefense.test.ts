import { expect } from 'chai';
import {
  createFailedPasswordResponseEnvelope,
  createPasswordTimingDefense,
  extractPasswordFromLoginArguments,
  extractPasswordLoginQuery,
  wrapPasswordLoginMethodWithResponseEnvelope,
} from './passwordTimingDefense';

describe('password timing defense', function() {
  this.timeout(10_000);

  it('extracts only supported password login arguments', () => {
    expect(extractPasswordFromLoginArguments([{ user: { email: 'user@example.invalid' }, password: 'secret' }]))
      .to.equal('secret');
    expect(extractPasswordFromLoginArguments([{ password: { digest: 'digest', algorithm: 'sha-256' } }]))
      .to.deep.equal({ digest: 'digest', algorithm: 'sha-256' });
    expect(extractPasswordFromLoginArguments([{ password: { digest: 'digest', algorithm: 'md5' } }]))
      .to.equal(null);
    expect(extractPasswordFromLoginArguments([])).to.equal(null);
  });

  it('extracts the Meteor password-login account query without retaining the password', () => {
    expect(extractPasswordLoginQuery([{
      user: { email: 'user@example.invalid' },
      password: { digest: 'digest', algorithm: 'sha-256' },
    }])).to.deep.equal({ email: 'user@example.invalid' });
    expect(extractPasswordLoginQuery([{ user: { username: 'learner' }, password: 'secret' }]))
      .to.deep.equal({ username: 'learner' });
    expect(extractPasswordLoginQuery([{ password: 'secret' }])).to.equal(null);
  });

  it('equalizes unknown, bcrypt, and Argon2 failures with the missing verifier work', async () => {
    const observedUsers: Array<{ _id: string; services: { password: { bcrypt?: string; argon2?: string } } }> = [];
    let observedPassword: unknown;
    const observedLookups: unknown[] = [];
    const defense = createPasswordTimingDefense(
      async (user, password) => {
        observedUsers.push(user);
        observedPassword = password;
        return { error: new Error('Incorrect password') };
      },
      async (query) => {
        observedLookups.push(query);
      },
    );
    expect(await defense.equalizeFailedPasswordAttempt(null, 'incorrect password', { email: 'missing@example.invalid' }))
      .to.equal(undefined);
    expect(observedLookups).to.deep.equal([]);
    expect(observedUsers.map((user) => user._id)).to.deep.equal([
      'password-timing-decoy-bcrypt',
      'password-timing-decoy-argon2',
    ]);
    expect(observedUsers[0]!.services.password.bcrypt).to.match(/^\$2b\$10\$/);
    expect(observedUsers[1]!.services.password.argon2).to.match(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(observedPassword).to.equal('incorrect password');

    observedUsers.length = 0;
    await defense.equalizeFailedPasswordAttempt(
      { services: { password: { bcrypt: 'stored' } } },
      'incorrect password',
      { email: 'existing@example.invalid' },
    );
    expect(observedLookups).to.deep.equal([{ email: 'existing@example.invalid' }]);
    expect(observedUsers.map((user) => user._id)).to.deep.equal(['password-timing-decoy-argon2']);

    observedUsers.length = 0;
    observedLookups.length = 0;
    await defense.equalizeFailedPasswordAttempt(
      { services: { password: { argon2: 'stored' } } },
      'incorrect password',
      { username: 'existing-user' },
    );
    expect(observedLookups).to.deep.equal([{ username: 'existing-user' }]);
    expect(observedUsers.map((user) => user._id)).to.deep.equal(['password-timing-decoy-bcrypt']);
  });

  it('holds failed password responses to an outcome-independent target', async () => {
    const waits: number[] = [];
    const samples: unknown[] = [];
    const clock = [100, 500];
    const failure = new Error('Incorrect password');
    const envelope = createFailedPasswordResponseEnvelope({
      now: () => clock.shift()!,
      randomInt: (minimum, maximum) => {
        expect([minimum, maximum]).to.deep.equal([1100, 1301]);
        return 1200;
      },
      wait: async (delayMs) => { waits.push(delayMs); },
      onFailureComplete: (sample) => { samples.push(sample); },
    });

    let observed: unknown;
    try {
      await envelope.protect(async () => { throw failure; });
    } catch (error) {
      observed = error;
    }
    expect(observed).to.equal(failure);
    expect(waits).to.deep.equal([800]);
    expect(samples).to.deep.equal([{
      delayedMs: 800,
      envelopeExceeded: false,
      targetMs: 1200,
      workElapsedMs: 400,
    }]);
  });

  it('does not delay successful password logins or non-password login methods', async () => {
    const waits: number[] = [];
    const envelope = createFailedPasswordResponseEnvelope({
      now: () => 100,
      randomInt: () => 1200,
      wait: async (delayMs) => { waits.push(delayMs); },
    });
    const calls: unknown[][] = [];
    const invocation = { connection: 'synthetic-ddp-invocation' };
    const wrapped = wrapPasswordLoginMethodWithResponseEnvelope(async function(...args) {
      expect(this).to.equal(invocation);
      calls.push(args);
      return 'success';
    }, envelope);

    expect(await wrapped.call(invocation, { user: { email: 'user@example.invalid' }, password: 'correct' }))
      .to.equal('success');
    expect(await wrapped.call(invocation, { resume: 'token' })).to.equal('success');
    expect(calls).to.have.length(2);
    expect(waits).to.deep.equal([]);
  });

  it('reports rather than masking work that exceeds the selected envelope', async () => {
    const waits: number[] = [];
    const samples: Array<{ envelopeExceeded: boolean }> = [];
    const clock = [100, 1500];
    const envelope = createFailedPasswordResponseEnvelope({
      now: () => clock.shift()!,
      randomInt: () => 1100,
      wait: async (delayMs) => { waits.push(delayMs); },
      onFailureComplete: (sample) => { samples.push(sample); },
    });

    try {
      await envelope.protect(async () => { throw new Error('Incorrect password'); });
    } catch { /* expected authentication failure */ }
    expect(waits).to.deep.equal([]);
    expect(samples).to.deep.equal([{ delayedMs: 0, envelopeExceeded: true, targetMs: 1100, workElapsedMs: 1400 }]);
  });
});
