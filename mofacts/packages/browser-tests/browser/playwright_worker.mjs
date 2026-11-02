import path from 'node:path';
import { pathToFileURL } from 'node:url';

const consoleMap = {
  warning: 'warn',
  startGroup: 'group',
  endGroup: 'groupEnd',
};

async function startPlaywright(done) {
  const playwrightEntry = pathToFileURL(
    path.join(process.cwd(), 'node_modules', 'playwright', 'index.mjs'),
  ).href;
  const playwright = await import(playwrightEntry);
  const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const browserType = playwright[browserName];

  if (!browserType) {
    throw new Error(`Unknown PLAYWRIGHT_BROWSER "${browserName}"`);
  }

  const browser = await browserType.launch();
  console.log(await browser.version());
  const page = await browser.newPage();

  page.on('error', (error) => {
    console.warn('The Meteor client-test page crashed.', error);
  });

  page.on('console', async (message) => {
    let messageType = message.type();
    if (consoleMap[messageType]) {
      messageType = consoleMap[messageType];
    } else if (typeof console[messageType] === 'undefined') {
      console.warn(`UNKNOWN CONSOLE TYPE: ${messageType}`);
      messageType = 'warn';
    }

    console[messageType](
      ...(await Promise.all(message.args().map((argument) => argument.jsonValue()))),
    );
  });

  await page.goto(process.env.ROOT_URL);
  await page.waitForFunction(() => window.testsDone, [], { timeout: 0 });
  const testFailures = await page.evaluate('window.testFailures');
  if (process.env.MOCHA_REPORTER === 'mofacts-evidence') {
    const evidence = await page.evaluate(() => window.mofactsMeteorEvidence);
    if (!evidence) throw new Error('Missing browser test evidence');
    await new Promise((resolve, reject) => process.stdout.write(
      `MOFACTS_METEOR_EVIDENCE_V1 ${JSON.stringify(evidence)}\n`, error => error ? reject(error) : resolve()));
  }

  await page.close();
  await browser.close();
  done(testFailures);
}

process.on('message', () => {
  startPlaywright((testFailures) => {
    process.send({ kind: 'testsDone', data: { testFailures } }, error => {
      if (error) process.exitCode = 1;
      process.disconnect();
    });
  }).catch((error) => {
    console.error(error);
    // Notify the parent through exit; an open IPC channel must not turn a
    // browser/bootstrap/evidence error into a twenty-minute timeout.
    process.exit(1);
  });
});
