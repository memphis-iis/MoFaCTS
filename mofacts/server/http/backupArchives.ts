import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { WebApp } from 'meteor/webapp';
import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import { BackupJobs } from '../../common/Collections';
import { readBackupConfig } from '../lib/backup/backupConfig';
import { consumeBackupDownloadToken } from '../lib/backup/backupDownloadTokens';
import { createLocalBackupStorage } from '../lib/backup/backupStorage';

const AuditLog = (globalThis as any).AuditLog;

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

WebApp.connectHandlers.use('/admin/backups/download', async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== 'GET') {
    writeText(res, 405, 'Method not allowed');
    return;
  }

  try {
    const [token, requestedFileName] = decodePathParts(req);
    const record = consumeBackupDownloadToken(token || '');
    if (!record || !requestedFileName || requestedFileName !== record.archiveFileName) {
      writeText(res, 404, 'Backup download token is invalid or expired');
      return;
    }

    const isAdmin = await Roles.userIsInRoleAsync(record.createdByUserId, ['admin']);
    if (!isAdmin) {
      writeText(res, 403, 'Admin access is required');
      return;
    }

    const job = await BackupJobs.findOneAsync({ _id: record.backupJobId });
    if (!job || job.jobType !== 'backup' || job.archiveFileName !== record.archiveFileName) {
      writeText(res, 404, 'Backup job not found');
      return;
    }
    if (job.status !== 'complete' && job.status !== 'verified') {
      writeText(res, 409, 'Backup archive is not downloadable in its current state');
      return;
    }

    const config = readBackupConfig(Meteor.settings || {}, process.env);
    const storage = createLocalBackupStorage(config);
    const archivePath = storage.archivePath(record.archiveFileName);
    const stat = await fsp.stat(archivePath);
    if (!stat.isFile()) {
      writeText(res, 404, 'Backup archive file not found');
      return;
    }

    await AuditLog.insertAsync({
      action: 'backup.downloaded',
      actorUserId: record.createdByUserId,
      targetUserId: null,
      timestamp: new Date(),
      details: {
        jobId: record.backupJobId,
        backupId: job.backupId || null,
        archiveFileName: record.archiveFileName,
        sizeBytes: stat.size,
      },
    });

    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': attachmentDisposition(record.archiveFileName),
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(archivePath).on('error', () => {
      if (!res.headersSent) {
        writeText(res, 500, 'Backup archive stream failed');
        return;
      }
      res.destroy();
    }).pipe(res);
  } catch (error) {
    writeText(res, 500, error instanceof Error ? error.message : String(error));
  }
});
