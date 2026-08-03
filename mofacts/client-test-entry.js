function reportPreMochaClientError(reason) {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`[client-test-bootstrap] ${message}`);
  if (globalThis.testsAreRunning !== true) {
    globalThis.testFailures = Math.max(Number(globalThis.testFailures) || 0, 1);
    globalThis.testsDone = true;
  }
}

globalThis.addEventListener('error', (event) => {
  reportPreMochaClientError(event.error || event.message);
});
globalThis.addEventListener('unhandledrejection', (event) => {
  reportPreMochaClientError(event.reason);
});

const clientAppResult = import('./client/index.ts').then(
  () => ({ error: null }),
  (error) => ({ error }),
);

const clientTests = import.meta.webpackContext('./client', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

const clientTestKeys = clientTests.keys();

before(async function() {
  const { error } = await clientAppResult;
  if (error) throw error;
});

describe('client test discovery', function() {
  it('loads the repository client test modules', function() {
    if (clientTestKeys.length === 0) {
      throw new Error('The client test module discovered zero test files');
    }
  });
});

clientTestKeys.forEach(clientTests);
