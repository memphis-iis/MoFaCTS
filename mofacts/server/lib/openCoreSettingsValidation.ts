import { URL } from 'url';

type UnknownRecord = Record<string, unknown>;

export type SettingsValidationIssue = {
  path: string;
  message: string;
};

export type SettingsValidationResult = {
  ok: boolean;
  issues: SettingsValidationIssue[];
};

const PLACEHOLDER_PATTERN = /\b(example|placeholder|changeme|change-me|replace-me|your-domain|your_|example\.org|example\.com)\b/i;
const MIN_ENCRYPTION_KEY_LENGTH = 32;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function emailLike(value: unknown): value is string {
  return nonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractEmailAddress(value: string) {
  const trimmed = value.trim();
  const displayAddress = trimmed.match(/<([^<>]+)>$/);
  return (displayAddress?.[1] || trimmed).trim();
}

function addIssue(issues: SettingsValidationIssue[], path: string, message: string) {
  issues.push({ path, message });
}

function requireString(args: {
  issues: SettingsValidationIssue[];
  settings: UnknownRecord;
  path: string;
  allowPlaceholder?: boolean;
}) {
  const value = args.settings[args.path];
  if (!nonEmptyString(value)) {
    addIssue(args.issues, args.path, 'must be a non-empty string');
    return '';
  }
  const trimmed = value.trim();
  if (!args.allowPlaceholder && PLACEHOLDER_PATTERN.test(trimmed)) {
    addIssue(args.issues, args.path, 'contains an example placeholder and must be replaced');
  }
  return trimmed;
}

function requireBoolean(issues: SettingsValidationIssue[], record: UnknownRecord, path: string) {
  if (typeof record[path] !== 'boolean') {
    addIssue(issues, path, 'must be boolean');
  }
}

function validateUrl(issues: SettingsValidationIssue[], path: string, value: string, allowedProtocols: string[]) {
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) {
      addIssue(issues, path, `must use one of: ${allowedProtocols.join(', ')}`);
    }
    if (!parsed.hostname) {
      addIssue(issues, path, 'must include a host');
    }
  } catch {
    addIssue(issues, path, 'must be a valid URL');
  }
}

function validateOptionalProvider(issues: SettingsValidationIssue[], providerName: string, value: unknown) {
  if (value === undefined || value === null) {
    return;
  }
  if (!isRecord(value)) {
    addIssue(issues, providerName, 'must be an object when configured');
    return;
  }
  const enabled = value.enabled === true || value.clientId !== undefined || value.secret !== undefined;
  if (!enabled) {
    return;
  }
  for (const key of ['clientId', 'secret']) {
    const settingPath = `${providerName}.${key}`;
    if (!nonEmptyString(value[key])) {
      addIssue(issues, settingPath, 'is required when this OAuth provider is enabled');
    } else if (PLACEHOLDER_PATTERN.test(String(value[key]))) {
      addIssue(issues, settingPath, 'contains an example placeholder and must be replaced');
    }
  }
}

function validateMemphisSaml(issues: SettingsValidationIssue[], settings: UnknownRecord) {
  const saml = isRecord(settings.saml) ? settings.saml : {};
  const memphis = isRecord(saml.memphis) ? saml.memphis : {};
  if (memphis.enabled !== true) {
    return;
  }
  for (const key of ['metadataUrl', 'issuer', 'callbackUrl']) {
    const value = memphis[key];
    const path = `saml.memphis.${key}`;
    if (!nonEmptyString(value)) {
      addIssue(issues, path, 'is required when Memphis SAML is enabled');
      continue;
    }
    validateUrl(issues, path, value.trim(), ['https:']);
  }
  const hasMetadata = nonEmptyString(memphis.metadataUrl);
  const hasExplicitIdp = nonEmptyString(memphis.entryPoint) && nonEmptyString(memphis.idpCert || memphis.idpCertPath);
  if (!hasMetadata && !hasExplicitIdp) {
    addIssue(issues, 'saml.memphis', 'requires metadataUrl or entryPoint plus idpCert/idpCertPath');
  }
  const hasSigningPair = nonEmptyString(memphis.publicCert || memphis.publicCertPath) &&
    nonEmptyString(memphis.privateKey || memphis.privateKeyPath);
  if (!hasSigningPair) {
    addIssue(issues, 'saml.memphis', 'requires publicCert/publicCertPath and privateKey/privateKeyPath when enabled');
  }
}

