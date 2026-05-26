#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

const requiredFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'dependency-licenses.csv',
  'dependency-licenses-all.csv',
  'Dockerfile',
  'mofacts/package-lock.json',
  'deploy/.env.self-hosted.example',
  'deploy/settings.self-hosted.example.json',
  'docs/deployment/self-hosted-guide.md',
  'docs/deployment/settings-reference.md',
  'docs/deployment/public-release-source.md',
  'docs/deployment/release-checklist.md',
  'docs/deployment/upgrade-guide.md',
];

const requiredContent = [
  {
    file: 'docs/deployment/release-checklist.md',
    checks: [
      { name: 'source tag/archive', regex: /source tag or archive/i },
      { name: 'Docker image tag', regex: /docker image tag/i },
      { name: 'settings template version', regex: /settings template version/i },
      { name: 'release notes', regex: /release notes/i },
      { name: 'upgrade notes', regex: /upgrade notes/i },
      { name: 'dependency license audit', regex: /dependency license audit/i },
      { name: 'AGPL and third-party notices', regex: /AGPL license text.*third-party notices/is },
      { name: 'schema regeneration', regex: /npm run generate:schemas/i },
      { name: 'settings template triplet', regex: /deploy\/settings\.self-hosted\.example\.json.*deploy\/\.env\.self-hosted\.example.*docs\/deployment\/settings-reference\.md/is },
      { name: 'worker status', regex: /no separate worker service|worker entrypoint/i },
      { name: 'backup and restore', regex: /backup.*restore/is },
      { name: 'post-upgrade smoke test', regex: /post-upgrade smoke test/i },
    ],
  },
  {
    file: 'docs/deployment/public-release-source.md',
    checks: [
      { name: 'release checklist link', regex: /release-checklist\.md/i },
    ],
  },
];

const requiredSelfHostedSettingsKeys = [
  'ROOT_URL',
  'owner',
  'encryptionKey',
  'initRoles.admins',
  'auth.allowPublicSignup',
  'auth.requireEmailVerification',
  'auth.argon2Enabled',
  'MAIL_URL',
  'emailFrom',
  'openCore.requireRedis',
  'storage.backend',
  'storage.local.dynamicAssetsPath',
  'storage.local.h5pContentPath',
  'storage.local.h5pLibrariesPath',
  'public.sourceUrl',
];

const requiredSelfHostedEnvKeys = [
  'ROOT_URL',
  'METEOR_SETTINGS_HOST_PATH',
  'MONGO_URL',
  'EXPECTED_MONGO_DB_NAME',
  'MOFACTS_SELF_HOSTED',
  'MONGO_INITDB_ROOT_USERNAME',
  'MONGO_INITDB_ROOT_PASSWORD',
  'MOFACTS_MONGO_APP_USERNAME',
  'MOFACTS_MONGO_APP_PASSWORD',
  'REDIS_URL',
];

const secretPatterns = [
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'GitHub token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'private key header', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Mongo URI with literal credentials', regex: /\bmongodb(?:\+srv)?:\/\/(?!\$\{)[^/\s:@$]+:[^@\s$]+@/i },
  { name: 'SMTP URI with literal credentials', regex: /\bsmtps?:\/\/(?!\$\{)[^/\s:@$]+:[^@\s$]+@/i },
];

const privatePathPatterns = [
  { name: 'Windows user profile path', regex: /C:\\Users\\(?!ppavl\\\.codex)[^\\\s]+\\/i },
  { name: 'OneDrive project path', regex: /OneDrive\\Active projects\\/i },
  { name: 'Unix home path', regex: /\/home\/[^/\s]+\/|\/Users\/[^/\s]+\// },
];

const textExtensions = new Set([
  '.cjs', '.css', '.example', '.html', '.js', '.json', '.md', '.mjs', '.ps1', '.sh', '.svelte', '.toml', '.ts', '.txt', '.yml', '.yaml',
]);

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runMofactsNodeScript(args) {
  return execFileSync(process.execPath, args, {
    cwd: path.join(repoRoot, 'mofacts'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getTrackedFiles() {
  const output = git(['ls-files']);
  return output ? output.split(/\r?\n/) : [];
}

function isTextFile(file) {
  const basename = path.basename(file).toLowerCase();
  return textExtensions.has(path.extname(file).toLowerCase()) ||
    basename.startsWith('.env') ||
    /^settings.*\.json$/i.test(basename);
}

function readFile(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function pushFinding(findings, file, lineNumber, kind, message, line) {
  findings.push({
    file,
    lineNumber,
    kind,
    message,
    line: line.trim().slice(0, 180),
  });
}

function isClearlySanitizedExample(line) {
  return /\bexample\.(org|com|net)\b/i.test(line) ||
    /\$\{[A-Z0-9_]+\}/.test(line) ||
    /\b(replace|placeholder|changeme|change-me|smtp-user|smtp-password|secret|password-value)\b/i.test(line);
}

function scanTextFile(file, findings) {
  const text = readFile(file);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(line)) {
        if (isClearlySanitizedExample(line)) {
          continue;
        }
        pushFinding(findings, file, index + 1, 'secret', pattern.name, line);
      }
    }
    for (const pattern of privatePathPatterns) {
      if (pattern.regex.test(line)) {
        pushFinding(findings, file, index + 1, 'institution-specific', pattern.name, line);
      }
    }
  });
}

function scanRequiredFiles(findings, trackedFiles) {
  const trackedFileSet = new Set(trackedFiles);
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) {
      pushFinding(findings, file, 0, 'missing-artifact', 'required release artifact is missing', '');
      continue;
    }
    if (!trackedFileSet.has(file)) {
      pushFinding(findings, file, 0, 'untracked-artifact', 'required release artifact must be tracked for clean public checkouts', '');
    }
  }
}

function scanRequiredContent(findings) {
  for (const item of requiredContent) {
    const filePath = path.join(repoRoot, item.file);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const text = readFile(item.file);
    for (const check of item.checks) {
      if (!check.regex.test(text)) {
        pushFinding(
          findings,
          item.file,
          0,
          'missing-release-checklist-topic',
          `release checklist must mention ${check.name}`,
          '',
        );
      }
    }
  }
}

function getPathValue(source, keyPath) {
  return keyPath.split('.').reduce((current, part) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    return current[part];
  }, source);
}

