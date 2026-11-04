import assert from 'node:assert/strict';
import './dockerImageIdentity.test.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { ciEvidenceFixture } from './helpers/ciEvidenceFixture.mjs';
import { observeCiImage, writeCiImageObservation } from '../qualification/observeCiImage.mjs';
import { parsePostBuildImageObservation } from '../../../common/securityAudit/postBuildImageObservation.ts';
import { dockerImageFixture } from './helpers/dockerImageArchiveFixture.mjs';
import { readDockerArchiveIdentity } from '../qualification/imageArchiveIdentity.mjs';
import { Readable } from 'node:stream';

const bytes = value => Buffer.from(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = { message: 'CI image observation failed; no qualification was issued.' };

function fixture(change = () => {}) {
  const source = ciEvidenceFixture();
  const input = { imageReference: `sha256:${'f'.repeat(64)}`,
    sourceObservationBytes: source.files['mofacts-source-observation.json'],
    sourceEvidenceBytes: source.files['mofacts-meteor-test-evidence.json'],
    ci: { repository: 'memphis-iis/MoFaCTS', commit: source.expectedObservation.identity.baseCommit,
      runId: '101', runAttempt: '1' } };
  const inspected = { nativeId: input.imageReference, platform: 'linux/amd64', descriptor: null };
  const embedded = { schema: 'MoFaCTSImageSourceObservationV1', state: 'source-matched-unqualified',
    identity: structuredClone(source.expectedObservation.identity) };
  const calls = [];
  const dependencies = { archive: async value => ({ configDigest: value.nativeId, platform: value.platform }), command: async (command, args, maximum) => {
    calls.push({ command, args, maximum });
    assert.equal(command, 'docker');
    if (args[2] === 'container') return Buffer.alloc(0); // ordinary --rm completed
    const value = args[2] === 'image' ? inspected : embedded;
    return change({ command, args, inspected, embedded, input, value }) || bytes(value);
  } };
  return { input, dependencies, calls, inspected, embedded };
}

test('actual inspect and isolated embedded read produce only a bounded CI image observation', async () => {
  const { input, dependencies, calls } = fixture();
  const result = await observeCiImage(input, dependencies);
  assert.deepEqual(parsePostBuildImageObservation(result), result);
  assert.equal(result.state, 'observed-unqualified');
  assert.equal(result.lane, 'ci-test-image');
  assert.equal(result.image.configDigest, input.imageReference);
  assert.equal(result.sourceEvidenceDigestSha256, hash(input.sourceEvidenceBytes));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.maximum === 16384));
  assert.deepEqual(calls[0].args.slice(0, 4), ['--context', 'default', 'image', 'inspect']);
  const args = calls[1].args;
  for (const pair of [['--context', 'default'], ['--pull', 'never'], ['--network', 'none'],
    ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges:true'], ['--entrypoint', 'node']]) {
    assert.equal(args[args.indexOf(pair[0]) + 1], pair[1]);
  }
  assert.ok(args.includes('--read-only'));
  assert.ok(args.includes('--rm'));
  const probeName = args[args.indexOf('--name') + 1];
  const probeLabel = args[args.indexOf('--label') + 1];
  assert.match(probeName, /^mofacts-ci-image-probe-[0-9a-f-]{36}$/);
  assert.equal(probeLabel, `org.mofacts.ci-image-observation.owner=${probeName.slice('mofacts-ci-image-probe-'.length)}`);
  assert.ok(args.includes(input.imageReference));
  assert.ok(args.at(-1).includes("p='/opt/mofacts-source-observation.json'"));
  assert.doesNotMatch(JSON.stringify(result), /PASS|smoke|password|sensitive/);
});

