const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {
  MAX_ATTEMPTS,
  waitForCiMongo,
  reportCiContainerDiagnostics,
} = require('./ciMongoReadiness.cjs');

const container = 'mofacts-ci-mongodb';
const result = (exitCode = 0, stdout = '', stderr = '') => ({ exitCode, stdout, stderr });

test('CI Mongo readiness tolerates initial connection refusal while the container is running', async () => {
  let probes = 0;
  let sleeps = 0;
  await waitForCiMongo(container, 'ping', undefined, {
    runDocker: async (args) => {
      if (args[0] === 'inspect') return result(0, 'running\n');
      probes += 1;
      return result(probes < 3 ? 1 : 0);
    },
    sleep: async () => { sleeps += 1; },
  });
  assert.equal(probes, 3);
  assert.equal(sleeps, 2);
});

test('CI Mongo readiness stops immediately after a container exit without further exec or sleep', async () => {
  const calls = [];
  await assert.rejects(waitForCiMongo(container, 'ping', undefined, {
    runDocker: async (args) => {
      calls.push(args);
      if (args[0] === 'inspect') return result(0, calls.length === 1 ? 'running' : 'exited');
      return result(1);
    },
    sleep: async () => {},
  }), /stopped before ping readiness/);
  assert.deepEqual(calls.map((args) => args[0]), ['inspect', 'exec', 'inspect']);
});

test('CI Mongo readiness fails on a missing container or a Docker probe execution error', async () => {
  await assert.rejects(waitForCiMongo(container, 'ping', undefined, {
    runDocker: async () => result(1),
  }), /state inspection failed/);
  await assert.rejects(waitForCiMongo(container, 'ping', undefined, {
    runDocker: async (args) => args[0] === 'inspect' ? result(0, 'running') : result(-1),
  }), /probe could not complete/);
});

test('CI Mongo readiness retains bounded attempts and never treats timeout as success', async () => {
  let probes = 0;
  let sleeps = 0;
  await assert.rejects(waitForCiMongo(container, 'primary', 'mofacts-ci-rs', {
    runDocker: async (args) => {
      if (args[0] === 'inspect') return result(0, 'running');
      probes += 1;
      return result(1);
    },
    sleep: async () => { sleeps += 1; },
  }), /did not reach primary readiness/);
  assert.equal(probes, MAX_ATTEMPTS);
  assert.equal(sleeps, MAX_ATTEMPTS - 1);
});

test('primary readiness requires a successful hello, the configured set, and a writable primary', async () => {
  for (const hello of [
    { ok: 1, setName: 'mofacts-ci-rs', isWritablePrimary: true },
    { ok: 0, setName: 'mofacts-ci-rs', isWritablePrimary: true },
    { ok: 1, setName: 'other-rs', isWritablePrimary: true },
    { ok: 1, setName: 'mofacts-ci-rs', isWritablePrimary: false },
    { ok: 1, isWritablePrimary: true },
  ]) {
    const expected = hello.ok === 1 && hello.setName === 'mofacts-ci-rs' && hello.isWritablePrimary === true;
    const operation = waitForCiMongo(container, 'primary', 'mofacts-ci-rs', {
      runDocker: async (args) => {
        if (args[0] === 'inspect') return result(0, 'running');
        let code;
        vm.runInNewContext(args.at(-1), { db: { hello: () => hello }, quit: (value) => { code = value; } });
        return result(code);
      },
      sleep: async () => {},
    });
    if (expected) await operation;
    else await assert.rejects(operation, /did not reach primary readiness/);
  }
});

test('invalid topology inputs and non-CI container names fail before Docker access', async () => {
  const dependencies = { runDocker: async () => { throw new Error('Docker must not be accessed'); } };
  await assert.rejects(waitForCiMongo('production-mongodb', 'ping', undefined, dependencies), /Only explicitly named/);
  await assert.rejects(waitForCiMongo(container, 'primary', undefined, dependencies), /explicitly configured/);
  await assert.rejects(waitForCiMongo(container, 'primary', 'bad"set', dependencies), /explicitly configured/);
  await assert.rejects(waitForCiMongo(container, 'unknown', undefined, dependencies), /Primary readiness requires/);
  await assert.rejects(reportCiContainerDiagnostics('production-mongodb', dependencies), /Only explicitly named/);
});

test('CI failure diagnostics record bounded logs, exit/OOM status, and image identity without container environments', async () => {
  const calls = [];
  const messages = [];
  await reportCiContainerDiagnostics(container, {
    runDocker: async (args) => {
      calls.push(args);
      return args[0] === 'inspect'
        ? result(0, 'status=exited exitCode=137 oomKilled=true image=mongo:8.0 imageId=sha256:synthetic')
        : result(0, 'synthetic startup log', 'synthetic fatal log');
    },
    log: (message) => messages.push(message),
  });
  assert.deepEqual(calls.map((args) => args[0]), ['inspect', 'logs']);
  assert.match(calls[0][2], /State\.ExitCode/);
  assert.match(calls[0][2], /State\.OOMKilled/);
  assert.match(calls[0][2], /Config\.Image/);
  assert.doesNotMatch(calls[0][2], /Config\.Env|Mounts/);
  assert.deepEqual(calls[1], ['logs', '--tail', '120', '--timestamps', container]);
  assert.match(messages.join('\n'), /exitCode=137.*oomKilled=true/);
  assert.match(messages.join('\n'), /synthetic startup log/);
  assert.match(messages.join('\n'), /synthetic fatal log/);
});

test('missing CI containers report unavailable evidence without exposing Docker stderr', async () => {
  const messages = [];
  await reportCiContainerDiagnostics(container, {
    runDocker: async () => result(1, '', 'synthetic private daemon context'),
    log: (message) => messages.push(message),
  });
  assert.match(messages.join('\n'), /state is unavailable/);
  assert.match(messages.join('\n'), /logs are unavailable/);
  assert.doesNotMatch(messages.join('\n'), /private daemon/);
});
