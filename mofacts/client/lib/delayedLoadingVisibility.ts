export const LOADING_FEEDBACK_DELAY_MS = 200;
export const LOADING_FEEDBACK_MIN_VISIBLE_MS = 400;
export const LOADING_FEEDBACK_SLOW_MS = 5000;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface DelayedLoadingVisibilityOptions {
  onVisibilityChange: (visible: boolean) => void;
  onSlowChange?: (slow: boolean) => void;
  delayMs?: number;
  minimumVisibleMs?: number;
  slowMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
}

/** Delay-gates loading feedback and prevents it from flashing once revealed. */
export class DelayedLoadingVisibility {
  private readonly onVisibilityChange: (visible: boolean) => void;
  private readonly onSlowChange: (slow: boolean) => void;
  private readonly delayMs: number;
  private readonly minimumVisibleMs: number;
  private readonly slowMs: number;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly cancel: (timer: TimerHandle) => void;
  private pending = false;
  private visible = false;
  private slow = false;
  private visibleSince = 0;
  private revealTimer: TimerHandle | null = null;
  private hideTimer: TimerHandle | null = null;
  private slowTimer: TimerHandle | null = null;
  private destroyed = false;

  constructor(options: DelayedLoadingVisibilityOptions) {
    this.onVisibilityChange = options.onVisibilityChange;
    this.onSlowChange = options.onSlowChange ?? (() => undefined);
    this.delayMs = options.delayMs ?? LOADING_FEEDBACK_DELAY_MS;
    this.minimumVisibleMs = options.minimumVisibleMs ?? LOADING_FEEDBACK_MIN_VISIBLE_MS;
    this.slowMs = options.slowMs ?? LOADING_FEEDBACK_SLOW_MS;
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule
      ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.cancel = options.cancel
      ?? ((timer) => globalThis.clearTimeout(timer));
  }

  setPending(pending: boolean): void {
    if (this.destroyed || pending === this.pending) return;
    this.pending = pending;
    if (pending) {
      this.clearHideTimer();
      this.scheduleSlowState();
      if (this.visible || this.revealTimer) return;
      this.revealTimer = this.schedule(() => {
        this.revealTimer = null;
        if (!this.pending || this.destroyed) return;
        this.visible = true;
        this.visibleSince = this.now();
        this.onVisibilityChange(true);
      }, this.delayMs);
      return;
    }

    this.clearRevealTimer();
    this.clearSlowTimer();
    if (!this.visible) {
      this.setSlow(false);
      return;
    }
    const remainingMs = Math.max(0, this.minimumVisibleMs - (this.now() - this.visibleSince));
    if (remainingMs === 0) {
      this.hide();
      return;
    }
    this.hideTimer = this.schedule(() => {
      this.hideTimer = null;
      if (!this.pending) this.hide();
    }, remainingMs);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRevealTimer();
    this.clearHideTimer();
    this.clearSlowTimer();
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.setSlow(false);
    this.onVisibilityChange(false);
  }

  private scheduleSlowState(): void {
    if (this.slow || this.slowTimer) return;
    this.slowTimer = this.schedule(() => {
      this.slowTimer = null;
      if (this.pending && !this.destroyed) this.setSlow(true);
    }, this.slowMs);
  }

  private setSlow(slow: boolean): void {
    if (this.slow === slow) return;
    this.slow = slow;
    this.onSlowChange(slow);
  }

  private clearRevealTimer(): void {
    if (!this.revealTimer) return;
    this.cancel(this.revealTimer);
    this.revealTimer = null;
  }

  private clearHideTimer(): void {
    if (!this.hideTimer) return;
    this.cancel(this.hideTimer);
    this.hideTimer = null;
  }

  private clearSlowTimer(): void {
    if (!this.slowTimer) return;
    this.cancel(this.slowTimer);
    this.slowTimer = null;
  }
}
