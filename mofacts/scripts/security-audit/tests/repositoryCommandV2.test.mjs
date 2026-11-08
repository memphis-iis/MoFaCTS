import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRepositoryCommandV2 } from '../repository/commandV2.mjs';

const environment = { PATH: process.env.PATH, NODE_OPTIONS: '' };
const command = (args, options = {}) => runRepositoryCommandV2({ command: process.execPath,
  args, cwd: os.tmpdir(), environment, ...options });

test('V2 repository command preserves raw protocol bytes and finding exits while discarding diagnostic contents', async () => {
  const args = ['-e', 'process.stdin.on("data",chunk=>process.stderr.write(chunk));process.stdout.write(Buffer.from([255,0,128]));process.exitCode=1'];
  const result = await command(args, { input: Buffer.from('PRIVATE-value') });
  assert.deepEqual(result.stdout, Buffer.from([255, 0, 128])); assert.equal(result.exitCode, 1);
  assert.deepEqual(result.args, args); assert.equal(result.NODE_OPTIONS, '');
  assert.equal(Object.hasOwn(result, 'stderr'), false); assert.equal(JSON.stringify(result).includes('PRIVATE-value'), false);
  assert.equal(Object.keys(result).sort().join(','), 'NODE_OPTIONS,args,exitCode,stdout');
});

test('V2 repository command passes only explicit environment and bounded input, without shell expansion', async () => {
  const args = ['-e', 'process.stdin.on("data",chunk=>process.stdout.write(chunk));', '$(touch PRIVATE)'];
  const result = await command(args, { input: Buffer.from('synthetic stdin') });
  assert.equal(result.exitCode, 0); assert.equal(result.stdout.toString(), 'synthetic stdin');
  const checked = await command(['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))']);
  assert.deepEqual(JSON.parse(checked.stdout), ['NODE_OPTIONS', 'PATH']);
  for (const changes of [{ environment: { ...environment, AUDIT_AUTH_FIXTURES_JSON: 'PRIVATE' } },
    { environment: { ...environment, NODE_TEST_CONTEXT: 'child-v8' } }, { environment: { ...environment, NODE_OPTIONS: '--test-name-pattern=one' } },
    { cwd: 'relative' }, { maximum: 0 }, { timeoutMs: 0 }, { input: Buffer.alloc(65537) }]) {
    assert.throws(() => command([], changes), /Invalid repository command configuration/);
  }
});

test('V2 repository command absolute deadline and byte limits discard partial output', async () => {
  const timed = await command(['-e', 'setInterval(()=>process.stdout.write("x"),5)'], { timeoutMs: 150 });
  assert.equal(timed.exitCode, -1); assert.equal(timed.failure, 'timeout'); assert.equal(timed.stdout.length, 0);
  for (const output of ['stdout', 'stderr']) {
    const result = await command(['-e', `process.${output}.write(Buffer.alloc(70000));setInterval(()=>{},1000)`], { maximum: 32 });
    assert.equal(result.exitCode, -1); assert.equal(result.failure, 'output-limit'); assert.equal(result.stdout.length, 0);
  }
});

test('V2 repository command handles missing executable and signal termination as unavailable observations', async () => {
  const missing = await command([], { command: '/does-not-exist/mofacts-audit' });
  assert.equal(missing.exitCode, -1); assert.equal(missing.failure, 'command-unavailable'); assert.equal(missing.stdout.length, 0);
  const killed = await command(['-e', 'process.kill(process.pid,"SIGKILL")']);
  assert.equal(killed.exitCode, -1);
});

test('V2 repository command kills a pipe-holding child process on deadline before returning', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-command-tree-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const record = path.join(directory, 'child.pid');
  const script = 'const{spawn}=require("node:child_process");const fs=require("node:fs");'
    + 'const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:["ignore",1,2]});'
    + 'fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000)';
  const result = await command(['-e', script, record], { timeoutMs: 1000 });
  assert.equal(result.failure, 'timeout'); assert.equal(result.stdout.length, 0);
  const pid = Number(await fs.readFile(record, 'utf8'));
  // Linux may retain an orphaned zombie until init reaps it. It must have no
  // running code or open pipes, regardless of the host init's reap schedule.
  try {
    const status = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
    assert.equal(status.slice(status.lastIndexOf(')') + 2).split(' ')[0], 'Z');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
});
