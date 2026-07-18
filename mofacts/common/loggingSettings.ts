export type LoggingVerbosityLevel = 0 | 1 | 2;

export type LoggingSettingContract = Readonly<{
  id: string;
  key: string;
  defaultValue: LoggingVerbosityLevel;
}>;

export const SERVER_VERBOSITY_SETTING: LoggingSettingContract = Object.freeze({
  id: 'admin-setting.serverVerbosityLevel',
  key: 'serverVerbosityLevel',
  defaultValue: 1,
});

export const CLIENT_VERBOSITY_SETTING: LoggingSettingContract = Object.freeze({
  id: 'admin-setting.clientVerbosityLevel',
  key: 'clientVerbosityLevel',
  defaultValue: 0,
});

export const LOGGING_SETTING_CONTRACTS = Object.freeze([
  SERVER_VERBOSITY_SETTING,
  CLIENT_VERBOSITY_SETTING,
]);

export function parseLoggingVerbosityLevel(value: unknown): LoggingVerbosityLevel {
  if (value === 0 || value === 1 || value === 2) {
    return value;
  }
  if (value === '0' || value === '1' || value === '2') {
    return Number(value) as LoggingVerbosityLevel;
  }
  throw new Error(`Unsupported logging verbosity level: ${String(value)}`);
}

export function resolveLoggingSettingValue(
  contract: LoggingSettingContract,
  documents: ReadonlyArray<{ value?: unknown }>,
): LoggingVerbosityLevel {
  if (documents.length === 0) {
    return contract.defaultValue;
  }

  const values = documents.map((document) => parseLoggingVerbosityLevel(document.value));
  const distinctValues = new Set(values);
  if (distinctValues.size !== 1) {
    throw new Error(`Conflicting ${contract.key} setting documents`);
  }
  return values[0]!;
}

export function shouldEmitLogMessage(
  configuredLevel: LoggingVerbosityLevel,
  messageLevel: LoggingVerbosityLevel,
): boolean {
  return configuredLevel !== 0 && messageLevel <= configuredLevel;
}
