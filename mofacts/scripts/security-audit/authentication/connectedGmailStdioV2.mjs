import { parseResetMailboxBindingV2 } from './mailboxV2.mjs';
import { acquireConnectedGmailResetMessageV2 } from './connectedGmailV2.mjs';

const unavailable = () => new Error('Connected Gmail private handoff is unavailable');
const maxFrameBytes = 131072;

// The scheduled agent retains connector authority. Its owning scanner receives
// bounded responses on private stdin, never argv or a token-bearing file. Only
// acquisition requests leave stdout; the capability returns to the same caller.
// This transport does not grant mailbox access or replace the environment lease.
export async function acquireConnectedGmailOverStdioV2({ binding, input = process.stdin,
  output = process.stdout, now = Date.now }) {
  const scope = parseResetMailboxBindingV2(binding);
  const remaining = scope.deadlineMs - now();
  if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 120000) throw unavailable();
  let pending, sequence = 0, buffer = Buffer.alloc(0), failed = false;
  const wasRaw = input.isRaw === true;
  const reject = () => {
    failed = true;
    if (pending) { const current = pending; pending = null; current.reject(unavailable()); }
  };
  const receive = bytes => {
    if (failed || !pending || !Buffer.isBuffer(bytes) || buffer.length + bytes.length > maxFrameBytes) return reject();
    buffer = Buffer.concat([buffer, bytes]);
    const lf = buffer.indexOf(10), cr = buffer.indexOf(13);
    const end = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
    if (end < 0) return;
    try {
      // One response per request; no queued, concatenated or out-of-order frames.
      const terminatorBytes = buffer[end] === 13 && buffer[end + 1] === 10 ? 2 : 1;
      if (end + terminatorBytes !== buffer.length) throw unavailable();
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end)));
      if (!value || Object.keys(value).sort().join(',') !== 'requestId,response'
        || value.requestId !== pending.id || now() >= scope.deadlineMs) throw unavailable();
      const current = pending; pending = null; buffer.fill(0); buffer = Buffer.alloc(0);
      current.resolve(value.response);
    } catch { reject(); }
  };
  const request = (operation, fields) => new Promise((resolve, fail) => {
    if (failed || pending || now() >= scope.deadlineMs) return fail(unavailable());
    const id = ++sequence;
    pending = { id, resolve, reject: fail };
    output.write(JSON.stringify({ requestId: id, operation, ...fields }) + '\n', error => { if (error) reject(); });
  });
  let timer;
  try {
    // Raw terminal input disables echo before asking for any private response.
    if (input.isTTY) input.setRawMode(true);
    input.on('data', receive); input.on('end', reject); input.on('error', reject);
    output.on('error', reject);
    timer = setTimeout(reject, remaining);
    return await acquireConnectedGmailResetMessageV2({ binding: scope, now,
      listMessages: async () => request('gmail-metadata', { binding: scope, maximumResults: 10 }),
      readMessage: async messageId => request('gmail-full', { messageId }),
    });
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer); buffer.fill(0); buffer = Buffer.alloc(0);
    input.removeListener('data', receive); input.removeListener('end', reject); input.removeListener('error', reject);
    output.removeListener('error', reject); input.pause();
    if (input.isTTY) input.setRawMode(wasRaw);
  }
}
