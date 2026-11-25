import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { PROLIFIC_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';

describe('Prolific runtime bindings', function() {
  it('binds the installed Prolific methods and preserves their access boundaries', async function() {
    const observation = registeredMeteorMethodSurfaces();
    if (observation.state !== 'observed') throw new Error(observation.reason);
    const handlers = (Meteor as any).server.method_handlers;
    const participantOperations = new Map<string, string>([
      ['startProlificParticipation', 'participant-entry'],
      ['resumeProlificParticipation', 'participant-resume'],
      ['completeProlificParticipation', 'own-completion'],
    ]);
    for (const verification of Object.values(PROLIFIC_METHOD_VERIFICATIONS)) {
      const entries = observation.surfaces.filter(entry => entry.name === verification.method);
      expect(entries).to.have.length(1);
      expect(entries[0]?.verification).to.equal(verification);
      const operation = participantOperations.get(verification.method);
      if (operation) {
        expect(entries[0]?.policy).to.deep.equal({ kind: 'prolific', operation });
      } else {
        expect(entries[0]?.policy).to.deep.equal({ kind: 'prolific', operation: 'researcher', roles: ['admin', 'teacher'],
          rateLimit: { ipLimit: 120, identifierLimit: 30, windowMs: 60000 } });
      }
      let failure: any;
      try { await handlers[verification.method].call({}, null); }
      catch (error) { failure = error; }
      expect(failure?.error).to.equal(operation === 'participant-entry' || operation === 'participant-resume' ? 'prolific.invalidIdentity' : 401);
      if (!operation) {
        failure = undefined;
        try { await handlers[verification.method].call({ userId: 'synthetic-nonresearcher' }, null); }
        catch (error) { failure = error; }
        expect(failure?.error).to.equal(403);
      }
    }
  });
});
