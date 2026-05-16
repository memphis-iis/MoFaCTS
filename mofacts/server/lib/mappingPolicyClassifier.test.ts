import { expect } from 'chai';
import { hasMeaningfulProgressSignal } from './mappingPolicyClassifier';

describe('mappingPolicyClassifier', function() {
  it('detects meaningful progress signals from experiment state evidence', function() {
    expect(hasMeaningfulProgressSignal({})).to.equal(false);
    expect(hasMeaningfulProgressSignal({ currentUnitNumber: 1, lastUnitCompleted: 0 })).to.equal(false);
    expect(hasMeaningfulProgressSignal({ scheduleUnitNumber: 0 })).to.equal(true);
    expect(hasMeaningfulProgressSignal({ overallOutcomeHistory: [{ a: 1 }] })).to.equal(true);
  });
});
