import { Tdfs, UserDashboardCache } from '../../common/Collections';
import {
  migrateLearnerConfigDeliverySettings,
  migrateTdfDeliverySettings,
  type DeliverySettingsMigrationWarning,
} from '../../common/lib/deliverySettingsMigration';

type TdfDocument = {
  _id: string;
  content?: unknown;
  fileName?: string;
  packageAssetId?: string;
};

type UserDashboardCacheDocument = {
  _id: string;
  userId?: string;
  learnerTdfConfigs?: Record<string, unknown>;
};

type ConvertDeliverySettingsOptions = {
  dryRun?: boolean;
  confirmWrite?: 'convert-delivery-settings';
  tdfIds?: string[];
  limit?: number;
  removeLegacy?: boolean;
};

type ConvertDeliverySettingsDocReport = {
  _id: string;
  fileName?: string;
  packageAssetId?: string;
  changed: boolean;
  warnings: DeliverySettingsMigrationWarning[];
};

type ConvertDeliverySettingsReport = {
  dryRun: boolean;
  removeLegacy: boolean;
  scanned: number;
  changed: number;
  updated: number;
  skipped: number;
  cacheScanned: number;
  cacheChanged: number;
  cacheUpdated: number;
  cacheSkipped: number;
  warnings: number;
  docs: ConvertDeliverySettingsDocReport[];
  cacheDocs: ConvertDeliverySettingsCacheDocReport[];
};

const TdfsAny = Tdfs as any;
const UserDashboardCacheAny = UserDashboardCache as any;

type AsyncFindResult<T> = {
  fetchAsync(): Promise<T[]>;
};

type TdfMigrationCollection = {
  find(selector: Record<string, unknown>, options?: Record<string, unknown>): AsyncFindResult<TdfDocument>;
  updateAsync(selector: Record<string, unknown>, modifier: Record<string, unknown>): Promise<unknown>;
};

type UserDashboardCacheMigrationCollection = {
  find(selector: Record<string, unknown>, options?: Record<string, unknown>): AsyncFindResult<UserDashboardCacheDocument>;
  updateAsync(selector: Record<string, unknown>, modifier: Record<string, unknown>): Promise<unknown>;
};

type ConvertDeliverySettingsCollections = {
  Tdfs: TdfMigrationCollection;
  UserDashboardCache: UserDashboardCacheMigrationCollection;
};

type ConvertDeliverySettingsCacheDocReport = {
  _id: string;
  userId?: string;
  changed: boolean;
  changedTdfIds: string[];
  warnings: DeliverySettingsMigrationWarning[];
};

function buildSelector(options: ConvertDeliverySettingsOptions): Record<string, unknown> {
  const selector: Record<string, unknown> = {
    'content.tdfs.tutor': { $exists: true },
  };

  if (options.tdfIds?.length) {
    selector._id = { $in: options.tdfIds };
  }

  return selector;
}

function configHasOverrides(config: unknown): boolean {
  const overrides = config && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>).overrides
    : undefined;
  return Boolean(
    overrides &&
    typeof overrides === 'object' &&
    !Array.isArray(overrides) &&
    Object.keys(overrides as Record<string, unknown>).length > 0
  );
}

function shouldMigrateConfig(tdfId: string, options: ConvertDeliverySettingsOptions): boolean {
  return !options.tdfIds?.length || options.tdfIds.includes(tdfId);
}

async function convertDeliverySettingsInDatabase(
  options: ConvertDeliverySettingsOptions = {}
): Promise<ConvertDeliverySettingsReport> {
  return convertDeliverySettingsInCollections(
    {
      Tdfs: TdfsAny,
      UserDashboardCache: UserDashboardCacheAny,
    },
    options,
  );
}

