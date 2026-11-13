import { ImapFlow } from 'imapflow';
import { proofRecord } from '../../../mofacts/common/securityAudit/proofFields.ts';
import { RESET_MAILBOX_LIMITS_V2 as limits, parseResetMailboxBindingV2,
  resetMailboxMessageMatchesV2, acquireResetMailboxMessageV2 } from '../../../mofacts/scripts/security-audit/authentication/mailboxV2.mjs';

export class MailboxReaderError extends Error {
  constructor(category) { super(`Mailbox acquisition stopped: ${category}`); this.category = category; }
}
const stop = category => { throw new MailboxReaderError(category); };
function text(value, max, category = 'configuration') {
  if (typeof value !== 'string' || !value || value.length > max
      || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) stop(category);
  return value;
}
function configuration(imaps, password) {
  const row = proofRecord(imaps, ['host', 'username', 'mailbox']);
  const host = text(row.host, 253);
  text(row.mailbox, 256);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.includes('..')) stop('configuration');
  return { host, port: 993, secure: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: text(row.username, 254), pass: text(password, 1024) },
    logger: false, logRaw: false, emitLogs: false, disableAutoIdle: true, disableCompression: true,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
    maxLineLength: 65536, maxLiteralSize: 65536, maxResponseSize: 131072 };
}
function uid(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffff) stop('evidence-incomplete');
  return value;
}
function validity(value) {
  if (typeof value !== 'bigint' || value < 1n || value > 0xffffffffn) stop('identity-conflict');
  return value;
}
function metadata(message) {
  const recipients = [];
  for (const key of ['to', 'cc', 'bcc']) {
    const addresses = message?.envelope?.[key];
    if (addresses !== undefined && !Array.isArray(addresses)) stop('evidence-incomplete');
    for (const address of addresses ?? []) recipients.push(text(address?.address, 254, 'evidence-incomplete'));
  }
  if (!recipients.length || recipients.length > 8 || !(message.internalDate instanceof Date)
      || !Number.isSafeInteger(message.internalDate.getTime())) stop('evidence-incomplete');
  return { messageId: String(uid(message.uid)), recipients, receivedAtMs: message.internalDate.getTime() };
}

// An explicit top-level part "1" is ImapFlow's documented single-part body
// address. Nested parts must carry their actual BODYSTRUCTURE part number.
export function selectPlainTextPartV2(structure) {
  let visited = 0;
  const candidates = [];
  function visit(node, depth) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 4 || ++visited > 16
        || typeof node.type !== 'string') stop('evidence-incomplete');
    const type = node.type.toLowerCase();
    if (node.disposition && node.disposition.toLowerCase() !== 'inline') stop('evidence-incomplete');
    if (node.dispositionParameters?.filename || node.parameters?.name) stop('evidence-incomplete');
    if (type.startsWith('multipart/')) {
      if (!Array.isArray(node.childNodes) || !node.childNodes.length) stop('evidence-incomplete');
      for (const child of node.childNodes) visit(child, depth + 1);
    } else {
      if (node.childNodes !== undefined || !['text/plain', 'text/html'].includes(type)) stop('evidence-incomplete');
      if (!Number.isSafeInteger(node.size) || node.size < 0 || node.size > 65536) stop('evidence-incomplete');
      if (type === 'text/plain') {
        // Missing charset/encoding have standard MIME defaults, not guessed
        // decoding. Restrict this reset protocol to ASCII/UTF-8 text.
        if ((node.parameters?.charset !== undefined && !['utf-8', 'us-ascii'].includes(String(node.parameters.charset).toLowerCase()))
            || node.encoding !== undefined && !['7bit', '8bit', 'binary', 'base64', 'quoted-printable'].includes(String(node.encoding).toLowerCase())) stop('evidence-incomplete');
        if (node.parameters?.format !== undefined && String(node.parameters.format).toLowerCase() !== 'fixed') stop('evidence-incomplete');
        const part = depth === 0 && !node.part ? '1' : node.part;
        if (typeof part !== 'string' || !/^[1-9]\d*(?:\.[1-9]\d*)*$/.test(part) || part.length > 32) stop('evidence-incomplete');
        candidates.push(part);
      }
    }
  }
  visit(structure, 0);
  if (candidates.length !== 1) stop('evidence-incomplete');
  return candidates[0];
}

