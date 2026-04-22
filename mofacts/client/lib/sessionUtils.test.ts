import { expect } from 'chai';
import { Session } from 'meteor/session';
import { sessionCleanUp, clearMappingSessionStateForCleanup } from './sessionUtils';

describe('sessionUtils mapping cleanup', function() {
  beforeEach(function() {
    Session.set('clusterMapping', [2, 1, 0]);
    Session.set('mappingSignature', 'msig_v2_abc123');
  });

  afterEach(function() {
    Session.set('clusterMapping', '');
    Session.set('mappingSignature', null);
    Session.set('fromInstructions', false);
    Session.set('cardBootstrapInProgress', false);
  });

  it('clears mapping and signature session keys via cleanup helper', function() {
    clearMappingSessionStateForCleanup();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the normal (full) cleanup branch', function() {
    Session.set('fromInstructions', false);

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the fromInstructions guard branch', function() {
    Session.set('fromInstructions', true);
    // Simulate navigating to /card so the guard branch executes
    Object.defineProperty(document, 'location', {
      value: { pathname: '/card' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });

  it('clears mapping and signature in the card bootstrap guard branch', function() {
    Session.set('fromInstructions', false);
    Session.set('cardBootstrapInProgress', true);
    Object.defineProperty(document, 'location', {
      value: { pathname: '/card' },
      writable: true,
      configurable: true,
    });

    sessionCleanUp();

    expect(Session.get('clusterMapping')).to.equal('');
    expect(Session.get('mappingSignature')).to.equal(null);
  });
});
