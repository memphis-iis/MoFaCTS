import startPlaywright from './browser/playwright';

const driver = process.env.TEST_BROWSER_DRIVER;

function startBrowser(options) {
  if (driver !== 'playwright') {
    throw new Error(
      `MoFaCTS Meteor client tests require TEST_BROWSER_DRIVER=playwright; received "${driver}"`,
    );
  }

  startPlaywright(options);
}

export { startBrowser };
