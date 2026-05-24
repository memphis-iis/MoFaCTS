import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: any[]) => void;
type ScheduleKind = 'everyMinute' | 'dailyAtLocalTime';
type ScheduledJob = {
  name: string;
  schedule: ScheduleKind;
  hour?: number;
  minute?: number;
  run: () => Promise<unknown>;
};
type CronHistoryDocument = {
  _id?: string;
  intendedAt: Date;
  name: string;
  startedAt: Date;
  processId: string;
  finishedAt?: Date;
  result?: unknown;
  error?: unknown;
  skipped?: true;
  timedOut?: true;
};
type CronHistoryCollection = Mongo.Collection<CronHistoryDocument> & {
  createIndexAsync: (keys: UnknownRecord, options?: UnknownRecord) => Promise<unknown>;
};

type StartConfiguredMofactsCronJobsDeps = {
  Meteor: typeof Meteor;
  isProd: boolean;
  serverConsole: Logger;
  sendScheduledTurkMessages: () => Promise<unknown>;
  sendErrorReportSummaries: () => Promise<unknown>;
  checkDriveSpace: () => unknown | Promise<unknown>;
};

const CRON_PROCESS_ID = Random.id();
const RUNNING_JOB_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2147483647;
const cronHistory = new Mongo.Collection<CronHistoryDocument>('cronHistory') as CronHistoryCollection;

function truncateToSecond(date: Date) {
  const next = new Date(date.getTime());
  next.setMilliseconds(0);
  return next;
}

function getNextMinuteDate(from: Date) {
  const next = truncateToSecond(from);
  next.setSeconds(0);
  next.setMinutes(next.getMinutes() + 1);
  return next;
}

function getNextLocalTimeDate(from: Date, hour: number, minute: number) {
  const next = new Date(from.getTime());
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getNextRunDate(job: ScheduledJob, from = new Date()) {
  if (job.schedule === 'everyMinute') {
    return getNextMinuteDate(from);
  }
  if (job.hour === undefined || job.minute === undefined) {
    throw new Error(`Scheduled job "${job.name}" is missing daily local time fields`);
  }
  return getNextLocalTimeDate(from, job.hour, job.minute);
}

function serializeCronError(error: unknown) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

async function initializeCronHistoryCollection() {
  await cronHistory.createIndexAsync({ intendedAt: 1, name: 1 }, { unique: true });
  await cronHistory.createIndexAsync({ finishedAt: 1, processId: 1 });
}

async function reserveCronRun(job: ScheduledJob, intendedAt: Date, serverConsole: Logger) {
  const runningJob = await cronHistory.findOneAsync({
    name: job.name,
    finishedAt: { $exists: false },
  });

  if (runningJob) {
    if (!runningJob._id) {
      throw new Error(`Running cron history document for "${job.name}" is missing _id`);
    }
    const startedAt = runningJob.startedAt instanceof Date ? runningJob.startedAt : new Date(runningJob.startedAt);
    const runningTimeMs = Date.now() - startedAt.getTime();
    if (runningTimeMs < RUNNING_JOB_TIMEOUT_MS) {
      serverConsole(`MoFaCTS cron skipping "${job.name}" because a previous run is still active`);
      return null;
    }

    await cronHistory.updateAsync(
      { _id: runningJob._id },
      {
        $set: {
          finishedAt: new Date(),
          timedOut: true,
        },
      },
    );
    serverConsole(`MoFaCTS cron marked stale running job "${job.name}" as timed out`);
  }

  const history: CronHistoryDocument = {
    intendedAt,
    name: job.name,
    startedAt: new Date(),
    processId: CRON_PROCESS_ID,
  };

  try {
    history._id = await cronHistory.insertAsync(history);
    return history;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === 'object' && error && 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 11000 || message.includes('E11000')) {
      serverConsole(`MoFaCTS cron skipping "${job.name}" because this intended run is already claimed`);
      return null;
    }
    throw error;
  }
}

async function runCronJob(job: ScheduledJob, intendedAt: Date, serverConsole: Logger) {
  const history = await reserveCronRun(job, intendedAt, serverConsole);
  if (!history?._id) {
    return;
  }

  try {
    serverConsole(`MoFaCTS cron starting "${job.name}"`);
    const result = await job.run();
    await cronHistory.updateAsync(
      { _id: history._id },
      {
        $set: {
          finishedAt: new Date(),
          result,
        },
      },
    );
    serverConsole(`MoFaCTS cron finished "${job.name}"`);
  } catch (error: unknown) {
    const serializedError = serializeCronError(error);
    await cronHistory.updateAsync(
      { _id: history._id },
      {
        $set: {
          finishedAt: new Date(),
          error: serializedError,
        },
      },
    );
    serverConsole(`MoFaCTS cron failed "${job.name}"`, error);
  }
}

function scheduleCronJob(job: ScheduledJob, serverConsole: Logger) {
  const scheduleNext = (from = new Date()) => {
    const intendedAt = getNextRunDate(job, from);
    const delayMs = intendedAt.getTime() - Date.now();

    if (delayMs > MAX_TIMER_DELAY_MS) {
      Meteor.setTimeout(() => scheduleNext(from), MAX_TIMER_DELAY_MS);
      return;
    }

    Meteor.setTimeout(async () => {
      try {
        await runCronJob(job, intendedAt, serverConsole);
      } catch (error: unknown) {
        serverConsole(`MoFaCTS cron infrastructure failed "${job.name}"`, error);
      } finally {
        scheduleNext(new Date());
      }
    }, Math.max(delayMs, 1000));

    serverConsole(`MoFaCTS cron scheduled "${job.name}" next run @ ${intendedAt.toString()}`);
  };

  scheduleNext();
}

function getConfiguredJobs(deps: StartConfiguredMofactsCronJobsDeps): ScheduledJob[] {
  return [
    {
      name: 'Period Email Sent Check',
      schedule: 'everyMinute',
      run: async () => {
        try {
          return await deps.sendScheduledTurkMessages();
        } catch (error: unknown) {
          deps.serverConsole('MoFaCTS cron job failed: Period Email Sent Check', error);
          return { sendCount: 0, error: String(error) };
        }
      },
    },
    {
      name: 'Send Error Report Summaries',
      schedule: 'dailyAtLocalTime',
      hour: 15,
      minute: 0,
      run: async () => {
        try {
          return await deps.sendErrorReportSummaries();
        } catch (error: unknown) {
          deps.serverConsole('MoFaCTS cron job failed: Send Error Report Summaries', error);
          return { error: String(error) };
        }
      },
    },
    {
      name: 'Check Drive Space Remaining',
      schedule: 'dailyAtLocalTime',
      hour: 15,
      minute: 0,
      run: async () => {
        try {
          return await deps.checkDriveSpace();
        } catch (error: unknown) {
          deps.serverConsole('MoFaCTS cron job failed: Check Drive Space Remaining', error);
          return { error: String(error) };
        }
      },
    },
  ];
}

export async function startConfiguredMofactsCronJobs(deps: StartConfiguredMofactsCronJobsDeps) {
  const enableCronJobs = deps.Meteor.settings.enableEmail ?? deps.isProd;
  if (!enableCronJobs) {
    deps.serverConsole('MoFaCTS cron jobs disabled; cron runtime not started');
    return;
  }

  await initializeCronHistoryCollection();
  for (const job of getConfiguredJobs(deps)) {
    scheduleCronJob(job, deps.serverConsole);
  }
}
