const { spawnSync } = require('node:child_process');

const allowWindowsMeteorTests = process.env.MOFACTS_ALLOW_WINDOWS_METEOR_TESTS === '1';
const isLocalWindows = process.platform === 'win32' && !process.env.CI;

if (isLocalWindows && !allowWindowsMeteorTests) {
  console.error(
    [
      'Refusing to run Meteor CI tests on local Windows.',
      'This repository does not treat the local Windows Meteor harness as routine verification.',
      'Use CI or another supported Meteor test environment, or set MOFACTS_ALLOW_WINDOWS_METEOR_TESTS=1 when deliberately debugging the Windows harness.',
    ].join('\n'),
  );
  process.exit(1);
}

const result = spawnSync(
  'meteor',
  [
    'test',
    '--once',
    '--driver-package=meteortesting:mocha',
    '--port',
    '3010',
    '--settings',
    'settings.json',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
