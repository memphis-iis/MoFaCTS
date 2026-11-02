const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const MARKER = 'MOFACTS_METEOR_EVIDENCE_V1 ';
const MAX_BYTES = 2 * 1024 * 1024;
const testFile = /\.(?:test|spec)s?\.[jt]s$/;
const invalid = () => { throw new Error('Missing, malformed, or incomplete Meteor test evidence'); };
function keys(record, expected) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !isDeepStrictEqual(Object.keys(record).sort(), [...expected].sort())) invalid();
}

function discoverTestModules(appRoot) {
  const result = { server: [], client: [] };
  let entries = 0;
  function visit(root, side, recursive) {
    const stat = fs.lstatSync(path.join(appRoot, root));
    if (!stat.isDirectory() || stat.isSymbolicLink()) invalid();
    for (const item of fs.readdirSync(path.join(appRoot, root), { withFileTypes: true })) {
      if (++entries > 100000 || item.isSymbolicLink()) invalid();
      const name = `${root}/${item.name}`;
      if (item.isDirectory() && recursive) visit(name, side, recursive);
      else if (item.isFile() && testFile.test(name)) result[side].push(name);
    }
  }
  visit('server', 'server', true);
  visit('common', 'server', true);
  visit('tests', 'server', false);
  visit('client', 'client', true);
  for (const side of ['server', 'client']) result[side].sort();
  return result;
}

function validateEnvironment(value, expectedModules, side) {
  keys(value, ['schema', 'side', 'modules', 'tests', 'hookFailures']);
  if (value.schema !== 'MeteorEnvironmentEvidenceV1' || value.side !== side
    || !Array.isArray(value.modules) || !value.modules.length || value.modules.length > 2000
    || !value.modules.every(name => typeof name === 'string' && name.length < 1024
      && /^(?:server|common|tests|client)\/[A-Za-z0-9_./-]+$/.test(name)
      && !name.split('/').some(part => !part || part === '.' || part === '..') && testFile.test(name))
    || new Set(value.modules).size !== value.modules.length
    || !isDeepStrictEqual([...value.modules].sort(), [...expectedModules].sort())
    || !Array.isArray(value.tests) || !value.tests.length || value.tests.length > 20000
    || !Number.isSafeInteger(value.hookFailures) || value.hookFailures < 0 || value.hookFailures > 20000) invalid();
  const ids = new Set();
  const counts = { passed: 0, failed: 0, pending: 0 };
  for (const test of value.tests) {
    keys(test, ['id', 'outcome']);
    if (typeof test.id !== 'string' || !/^[0-9a-f]{64}$/.test(test.id) || ids.has(test.id)
      || typeof test.outcome !== 'string' || !Object.hasOwn(counts, test.outcome)) invalid();
    ids.add(test.id);
    counts[test.outcome]++;
  }
  if (!counts.passed) invalid();
  return { ...value, modules: [...value.modules].sort(), counts };
}

function evidenceCollector(expectedModules) {
  let buffer = '';
  let broken = false;
  const environments = new Map();
  function line(text) {
    const start = text.indexOf(MARKER);
    if (start < 0) return;
    try {
      const value = JSON.parse(text.slice(start + MARKER.length));
      if (!['server', 'client'].includes(value.side) || environments.has(value.side)) invalid();
      const validated = validateEnvironment(value, expectedModules[value.side], value.side);
      environments.set(value.side, validated);
    } catch { broken = true; }
  }
  return {
    push(chunk) {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        if (end > MAX_BYTES) broken = true;
        else line(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > MAX_BYTES) { broken = true; buffer = ''; }
    },
    finish(exitStatus) {
      if (buffer) line(buffer);
      if (broken || environments.size !== 2) invalid();
      const results = ['server', 'client'].map(side => environments.get(side));
      const failed = results.some(item => item.counts.failed || item.hookFailures);
      if ((exitStatus === 0 && failed) || !Number.isInteger(exitStatus)) invalid();
      return { schema: 'MeteorTestRunEvidenceV1', exitStatus, environments: results };
    },
  };
}

function validateRun(value, expectedModules) {
  keys(value, ['schema', 'exitStatus', 'environments']);
  if (value.schema !== 'MeteorTestRunEvidenceV1' || value.exitStatus !== 0
    || !Array.isArray(value.environments) || value.environments.length !== 2) invalid();
  const environments = ['server', 'client'].map((side, index) => {
    const environment = value.environments[index];
    keys(environment, ['schema', 'side', 'modules', 'tests', 'hookFailures', 'counts']);
    const { counts, ...raw } = environment;
    const validated = validateEnvironment(raw, expectedModules[side], side);
    if (!isDeepStrictEqual(counts, validated.counts) || counts.failed || validated.hookFailures) invalid();
    return validated;
  });
  return { schema: value.schema, exitStatus: 0, environments };
}

module.exports = { discoverTestModules, evidenceCollector, validateEnvironment, validateRun, MAX_BYTES, MARKER };
