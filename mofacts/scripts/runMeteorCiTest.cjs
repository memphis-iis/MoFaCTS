const { spawnSync } = require('node:child_process');
const path = require('node:path');

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

const hotfixDevScript = path.resolve(__dirname, '..', '..', 'deploy', 'hotfix-dev.ps1');
const hotfixDevCwd = path.dirname(hotfixDevScript);

function resolveOperatorLocalSettingsPath() {
  if (!process.env.USERPROFILE) {
    throw new Error('USERPROFILE is required to resolve the operator local Meteor settings path.');
  }
  return path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'settings.local.json');
}

function runHotfixDev(command, stdio = 'pipe') {
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    hotfixDevScript,
    command,
  ];

  if (command === 'start' || command === 'restart') {
    args.push('-SettingsPath', resolveOperatorLocalSettingsPath());
  }

  return spawnSync(
    'powershell.exe',
    args,
    {
      cwd: hotfixDevCwd,
      encoding: 'utf8',
      stdio,
    },
  );
}

function isHotfixDevRunning() {
  if (!isLocalWindows || !allowWindowsMeteorTests) {
    return false;
  }
  const status = runHotfixDev('status');
  const output = `${status.stdout || ''}${status.stderr || ''}`;
  return status.status === 0 && output.includes('Hotfix dev server is running');
}

const shouldRestartHotfixDev = isHotfixDevRunning();

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

let exitStatus = result.status ?? 1;

if (result.error) {
  console.error(result.error.message);
  exitStatus = 1;
}

if (result.signal) {
  console.error(`Meteor test process exited via signal ${result.signal}`);
  exitStatus = 1;
}

if (shouldRestartHotfixDev) {
  console.log('Restarting local hotfix dev server because the Meteor test harness can disturb the watched dev build state.');
  const restart = runHotfixDev('restart', 'inherit');
  if (restart.status !== 0 && exitStatus === 0) {
    exitStatus = restart.status ?? 1;
  }
  if (restart.status === 0) {
    runHotfixDev('status', 'inherit');
  }
}

process.exit(exitStatus);
