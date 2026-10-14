import { expect } from 'chai';
import { Session } from 'meteor/session';
import { pickCaptureSettings } from '../../../../lib/deliverySettingsResolver';
import {
  buildSignalCaptureLifecycleEvent,
  emitSignalCaptureLifecycleEvent,
  isSignalCaptureEmissionActive,
  resetSignalCaptureEmitterForTests,
  resolveCaptureEmissionConfig,
  resolveCaptureSessionId,
  setSignalCaptureFetchForTests,
} from './signalCaptureLifecycleEmitter';

describe('signalCaptureLifecycleEmitter (#316)', function() {
  afterEach(function() {
    resetSignalCaptureEmitterForTests();
    Session.set('currentTdfUnit', null);
    Session.set('psynaptixSessionId', null);
    Session.set('portalHandoffToken', null);
  });

  it('resolves generic capture settings with legacy aliases', function() {
    const config = resolveCaptureEmissionConfig({
      enablePsynaptix: true,
      psynaptixEndpoint: 'https://capture.example/events-root',
      captureApiToken: 'cap-tok',
    });
    expect(config.enabled).to.equal(true);
    expect(config.endpoint).to.equal('https://capture.example/events-root');
    expect(config.authToken).to.equal('cap-tok');
  });

  it('prefers portal handoff token when captureApiToken is absent', function() {
    Session.set('portalHandoffToken', 'handoff-tok');
    const config = resolveCaptureEmissionConfig({
      enableSignalCapture: true,
      captureApiEndpoint: 'https://capture.example',
    });
    expect(config.authToken).to.equal('handoff-tok');
  });

  it('is inactive for external-url units', function() {
    Session.set('currentTdfUnit', { externalurl: { urlTemplate: 'https://x' } });
    expect(isSignalCaptureEmissionActive({
      enableSignalCapture: true,
      captureApiEndpoint: 'https://capture.example',
    })).to.equal(false);
  });

  it('builds stimulus-onset with session id, trial index, and stim identity', function() {
    Session.set('psynaptixSessionId', 'psx-abc');
    const event = buildSignalCaptureLifecycleEvent('stimulus-onset', {
      deliverySettings: {
        enableSignalCapture: true,
        captureApiEndpoint: 'https://capture.example',
      },
      attemptId: 'attempt-1',
      userId: 'u1',
      tdfId: 'tdf-1',
      questionIndex: 3,
      testType: 'd',
      engineIndices: { clusterIndex: 2, whichStim: 1 },
    }, 1_700_000_000_000);
    expect(event).to.deep.include({
      type: 'stimulus-onset',
      sessionId: 'psx-abc',
      trialIndex: 2,
      timestampMs: 1_700_000_000_000,
      stimulusId: '2:1',
      itemId: '2:1',
      tdfId: 'tdf-1',
      userId: 'u1',
      unitType: 'd',
    });
  });

  it('POSTs to {endpoint}/events with bearer auth (soft-fail fetch)', function() {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    setSignalCaptureFetchForTests(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init: init ?? {} });
      return new Response('{}', { status: 200 });
    });

    emitSignalCaptureLifecycleEvent({
      type: 'trial-start',
      sessionId: 'psx-1',
      trialIndex: 0,
      timestampMs: 100,
    }, {
      enableSignalCapture: true,
      captureApiEndpoint: 'https://capture.example/',
      captureApiToken: 'tok',
    });

    expect(calls).to.have.length(1);
    expect(calls[0]!.url).to.equal('https://capture.example/events');
    expect(calls[0]!.init.method).to.equal('POST');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).to.equal('Bearer tok');
    expect(JSON.parse(String(calls[0]!.init.body))).to.deep.include({
      type: 'trial-start',
      sessionId: 'psx-1',
    });
  });

  it('resolveCaptureSessionId prefers portal session id', function() {
    Session.set('psynaptixSessionId', 'psx-portal');
    expect(resolveCaptureSessionId({ attemptId: 'attempt-1' })).to.equal('psx-portal');
  });
});

describe('deliverySettingsResolver capture keys (#316)', function() {
  it('picks generic capture delivery keys', function() {
    const picked = pickCaptureSettings({
      enableSignalCapture: true,
      captureApiEndpoint: 'http://psynaptix:3001',
      captureApiToken: 'tok',
      captureConfig: { enableSensors: ['mouse', 'eeg'] },
      calibrationOverlay: 'bundle',
      psynaptixEndpoint: 'https://legacy.example.org',
      enablePsynaptix: false,
      audioInputEnabled: 'true',
    });
    expect(picked).to.deep.equal({
      enableSignalCapture: true,
      enablePsynaptix: false,
      captureApiEndpoint: 'http://psynaptix:3001',
      psynaptixEndpoint: 'https://legacy.example.org',
      captureApiToken: 'tok',
    });
  });

  it('returns {} for a null source', function() {
    expect(pickCaptureSettings(null)).to.deep.equal({});
  });
});
