import { expect } from 'chai';
import {
  PUBLIC_DEMO_DEFINITIONS,
  PUBLIC_DEMO_LIFETIME_MS,
  parsePublicDemoRequest,
  publicDemoExpiresAt,
} from './publicDemoContract';

describe('publicDemoContract', function() {
  it('accepts only the three allowlisted kinds with no client-supplied launch fields', function() {
    expect(parsePublicDemoRequest({ kind: 'student' })).to.equal('student');
    expect(parsePublicDemoRequest({ kind: 'teacher' })).to.equal('teacher');
    expect(parsePublicDemoRequest({ kind: 'researcher' })).to.equal('researcher');
    expect(parsePublicDemoRequest({ kind: 'student', experimentTarget: 'forged' })).to.equal(null);
    expect(parsePublicDemoRequest({ kind: 'student', expiresAt: new Date(0) })).to.equal(null);
    expect(parsePublicDemoRequest({ kind: 'unknown' })).to.equal(null);
  });

  it('keeps every launch path tied to its allowlisted experiment target', function() {
    for (const definition of Object.values(PUBLIC_DEMO_DEFINITIONS)) {
      expect(definition.launchPath).to.equal(`/experiment/${definition.experimentTarget}`);
    }
    expect(PUBLIC_DEMO_DEFINITIONS.teacher.experimentTarget).to.equal('public-demo-teacher-autotutor');
  });

  it('expires exactly 24 hours after creation', function() {
    const createdAt = new Date('2026-08-26T12:00:00.000Z');
    expect(publicDemoExpiresAt(createdAt).getTime() - createdAt.getTime()).to.equal(PUBLIC_DEMO_LIFETIME_MS);
  });
});