function validateMongoUrl(issues: SettingsValidationIssue[], env: NodeJS.ProcessEnv) {
  const raw = env.MONGO_URL || '';
  if (!raw.trim()) {
    addIssue(issues, 'MONGO_URL', 'environment variable is required');
    return;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
      addIssue(issues, 'MONGO_URL', 'must be a MongoDB connection string');
    }
    const dbName = parsed.pathname.replace(/^\//, '');
    const expectedDb = env.EXPECTED_MONGO_DB_NAME || 'MoFACT-meteor3';
    if (dbName !== expectedDb) {
      addIssue(issues, 'MONGO_URL', `must target database ${expectedDb}`);
    }
    if (env.MOFACTS_SELF_HOSTED === 'true') {
      if (!decodeURIComponent(parsed.username || '') || !decodeURIComponent(parsed.password || '')) {
        addIssue(issues, 'MONGO_URL', 'self-hosted production requires app-user credentials in MONGO_URL');
      }
      if (!parsed.searchParams.get('authSource')) {
        addIssue(issues, 'MONGO_URL', 'self-hosted production requires authSource in MONGO_URL');
      }
    }
  } catch {
    addIssue(issues, 'MONGO_URL', 'must be a valid MongoDB connection string');
  }
}

function validateRedis(issues: SettingsValidationIssue[], settings: UnknownRecord, env: NodeJS.ProcessEnv) {
  const openCore = isRecord(settings.openCore) ? settings.openCore : {};
  const requireRedis = openCore.requireRedis === true || env.MOFACTS_REQUIRE_REDIS === 'true';
  if (!requireRedis) {
    return;
  }
  const redisUrl = env.REDIS_URL || String(openCore.redisUrl || '');
  if (!redisUrl.trim()) {
    addIssue(issues, 'REDIS_URL', 'is required when openCore.requireRedis is true');
    return;
  }
  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      addIssue(issues, 'REDIS_URL', 'must use redis:// or rediss://');
    }
  } catch {
    addIssue(issues, 'REDIS_URL', 'must be a valid Redis URL');
  }
}

export function validateOpenCoreSettings(
  rawSettings: unknown,
  env: NodeJS.ProcessEnv = process.env
): SettingsValidationResult {
  const issues: SettingsValidationIssue[] = [];
  const settings = isRecord(rawSettings) ? rawSettings : {};

  const owner = requireString({ issues, settings, path: 'owner' });
  if (owner && !emailLike(owner)) {
    addIssue(issues, 'owner', 'must be an email address');
  }

  const rootUrl = requireString({ issues, settings, path: 'ROOT_URL' });
  if (rootUrl) {
    validateUrl(issues, 'ROOT_URL', rootUrl, ['http:', 'https:']);
    const envRootUrl = env.ROOT_URL;
    if (nonEmptyString(envRootUrl) && envRootUrl.replace(/\/$/, '') !== rootUrl.replace(/\/$/, '')) {
      addIssue(issues, 'ROOT_URL', 'must match the ROOT_URL environment variable');
    }
  }

  const encryptionKey = requireString({ issues, settings, path: 'encryptionKey' });
  if (encryptionKey && encryptionKey.length < MIN_ENCRYPTION_KEY_LENGTH) {
    addIssue(issues, 'encryptionKey', `must be at least ${MIN_ENCRYPTION_KEY_LENGTH} characters`);
  }

  const initRoles = isRecord(settings.initRoles) ? settings.initRoles : {};
  const admins = Array.isArray(initRoles.admins) ? initRoles.admins : [];
  if (admins.length < 1) {
    addIssue(issues, 'initRoles.admins', 'must contain at least one admin email');
  }
  for (const [index, admin] of admins.entries()) {
    if (!emailLike(admin)) {
      addIssue(issues, `initRoles.admins.${index}`, 'must be an email address');
    }
  }
  if (owner && admins.length > 0 && !admins.map((value) => String(value).trim().toLowerCase()).includes(owner.toLowerCase())) {
    addIssue(issues, 'initRoles.admins', 'must include owner so first-admin role assignment is traceable');
  }

  const auth = isRecord(settings.auth) ? settings.auth : {};
  requireBoolean(issues, auth, 'allowPublicSignup');
  requireBoolean(issues, auth, 'requireEmailVerification');
  requireBoolean(issues, auth, 'argon2Enabled');

  const emailEnabled = settings.enableEmail !== undefined
    ? settings.enableEmail === true
    : settings.prod === true;
  if (emailEnabled) {
    const mailUrl = requireString({ issues, settings, path: 'MAIL_URL' });
    if (mailUrl) {
      validateUrl(issues, 'MAIL_URL', mailUrl, ['smtp:', 'smtps:']);
    }
    const emailFrom = requireString({ issues, settings, path: 'emailFrom' });
    if (emailFrom && !emailLike(extractEmailAddress(emailFrom))) {
      addIssue(issues, 'emailFrom', 'must be an email address or display name with address, such as "MoFaCTS <no-reply@example.org>"');
    }
    if (settings.emailReplyTo !== undefined && !emailLike(settings.emailReplyTo)) {
      addIssue(issues, 'emailReplyTo', 'must be an email address when provided');
    }
  }

  validateOptionalProvider(issues, 'google', settings.google);
  validateOptionalProvider(issues, 'microsoft', settings.microsoft);
  validateMemphisSaml(issues, settings);
  validateMongoUrl(issues, env);
  validateRedis(issues, settings, env);

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function formatSettingsValidationIssues(issues: SettingsValidationIssue[]) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}
