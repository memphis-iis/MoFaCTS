// Browser-side test sink. Subscribe when the compiled collector is installed;
// drain only after record notifications. No model inspection or interval timer.
export function installEventDrain(options = {}) {
  if (options.trace) window[options.trace] = [];
  if (options.counts) window[options.counts] = {};
  Object.defineProperty(window, 'phetResearchMonitor', { configurable: true, set(monitor) {
    Object.defineProperty(window, 'phetResearchMonitor', { configurable: true, writable: true, value: monitor });
    let scheduled = false;
    monitor.onRecords(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const records = monitor.drain();
        if (options.trace) window[options.trace].push(...records);
        if (options.counts) for (const record of records) {
          const counts = window[options.counts]; counts[record.type] = (counts[record.type] || 0) + 1;
        }
      });
    });
  } });
}
