import { Meteor } from 'meteor/meteor';
import { formatSettingsValidationIssues, validateOpenCoreSettings } from '../lib/openCoreSettingsValidation';
import { validateStorageBoundary } from '../lib/storageBoundary';
import { validateBackupConfig } from '../lib/backup/backupConfig';
import { formatMongoConnectionValidation, validateMongoConnection } from '../lib/mongoConnectionValidation';
import { getStrictMongoReactivityMetrics } from '../lib/strictMongoReactivity';
import { validateTdfExpressions } from '../../../learning-components/content/tdfExpressionValidation';

type UnknownRecord = Record<string, unknown>;

type ReadinessDeps = {
  Roles: any;
  Tdfs: any;
  usersCollection: {
    findOneAsync(selector: UnknownRecord, options?: UnknownRecord): Promise<any>;
  };
  redisBoundary: {
    enabled: boolean;
    ping(): Promise<void>;
  };
};

type ReadinessCheckWorkResult = string | {
  readonly status?: 'pass' | 'fail';
  readonly message: string;
  readonly details?: unknown;
};

async function check(name: string, work: () => Promise<ReadinessCheckWorkResult>) {
  try {
    const result = await work();
    if (typeof result === 'string') {
      return { name, status: 'pass' as const, message: result };
    }
    return {
      name,
      status: result.status ?? 'pass',
      message: result.message,
      ...(result.details === undefined ? {} : { details: result.details }),
    };
  } catch (error: unknown) {
    return {
      name,
      status: 'fail' as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

const TDF_EXPRESSION_BATCH_SIZE = 200;
const TDF_EXPRESSION_FAILURE_LIMIT = 50;

function boundedIdentifier(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9_.:\u005B\u005D-]/g, '?').slice(0, 120) || 'unknown';
}

export async function inspectTdfExpressions(Tdfs: any) {
  let lastId: unknown;
  let tdfCount = 0;
  let expressionCount = 0;
  let probabilityExpressionCount = 0;
  let adaptiveRuleCount = 0;
  let failureCount = 0;
  const failures: Array<{ tdfId: string; fieldPath: string }> = [];
  for (;;) {
    const selector = lastId === undefined ? {} : { _id: { $gt: lastId } };
    const docs = await Tdfs.find(selector, {
      fields: {
        _id: 1,
        'content.tdfs.tutor.unit': 1,
        'content.tdfs.tutor.setspec.unitTemplate': 1,
      },
      sort: { _id: 1 },
      limit: TDF_EXPRESSION_BATCH_SIZE,
    }).fetchAsync();
    if (!Array.isArray(docs)) throw new Error('TDF expression inventory did not return a batch');
    for (const doc of docs) {
      tdfCount += 1;
      const result = validateTdfExpressions(doc?.content, 'tdfs.tutor');
      expressionCount += result.expressionCount;
      probabilityExpressionCount += result.probabilityExpressionCount;
      adaptiveRuleCount += result.adaptiveRuleCount;
      failureCount += result.issues.length;
      for (const issue of result.issues) {
        if (failures.length >= TDF_EXPRESSION_FAILURE_LIMIT) break;
        failures.push({
          tdfId: boundedIdentifier(doc?._id),
          fieldPath: boundedIdentifier(issue.fieldPath),
        });
      }
    }
    if (docs.length < TDF_EXPRESSION_BATCH_SIZE) break;
    lastId = docs[docs.length - 1]?._id;
    if (lastId === undefined) throw new Error('TDF expression inventory cannot advance its batch cursor');
  }
  return { tdfCount, expressionCount, probabilityExpressionCount, adaptiveRuleCount, failureCount, failures };
}

function settingsSourceMessage() {
  const source = String(process.env.METEOR_SETTINGS_FILE || '').trim();
  if (!source) {
    throw new Error('METEOR_SETTINGS_FILE is not set; self-hosted deployments must mount a private settings file');
  }
  if (source !== '/run/mofacts/settings.json') {
    throw new Error(`settings loaded from ${source}; expected /run/mofacts/settings.json`);
  }
  return source;
}

export function createDeploymentReadinessMethods(deps: ReadinessDeps) {
  return {
    deploymentReadiness: async function(this: { userId?: string | null }) {
      if (!this.userId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }
      const isAdmin = await deps.Roles.userIsInRoleAsync(this.userId, ['admin']);
      if (!isAdmin) {
        throw new Meteor.Error('not-authorized', 'Admin only');
      }

      const checks = [
        await check('settings.source', async () => settingsSourceMessage()),
        await check('settings.required', async () => {
          const result = validateOpenCoreSettings(Meteor.settings || {}, process.env);
          if (!result.ok) {
            throw new Error(formatSettingsValidationIssues(result.issues));
          }
          return 'required settings are valid';
        }),
        await check('mongo.connection', async () => {
          const result = await validateMongoConnection(deps.Tdfs.rawDatabase(), process.env);
          return formatMongoConnectionValidation(result);
        }),
        await check('mongo.reactivity', async () => {
          if (process.env.METEOR_REACTIVITY_ORDER !== 'changeStreams') {
            throw new Error('METEOR_REACTIVITY_ORDER must be changeStreams');
          }
          const metrics = getStrictMongoReactivityMetrics();
          const collectionCount = metrics.collections.length;
          return `strict Change Streams driver; ${metrics.active} active observer(s) across ${collectionCount} collection(s); ${metrics.rejectedStarts} rejected start(s)`;
        }),
        await check('rootUrl', async () => {
          const rootUrl = String((Meteor.settings as any).ROOT_URL || '').trim();
          if (!rootUrl) {
            throw new Error('Meteor.settings.ROOT_URL is missing');
          }
          return rootUrl;
        }),
        await check('firstAdmin.account', async () => {
          const owner = String((Meteor.settings as any).owner || '').trim().toLowerCase();
          if (!owner) {
            throw new Error('owner setting is missing');
          }
          const user = await deps.usersCollection.findOneAsync({
            $or: [
              { email_canonical: owner },
              { username: owner },
              { 'emails.address': owner },
            ],
          }, { fields: { _id: 1 } });
          if (!user?._id) {
            throw new Error('configured owner/admin account has not signed up yet');
          }
          const isOwnerAdmin = await deps.Roles.userIsInRoleAsync(user._id, ['admin']);
          if (!isOwnerAdmin) {
            throw new Error('configured owner account exists but does not have admin role');
          }
          return 'configured owner account exists and has admin role';
        }),
        await check('tdf.expressions', async () => {
          const inventory = await inspectTdfExpressions(deps.Tdfs);
          const details = {
            tdfCount: inventory.tdfCount,
            expressionCount: inventory.expressionCount,
            probabilityExpressionCount: inventory.probabilityExpressionCount,
            adaptiveRuleCount: inventory.adaptiveRuleCount,
            failureCount: inventory.failureCount,
            failures: inventory.failures.map(({ tdfId, fieldPath }) => ({ tdfId, fieldPath })),
            omittedFailureCount: Math.max(0, inventory.failureCount - inventory.failures.length),
          };
          if (inventory.failureCount > 0) {
            return {
              status: 'fail' as const,
              message: `${inventory.failureCount} invalid expression(s) across ${inventory.tdfCount} TDF(s)`,
              details,
            };
          }
          return {
            message: `${inventory.expressionCount} expression(s) across ${inventory.tdfCount} TDF(s) validate (${inventory.probabilityExpressionCount} probability, ${inventory.adaptiveRuleCount} adaptive)`,
            details,
          };
        }),
      ];

      const storageChecks = await validateStorageBoundary(Meteor.settings || {}, process.env);
      checks.push(...storageChecks);

      const backupChecks = await validateBackupConfig(Meteor.settings || {}, process.env);
      checks.push(...backupChecks);

      if (deps.redisBoundary.enabled) {
        checks.push(await check('redis.connection', async () => {
          await deps.redisBoundary.ping();
          return 'Redis PING succeeded';
        }));
      }

      return {
        ok: checks.every((item) => item.status === 'pass'),
        generatedAt: new Date(),
        checks,
      };
    },
  };
}
