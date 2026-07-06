import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  createAppUnitEngineRuntimeContext,
  UNIT_ENGINE_SESSION_READ_KEYS,
  UNIT_ENGINE_SESSION_WRITE_KEYS,
} from './unitEngineRuntimeContext';
import {
  getQuestionIndex,
  resetQuestionIndex,
} from './svelte/services/trialProgressionState';
import {
  getCurrentAnswer,
  resetActiveTrialDisplayRuntimeState,
} from './svelte/services/activeTrialDisplayRuntimeState';

describe('unitEngineRuntimeContext', function() {
  afterEach(function() {
    Session.set('currentTdfId', undefined);
    Session.set('currentTdfDoc', undefined);
    Session.set('testType', undefined);
    resetQuestionIndex();
    resetActiveTrialDisplayRuntimeState();
    delete (globalThis as any).Tdfs;
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

  it('resolves the active full TDF document from session for unit-engine stimuli lookups', function() {
    const activeDoc = {
      _id: 'tdf-active',
      rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'page-1' }] } },
    };
    let collectionLookupCount = 0;
    (globalThis as any).Tdfs = {
      findOne() {
        collectionLookupCount += 1;
        return null;
      },
    };
    Session.set('currentTdfId', 'tdf-active');
    Session.set('currentTdfDoc', activeDoc);

    const context = createAppUnitEngineRuntimeContext();

    expect(context.stimuli.findTdfById('tdf-active')).to.equal(activeDoc);
    expect(collectionLookupCount).to.equal(0);
  });

  it('exposes current-answer updates as a named app runtime capability', function() {
    const context = createAppUnitEngineRuntimeContext();

    context.cardState.setCurrentAnswer('alpha');

    expect(getCurrentAnswer()).to.equal('alpha');
  });

  it('exposes question-index updates through the trial progression owner', function() {
    const context = createAppUnitEngineRuntimeContext();

    context.cardState.setQuestionIndex(7);

    expect(getQuestionIndex()).to.equal(7);
  });
});
