import { setAiFlowLogSink } from '../../common/lib/aiFlowLogger';

setAiFlowLogSink((level: number, ...args: unknown[]) => {
  const browserConsole = typeof window !== 'undefined' && typeof window.clientConsole === 'function'
    ? window.clientConsole
    : null;
  if (browserConsole) {
    browserConsole(level, ...args);
  }
});

export * from '../../common/lib/aiFlowLogger';
