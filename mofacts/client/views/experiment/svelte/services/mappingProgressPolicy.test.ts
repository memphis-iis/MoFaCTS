import { expect } from 'chai';
import {
  hasMeaningfulMappingProgress,
  isStrictMappingMismatchEnforcementEnabled,
} from './mappingProgressPolicy';

type TestMeteorGlobal = typeof globalThis & {
  Meteor?: unknown;
};

type TestMeteorSettings = {
  settings?: {
    public?: {
      strictMappingMismatchEnforcement?: boolean | string;
      features?: {
        strictMappingMismatchEnforcement?: boolean | string;
      };
    };
  };
};

describe('mappingProgressPolicy', function() {
  const runtime = globalThis as TestMeteorGlobal;

  afterEach(function() {
    Reflect.deleteProperty(runtime as Record<string, unknown>, 'Meteor');
  });

  it('detects meaningful progress from action/history markers', function() {
    expect(hasMeaningfulMappingProgress({})).to.equal(false);
    expect(hasMeaningfulMappingProgress({ id: 'state-1' } as Record<string, unknown>)).to.equal(false);
    expect(hasMeaningfulMappingProgress({ currentUnitNumber: 0 })).to.equal(true);
    expect(hasMeaningfulMappingProgress({ overallStudyHistory: [{ x: 1 }] })).to.equal(true);
  });

  it('defaults strict mismatch enforcement to enabled', function() {
    expect(isStrictMappingMismatchEnforcementEnabled()).to.equal(true);
  });

  it('reads strict mismatch enforcement feature flag from Meteor public settings', function() {
    Object.assign(runtime as Record<string, unknown>, {
      Meteor: { settings: { public: { strictMappingMismatchEnforcement: false } } } as TestMeteorSettings
    });
    expect(isStrictMappingMismatchEnforcementEnabled()).to.equal(false);

    Object.assign(runtime as Record<string, unknown>, {
      Meteor: {
        settings: { public: { features: { strictMappingMismatchEnforcement: 'true' } } }
      } as TestMeteorSettings
    });
    expect(isStrictMappingMismatchEnforcementEnabled()).to.equal(true);
  });
});
