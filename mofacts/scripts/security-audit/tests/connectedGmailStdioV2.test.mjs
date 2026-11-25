import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

const moduleUrl = new URL('../authentication/connectedGmailStdioV2.mjs', import.meta.url).href;
const token = 'a'.repeat(64);
async function childCase(mode) {
  const script = `
    import { acquireConnectedGmailOverStdioV2 as acquire } from ${JSON.stringify(moduleUrl)};
    const requestedAtMs = Date.now();
    const namespace = 'mofacts_audit_fixture_0123456789ab';
    const binding = { namespace, recipient: 'operator+' + namespace + '-reset@example.test',
      target: 'https://staging2.optimallearning.org', requestedAtMs, deadlineMs: requestedAtMs + ${mode === 'timeout' ? 150 : 5000} };
    try {
      const value = await acquire({ binding });
      if (value.state === 'not-observed') process.stdout.write('RESULT missing\\n');
      else if (value.plainText.endsWith('a'.repeat(64)) && value.metadata.recipients[0] === binding.recipient)
        process.stdout.write('RESULT private-handoff-verified\\n');
      else process.exitCode = 2;
    } catch (error) { process.stderr.write(error.message + '\\n'); process.exitCode = 1; }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', lines = '', message;
  const operations = [];
  const killTimer = setTimeout(() => child.kill(), 10000);
  child.stdin.on('error', () => {});
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdout.on('data', bytes => {
    stdout += bytes; lines += bytes;
    while (lines.includes('\n')) {
      const end = lines.indexOf('\n'), line = lines.slice(0, end); lines = lines.slice(end + 1);
      if (!line.startsWith('{')) continue;
      const request = JSON.parse(line); operations.push(request.operation);
      if (mode === 'timeout') continue;
      if (mode === 'eof') { child.stdin.end(); continue; }
      if (mode === 'malformed') { child.stdin.write('SECRET_INVALID_JSON\n'); continue; }
      if (mode === 'oversize') { child.stdin.write('x'.repeat(131073)); continue; }
      if (request.operation === 'gmail-metadata') {
        const scope = request.binding;
        const content = scope.target + '/auth/reset-password?email=' + encodeURIComponent(scope.recipient) + '&token=' + token;
        message = { id: '1abcd', payload: { mime_type: 'text/plain', filename: null, parts: null,
          headers: [{ name: 'To', value: scope.recipient }, { name: 'Delivered-To', value: scope.recipient },
            { name: 'X-Received', value: 'by 2002:a17:903:1 with SMTP id synthetic.' + scope.requestedAtMs + '; Synthetic' }],
          body: { content, size: Buffer.byteLength(content), attachment_id: null } } };
        const metadata = structuredClone(message); delete metadata.payload.body;
        child.stdin.write(JSON.stringify({ requestId: mode === 'wrong-id' ? 9 : request.requestId,
          response: mode === 'empty' ? [] : [metadata] }) + (mode === 'terminal-cr' ? '\r' : mode === 'crlf' ? '\r\n' : '\n'));
      } else child.stdin.write(JSON.stringify({ requestId: request.requestId, response: message }) + '\n');
    }
  });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  clearTimeout(killTimer);
  assert.equal(stdout.includes(token), false);
  assert.equal(stderr.includes(token), false);
  assert.equal(stderr.includes('SECRET_INVALID_JSON'), false);
  return { code, stdout, stderr, operations };
}

test('real child process receives capability privately after metadata-first selection', async () => {
  const result = await childCase('success');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /RESULT private-handoff-verified/);
  assert.deepEqual(result.operations, ['gmail-metadata', 'gmail-full']);
});
test('empty connector evidence remains missing and never requests a body', async () => {
  const result = await childCase('empty');
  assert.equal(result.code, 0); assert.match(result.stdout, /RESULT missing/);
  assert.deepEqual(result.operations, ['gmail-metadata']);
});
for (const mode of ['terminal-cr', 'crlf']) {
  test(`private handoff accepts the ${mode} record terminator`, async () => {
    const result = await childCase(mode);
    assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /RESULT private-handoff-verified/);
  });
}
for (const mode of ['wrong-id', 'malformed', 'oversize', 'eof', 'timeout']) {
  test(`private handoff closes on ${mode} with content-free failure`, async () => {
    const result = await childCase(mode);
    assert.equal(result.code, 1);
    assert.equal(result.stderr, 'Connected Gmail private handoff is unavailable\n');
    assert.deepEqual(result.operations, ['gmail-metadata']);
  });
}