// No CLI, environment reads, mailbox writes or evidence persistence. The caller
// owns credential custody and the returned transient capability. Only receipt
// may leave that private owner. Factory/timers are injected solely for tests.
export async function readResetMailImapsV2({ binding, imaps, password }, dependencies = {}) {
  if (process.version !== 'v24.22.1') stop('configuration');
  let scope, options;
  try { scope = parseResetMailboxBindingV2(binding); options = configuration(imaps, password); }
  catch { stop('configuration'); }
  const createClient = dependencies.createClient ?? (value => new ImapFlow(value));
  const mailboxPath = imaps.mailbox;
  const timers = dependencies.timers ?? { setTimeout, clearTimeout };
  let client, activeStream, closed = false, connected = false, expired = false, fault = false, timer, failure, result;
  const alive = () => { if (expired) stop('timeout'); if (fault || closed) stop('transport'); };
  const io = async operation => {
    try { const value = await operation(); alive(); return value; }
    catch (error) { if (expired) stop('timeout'); if (error instanceof MailboxReaderError) throw error; stop('transport'); }
  };
  try {
    try { client = createClient(options); } catch { stop('configuration'); }
    if (!client || ['connect', 'mailboxOpen', 'search', 'fetchAll', 'fetchOne', 'download', 'logout', 'close', 'on']
      .some(method => typeof client[method] !== 'function')) stop('configuration');
    client.on('close', () => { closed = true; });
    client.on('error', () => { fault = true; });
    const timeout = new Promise((_, reject) => { timer = timers.setTimeout(() => {
      expired = true;
      activeStream?.destroy();
      try { client.close(); } catch { /* final ownership check still blocks success */ }
      reject(new MailboxReaderError('timeout'));
    }, 45000); });
    const work = async () => {
      await io(() => client.connect()); connected = true;
      const mailbox = await io(() => client.mailboxOpen(mailboxPath, { readOnly: true }));
      if (mailbox?.readOnly !== true || mailbox.path !== mailboxPath) stop('identity-conflict');
      const epoch = validity(mailbox.uidValidity);
      const check = () => {
        alive();
        if (client.mailbox?.path !== mailboxPath || client.mailbox?.readOnly !== true
            || validity(client.mailbox?.uidValidity) !== epoch) stop('identity-conflict');
      };
      return acquireResetMailboxMessageV2({ binding: scope,
        async listMetadata() {
          check();
          // IMAP SINCE is a timezone-dependent calendar date, not an instant.
          // The unique run recipient bounds this search; exact INTERNALDATE
          // milliseconds are checked by the shared owner before any body read.
          const ids = await io(() => client.search({ to: scope.recipient }, { uid: true })); check();
          if (!Array.isArray(ids) || ids.length > limits.messageCount || new Set(ids).size !== ids.length) stop('evidence-incomplete');
          ids.forEach(uid);
          if (!ids.length) return [];
          const values = await io(() => client.fetchAll(ids.join(','), { uid: true, envelope: true, internalDate: true }, { uid: true })); check();
          if (!Array.isArray(values) || values.length !== ids.length
              || new Set(values.map(value => uid(value.uid))).size !== ids.length
              || values.some(value => !ids.includes(value.uid))) stop('identity-conflict');
          return values.map(metadata);
        },
        async readPlainText(messageId) {
          check();
          const id = uid(Number(messageId));
          const message = await io(() => client.fetchOne(id, { uid: true, bodyStructure: true, envelope: true, internalDate: true }, { uid: true })); check();
          if (!message || message.uid !== id) stop('identity-conflict');
          const expected = metadata(message);
          // Reapply exact recipient/time selection immediately before download.
          if (!resetMailboxMessageMatchesV2(scope, expected)) stop('identity-conflict');
          const part = selectPlainTextPartV2(message.bodyStructure); check();
          const download = await io(() => client.download(id, part, { uid: true, maxBytes: limits.bodyBytes + 1, chunkSize: 8192 })); check();
          const stream = download?.content;
          if (!stream || typeof stream[Symbol.asyncIterator] !== 'function' || typeof stream.destroy !== 'function') stop('evidence-incomplete');
          activeStream = stream;
          try {
            if (download.meta?.contentType !== 'text/plain' || download.meta?.filename
                || download.meta?.flowed
                || (download.meta?.disposition && download.meta.disposition !== 'inline')
                || download.meta?.charset !== undefined && !['utf-8', 'us-ascii'].includes(String(download.meta.charset).toLowerCase())) stop('evidence-incomplete');
            const chunks = []; let size = 0;
            await io(async () => {
              for await (const chunk of stream) {
                check();
                if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) stop('evidence-incomplete');
                size += chunk.length;
                if (size > limits.bodyBytes) stop('evidence-incomplete');
                chunks.push(Buffer.from(chunk));
              }
            });
            check();
            return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
          } finally { stream.destroy(); activeStream = undefined; }
        } });
    };
    result = await Promise.race([work(), timeout]);
  } catch (error) { failure = error instanceof MailboxReaderError ? error : new MailboxReaderError('evidence-incomplete'); }
  finally {
    if (timer !== undefined) timers.clearTimeout(timer);
    activeStream?.destroy();
    let cleanupTimer;
    if (client) {
      if (connected && !closed) {
        try {
          const outcome = await Promise.race([client.logout(), new Promise((_, reject) => {
            cleanupTimer = timers.setTimeout(() => reject(new MailboxReaderError('cleanup-unverified')), 10000);
          })]);
          if (outcome === false) failure = new MailboxReaderError('cleanup-unverified');
        } catch { failure = new MailboxReaderError('cleanup-unverified'); }
      }
      if (cleanupTimer !== undefined) timers.clearTimeout(cleanupTimer);
      if (!closed) { try { client.close(); } catch { /* closed remains false */ } }
      if (!closed) failure = new MailboxReaderError('cleanup-unverified');
      if (fault && !failure) failure = new MailboxReaderError('transport');
    }
  }
  if (failure) throw failure;
  return result;
}
