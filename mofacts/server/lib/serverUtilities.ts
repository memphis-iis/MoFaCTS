import { Meteor } from 'meteor/meteor';
import { Email } from 'meteor/email';
import { check } from 'meteor/check';
import { sendErrorReportSummariesWorkflow } from './errorReportSummary';

type UnknownRecord = Record<string, unknown>;

type ServerUtilityDeps = {
  Assignments: { removeAsync: (selector: UnknownRecord) => Promise<unknown> };
  Histories: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  GlobalExperimentStates: {
    removeAsync: (selector: UnknownRecord) => Promise<unknown>;
  };
  ErrorReports: any;
  findUsersByIds: (userIds: string[]) => Promise<any[]>;
  adminUsers: string[];
  ownerEmail: string;
  thisServerUrl: string;
  isProd: boolean;
  serverConsole: (...args: unknown[]) => void;
};

function getDiskUsageInfo(path = "/") {
  try {
    const fs = Npm.require('fs') as typeof import('fs');
    if (typeof fs.statfsSync === 'function') {
      const info = fs.statfsSync(path);
      const blockSize = Number(info.bsize);
      const totalBlocks = Number(info.blocks);
      const freeBlocks = Number(info.bfree);
      const total = totalBlocks * blockSize;
      const free = freeBlocks * blockSize;

      if (Number.isFinite(total) && Number.isFinite(free) && total > 0) {
        return { total, free };
      }
    }
  } catch (_error: unknown) {
    return null;
  }

  return null;
}

function buildDiskUsageStatus(path = "/") {
  const info = getDiskUsageInfo(path);
  if (!info) {
    return {
      diskSpacePercent: 'N/A',
      remainingSpace: 'N/A',
      diskSpace: 'N/A',
      diskSpaceUsed: 'N/A',
      error: 'Disk usage unavailable from fs.statfsSync.'
    };
  }

  const diskSpaceTotal = info.total;
  const diskSpaceUsed = info.total - info.free;
  const remainingSpace = info.free;
  const driveSpaceUsedPercent = (diskSpaceUsed / diskSpaceTotal) * 100;

  return {
    diskSpacePercent: driveSpaceUsedPercent.toFixed(2),
    remainingSpace: (remainingSpace / 1000000000).toFixed(2),
    diskSpace: (diskSpaceTotal / 1000000000).toFixed(2),
    diskSpaceUsed: (diskSpaceUsed / 1000000000).toFixed(2)
  };
}

export function createServerUtilityHelpers(deps: ServerUtilityDeps) {
  function getLoggedDiskUsageInfo(path = "/") {
    const info = getDiskUsageInfo(path);
    if (!info) {
      deps.serverConsole('Error getting disk usage with fs.statfsSync: unavailable');
    }
    return info;
  }

  function sendEmail(to: string, from: string, subject: string, text: string) {
    deps.serverConsole('sendEmail', to, from, subject, '[body redacted, length=' + (text?.length || 0) + ']');
    check([to, from, subject, text], [String]);
    const emailEnabled = Meteor.settings.enableEmail ?? deps.isProd;
    if (emailEnabled)
      Email.send({ to, from, subject, text });
    else
      deps.serverConsole('sendEmail SKIPPED (enableEmail is false and prod is false)');
  }

  async function sendErrorReportSummaries() {
    return sendErrorReportSummariesWorkflow({
      ErrorReports: deps.ErrorReports,
      findUsersByIds: deps.findUsersByIds,
      adminUsers: deps.adminUsers,
      ownerEmail: deps.ownerEmail,
      thisServerUrl: deps.thisServerUrl,
      sendEmail,
      serverConsole: deps.serverConsole
    });
  }

  async function deleteTdfRuntimeData(tdfId: string) {
    await deps.Assignments.removeAsync({ TDFId: tdfId });
    await deps.Histories.removeAsync({ TDFId: tdfId });
    await deps.GlobalExperimentStates.removeAsync({ TDFId: tdfId });
  }

  return {
    getDiskUsageInfo: getLoggedDiskUsageInfo,
    buildDiskUsageStatus,
    sendEmail,
    sendErrorReportSummaries,
    deleteTdfRuntimeData,
  };
}
