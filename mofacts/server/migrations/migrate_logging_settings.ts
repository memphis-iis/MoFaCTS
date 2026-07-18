import {
  CLIENT_VERBOSITY_SETTING,
  LOGGING_SETTING_CONTRACTS,
  SERVER_VERBOSITY_SETTING,
  type LoggingSettingContract,
  type LoggingVerbosityLevel,
  resolveLoggingSettingValue,
} from '../../common/loggingSettings';

type UnknownRecord = Record<string, unknown>;

type LoggingSettingsCollection = {
  find: (
    selector: UnknownRecord,
    options?: UnknownRecord,
  ) => { fetchAsync: () => Promise<Array<{ _id?: unknown; key?: unknown; value?: unknown }>> };
  removeAsync: (selector: UnknownRecord) => Promise<number>;
  upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
};

type MigrationResult = Readonly<{
  clientVerbosityLevel: LoggingVerbosityLevel;
  serverVerbosityLevel: LoggingVerbosityLevel;
  removedDuplicateDocuments: number;
}>;

async function readLoggingSetting(
  DynamicSettings: LoggingSettingsCollection,
  contract: LoggingSettingContract,
): Promise<{
  contract: LoggingSettingContract;
  value: LoggingVerbosityLevel;
}> {
  const documents = await DynamicSettings.find(
    { $or: [{ _id: contract.id }, { key: contract.key }] },
    { fields: { _id: 1, key: 1, value: 1 } },
  ).fetchAsync();
  const value = resolveLoggingSettingValue(contract, documents);
  return { contract, value };
}

export async function migrateLoggingSettings(
  DynamicSettings: LoggingSettingsCollection,
): Promise<MigrationResult> {
  const settings = await Promise.all(
    LOGGING_SETTING_CONTRACTS.map((contract) => readLoggingSetting(DynamicSettings, contract)),
  );
  let removedDuplicateDocuments = 0;

  for (const setting of settings) {
    await DynamicSettings.upsertAsync(
      { _id: setting.contract.id },
      { $set: { key: setting.contract.key, value: setting.value } },
    );
    removedDuplicateDocuments += await DynamicSettings.removeAsync({
      key: setting.contract.key,
      _id: { $ne: setting.contract.id },
    });
  }

  return {
    clientVerbosityLevel: settings.find(
      (setting) => setting.contract.id === CLIENT_VERBOSITY_SETTING.id,
    )?.value as LoggingVerbosityLevel,
    serverVerbosityLevel: settings.find(
      (setting) => setting.contract.id === SERVER_VERBOSITY_SETTING.id,
    )?.value as LoggingVerbosityLevel,
    removedDuplicateDocuments,
  };
}
