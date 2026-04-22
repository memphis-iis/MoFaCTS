import { Meteor } from 'meteor/meteor';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: any[]) => void;
type CronParser = { text: (expression: string) => unknown };
type SyncedCronRuntime = {
  config: (options: UnknownRecord) => void;
  start: () => void;
  add: (job: UnknownRecord) => void;
};

type StartConfiguredSyncedCronJobsDeps = {
  Meteor: typeof Meteor;
  isProd: boolean;
  serverConsole: Logger;
  sendScheduledTurkMessages: () => Promise<unknown>;
  sendErrorReportSummaries: () => Promise<unknown>;
  checkDriveSpace: () => unknown | Promise<unknown>;
};

function requireSyncedCronRuntime() {
  const runtime = (globalThis as unknown as { SyncedCron?: Partial<SyncedCronRuntime> }).SyncedCron;
  if (!runtime || typeof runtime.start !== 'function' || typeof runtime.add !== 'function' || typeof runtime.config !== 'function') {
    throw new Error('SyncedCron runtime is required at startup. Ensure quave:synced-cron is loaded correctly.');
  }
  return runtime as SyncedCronRuntime;
}

export async function startConfiguredSyncedCronJobs(deps: StartConfiguredSyncedCronJobsDeps) {
  const syncedCron = requireSyncedCronRuntime();
  syncedCron.config({
    log: true,
    logger: null,
    collectionName: 'cronHistory',
    utc: false,
    collectionTTL: undefined,
  });
  syncedCron.start();

  const enableCronJobs = deps.Meteor.settings.enableEmail ?? deps.isProd;
  if (!enableCronJobs) {
    return;
  }

  syncedCron.add({
    name: 'Period Email Sent Check',
    schedule: function(parser: CronParser) {
      return parser.text('every 1 minutes');
    },
    job: async function() {
      try {
        return await deps.sendScheduledTurkMessages();
      } catch (error: unknown) {
        deps.serverConsole('SyncedCron job failed: Period Email Sent Check', error);
        return { sendCount: 0, error: String(error) };
      }
    },
  });

  syncedCron.add({
    name: 'Send Error Report Summaries',
    schedule: function(parser: CronParser) {
      return parser.text('at 3:00 pm');
    },
    job: async function() {
      try {
        return await deps.sendErrorReportSummaries();
      } catch (error: unknown) {
        deps.serverConsole('SyncedCron job failed: Send Error Report Summaries', error);
        return { error: String(error) };
      }
    },
  });

  syncedCron.add({
    name: 'Check Drive Space Remaining',
    schedule: function(parser: CronParser) {
      return parser.text('at 3:00 pm');
    },
    job: async function() {
      try {
        return await deps.checkDriveSpace();
      } catch (error: unknown) {
        deps.serverConsole('SyncedCron job failed: Check Drive Space Remaining', error);
        return { error: String(error) };
      }
    }
  });
}
