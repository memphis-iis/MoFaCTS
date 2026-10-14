import { expect } from 'chai';
import { Session } from 'meteor/session';
import {
  buildCalibrationResumeUrl,
  buildCalibrationReadySignal,
  buildSyntheticExternalComplete,
  capturePortalHandoffFromLocation,
  EXTERNAL_COMPLETE_MAX_AGE_MS,
  extractCompletionPayload,
  isAllowedCompletionOrigin,
  isCompletionOriginAllowed,
  isExternalSessionReadyMessage,
  isExternalUrlUnitActive,
  isFreshMatchingExternalComplete,
  isTabClosed,
  isTerminalCalibrationResumeStatus,
  parseExternalCompleteSignal,
  readPendingExternalComplete,
  readPortalHandoffParams,
  resolveCompletionAllowlistOrigins,
  resolveExternalSessionId,
  resolveExternalUrl,
} from './externalUrlSession';

describe('externalUrlSession helpers (issue #239)', function() {
  it('resolves {{sessionId}}', function() {
    expect(resolveExternalUrl('https://app.test/s?sid={{sessionId}}', { sessionId: 'psx-1' }))
      .to.equal('https://app.test/s?sid=psx-1');
  });

  it('resolves {{target}}', function() {
    expect(resolveExternalUrl('https://app.test/t={{target}}', { target: 'exp-42' }))
      .to.equal('https://app.test/t=exp-42');
  });

  it('resolves {{token}} when available', function() {
    expect(resolveExternalUrl('https://app.test/tok={{token}}', { token: 'cap-9' }))
      .to.equal('https://app.test/tok=cap-9');
  });

  it('resolves {{mofactsUrl}}', function() {
    expect(resolveExternalUrl('https://app.test/m={{mofactsUrl}}', { mofactsUrl: 'https://mofacts.test' }))
      .to.equal('https://app.test/m=https://mofacts.test');
  });

  it('resolves {{psynaptixUrl}}', function() {
    expect(resolveExternalUrl('{{psynaptixUrl}}/session?x=1', { psynaptixUrl: 'http://psynaptix:3001' }))
      .to.equal('http://psynaptix:3001/session?x=1');
  });

  it('resolves {{tdfId}} for Psynaptix license checks', function() {
    expect(resolveExternalUrl(
      '{{psynaptixUrl}}/session?sessionId={{sessionId}}&tdfId={{tdfId}}',
      { psynaptixUrl: 'https://api.test', sessionId: 'psx-1', tdfId: 'whole-bundle' },
    )).to.equal('https://api.test/session?sessionId=psx-1&tdfId=whole-bundle');
  });

  it('resolves all placeholders together', function() {
    const out = resolveExternalUrl(
      'https://app.test/s={{sessionId}}&t={{target}}&tok={{token}}&m={{mofactsUrl}}',
      { sessionId: 'psx-1', target: 'exp-42', token: 'cap-9', mofactsUrl: 'https://mofacts.test' },
    );
    expect(out).to.equal('https://app.test/s=psx-1&t=exp-42&tok=cap-9&m=https://mofacts.test');
  });

  it('renders a missing known value as an empty segment and preserves unknown placeholders', function() {
    const out = resolveExternalUrl('https://app.test/s={{sessionId}}&x={{unknown}}', {});
    expect(out).to.equal('https://app.test/s=&x={{unknown}}');
  });

  it('origin allowlist: same origin accepted, others rejected', function() {
    expect(isAllowedCompletionOrigin('https://app.test', 'https://app.test/path?q=1')).to.equal(true);
    expect(isAllowedCompletionOrigin('https://evil.test', 'https://app.test')).to.equal(false);
    expect(isAllowedCompletionOrigin('not-a-url', 'https://app.test')).to.equal(false);
  });

  it('completion allowlist merges endpoint + session URL origins', function() {
    expect(resolveCompletionAllowlistOrigins(
      'https://api.test',
      'https://api.test/session?x=1',
      'https://api.alt/session',
      '',
      null,
    )).to.deep.equal(['https://api.test', 'https://api.alt']);
    expect(isCompletionOriginAllowed('https://api.test', ['https://api.test', 'https://api.alt'])).to.equal(true);
    expect(isCompletionOriginAllowed('https://evil.test', ['https://api.test'])).to.equal(false);
  });

  it('builds calibrate/resume poll URL and synthetic complete envelope', function() {
    expect(buildCalibrationResumeUrl('https://api.test/session?x=1', 'psx-1'))
      .to.equal('https://api.test/calibrate/resume?sessionId=psx-1');
    expect(buildCalibrationResumeUrl('', 'psx-1')).to.equal(null);
    expect(isTerminalCalibrationResumeStatus('completed')).to.equal(true);
    expect(isTerminalCalibrationResumeStatus('running')).to.equal(false);
    const synth = buildSyntheticExternalComplete('external-url-complete', 'psx-1', 'completed', 1000);
    expect(synth).to.deep.include({ type: 'external-url-complete', sessionId: 'psx-1', at: 1000 });
    expect(synth.result).to.deep.include({ sessionId: 'psx-1', status: 'calibrated', source: 'calibrate-resume-poll' });
    const ready = buildCalibrationReadySignal('psx-1', 1000);
    expect(ready).to.deep.equal({
      type: 'psynaptix:calibration-complete',
      sessionId: 'psx-1',
      at: 1000,
    });
    expect(extractCompletionPayload(ready, 'external-url-complete')).to.equal(null);
  });

  it('extracts only the declared completionType + carries the result', function() {
    expect(extractCompletionPayload({ type: 'external-url-complete', result: { trials: 3 } }, 'external-url-complete'))
      .to.deep.equal({ type: 'external-url-complete', result: { trials: 3 } });
    expect(extractCompletionPayload({ type: 'other-message' }, 'external-url-complete')).to.equal(null);
    expect(extractCompletionPayload(null, 'external-url-complete')).to.equal(null);
  });

  it('ready message: completionType or psynaptix calibration-complete (issue #272)', function() {
    expect(isExternalSessionReadyMessage({ type: 'external-url-complete' }, 'external-url-complete')).to.equal(true);
    expect(isExternalSessionReadyMessage({ type: 'psynaptix:calibration-complete' }, 'external-url-complete')).to.equal(true);
    expect(isExternalSessionReadyMessage({ type: 'other' }, 'external-url-complete')).to.equal(false);
  });

  it('reads portal handoff params and prefers portal session id (issue #273)', function() {
    expect(readPortalHandoffParams('?psynaptixSessionId=psx-1&handoffToken=tok'))
      .to.deep.equal({ psynaptixSessionId: 'psx-1', handoffToken: 'tok' });
    expect(resolveExternalSessionId({ portalSessionId: 'psx-9', tdfId: 'tdf', userId: 'u' })).to.equal('psx-9');
    expect(resolveExternalSessionId({ tdfId: 'tdf', userId: 'u' })).to.equal('tdf');
  });

  it('persists portal handoff into Session (#619)', function() {
    const written: Record<string, string> = {};
    const handoff = capturePortalHandoffFromLocation(
      '?psynaptixSessionId=psx-bind&handoffToken=htok',
      (key, value) => { written[key] = value; },
    );
    expect(handoff).to.deep.equal({ psynaptixSessionId: 'psx-bind', handoffToken: 'htok' });
    expect(written).to.deep.equal({
      psynaptixSessionId: 'psx-bind',
      portalHandoffToken: 'htok',
    });
    expect(capturePortalHandoffFromLocation('', (key, value) => { written[key] = value; }))
      .to.deep.equal({});
  });

  it('detects a closed tab', function() {
    expect(isTabClosed(null)).to.equal(true);
    expect(isTabClosed({ closed: true } as Window)).to.equal(true);
    expect(isTabClosed({ closed: false } as Window)).to.equal(false);
  });
});

