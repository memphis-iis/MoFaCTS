import { Meteor } from 'meteor/meteor';
import { formatSettingsValidationIssues, validateOpenCoreSettings } from '../lib/openCoreSettingsValidation';
import { validateStorageBoundary } from '../lib/storageBoundary';
import { validateBackupConfig } from '../lib/backup/backupConfig';

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

async function check(name: string, work: () => Promise<string>) {
  try {
    return {
      name,
      status: 'pass' as const,
      message: await work(),
    };
  } catch (error: unknown) {
    return {
      name,
      status: 'fail' as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function settingsSourceMessage() {
  const source = String(process.env.METEOR_SETTINGS_WORKAROUND || '').trim();
  if (!source) {
    throw new Error('METEOR_SETTINGS_WORKAROUND is not set; self-hosted deployments must mount a private settings file');
  }
  if (source !== '/run/mofacts/settings.json') {
    throw new Error(`settings loaded from ${source}; expected /run/mofacts/settings.json`);
  }
  return source;
}

function mongoUrlMessage() {
  const rawUrl = String(process.env.MONGO_URL || '').trim();
  if (!rawUrl) {
    throw new Error('MONGO_URL is not set');
  }
  const parsed = new URL(rawUrl);
  const expectedDb = process.env.EXPECTED_MONGO_DB_NAME || 'MoFACT-meteor3';
  const actualDb = parsed.pathname.replace(/^\//, '');
  if (actualDb !== expectedDb) {
    throw new Error(`MONGO_URL targets ${actualDb}; expected ${expectedDb}`);
  }
  if (process.env.MOFACTS_SELF_HOSTED === 'true' && (!parsed.username || !parsed.password)) {
    throw new Error('self-hosted MONGO_URL must include app-user credentials');
  }
  return `connected to ${actualDb}`;
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
          await deps.Tdfs.rawDatabase().command({ ping: 1 });
          return mongoUrlMessage();
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
