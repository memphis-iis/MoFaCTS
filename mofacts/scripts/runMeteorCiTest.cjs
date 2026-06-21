const { spawnSync } = require('node:child_process');

if (!process.env.CI) {
  console.error(
    [
      'Refusing to run Meteor CI tests outside CI.',
      'This repository does not treat the local Meteor Mocha harness as supported local verification.',
      'Use npm run typecheck and npm run lint locally, and use CI for Meteor integration and client contract coverage.',
    ].join('\n'),
  );
  process.exit(1);
}

const meteorTestEnv = { ...process.env };
delete meteorTestEnv.FORCE_COLOR;
delete meteorTestEnv.NO_COLOR;

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
    env: meteorTestEnv,
  },
);

let exitStatus = result.status ?? 1;

if (result.error) {
  console.error(result.error.message);
  exitStatus = 1;
}

if (result.signal) {
  console.error(`Meteor test process exited via signal ${result.signal}`);
  exitStatus = 1;
}

process.exit(exitStatus);
