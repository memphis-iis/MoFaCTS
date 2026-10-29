/** One-shot refresh at the server-owned course snapshot deadline. */
export function createCourseSnapshotRefresh(onExpired: () => void, elapsedTime = () => performance.now()) {
  const maximumTimerDelay = 2_147_483_647;
  let deadline: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clearTimer();
    if (destroyed || deadline === null) return;
    timer = setTimeout(() => {
      timer = null;
      if (destroyed || deadline === null) return;
      if (elapsedTime() < deadline) schedule();
      else onExpired();
    }, Math.min(maximumTimerDelay, Math.max(0, deadline - elapsedTime())));
  };

  return {
    setExpiration(value: number | null, serverNow: number) {
      if (value !== null && (!Number.isFinite(value) || !Number.isSafeInteger(value))) {
        throw new Error('Course snapshot expiration must be a finite epoch millisecond value or null');
      }
      if (!Number.isSafeInteger(serverNow)) throw new Error('Course snapshot response requires a server timestamp');
      if (value !== null && value <= serverNow) throw new Error('Course snapshot is already expired');
      deadline = value === null ? null : elapsedTime() + value - serverNow;
      schedule();
    },
    refreshIfExpired() {
      if (!destroyed && deadline !== null && elapsedTime() >= deadline) {
        clearTimer();
        onExpired();
      }
    },
    destroy() {
      destroyed = true;
      clearTimer();
    },
  };
}
