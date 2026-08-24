import { expect } from 'chai';
import {
  createPasswordTimingDefense,
  extractPasswordFromLoginArguments,
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

  it('uses Meteor password verification against a decoy Argon2 account', async () => {
    let observedUser: { _id: string; services: { password: { argon2: string } } } | undefined;
    let observedPassword: unknown;
    const defense = createPasswordTimingDefense(async (user, password) => {
      observedUser = user;
      observedPassword = password;
      return { error: new Error('Incorrect password') };
    });
    expect(await defense.verifyUnknownPasswordAttempt('incorrect password')).to.equal(undefined);
    expect(observedUser?._id).to.equal('password-timing-decoy');
    expect(observedUser?.services.password.argon2).to.match(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(observedPassword).to.equal('incorrect password');
  });
});
