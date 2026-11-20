import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { EXPERIMENT_ENTRY_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';

describe('experiment entry runtime bindings', function() {
  it('binds the four installed experiment entries to their existing admission and rate-limit rules', async function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const operations = {
      provisionExperimentUser: 'passwordless', enterCredentialedExperiment: 'credentialed',
      reconnectExperimentParticipant: 'scoped-reconnect', startPublicDemo: 'public-demo',
    } as const;
    const limiter = DDPRateLimiter as typeof DDPRateLimiter & {
      findAllMatchingRulesAsync(input: { type: string; name: string; connectionId: string; userId: null }): Promise<unknown[]>;
    };
    for (const verification of Object.values(EXPERIMENT_ENTRY_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      const isDemo = verification.method === 'startPublicDemo';
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      expect(entries[0]?.policy).to.deep.equal({
        kind: 'experiment-entry', operation: operations[verification.method],
        rateLimit: isDemo ? { requests: 10, windowMs: 3600000, scope: 'connection' } : null,
      });
      const rules = await limiter.findAllMatchingRulesAsync({
        type: 'method', name: verification.method, connectionId: 'synthetic-audit-connection', userId: null,
      });
      expect(rules).to.have.length(isDemo ? 1 : 0);
    }
  });

  it('retains experiment admission errors and signed-in public demo denial', async function() {
    const handlers = (Meteor as any).server.method_handlers;
    for (const [method, context, arg, code] of [
      ['enterCredentialedExperiment', {}, 'synthetic-unavailable-study', 403],
      ['reconnectExperimentParticipant', {}, 'synthetic-invalid-session', 403],
      ['startPublicDemo', { userId: 'synthetic-signed-in' }, { kind: 'student' }, 'public-demo-account-active'],
    ] as const) {
      let failure: any;
      try { await handlers[method].call(context, arg); }
      catch (error) { failure = error; }
      expect(failure?.error).to.equal(code);
    }
  });
});
