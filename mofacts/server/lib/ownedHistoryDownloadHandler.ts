import type { IncomingMessage, ServerResponse } from 'node:http';
import { attachmentDisposition } from './attachmentDisposition';
import type { OwnedHistoryDownloadToken } from './ownedHistoryDownloadTokens';
import { writeHistoryDownloadBytes as writeBytes, writeHistoryDownloadText as writeText } from './historyDownloadResponse';

type HistoryRecord = Record<string, unknown>;
export type OwnedHistoryDownloadHandlerDeps = {
  consumeToken: (token: string) => OwnedHistoryDownloadToken | null;
  reauthorize: (record: OwnedHistoryDownloadToken) => Promise<void>;
  openHistory: (record: OwnedHistoryDownloadToken, signal: AbortSignal) => AsyncGenerator<HistoryRecord>;
  writeHistory: (histories: AsyncIterable<HistoryRecord>, write: (chunk: string) => Promise<void>) => Promise<void>;
};

export function createOwnedHistoryDownloadHandler(deps: OwnedHistoryDownloadHandlerDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET') { writeText(res, 405, 'Method not allowed'); return; }
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('History download connection closed'));
    req.once('aborted', abort);
    res.once('close', abort);
    res.once('error', abort);
    let histories: AsyncGenerator<HistoryRecord> | undefined;
    try {
      const parts = (String(req.url ?? '').split('?')[0] ?? '').split('/').filter(Boolean).map(part => decodeURIComponent(part));
      const [token, fileName] = parts;
      const record = parts.length === 2 && token ? deps.consumeToken(token) : null;
      if (!record || fileName !== record.fileName) { writeText(res, 404, 'History download token is invalid or expired'); return; }
      await deps.reauthorize(record);
      controller.signal.throwIfAborted();
      histories = deps.openHistory(record, controller.signal);
      // Sorting may be lengthy. Complete it before headers and recheck current access.
      const first = await histories.next();
      await deps.reauthorize(record);
      controller.signal.throwIfAborted();
      res.writeHead(200, {
        'Content-Type': 'text/tab-separated-values; charset=utf-16le',
        'Content-Disposition': attachmentDisposition(record.fileName),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      await writeBytes(res, Buffer.from([0xFF, 0xFE]), controller.signal);
      const remainder = histories;
      async function* records(): AsyncGenerator<HistoryRecord> {
        if (!first.done) yield first.value;
        yield* remainder;
      }
      await deps.writeHistory(records(), async chunk => writeBytes(res, Buffer.from(chunk, 'utf16le'), controller.signal));
      res.end();
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      const code = (error as { error?: unknown })?.error;
      writeText(res, code === 403 || code === 404 ? code : error instanceof URIError ? 404 : 500,
        code === 403 ? 'Not authorized to download this history' : code === 404 ? 'History download is unavailable' : 'History download failed');
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
      res.removeListener('error', abort);
      try { await histories?.return(undefined); }
      catch {
        // Cleanup failures must not escape the HTTP handler as an unhandled rejection.
        if (!res.destroyed) {
          if (res.headersSent) res.destroy();
          else writeText(res, 500, 'History download failed');
        }
      }
    }
  };
}
