import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import { once } from 'events';
import { Histories } from '../../common/Collections';
import { consumeOwnHistoryDownloadToken } from '../lib/ownHistoryDownloadTokens';
import { writeExperimentExportFromHistoryIterable } from '../experiment_times';

const HISTORY_EXPORT_BATCH_SIZE = 500;

function writeText(res: ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function decodePathParts(req: IncomingMessage): string[] {
  const rawPath = String(req.url || '').split('?')[0] || '';
  return rawPath.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
}

function attachmentDisposition(fileName: string): string {
  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function writeUtf16Le(res: ServerResponse, chunk: string): Promise<void> {
  if (!res.write(Buffer.from(chunk, 'utf16le'))) {
    await once(res, 'drain');
  }
}

WebApp.connectHandlers.use('/data-download/own-history', async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'GET') {
    writeText(res, 405, 'Method not allowed');
    return;
  }

  try {
    const [token, requestedFileName] = decodePathParts(req);
    const record = consumeOwnHistoryDownloadToken(token || '');
    if (!record || !requestedFileName || requestedFileName !== record.fileName) {
      writeText(res, 404, 'History download token is invalid or expired');
      return;
    }

    const user = await Meteor.users.findOneAsync(
      { _id: record.userId },
      { fields: { _id: 1 } }
    );
    if (!user) {
      writeText(res, 404, 'User not found');
      return;
    }

    const history = await Histories.findOneAsync(
      { userId: record.userId },
      { fields: { _id: 1 } }
    );
    if (!history) {
      writeText(res, 404, 'No history found for current user');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/tab-separated-values; charset=utf-16le',
      'Content-Disposition': attachmentDisposition(record.fileName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write(Buffer.from([0xFF, 0xFE]));

    const cursor = (Histories.rawCollection() as any)
      .find(
        { userId: record.userId },
        { sort: { recordedServerTime: 1, time: 1, eventId: 1 } }
      )
      .batchSize(HISTORY_EXPORT_BATCH_SIZE);

    await writeExperimentExportFromHistoryIterable(cursor, async (chunk) => {
      await writeUtf16Le(res, chunk);
    });
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      writeText(res, 500, error instanceof Error ? error.message : String(error));
      return;
    }
    res.destroy(error instanceof Error ? error : undefined);
  }
});
