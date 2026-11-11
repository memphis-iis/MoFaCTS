import { Tracker } from 'meteor/tracker';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { isLessonRoutePath } from '../../../../lib/lessonRoute';

export interface CameraTrackingLease<T> {
  readonly owner: 'gaze' | 'pose';
  readonly ready: Promise<T>;
  isCurrent(): boolean;
  stop(reason?: 'released' | 'failed'): void;
}

// One app-session camera owner, including pending permission/model initialization.
// Neither browser acquisition nor WebGazer.begin is abortable: a successor waits
// for the revoked initializer and its late-resource cleanup before opening video.
let current: CameraTrackingLease<unknown> | null = null;
let pending: Promise<unknown> = Promise.resolve();
export function startCameraTracking<T>(
  owner: 'gaze' | 'pose',
  cleanup: (reason: 'released' | 'failed') => void,
  initialize: (isCurrent: () => boolean) => Promise<T>,
): CameraTrackingLease<T> {
  current?.stop();
  let stopped = false;
  let reason: 'released' | 'failed' = 'released';
  const lease: CameraTrackingLease<T> = {
    owner,
    isCurrent: () => !stopped && current === lease,
    stop(nextReason = 'released') {
      if (stopped) return;
      stopped = true;
      reason = nextReason;
      if (current === lease) current = null;
      cleanup(reason);
    },
    ready: pending.then(async () => {
      try {
        if (!lease.isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
        const result = await initialize(lease.isCurrent);
        if (!lease.isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
        return result;
      } catch (error) {
        lease.stop('failed');
        throw error;
      } finally {
        // Cleanup once more after a cancelled initializer can have created late
        // resources. The next initializer cannot run until this has completed.
        if (!lease.isCurrent()) cleanup(reason);
      }
    }),
  };
  current = lease;
  pending = lease.ready.then(() => undefined, () => undefined);
  return lease;
}
export function stopCameraTracking(): void { current?.stop(); }

const { FlowRouter } = require('meteor/ostrio:flow-router-extra') as {
  FlowRouter: { watchPathChange(): void; current(): { path?: string } };
};
let lessonId: unknown;
let userId: string | null | undefined;
Tracker.autorun(() => {
  FlowRouter.watchPathChange();
  const path = FlowRouter.current().path || '';
  const user = Meteor.userId();
  const nextLesson = Session.get('currentTdfId');
  if (!user || (userId !== undefined && userId !== user) || (lessonId !== undefined && lessonId !== nextLesson)
    || (!isLessonRoutePath(path, '/content') && !isLessonRoutePath(path, '/instructions'))) stopCameraTracking();
  lessonId = nextLesson;
  userId = user;
});
window.addEventListener('pagehide', stopCameraTracking);
