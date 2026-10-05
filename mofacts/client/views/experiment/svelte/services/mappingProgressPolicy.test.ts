import { expect } from 'chai';
import {
  hasMeaningfulMappingProgress,
} from './mappingProgressPolicy';

describe('mappingProgressPolicy', function() {
  it('detects meaningful progress from action/history markers', function() {
    expect(hasMeaningfulMappingProgress({})).to.equal(false);
    expect(hasMeaningfulMappingProgress({ currentUnitNumber: 0, lastUnitCompleted: -1 })).to.equal(false);
    expect(hasMeaningfulMappingProgress({ currentUnitNumber: 1, lastUnitCompleted: 0 })).to.equal(true);
    expect(hasMeaningfulMappingProgress({ overallStudyHistory: [{ x: 1 }] })).to.equal(true);
    expect(hasMeaningfulMappingProgress({ scheduleUnitNumber: 1 })).to.equal(true);
    expect(hasMeaningfulMappingProgress({ questionIndex: 0 })).to.equal(true);
    expect(hasMeaningfulMappingProgress({ schedule: { q: [] } })).to.equal(true);
  });
});
