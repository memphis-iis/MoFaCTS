import { expect } from 'chai';
import {
  createPasswordTimingDefense,
  extractPasswordFromLoginArguments,
  formatMeteorPasswordForVerification,
} from './passwordTimingDefense';

describe('password timing defense', function() {
  this.timeout(10_000);

  it('formats plaintext and client-digested passwords like Meteor accounts-password', () => {
    expect(formatMeteorPasswordForVerification('password')).to.equal(
      '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    );
    expect(formatMeteorPasswordForVerification({ digest: 'client-digest', algorithm: 'sha-256' }))
      .to.equal('client-digest');
  });

  it('extracts only supported password login arguments', () => {
    expect(extractPasswordFromLoginArguments([{ user: { email: 'user@example.invalid' }, password: 'secret' }]))
      .to.equal('secret');
    expect(extractPasswordFromLoginArguments([{ password: { digest: 'digest', algorithm: 'sha-256' } }]))
      .to.deep.equal({ digest: 'digest', algorithm: 'sha-256' });
    expect(extractPasswordFromLoginArguments([{ password: { digest: 'digest', algorithm: 'md5' } }]))
      .to.equal(null);
    expect(extractPasswordFromLoginArguments([])).to.equal(null);
  });

  it('performs an Argon2 verification for an unknown account without exposing the result', async () => {
    const defense = await createPasswordTimingDefense();
    expect(await defense.verifyUnknownPasswordAttempt('incorrect password')).to.equal(undefined);
  });
});
