/** Owns conversation following; content growth must not redefine learner intent. */
export function createSparcDialogueScroll(viewport: HTMLElement, content: HTMLElement) {
  let following = true;
  let previousTop = viewport.scrollTop;
  let frame: number | undefined;
  let disposed = false;
  const follow = () => {
    if (disposed || !following) return;
    viewport.scrollTop = viewport.scrollHeight;
    previousTop = viewport.scrollTop;
  };
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      follow();
    });
  };
  const onScroll = () => {
    if (viewport.scrollTop === previousTop) return;
    previousTop = viewport.scrollTop;
    following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 48;
  };
  viewport.addEventListener('scroll', onScroll, { passive: true });
  // ResizeObserver runs after layout and before paint. Correct the scroll here,
  // rather than painting the old position and correcting it in the next frame.
  const observer = new ResizeObserver(follow);
  observer.observe(content);
  observer.observe(viewport);
  schedule();
  return {
    schedule,
    isFollowing: () => following,
    destroy() {
      disposed = true;
      observer.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    },
  };
}
