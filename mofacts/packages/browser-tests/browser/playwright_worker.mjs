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

  await page.close();
  await browser.close();
  done(testFailures);
}

process.on('message', () => {
  startPlaywright((testFailures) => {
    process.send({ kind: 'testsDone', data: { testFailures } });
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
});
