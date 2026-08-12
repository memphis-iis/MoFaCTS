import { fork } from 'node:child_process';

export default function startPlaywright({ done }) {
  // Keep the browser outside Meteor's fiber runtime.
  const child = fork(Assets.absoluteFilePath('browser/playwright_worker.mjs'), {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    cwd: process.env.PWD,
    detached: false,
  });

  child.on('message', ({ kind, data }) => {
    if (kind === 'testsDone') {
      done(data.testFailures);
      return;
    }

    console.warn(`Unknown Playwright worker message kind: ${kind}`);
  });
  child.send('runTests');
}
