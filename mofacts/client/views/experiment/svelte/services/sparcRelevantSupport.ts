/** A single observer serves all mounted tutor outputs. */
let observers = 0;
let observer: MutationObserver | undefined;
let queued = false;
function refresh() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const outputs = [...document.querySelectorAll<HTMLElement>('[data-sparc-speaker="tutor"]')];
    document.querySelectorAll('.sparc-relevant-support').forEach(node => node.classList.remove('sparc-relevant-support'));
    outputs.at(-1)?.querySelectorAll<HTMLAnchorElement>('a[data-sparc-reference]').forEach(link => {
      document.getElementById(link.dataset.sparcReference!)?.classList.add('sparc-relevant-support');
    });
  });
}
export function relevantSupport(_element: HTMLElement) {
  observers++;
  if (!observer) { observer = new MutationObserver(refresh); observer.observe(document.body, { childList: true, subtree: true }); }
  refresh();
  return { update: refresh, destroy: () => { if (--observers === 0) { observer?.disconnect(); observer = undefined; } } };
}