describe('external complete resilient channel (issue #307)', function() {
  const completionType = 'external-url-complete';
  const now = 1_700_000_000_000;

  it('parses BroadcastChannel / storage envelopes', function() {
    expect(parseExternalCompleteSignal({
      type: 'external-url-complete',
      result: { status: 'calibrated' },
      sessionId: 'psx-1',
      at: now,
    }, completionType)).to.deep.equal({
      type: 'external-url-complete',
      result: { status: 'calibrated' },
      sessionId: 'psx-1',
      at: now,
    });
    expect(parseExternalCompleteSignal({ type: 'other' }, completionType)).to.equal(null);
  });

  it('rejects stale or session-mismatched signals', function() {
    const fresh = parseExternalCompleteSignal({
      type: 'external-url-complete',
      sessionId: 'psx-1',
      at: now,
    }, completionType);
    expect(isFreshMatchingExternalComplete(fresh, { sessionId: 'psx-1', now })).to.equal(true);
    expect(isFreshMatchingExternalComplete(fresh, { sessionId: 'psx-other', now })).to.equal(false);
    expect(isFreshMatchingExternalComplete(fresh, {
      sessionId: 'psx-1',
      now: now + EXTERNAL_COMPLETE_MAX_AGE_MS + 1,
    })).to.equal(false);
  });

  it('reads pending localStorage JSON when fresh and matching', function() {
    const raw = JSON.stringify({
      type: 'external-url-complete',
      result: { status: 'calibrated' },
      sessionId: 'psx-1',
      at: now,
    });
    expect(readPendingExternalComplete(raw, completionType, { sessionId: 'psx-1', now }))
      .to.include({ type: 'external-url-complete', sessionId: 'psx-1' });
    expect(readPendingExternalComplete('not-json', completionType, { sessionId: 'psx-1', now }))
      .to.equal(null);
    expect(readPendingExternalComplete(null, completionType)).to.equal(null);
  });
});

describe('isExternalUrlUnitActive (issue #242 gate-off)', function() {
  afterEach(function() {
    Session.set('currentTdfUnit', undefined);
  });

  it('true when the current unit is an externalurl unit', function() {
    Session.set('currentTdfUnit', { externalurl: { urlTemplate: 'https://app.test/s={{sessionId}}' } });
    expect(isExternalUrlUnitActive()).to.equal(true);
  });

  it('false for any other unit (instrumented lessons keep the legacy path)', function() {
    Session.set('currentTdfUnit', { videosession: {} });
    expect(isExternalUrlUnitActive()).to.equal(false);
    Session.set('currentTdfUnit', undefined);
    expect(isExternalUrlUnitActive()).to.equal(false);
  });
});