test('post-build contract rejects different lanes, dirty source, platform and CI coordinate substitution', () => {
  const good = { schema: 'PostBuildImageObservationV1', state: 'observed-unqualified', lane: 'ci-test-image',
    source: ciEvidenceFixture().expectedObservation.identity,
    image: { configDigest: `sha256:${'f'.repeat(64)}`, platform: 'linux/amd64' },
    sourceEvidenceDigestSha256: 'b'.repeat(64),
    ci: { repository: 'memphis-iis/MoFaCTS', commit: 'a'.repeat(40), runId: '101', runAttempt: '1' } };
  const mutations = [
    value => { value.state = 'PASS'; }, value => { value.lane = 'workstation-release-image'; },
    value => { value.source.includedUncommittedLocalChanges = true; },
    value => { value.image.platform = 'linux/arm64'; }, value => { value.image.configDigest = 'tag:latest'; },
    value => { value.sourceEvidenceDigestSha256 = 'private'; }, value => { value.ci.commit = 'c'.repeat(40); },
    value => { value.ci.repository = 'untrusted/fork'; }, value => { value.ci.runId = '0'; },
    value => { value.ci.runAttempt = 'attempt'; }, value => { value.smoke = 'PASS'; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(good);
    mutate(value);
    assert.throws(() => parsePostBuildImageObservation(value));
  }
});

test('CI observation uses resolved config identity while probing the immutable engine reference', async () => {
  for (const kind of ['index', 'manifest']) {
    const image = dockerImageFixture(kind);
    const { input, embedded } = fixture();
    input.imageReference = image.inspection.nativeId;
    let probed = false;
    const result = await observeCiImage(input, {
      command: async (_command, args) => {
        if (args[2] === 'image') return bytes(image.inspection);
        assert.ok(args.includes(image.inspection.nativeId));
        probed = true;
        return bytes(embedded);
      },
      archive: inspected => readDockerArchiveIdentity(Readable.from([image.archive()]), inspected),
    });
    assert.equal(result.image.configDigest, image.configDigest);
    assert.notEqual(result.image.configDigest, input.imageReference);
    assert.equal(probed, true);
  }
});

test('invalid expected source or joined evidence is rejected before any image command', async () => {
  const mutations = [
    input => { input.imageReference = 'latest'; },
    input => { input.ci.runId = '0'; }, input => { input.ci.commit = 'b'.repeat(40); },
    input => { input.ci.runAttempt = '2'; }, input => { input.ci.repository = 'untrusted/fork'; },
    input => { const source = JSON.parse(input.sourceObservationBytes); source.identity.includedUncommittedLocalChanges = true; input.sourceObservationBytes = bytes(source); },
    input => { const source = JSON.parse(input.sourceObservationBytes); source.secret = 'private canary'; input.sourceObservationBytes = bytes(source); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.source.sourceSnapshotDigestSha256 = '0'.repeat(64); input.sourceEvidenceBytes = bytes(evidence); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.supplementalDigestSha256 = '0'.repeat(64); input.sourceEvidenceBytes = bytes(evidence); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.state = 'completed'; input.sourceEvidenceBytes = bytes(evidence); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.run.environments[0].counts.passed++; input.sourceEvidenceBytes = bytes(evidence); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.run.environments[0].hookFailures++; input.sourceEvidenceBytes = bytes(evidence); },
    input => { const evidence = JSON.parse(input.sourceEvidenceBytes); evidence.privateField = 'private canary'; input.sourceEvidenceBytes = bytes(evidence); },
    input => { input.sourceObservationBytes = Buffer.from('{"state":"private","state":"test-inputs-verified-unqualified"}'); },
  ];
  for (const mutate of mutations) {
    const { input, dependencies, calls } = fixture();
    mutate(input);
    await assert.rejects(observeCiImage(input, dependencies), failure);
    assert.equal(calls.length, 0);
  }
});

test('actual image/config/source mismatches, malformed payloads and command errors cannot manufacture proof', async () => {
  for (const mode of ['image', 'platform', 'embedded', 'unavailable', 'private', 'json', 'duplicate', 'large', 'command']) {
    const { input, dependencies } = fixture(({ args, inspected, embedded }) => {
      if (args[2] === 'image') {
        if (mode === 'image') inspected.nativeId = `sha256:${'0'.repeat(64)}`;
        if (mode === 'platform') inspected.platform = 'windows/amd64';
        if (mode === 'command') throw new Error('private command diagnostic');
      } else {
        if (mode === 'embedded') embedded.identity.sourceSnapshotDigestSha256 = '0'.repeat(64);
        if (mode === 'unavailable') embedded.state = 'unavailable';
        if (mode === 'private') embedded.privateField = 'private canary';
        if (mode === 'json') return Buffer.from('{');
        if (mode === 'duplicate') return Buffer.from(`{"schema":"private overwritten value",${JSON.stringify(embedded).slice(1)}`);
        if (mode === 'large') return Buffer.alloc(16385, 32);
      }
    });
    await assert.rejects(observeCiImage(input, dependencies), failure);
  }
});

test('fixed image read bounds regular-file bytes and preserves raw JSON for duplicate-key validation', async () => {
  const { input, dependencies, calls } = fixture();
  await observeCiImage(input, dependencies);
  const script = calls[1].args.at(-1);
  for (const mode of ['valid', 'declared-large', 'actual-large', 'link', 'nonfile']) {
    let reads = 0;
    const written = [];
    const raw = mode === 'actual-large' ? Buffer.alloc(16385) : Buffer.from('{ "raw": true }\n');
    const context = {
      require: name => {
        assert.equal(name, 'node:fs');
        return {
          lstatSync: file => {
            assert.equal(file, '/opt/mofacts-source-observation.json');
            return { isFile: () => mode !== 'nonfile', isSymbolicLink: () => mode === 'link',
              size: mode === 'declared-large' ? 16385 : 10 };
          },
          readFileSync: file => { assert.equal(file, '/opt/mofacts-source-observation.json'); reads++; return raw; },
        };
      },
      process: { exit: status => { assert.equal(status, 1); throw new Error('bounded read rejected'); },
        stdout: { write: value => written.push(value) } },
    };
    if (mode === 'valid') {
      runInNewContext(script, context);
      assert.deepEqual(written, [raw]);
    } else {
      assert.throws(() => runInNewContext(script, context), /bounded read rejected/);
      assert.deepEqual(written, []);
    }
    assert.equal(reads, ['valid', 'actual-large'].includes(mode) ? 1 : 0);
  }
});

test('failed or cancelled probe reads verify ownership before removing their immutable container', async () => {
  for (const mode of ['cancelled', 'bad-json']) {
    const { input, inspected } = fixture();
    const commands = [];
    const id = 'c'.repeat(64);
    let name;
    let owner;
    const command = async (_command, args) => {
      commands.push(args);
      if (args[2] === 'image') return bytes(inspected);
      if (args[2] === 'run') {
        name = args[args.indexOf('--name') + 1];
        owner = args[args.indexOf('--label') + 1].split('=')[1];
        if (mode === 'cancelled') throw new Error('cancelled CLI; daemon container still runs');
        return Buffer.from('{');
      }
      if (args[3] === 'ls') {
        assert.equal(args[args.indexOf('--filter') + 1], `name=^/${name}$`);
        assert.ok(args.includes('--no-trunc'));
        return bytes({ id, name });
      }
      if (args[3] === 'inspect') {
        assert.equal(args.at(-1), id);
        return bytes({ id, owner });
      }
      assert.deepEqual(args, ['--context', 'default', 'container', 'rm', '--force', id]);
      return Buffer.from(`${id}\n`);
    };
    await assert.rejects(observeCiImage(input, { command, archive: async value => ({ configDigest: value.nativeId, platform: value.platform }) }), failure);
    assert.equal(commands.length, 5);
  }
});

test('failed probe cleanup refuses foreign labels and reports daemon/removal uncertainty', async () => {
  for (const mode of ['foreign', 'listing-error', 'inspect-error', 'remove-error', 'wrong-id']) {
    const { input, inspected } = fixture();
    const commands = [];
    const id = 'c'.repeat(64);
    let name;
    let owner;
    const command = async (_command, args) => {
      commands.push(args);
      if (args[2] === 'image') return bytes(inspected);
      if (args[2] === 'run') {
        name = args[args.indexOf('--name') + 1];
        owner = args[args.indexOf('--label') + 1].split('=')[1];
        throw new Error('failed probe');
      }
      if (args[3] === 'ls') {
        if (mode === 'listing-error') throw new Error('private daemon diagnostic');
        return bytes({ id, name });
      }
      if (args[3] === 'inspect') {
        if (mode === 'inspect-error') throw new Error('private daemon diagnostic');
        return bytes({ id: mode === 'wrong-id' ? 'd'.repeat(64) : id, owner: mode === 'foreign' ? 'foreign owner' : owner });
      }
      if (mode === 'remove-error') throw new Error('private daemon diagnostic');
      assert.fail('foreign container removal attempted');
    };
    await assert.rejects(observeCiImage(input, { command, archive: async value => ({ configDigest: value.nativeId, platform: value.platform }) }), {
      message: 'CI image observation probe cleanup failed; no qualification was issued.',
      code: 'CI_IMAGE_PROBE_CLEANUP_FAILED',
    });
    assert.equal(commands.filter(args => args[3] === 'rm').length, mode === 'remove-error' ? 1 : 0);
  }
});

test('fresh probe ownership differs between reads and an absent auto-removed probe is not deleted', async () => {
  const first = fixture();
  const second = fixture();
  await observeCiImage(first.input, first.dependencies);
  await observeCiImage(second.input, second.dependencies);
  const firstName = first.calls[1].args[first.calls[1].args.indexOf('--name') + 1];
  const secondName = second.calls[1].args[second.calls[1].args.indexOf('--name') + 1];
  assert.notEqual(firstName, secondName);
  const failed = fixture(({ args }) => { if (args[2] === 'run') throw new Error('cancelled'); });
  await assert.rejects(observeCiImage(failed.input, failed.dependencies), failure);
  assert.equal(failed.calls.length, 3);
  assert.equal(failed.calls[2].args[3], 'ls');
});

async function filesystemFixture(t) {
  const parent = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'mofacts-ci-image-test-'));
  t.after(async () => {
    if (path.dirname(root) !== parent || !path.basename(root).startsWith('mofacts-ci-image-test-')) assert.fail('foreign fixture');
    await fs.rm(root, { recursive: true });
  });
  const { input, dependencies, calls } = fixture();
  const sourceFile = path.join(root, 'source.json');
  const evidenceFile = path.join(root, 'evidence.json');
  const output = path.join(root, 'image.json');
  await fs.writeFile(sourceFile, input.sourceObservationBytes);
  await fs.writeFile(evidenceFile, input.sourceEvidenceBytes);
  return { root, input, dependencies, calls, sourceFile, evidenceFile, output };
}

