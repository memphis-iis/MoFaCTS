import assert from 'node:assert/strict';
import test from 'node:test';
import tls from 'node:tls';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ImapFlow } from 'imapflow';
import { readResetMailImapsV2, MailboxReaderError } from '../reader.mjs';

// Exercises the real pinned client against an isolated TLS/IMAP wire fixture.
// No external mailbox, provider, credential, port publication or package is used.
test('real ImapFlow uses EXAMINE, UID and PEEK, decodes the selected MIME body and rejects untrusted TLS', async t => {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); }
  catch {
    if (process.platform === 'win32') { t.skip('Real TLS fixture runs on supported Linux with existing OpenSSL'); return; }
    throw new Error('Existing OpenSSL is required by the Linux TLS fixture');
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-mail-reader-'));
  await fs.chmod(directory, 0o700);
  const sockets = new Set(), commands = [];
  let server;
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise(resolve => server.close(resolve));
    const resolved = await fs.realpath(directory);
    assert.equal(path.resolve(resolved), path.resolve(directory));
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(resolved), /^mofacts-mail-reader-[A-Za-z0-9]+$/);
    assert.equal((await fs.lstat(resolved)).isSymbolicLink(), false);
    await fs.rm(resolved, { recursive: true });
  });
  const keyPath = path.join(directory, 'key.pem'), certPath = path.join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-keyout', keyPath, '-out', certPath],
  { stdio: 'ignore', timeout: 10000 });
  const key = await fs.readFile(keyPath), cert = await fs.readFile(certPath);
  const namespace = 'mofacts_audit_fixture_abcdef012345';
  const recipient = `operator+${namespace}-reset@example.test`;
  const token = 'c'.repeat(64);
  const binding = { namespace, recipient, target: 'https://staging2.optimallearning.org',
    requestedAtMs: Date.UTC(2026, 10, 13, 10), deadlineMs: Date.UTC(2026, 10, 13, 10, 2) };
  const rawBody = `${binding.target}/auth/reset-password?email=${encodeURIComponent(recipient)}&token=${token}\r\n`;
  let encodedBody = Buffer.from(Buffer.from(rawBody).toString('base64') + '\r\n');
  const headers = Buffer.from('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n');
  const [local, domain] = recipient.split('@');
  const envelope = `(NIL "MoFaCTS Password Reset" NIL NIL NIL ((NIL NIL "${local}" "${domain}")) NIL NIL NIL "<synthetic>")`;
  const structure = () => `("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "BASE64" ${encodedBody.length} 3)`;
  server = tls.createServer({ key, cert }, socket => {
    socket.setEncoding('utf8');
    socket.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR] Synthetic test server\r\n');
    let pending = '', authenticationTag;
    socket.on('data', chunk => {
      pending += chunk;
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n'), line = pending.slice(0, end); pending = pending.slice(end + 2);
        if (authenticationTag) {
          socket.write(`${authenticationTag} OK authenticated\r\n`); authenticationTag = undefined; continue;
        }
        const match = /^(\S+) (.*)$/.exec(line);
        if (!match) { socket.destroy(); return; }
        const [, tag, command] = match, upper = command.toUpperCase();
        // Retain command names/section markers only, never AUTH payloads.
        commands.push({ verb: upper.split(' ').slice(0, upper.startsWith('UID ') ? 2 : 1).join(' '),
          header: upper.includes('BODY.PEEK[HEADER]'), text: upper.includes('BODY.PEEK[TEXT]'),
          wholeMessage: upper.includes('BODY.PEEK[]') || upper.includes('BODY[]') });
        const ok = () => socket.write(`${tag} OK completed\r\n`);
        if (upper === 'CAPABILITY') { socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN SASL-IR\r\n'); ok(); }
        else if (upper.startsWith('AUTHENTICATE PLAIN ')) ok();
        else if (upper === 'AUTHENTICATE PLAIN') { authenticationTag = tag; socket.write('+\r\n'); }
        else if (upper.startsWith('LIST ')) { socket.write('* LIST (\\Noselect) "/" ""\r\n'); ok(); }
        else if (upper.startsWith('EXAMINE ')) {
          socket.write('* FLAGS (\\Seen \\Deleted)\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 777]\r\n* OK [UIDNEXT 102]\r\n');
          socket.write(`${tag} OK [READ-ONLY] selected\r\n`);
        } else if (upper.startsWith('UID SEARCH ')) { socket.write('* SEARCH 101\r\n'); ok(); }
        else if (/^UID FETCH 101 /.test(upper)) {
          let response = '* 2 FETCH (UID 101'; // Sequence 2 deliberately differs from UID 101.
          if (upper.includes('ENVELOPE')) response += ` ENVELOPE ${envelope}`;
          if (upper.includes('INTERNALDATE')) response += ' INTERNALDATE "13-Nov-2026 10:00:01 +0000"';
          if (upper.includes('BODYSTRUCTURE')) response += ` BODYSTRUCTURE ${structure()}`;
          if (upper.includes('RFC822.SIZE')) response += ` RFC822.SIZE ${headers.length + encodedBody.length}`;
          for (const section of command.matchAll(/BODY\.PEEK\[(HEADER|TEXT)\](?:<(\d+)\.(\d+)>)?/gi)) {
            const name = section[1].toUpperCase(), offset = Number(section[2] ?? 0);
            const source = name === 'HEADER' ? headers : encodedBody;
            const bytes = source.subarray(offset, section[3] ? offset + Number(section[3]) : undefined);
            response += ` BODY[${name}]${section[2] === undefined ? '' : `<${offset}>`} {${bytes.length}}\r\n${bytes.toString('utf8')}`;
          }
          socket.write(response + ')\r\n'); ok();
        } else if (upper === 'LOGOUT') { socket.write(`* BYE closing\r\n${tag} OK logout\r\n`); socket.end(); }
        else socket.write(`${tag} BAD unsupported fixture command\r\n`);
      }
    });
    socket.on('error', () => {});
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const input = { binding, imaps: { host: 'localhost', username: 'synthetic', mailbox: 'INBOX' }, password: 'synthetic-password' };
  let result;
  try {
    result = await readResetMailImapsV2(input, { createClient: options => {
      const client = new ImapFlow({ ...options, port, tls: { ...options.tls, ca: cert } });
      client.on('error', error => { if (/^[A-Z0-9_]+$/.test(String(error.code))) t.diagnostic(`Synthetic TLS client code: ${error.code}`); });
      return client;
    } });
  } catch (error) { t.diagnostic(JSON.stringify(commands)); throw error; }
  assert.equal(result.token, token);
  assert.equal(result.receipt.exactRecipientMatched, true);
  assert(commands.some(value => value.verb === 'EXAMINE'));
  assert(commands.some(value => value.verb === 'UID SEARCH'));
  assert(commands.some(value => value.text));
  assert(commands.some(value => value.verb === 'LOGOUT'));
  assert.equal(commands.some(value => value.wholeMessage || ['SELECT', 'STORE', 'CLOSE', 'EXPUNGE', 'APPEND'].includes(value.verb)), false);
  encodedBody = Buffer.from(Buffer.from(rawBody + 'x'.repeat(17000)).toString('base64') + '\r\n');
  await assert.rejects(readResetMailImapsV2(input, { createClient: options => new ImapFlow({ ...options,
    port, tls: { ...options.tls, ca: cert } }) }),
  error => error instanceof MailboxReaderError && error.category === 'evidence-incomplete');
  await assert.rejects(readResetMailImapsV2(input, { createClient: options => new ImapFlow({ ...options, port }) }),
    error => error instanceof MailboxReaderError && error.category === 'transport');
});
