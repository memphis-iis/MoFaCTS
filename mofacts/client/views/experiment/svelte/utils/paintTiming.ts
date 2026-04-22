/**
 * Wait for one or more browser paint cycles.
 *
 * A single requestAnimationFrame callback runs before the next paint, so we
 * chain one extra frame to guarantee that at least one painted frame has
 * elapsed before the promise resolves.
 */
export async function waitForBrowserPaint(frames = 1): Promise<void> {
  const normalizedFrames = Math.max(1, Math.floor(frames));

  for (let index = 0; index < normalizedFrames; index += 1) {
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
        return;
      }

      setTimeout(() => resolve(), 0);
    });
  }
}
