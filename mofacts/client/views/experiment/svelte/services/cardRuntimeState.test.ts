import { expect } from 'chai';
import { Session } from 'meteor/session';
import { clearEngine, setEngine } from '../../../../lib/engineManager';
import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
import { CardStore } from '../../modules/cardStore';
import {
  clearResumeToQuestion,
  clearVideoSessionState,
  getCurrentAnswer,
  getEngineIndices,
  getRuntimeExperimentState,
  getOverallOutcomeHistory,
  getOverallStudyHistory,
  getIsVideoSessionFlag,
  getVideoCheckpoints,
  getVideoResumeAnchor,
  hasCurrentTdfId,
  isInResume,
  isResumeInProgress,
  isResumeRequested,
  markResumeRuntimeInactive,
  publishEngineIndices,
  recordRuntimeOutcomeHistories,
  resetCardRuntimeForInitialization,
  resetRuntimeHistories,
  resolveRuntimeEngine,
  setCurrentAnswer,
  setCurrentDeliverySettings,
  setDisplayReadyState,
  setEngineIndices,
  setInResume,
  setInputReadyState,
  setResumeInProgress,
  setResumeToQuestion,
  setRuntimeHistories,
  setVideoCheckpoints,
  setVideoEngineIndices,
  setVideoResumeAnchor,
  setVideoSessionActive,
} from './cardRuntimeState';

describe('cardRuntimeState', function() {
  beforeEach(function() {
    CardStore.initialize();
    clearEngine();
    Session.set('currentTdfFile', undefined);
    Session.set('currentTdfId', undefined);
    Session.set('overallOutcomeHistory', undefined);
    Session.set('overallStudyHistory', undefined);
    Session.set('resumeToQuestion', undefined);
    Session.set('engineIndices', undefined);
    ExperimentStateStore.clear();
  });

  afterEach(function() {
    clearEngine();
    ExperimentStateStore.clear();
  });

  it('resets the card init bridge state and preserves the current TDF snapshot', function() {
    const tdfFile = { tdfs: { tutor: {} } };
    Session.set('currentTdfFile', tdfFile);
    Session.set('overallOutcomeHistory', [{ correct: true }]);
    CardStore.setDisplayReady(true);
    CardStore.setInputReady(true);

    const snapshot = resetCardRuntimeForInitialization();

    expect(snapshot.currentTdfFile).to.equal(tdfFile);
    expect(snapshot.overallOutcomeHistory).to.deep.equal([{ correct: true }]);
    expect(snapshot.overallStudyHistory).to.deep.equal([]);
    expect(CardStore.isDisplayReady()).to.equal(false);
    expect(CardStore.isInputReady()).to.equal(false);
    expect(Session.get('displayReady')).to.equal(false);
    expect(Session.get('inputReady')).to.equal(false);
    expect(Session.get('isVideoSession')).to.equal(false);
    expect(Session.get('videoCheckpoints')).to.equal(null);
    expect(Session.get('videoResumeAnchor')).to.equal(null);
  });

  it('owns display/input readiness mirrors through one accessor layer', function() {
    setDisplayReadyState(true);
    setInputReadyState(true);

    expect(CardStore.isDisplayReady()).to.equal(true);
    expect(CardStore.isInputReady()).to.equal(true);
    expect(Session.get('displayReady')).to.equal(true);
    expect(Session.get('inputReady')).to.equal(true);

    setDisplayReadyState(false);
    setInputReadyState(false);

    expect(CardStore.isDisplayReady()).to.equal(false);
    expect(CardStore.isInputReady()).to.equal(false);
    expect(Session.get('displayReady')).to.equal(false);
    expect(Session.get('inputReady')).to.equal(false);
  });

  it('resolves engines through the documented priority order', function() {
    const globalEngine = { unitType: 'model', source: 'global' };
    const contextEngine = { unitType: 'model', source: 'context' };
    const eventEngine = { unitType: 'model', source: 'event' };
    const explicitEngine = { unitType: 'model', source: 'explicit' };
    setEngine(globalEngine);

    expect(resolveRuntimeEngine()).to.equal(globalEngine);
    expect(resolveRuntimeEngine({ contextEngine })).to.equal(contextEngine);
    expect(resolveRuntimeEngine({ eventEngine, contextEngine })).to.equal(eventEngine);
    expect(resolveRuntimeEngine({ explicitEngine, eventEngine, contextEngine })).to.equal(explicitEngine);
  });

  it('owns engine indices and one-shot resume flags through named accessors', function() {
    Session.set('currentTdfId', 'tdf-1');
    setResumeToQuestion(true);
    setResumeInProgress(true);
    setInResume(true);

    expect(hasCurrentTdfId()).to.equal(true);
    expect(isResumeRequested()).to.equal(true);
    expect(isResumeInProgress()).to.equal(true);
    expect(isInResume()).to.equal(true);

    clearResumeToQuestion();
    expect(Session.get('resumeToQuestion')).to.equal(false);
    markResumeRuntimeInactive();
    expect(isResumeInProgress()).to.equal(false);
    expect(isInResume()).to.equal(false);

    setEngineIndices({ clusterIndex: 2, stimIndex: 3 });
    expect(getEngineIndices()).to.deep.equal({ clusterIndex: 2, stimIndex: 3 });

    const videoIndices = setVideoEngineIndices(5);
    expect(videoIndices).to.deep.equal({ clusterIndex: 5, stimIndex: 0 });
    expect(Session.get('engineIndices')).to.deep.equal({ clusterIndex: 5, stimIndex: 0 });

    publishEngineIndices({ clusterIndex: 7, whichStim: 8, stimIndex: 9 });
    expect(Session.get('clusterIndex')).to.equal(7);
    expect(Session.get('whichStim')).to.equal(8);
    expect(Session.get('stimIndex')).to.equal(9);
  });

  it('centralizes trial session writes and experiment state reads', function() {
    ExperimentStateStore.set({ originalDisplay: 'Question' });
    setRuntimeHistories([{ correct: false }], [0]);
    setVideoSessionActive(true);
    setVideoCheckpoints({ times: [1], questions: [2] });
    setVideoResumeAnchor({ time: 10 });

    setCurrentDeliverySettings({ maxTime: 1000 });
    setCurrentAnswer('answer');

    expect(Session.get('currentDeliverySettings')).to.deep.equal({ maxTime: 1000 });
    expect(getCurrentAnswer()).to.equal('answer');
    expect(getRuntimeExperimentState()).to.deep.equal({ originalDisplay: 'Question' });
    expect(getOverallOutcomeHistory()).to.deep.equal([{ correct: false }]);
    expect(getOverallStudyHistory()).to.deep.equal([0]);
    expect(getIsVideoSessionFlag()).to.equal(true);
    expect(getVideoCheckpoints()).to.deep.equal({ times: [1], questions: [2] });
    expect(getVideoResumeAnchor()).to.deep.equal({ time: 10 });

    resetRuntimeHistories();
    expect(getOverallOutcomeHistory()).to.deep.equal([]);
    expect(getOverallStudyHistory()).to.deep.equal([]);

    recordRuntimeOutcomeHistories('d', [true, false]);
    expect(getOverallOutcomeHistory()).to.deep.equal([1, 0]);
    expect(getOverallStudyHistory()).to.deep.equal([0]);

    clearVideoSessionState();
    expect(getIsVideoSessionFlag()).to.equal(false);
    expect(getVideoResumeAnchor()).to.equal(null);
  });
});
