import type { IncomingMessage, ServerResponse } from 'node:http';
import { attachmentDisposition } from './attachmentDisposition';
import { writeHistoryDownloadBytes, writeHistoryDownloadText } from './historyDownloadResponse';
import type { OwnHistoryDownloadToken } from './ownHistoryDownloadTokens';

type HistoryCursor = AsyncIterable<Record<string, unknown>> & { close(): Promise<void> };
export type OwnHistoryDownloadHandlerDeps = {
  consumeToken(token: string): OwnHistoryDownloadToken | null;
  userExists(userId: string): Promise<boolean>;
  hasHistory(userId: string): Promise<boolean>;
  openHistory(record: OwnHistoryDownloadToken): HistoryCursor;
  writeHistory(histories: HistoryCursor, write: (chunk: string) => Promise<void>): Promise<void>;
};

export function createOwnHistoryDownloadHandler(deps: OwnHistoryDownloadHandlerDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET') { writeHistoryDownloadText(res, 405, 'Method not allowed'); return; }
    const controller = new AbortController();
    let histories: HistoryCursor | undefined;
    let closing: Promise<void> | undefined;
    async function closeHistory(): Promise<void> {
      if (histories) await (closing ??= histories.close());
    }
    const abort = () => {
      controller.abort(new Error('History download connection closed'));
      // Closing the cursor also interrupts an outstanding read. The finally
      // owner observes cleanup failures; event callbacks must not reject.
      void closeHistory().catch(() => undefined);
    };
    req.once('aborted', abort);
    res.once('close', abort);
    res.once('error', abort);
    try {
      const parts = (String(req.url || '').split('?')[0] || '').split('/').filter(Boolean).map(part => decodeURIComponent(part));
      const [token, requestedFileName] = parts;
      const record = deps.consumeToken(token || '');
      if (!record || !requestedFileName || requestedFileName !== record.fileName) {
        writeHistoryDownloadText(res, 404, 'History download token is invalid or expired'); return;
      }
      if (!await deps.userExists(record.userId)) {
        writeHistoryDownloadText(res, 404, 'User not found'); return;
      }
      controller.signal.throwIfAborted();
      if (!await deps.hasHistory(record.userId)) {
        writeHistoryDownloadText(res, 404, 'No history found for current user'); return;
      }
      controller.signal.throwIfAborted();
      res.writeHead(200, {
        'Content-Type': 'text/tab-separated-values; charset=utf-16le',
        'Content-Disposition': attachmentDisposition(record.fileName),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      await writeHistoryDownloadBytes(res, Buffer.from([0xFF, 0xFE]), controller.signal);
      histories = deps.openHistory(record);
      controller.signal.throwIfAborted();
      await deps.writeHistory(histories, chunk => writeHistoryDownloadBytes(res, Buffer.from(chunk, 'utf16le'), controller.signal));
      controller.signal.throwIfAborted();
      res.end();
    } catch {
      if (!controller.signal.aborted && !res.destroyed) {
        if (res.headersSent) res.destroy();
        else writeHistoryDownloadText(res, 500, 'History download failed');
      }
    } finally {
      try { await closeHistory(); }
      catch {
        if (!res.destroyed && !res.writableEnded) {
          if (res.headersSent) res.destroy();
          else writeHistoryDownloadText(res, 500, 'History download failed');
        }
      } finally {
        req.removeListener('aborted', abort);
        res.removeListener('close', abort);
        res.removeListener('error', abort);
      }
    }
  };
}
