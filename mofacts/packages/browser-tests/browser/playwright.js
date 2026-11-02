import { fork } from 'node:child_process';

export default function startPlaywright({ done }) {
  let completed = false;
  const finish = failures => {
    if (completed) return;
    completed = true;
    done(failures);
  };
  // Keep the browser outside Meteor's fiber runtime.
  const child = fork(Assets.absoluteFilePath('browser/playwright_worker.mjs'), {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    cwd: process.env.PWD,
    detached: false,
  });

  child.on('message', ({ kind, data }) => {
    if (kind === 'testsDone') {
      finish(Number.isSafeInteger(data?.testFailures) && data.testFailures >= 0 ? data.testFailures : 1);
      return;
    }

    console.warn(`Unknown Playwright worker message kind: ${kind}`);
  });
  child.once('error', () => {
    console.error('The Playwright worker could not start.');
    finish(1);
  });
  child.once('exit', () => {
    if (!completed) {
      console.error('The Playwright worker exited without a complete test result.');
      finish(1);
    }
  });
  child.send('runTests');
}
