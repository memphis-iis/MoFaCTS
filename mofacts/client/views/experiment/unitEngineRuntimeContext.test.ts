import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  createAppUnitEngineRuntimeContext,
  UNIT_ENGINE_SESSION_READ_KEYS,
  UNIT_ENGINE_SESSION_WRITE_KEYS,
} from './unitEngineRuntimeContext';

describe('unitEngineRuntimeContext', function() {
  afterEach(function() {
    Session.set('currentTdfId', undefined);
    Session.set('testType', undefined);
  });

  it('exposes documented session read/write keys to component-facing adapters', function() {
    const context = createAppUnitEngineRuntimeContext();

    expect([...context.session.allowedReadKeys]).to.have.members([...UNIT_ENGINE_SESSION_READ_KEYS]);
    expect([...context.session.allowedWriteKeys]).to.have.members([...UNIT_ENGINE_SESSION_WRITE_KEYS]);

    Session.set('currentTdfId', 'tdf-1');
    expect(context.session.getSessionValue('currentTdfId')).to.equal('tdf-1');

    context.session.setSessionValue('testType', 'd');
    expect(Session.get('testType')).to.equal('d');
  });

  it('rejects component-facing reads and writes outside the runtime contract', function() {
    const context = createAppUnitEngineRuntimeContext();
    const unsafeSession = context.session as any;

    expect(() => unsafeSession.getSessionValue('currentUserPrivateToken')).to.throw(
      'Component session read is not allowed for key "currentUserPrivateToken"',
    );
    expect(() => unsafeSession.setSessionValue('currentUserPrivateToken', 'secret')).to.throw(
      'Component session write is not allowed for key "currentUserPrivateToken"',
    );
  });
});