function parseEnvExample(file) {
  const env = {};
  const text = readFile(file);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return env;
}

function scanSelfHostedSettingsAlignment(findings) {
  const settingsFile = 'deploy/settings.self-hosted.example.json';
  const envFile = 'deploy/.env.self-hosted.example';
  const referenceFile = 'docs/deployment/settings-reference.md';
  if (![settingsFile, envFile, referenceFile].every((file) => fs.existsSync(path.join(repoRoot, file)))) {
    return;
  }

  let settings;
  try {
    settings = JSON.parse(readFile(settingsFile));
  } catch (error) {
    pushFinding(findings, settingsFile, 0, 'invalid-settings-template', `settings example must parse as JSON: ${error.message}`, '');
    return;
  }

  const env = parseEnvExample(envFile);
  const reference = readFile(referenceFile);

  for (const key of requiredSelfHostedSettingsKeys) {
    if (getPathValue(settings, key) === undefined) {
      pushFinding(findings, settingsFile, 0, 'missing-settings-key', `settings example must include ${key}`, '');
    }
    if (!reference.includes(`\`${key}\``)) {
      pushFinding(findings, referenceFile, 0, 'missing-settings-reference', `settings reference must document ${key}`, '');
    }
  }

  for (const key of requiredSelfHostedEnvKeys) {
    if (!(key in env)) {
      pushFinding(findings, envFile, 0, 'missing-env-key', `.env self-hosted example must include ${key}`, '');
    }
    if (!reference.includes(`\`${key}\``)) {
      pushFinding(findings, referenceFile, 0, 'missing-env-reference', `settings reference must document ${key}`, '');
    }
  }
}

function scanFieldRegistryAudit(findings) {
  try {
    runMofactsNodeScript(['--experimental-strip-types', 'scripts/auditFields.ts']);
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
    const firstFailure = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('- ['));
    pushFinding(
      findings,
      'mofacts/scripts/auditFields.ts',
      0,
      'field-registry-audit',
      firstFailure || 'field registry audit failed',
      '',
    );
  }
}

function main() {
  const findings = [];
  const trackedFiles = getTrackedFiles();
  scanRequiredFiles(findings, trackedFiles);
  scanRequiredContent(findings);
  scanSelfHostedSettingsAlignment(findings);
  scanFieldRegistryAudit(findings);

  for (const file of trackedFiles) {
    if (!isTextFile(file)) {
      continue;
    }
    if (!fs.existsSync(path.join(repoRoot, file))) {
      continue;
    }
    scanTextFile(file, findings);
  }
  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(repoRoot, file)) && isTextFile(file) && !trackedFiles.includes(file)) {
      scanTextFile(file, findings);
    }
  }

  if (findings.length === 0) {
    console.log('Open-core readiness scan passed.');
    return;
  }

  console.error(`Open-core readiness scan found ${findings.length} issue(s):`);
  for (const finding of findings) {
    const location = finding.lineNumber > 0 ? `${finding.file}:${finding.lineNumber}` : finding.file;
    console.error(`- [${finding.kind}] ${location} - ${finding.message}`);
    if (finding.line) {
      console.error(`  ${finding.line}`);
    }
  }
  process.exit(1);
}

main();