test('writer exclusively publishes bounded observation outside source and preserves existing bytes', async t => {
  const { input, dependencies, calls, sourceFile, evidenceFile, output } = await filesystemFixture(t);
  const observed = await writeCiImageObservation(input.imageReference, sourceFile, evidenceFile, output, input.ci, dependencies);
  assert.deepEqual(JSON.parse(await fs.readFile(output)), observed);
  assert.ok((await fs.stat(output)).size <= 16384);
  calls.length = 0;
  await assert.rejects(writeCiImageObservation(input.imageReference, sourceFile, evidenceFile, output, input.ci, dependencies), failure);
  assert.deepEqual(JSON.parse(await fs.readFile(output)), observed);
  assert.equal(calls.length, 0);
});

test('writer rejects a source-tree destination, linked input and failed inspection without output', async t => {
  const { root, input, dependencies, sourceFile, evidenceFile, output } = await filesystemFixture(t);
  const insideSource = path.resolve('mofacts/scripts/security-audit/qualification/.image-observation-test-output');
  await assert.rejects(writeCiImageObservation(input.imageReference, sourceFile, evidenceFile, insideSource, input.ci, dependencies), failure);
  const linked = path.join(root, 'linked.json');
  await fs.link(sourceFile, linked);
  await assert.rejects(writeCiImageObservation(input.imageReference, linked, evidenceFile, output, input.ci, dependencies), failure);
  await fs.unlink(linked);
  await assert.rejects(writeCiImageObservation(input.imageReference, sourceFile, evidenceFile, output, input.ci,
    { command: async () => { throw new Error('private failure'); } }), failure);
  await assert.rejects(fs.lstat(output), { code: 'ENOENT' });
});
