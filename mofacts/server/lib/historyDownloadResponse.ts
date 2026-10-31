import type { ServerResponse } from 'node:http';

export function writeHistoryDownloadText(res: ServerResponse, code: number, message: string): void {
  if (res.destroyed) return;
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(message);
}

/** Both history scopes share transport cancellation, without sharing authorization or ordering. */
export async function writeHistoryDownloadBytes(res: ServerResponse, bytes: Buffer, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (res.destroyed || res.writableEnded) throw new Error('History download connection closed');
  if (res.write(bytes)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.removeListener('drain', drained);
      res.removeListener('close', closed);
      res.removeListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const drained = () => { cleanup(); resolve(); };
    const closed = () => { cleanup(); reject(new Error('History download connection closed')); };
    const failed = (error: Error) => { cleanup(); reject(error); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    res.once('drain', drained);
    res.once('close', closed);
    res.once('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    else if (res.destroyed || res.writableEnded) closed();
  });
}
