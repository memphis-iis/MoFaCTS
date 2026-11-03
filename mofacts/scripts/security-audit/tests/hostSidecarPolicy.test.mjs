import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const policyUrl = new URL('../../../../deploy/security-audit/host-sidecar-policy.jq', import.meta.url);
const policyPath = fileURLToPath(policyUrl);
const policy = fs.readFileSync(policyUrl, 'utf8');
const native = {
  skip: process.platform !== 'linux' ? 'Native jq policy execution requires Linux; canonical source drift is checked on every platform.' : false,
};

const record = (index, overrides = {}) => ({
  id: index.toString(16).padStart(64, '0'),
  service: null,
  imageTitle: null,
  exposedPorts: null,
  bindings: null,
  networkPorts: null,
  ...overrides,
});
const counts = (containers, helpers = 0, declarations = 0, publications = 0) => ({
  containerCount: containers,
  helperContainerCount: helpers,
  endpointDeclarationCount: declarations,
  endpointPublicationCount: publications,
});
function execute(input, raw = false) {
  const result = spawnSync('jq', ['--exit-status', '--compact-output', '--from-file', policyPath], {
    input: raw ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  assert.ifError(result.error);
  return result;
}
function classify(input) {
  const result = execute(input);
  assert.equal(result.status, 0, result.error?.code || result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  return JSON.parse(result.stdout);
}
function rejected(input, raw = false) {
  const result = execute(input, raw);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('synthetic-private-marker'));
}

test('Sidecar classifier signatures stay aligned with the canonical helper deployment', () => {
  const compose = fs.readFileSync(new URL('../../../../mofacts-mcp-sidecar/docker-compose.yml', import.meta.url), 'utf8');
  const playwright = fs.readFileSync(new URL('../../../../mofacts-mcp-sidecar/services/playwright-mcp/Dockerfile', import.meta.url), 'utf8');
  const mongo = fs.readFileSync(new URL('../../../../mofacts-mcp-sidecar/services/mongo-mcp/Dockerfile', import.meta.url), 'utf8');
  const services = JSON.parse(policy.match(/def helper_service_names:\s*(\[[^;]+\]);/)[1]);
  const title = JSON.parse(policy.match(/def helper_image_title:\s*("[^"\r\n]+");/)[1]);
  const ports = JSON.parse(policy.match(/def helper_ports:\s*(\[[^;]+\]);/)[1]);
  assert.deepEqual(services.toSorted(), [...compose.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map(match => match[1]).toSorted());
  assert.equal(title, playwright.match(/^LABEL org\.opencontainers\.image\.title="([^"]+)"\s*$/m)[1]);
  const bindings = [...compose.matchAll(/^\s+- "127\.0\.0\.1:(\d+):(\d+)"\s*$/gm)];
  assert.ok(bindings.every(match => match[1] === match[2]));
  assert.deepEqual(ports.toSorted((a, b) => a - b), bindings.map(match => Number(match[2])).toSorted((a, b) => a - b));
  assert.ok(ports.includes(Number(mongo.match(/^EXPOSE (\d+)\s*$/m)[1])));
});

test('Sidecar classifier returns only zero/count evidence for ordinary containers and an empty inventory', native, () => {
  assert.deepEqual(classify([]), counts(0));
  const appBinding = { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }] };
  const ordinary = [
    record(1, { service: 'mofacts', exposedPorts: { '3000/tcp': {} }, bindings: appBinding, networkPorts: appBinding }),
    record(2, { service: 'mongodb', exposedPorts: { '27017/tcp': {} }, bindings: {}, networkPorts: { '27017/tcp': null } }),
    record(3, { service: 'redis', exposedPorts: { '6379/tcp': {} } }),
  ];
  assert.deepEqual(classify(ordinary), counts(3));
  assert.deepEqual(classify([record(4, { bindings: { '3000/tcp': [{ HostIp: '', HostPort: '' }] } })]), counts(1));
  assert.deepEqual(classify(Array.from({ length: 256 }, (_, index) => record(index))), counts(256));
});

test('Sidecar classifier detects canonical helpers even when stopped and unpublished', native, () => {
  for (const service of ['playwright-mcp', 'mongo-mcp']) {
    assert.deepEqual(classify([record(1, { service })]), counts(1, 1));
  }
  assert.deepEqual(classify([record(1, { imageTitle: 'mofacts-playwright-mcp' })]), counts(1, 1));
  assert.deepEqual(classify([record(1, {
    service: 'playwright-mcp',
    imageTitle: 'mofacts-playwright-mcp',
    exposedPorts: { '8931/tcp': {} },
  })]), counts(1, 1, 1));
});

test('Sidecar classifier detects declared reserved endpoints for TCP, UDP and SCTP without requiring a publication', native, () => {
  for (const port of [8931, 8932]) {
    for (const protocol of ['tcp', 'udp', 'sctp']) {
      const key = `${port}/${protocol}`;
      assert.deepEqual(classify([record(1, { exposedPorts: { [key]: {} } })]), counts(1, 1, 1));
      assert.deepEqual(classify([record(1, { bindings: { [key]: null }, networkPorts: { [key]: null } })]), counts(1, 1, 1));
      assert.deepEqual(classify([record(1, { bindings: { [key]: [{ HostIp: '', HostPort: '0' }] } })]), counts(1, 1, 1, 1));
    }
  }
});

test('Sidecar classifier detects remapped reserved host ports and deduplicates matching configured/active mappings', native, () => {
  for (const protocol of ['tcp', 'udp', 'sctp']) {
    const remap = { [`3000/${protocol}`]: [{ HostIp: '::', HostPort: '8931' }] };
    assert.deepEqual(classify([record(1, { bindings: remap, networkPorts: remap })]), counts(1, 1, 0, 1));
    const helper = { [`8932/${protocol}`]: [{ HostIp: '127.0.0.1', HostPort: '48932' }] };
    assert.deepEqual(classify([record(1, { exposedPorts: { [`8932/${protocol}`]: {} }, bindings: helper, networkPorts: helper })]), counts(1, 1, 1, 1));
  }
});

test('Sidecar classifier rejects malformed, duplicate, oversized and private input without emitting evidence', native, () => {
  const invalid = [
    null, {}, 1, '',
    Array.from({ length: 257 }, (_, index) => record(index)),
    [record(1), record(1)],
    [record(1, { id: 'not-an-id' })],
    [record(1, { service: 2 })],
    [record(1, { service: 'bad\nlabel' })],
    [record(1, { imageTitle: 'x'.repeat(257) })],
    [record(1, { credentials: 'synthetic-private-marker' })],
    [{ id: '1'.repeat(64) }],
    [record(1, { exposedPorts: [] })],
    [record(1, { exposedPorts: { '8932/tcp': null } })],
    ...['0/tcp', '65536/tcp', '08932/tcp', '8932/TCP', '8932/http', 'synthetic-private-marker'].map(key => [record(1, { exposedPorts: { [key]: {} } })]),
    [record(1, { bindings: { '8932/tcp': {} } })],
    [record(1, { bindings: { '8932/tcp': [{ HostIp: 1, HostPort: '8932' }] } })],
    [record(1, { bindings: { '8932/tcp': [{ HostIp: '127.0.0.1', HostPort: 8932 }] } })],
    ...['-1', '65536', 'synthetic-private-marker'].map(HostPort => [record(1, { bindings: { '8932/tcp': [{ HostIp: '127.0.0.1', HostPort }] } })]),
    [record(1, { networkPorts: { '8932/tcp': [{ HostIp: '127.0.0.1' }] } })],
    [record(1, { networkPorts: { '8932/tcp': [{ HostIp: '127.0.0.1', HostPort: '8932', secret: 'synthetic-private-marker' }] } })],
    [record(1, { bindings: { '8932/tcp': Array.from({ length: 65 }, () => ({ HostIp: '', HostPort: '' })) } })],
    [record(1, { exposedPorts: Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`${index + 1}/tcp`, {}])) })],
  ];
  for (const input of invalid) rejected(input);
  rejected('[]\n[]', true);
  rejected('', true);
  rejected('{"synthetic-private-marker":', true);
});