export async function convertDeliverySettingsInCollections(
  collections: ConvertDeliverySettingsCollections,
  options: ConvertDeliverySettingsOptions = {}
): Promise<ConvertDeliverySettingsReport> {
  const dryRun = options.dryRun !== false;
  const removeLegacy = options.removeLegacy !== false;

  if (!dryRun && options.confirmWrite !== 'convert-delivery-settings') {
    throw new Error('convertDeliverySettingsInDatabase write mode requires confirmWrite: "convert-delivery-settings"');
  }

  const queryOptions: Record<string, unknown> = {
    fields: {
      _id: 1,
      content: 1,
      fileName: 1,
      packageAssetId: 1,
    },
  };

  if (options.limit && options.limit > 0) {
    queryOptions.limit = options.limit;
  }

  const docs = await collections.Tdfs.find(buildSelector(options), queryOptions).fetchAsync() as TdfDocument[];
  const report: ConvertDeliverySettingsReport = {
    dryRun,
    removeLegacy,
    scanned: docs.length,
    changed: 0,
    updated: 0,
    skipped: 0,
    cacheScanned: 0,
    cacheChanged: 0,
    cacheUpdated: 0,
    cacheSkipped: 0,
    warnings: 0,
    docs: [],
    cacheDocs: [],
  };

  for (const doc of docs) {
    const migration = migrateTdfDeliverySettings(doc.content, { removeLegacy });
    const docReport: ConvertDeliverySettingsDocReport = {
      _id: doc._id,
      changed: migration.changed,
      warnings: migration.warnings,
    };
    if (doc.fileName !== undefined) {
      docReport.fileName = doc.fileName;
    }
    if (doc.packageAssetId !== undefined) {
      docReport.packageAssetId = doc.packageAssetId;
    }

    report.docs.push(docReport);
    report.warnings += migration.warnings.length;

    if (!migration.changed) {
      report.skipped += 1;
      continue;
    }

    report.changed += 1;

    if (!dryRun) {
      await collections.Tdfs.updateAsync(
        { _id: doc._id },
        {
          $set: {
            content: migration.tdf,
            deliverySettingsMigratedAt: new Date(),
          },
        }
      );
      report.updated += 1;
    }
  }

  const cacheDocs = await collections.UserDashboardCache.find(
    { learnerTdfConfigs: { $exists: true } },
    { fields: { _id: 1, userId: 1, learnerTdfConfigs: 1 } },
  ).fetchAsync() as UserDashboardCacheDocument[];
  report.cacheScanned = cacheDocs.length;

  for (const cacheDoc of cacheDocs) {
    const originalConfigs = cacheDoc.learnerTdfConfigs || {};
    const nextConfigs: Record<string, unknown> = { ...originalConfigs };
    const changedTdfIds: string[] = [];
    const warnings: DeliverySettingsMigrationWarning[] = [];

    for (const [tdfId, config] of Object.entries(originalConfigs)) {
      if (!shouldMigrateConfig(tdfId, options)) {
        continue;
      }

      const migration = migrateLearnerConfigDeliverySettings(config, { removeLegacy });
      warnings.push(...migration.warnings.map((warning) => ({
        path: `learnerTdfConfigs.${tdfId}.${warning.path}`,
        message: warning.message,
      })));

      if (!migration.changed) {
        continue;
      }

      changedTdfIds.push(tdfId);
      if (configHasOverrides(migration.config)) {
        nextConfigs[tdfId] = migration.config;
      } else {
        delete nextConfigs[tdfId];
      }
    }

    const changed = changedTdfIds.length > 0;
    report.cacheDocs.push({
      _id: cacheDoc._id,
      ...(cacheDoc.userId !== undefined ? { userId: cacheDoc.userId } : {}),
      changed,
      changedTdfIds,
      warnings,
    });
    report.warnings += warnings.length;

    if (!changed) {
      report.cacheSkipped += 1;
      continue;
    }

    report.cacheChanged += 1;

    if (!dryRun) {
      await collections.UserDashboardCache.updateAsync(
        { _id: cacheDoc._id },
        {
          $set: {
            learnerTdfConfigs: nextConfigs,
            deliverySettingsMigratedAt: new Date(),
          },
        },
      );
      report.cacheUpdated += 1;
    }
  }

  return report;
}

Object.assign(globalThis, {
  convertDeliverySettingsInDatabase,
});
