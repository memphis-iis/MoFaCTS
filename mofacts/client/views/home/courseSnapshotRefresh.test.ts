import { expect } from 'chai';
import sinon from 'sinon';
import { createCourseSnapshotRefresh } from './courseSnapshotRefresh';

describe('course snapshot deadline refresh', function() {
  let clock: sinon.SinonFakeTimers;
  beforeEach(() => { clock = sinon.useFakeTimers({ now: 1000 }); });
  afterEach(() => { clock.restore(); });

  it('refreshes once at the boundary without polling before it', function() {
    const refresh = sinon.spy();
    const controller = createCourseSnapshotRefresh(refresh);
    controller.setExpiration(5000, 1000);
    clock.tick(3999);
    expect(refresh.callCount).to.equal(0);
    clock.tick(1);
    expect(refresh.callCount).to.equal(1);
    clock.tick(10000);
    expect(refresh.callCount).to.equal(1);
    controller.destroy();
  });

  it('replaces a former deadline and cancels the timer when no transition remains', function() {
    const refresh = sinon.spy();
    const controller = createCourseSnapshotRefresh(refresh);
    controller.setExpiration(2000, 1000);
    controller.setExpiration(4000, 1000);
    clock.tick(1000);
    expect(refresh.callCount).to.equal(0);
    controller.setExpiration(null, 2000);
    clock.tick(10000);
    expect(refresh.callCount).to.equal(0);
    controller.destroy();
  });

  it('handles dates beyond the browser timer limit without refreshing early', function() {
    const refresh = sinon.spy();
    const controller = createCourseSnapshotRefresh(refresh);
    const deadline = Date.now() + 2_147_483_647 + 5000;
    controller.setExpiration(deadline, Date.now());
    clock.tick(2_147_483_647);
    expect(refresh.callCount).to.equal(0);
    clock.tick(4999);
    expect(refresh.callCount).to.equal(0);
    clock.tick(1);
    expect(refresh.callCount).to.equal(1);
    controller.destroy();
  });

  it('refreshes an expired snapshot on focus after a suspended timer', function() {
    const refresh = sinon.spy();
    let elapsed = 0;
    const controller = createCourseSnapshotRefresh(refresh, () => elapsed);
    controller.setExpiration(2000, 1000);
    elapsed = 2000;
    controller.refreshIfExpired();
    expect(refresh.callCount).to.equal(1);
    clock.tick(1000);
    expect(refresh.callCount).to.equal(1);
    controller.destroy();
  });

  it('does not refresh after the page is destroyed', function() {
    const refresh = sinon.spy();
    const controller = createCourseSnapshotRefresh(refresh);
    controller.setExpiration(2000, 1000);
    controller.destroy();
    clock.tick(5000);
    controller.refreshIfExpired();
    expect(refresh.callCount).to.equal(0);
  });

  it('rejects malformed expiration instead of treating it as an unlimited cache', function() {
    const controller = createCourseSnapshotRefresh(() => undefined);
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => controller.setExpiration(value as number, 1000)).to.throw('Course snapshot expiration');
    }
    expect(() => controller.setExpiration(2000, Number.NaN)).to.throw('server timestamp');
    expect(() => controller.setExpiration(1000, 1000)).to.throw('already expired');
    controller.destroy();
  });

  it('uses server-relative elapsed time when the browser clock is ahead or changes', function() {
    const refresh = sinon.spy();
    const controller = createCourseSnapshotRefresh(refresh);
    clock.setSystemTime(86_400_000);
    controller.setExpiration(5000, 1000);
    controller.refreshIfExpired();
    expect(refresh.callCount).to.equal(0);
    clock.setSystemTime(-86_400_000);
    clock.tick(3999);
    expect(refresh.callCount).to.equal(0);
    clock.tick(1);
    expect(refresh.callCount).to.equal(1);
    controller.destroy();
  });
});
