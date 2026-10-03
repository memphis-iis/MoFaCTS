import { writable } from 'svelte/store';

// A completed unit can enter another unit on the same /content route.
// Advance only after saving progress and cleaning up the outgoing runtime.
export const contentSurfaceRevision = writable(0);

export function restartContentSurface(): void {
  contentSurfaceRevision.update(revision => revision + 1);
}
