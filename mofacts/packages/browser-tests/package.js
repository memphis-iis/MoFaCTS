Package.describe({
  name: 'meteortesting:browser-tests',
  summary: 'Run Meteor client tests in a headless browser',
  git: 'https://github.com/Meteor-Community-Packages/meteor-browser-tests.git',
  version: '1.8.0_1',
  testOnly: true,
});

Package.onUse((api) => {
  api.versionsFrom(['2.8.0', '3.0']);
  api.use('ecmascript');

  api.mainModule('server.js', 'server');
  api.addAssets('browser/playwright_worker.mjs', 'server');
});
