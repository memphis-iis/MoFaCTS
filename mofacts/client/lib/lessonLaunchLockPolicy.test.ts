import { expect } from 'chai';

import { shouldLockMultiTdfLaunchToCurrentUnit } from './lessonLaunchLockPolicy';

describe('lessonLaunchLockPolicy', function() {
  it('locks assessment units into the current unit', function() {
    expect(shouldLockMultiTdfLaunchToCurrentUnit({ assessmentsession: {} })).to.equal(true);
  });

  it('locks learning and video units only when display timing is configured', function() {
    expect(shouldLockMultiTdfLaunchToCurrentUnit({
      learningsession: {},
      deliverySettings: { displayMinSeconds: 2 },
    })).to.equal(true);
    expect(shouldLockMultiTdfLaunchToCurrentUnit({
      videosession: {},
      displayMaxSeconds: 5,
    })).to.equal(true);
    expect(shouldLockMultiTdfLaunchToCurrentUnit({ learningsession: {} })).to.equal(false);
    expect(shouldLockMultiTdfLaunchToCurrentUnit({ videosession: {} })).to.equal(false);
  });

  it('does not lock missing units', function() {
    expect(shouldLockMultiTdfLaunchToCurrentUnit(null)).to.equal(false);
  });
});
