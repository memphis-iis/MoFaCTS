import fs from 'node:fs/promises';
import path from 'node:path';
import {
  migrateTdfDeliverySettings,
  type DeliverySettingsMigrationWarning,
} from '../common/lib/deliverySettingsMigration.ts';

type JsonRecord = Record<string, unknown>;

export type ConfigDeliverySettingsConversionOptions = {
  configDir: string;
  write?: boolean;
  includeArchives?: boolean;
  removeLegacy?: boolean;
};

type Args = Required<ConfigDeliverySettingsConversionOptions>;

export type ConfigDeliverySettingsFileReport = {
  file: string;
  relativePath: string;
  changed: boolean;
  written: boolean;
  legacyFieldPaths: string[];
  deliverySettingsPaths: string[];
  warnings: DeliverySettingsMigrationWarning[];
};

export type ConfigDeliverySettingsConversionReport = {
  configDir: string;
  write: boolean;
  removeLegacy: boolean;
  scannedJsonFiles: number;
  skippedJsonFiles: number;
  tdfFiles: number;
  changedFiles: number;
  writtenFiles: number;
  warnings: number;
  files: ConfigDeliverySettingsFileReport[];
};

const DEFAULT_CONFIG_DIR = 'C:\\Users\\ppavl\\OneDrive\\Active projects\\mofacts_config';
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const ARCHIVE_DIRS = new Set(['internal_archive', 'mofacts_config']);

function usage(): string {
  return [
    'Usage:',
    '  node --experimental-strip-types scripts/convertConfigDeliverySettings.ts --config-dir "C:\\path\\to\\mofacts_config" [--write]',
    '',
    'Options:',
    '  --config-dir <path>   Config/content directory to scan. Defaults to MOFACTS_CONFIG_DIR, then the local known config path if present.',
    '  --write               Write converted JSON files. Without this, the script runs as a dry run.',
    '  --include-archives    Include internal/archive mirror directories.',
    '  --keep-legacy         Keep legacy deliveryparams/uiSettings while adding deliverySettings.',
  ].join('\n');
}

export function parseArgs(argv: string[]): Args {
  let configDir = process.env.MOFACTS_CONFIG_DIR || DEFAULT_CONFIG_DIR;
  let write = false;
  let includeArchives = false;
  let removeLegacy = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--config-dir') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('--config-dir requires a path.');
      }
      configDir = next;
      index += 1;
      continue;
    }
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--include-archives') {
      includeArchives = true;
      continue;
    }
    if (arg === '--keep-legacy') {
      removeLegacy = false;
      continue;
    }
    if (!arg.startsWith('-')) {
      configDir = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    configDir: path.resolve(configDir),
    write,
    includeArchives,
    removeLegacy,
  };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function hasTdfTutor(data: unknown): boolean {
  const root = asRecord(data);
  return Boolean(asRecord(asRecord(root.tdfs).tutor).setspec || asRecord(root.tutor).setspec);
}

function parseJsonFile(content: string): unknown {
  return JSON.parse(content.replace(/^\uFEFF/, '')) as unknown;
}

function wrapTdf(data: unknown): { wrapped: unknown; unwrap: (value: unknown) => unknown } {
  const root = asRecord(data);
  if (asRecord(asRecord(root.tdfs).tutor).setspec) {
    return {
      wrapped: data,
      unwrap: (value) => value,
    };
  }

  return {
    wrapped: { tdfs: data },
    unwrap: (value) => asRecord(value).tdfs,
  };
}

function collectFieldPaths(value: unknown, fieldNames: Set<string>, pathParts: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectFieldPaths(entry, fieldNames, [...pathParts, String(index)]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key];
    if (fieldNames.has(key)) {
      paths.push(nextPath.join('.'));
    }
    paths.push(...collectFieldPaths(entry, fieldNames, nextPath));
  }
  return paths;
}

const LEGACY_FIELD_NAMES = new Set(['deliveryparams', 'uiSettings']);
const DELIVERY_SETTINGS_FIELD_NAMES = new Set(['deliverySettings']);

async function findJsonFiles(dir: string, includeArchives: boolean, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || (!includeArchives && ARCHIVE_DIRS.has(entry.name))) {
        continue;
      }
      await findJsonFiles(entryPath, includeArchives, files);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function convertConfigDeliverySettingsDirectory(
  options: ConfigDeliverySettingsConversionOptions
): Promise<ConfigDeliverySettingsConversionReport> {
  const configDir = path.resolve(options.configDir);
  const write = options.write === true;
  const includeArchives = options.includeArchives === true;
  const removeLegacy = options.removeLegacy !== false;

  const stat = await fs.stat(configDir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Config directory does not exist: ${configDir}`);
  }

  const files = await findJsonFiles(configDir, includeArchives);
  const report: ConfigDeliverySettingsConversionReport = {
    configDir,
    write,
    removeLegacy,
    scannedJsonFiles: files.length,
    skippedJsonFiles: 0,
    tdfFiles: 0,
    changedFiles: 0,
    writtenFiles: 0,
    warnings: 0,
    files: [],
  };

  for (const file of files) {
    const before = await fs.readFile(file, 'utf8');
    const data = parseJsonFile(before);
    if (!hasTdfTutor(data)) {
      report.skippedJsonFiles += 1;
      continue;
    }

    report.tdfFiles += 1;
    const { wrapped, unwrap } = wrapTdf(data);
    const beforeLegacyFieldPaths = collectFieldPaths(wrapped, LEGACY_FIELD_NAMES);
    const migration = migrateTdfDeliverySettings(wrapped, { removeLegacy });
    const afterDeliverySettingsPaths = collectFieldPaths(migration.tdf, DELIVERY_SETTINGS_FIELD_NAMES);
    report.warnings += migration.warnings.length;

    const fileReport: ConfigDeliverySettingsFileReport = {
      file,
      relativePath: path.relative(configDir, file),
      changed: migration.changed,
      written: false,
      legacyFieldPaths: beforeLegacyFieldPaths,
      deliverySettingsPaths: afterDeliverySettingsPaths,
      warnings: migration.warnings,
    };
    report.files.push(fileReport);

    if (migration.changed) {
      report.changedFiles += 1;
    }
    if (migration.changed && write) {
      const next = `${JSON.stringify(unwrap(migration.tdf), null, 2)}\n`;
      await fs.writeFile(file, next, 'utf8');
      fileReport.written = true;
      report.writtenFiles += 1;
    }
  }

  return report;
}

function printReport(report: ConfigDeliverySettingsConversionReport): void {
  console.log(`${report.write ? 'Writing' : 'Dry run'} deliverySettings conversion for ${report.configDir}`);

  for (const file of report.files) {
    if (!file.changed && file.warnings.length === 0) {
      continue;
    }

    console.log(`\n${file.relativePath}`);
    if (file.changed) {
      console.log(`  ${file.written ? 'Wrote' : 'Would update'} canonical deliverySettings conversion.`);
    }
    if (file.legacyFieldPaths.length > 0) {
      console.log(`  Legacy fields found: ${file.legacyFieldPaths.join(', ')}`);
    }
    if (file.deliverySettingsPaths.length > 0) {
      console.log(`  deliverySettings after conversion: ${file.deliverySettingsPaths.join(', ')}`);
    }
    for (const warning of file.warnings) {
      console.log(`  ${warning.path}: ${warning.message}`);
    }
  }

  console.log('');
  console.log(`Scanned JSON files: ${report.scannedJsonFiles}`);
  console.log(`Skipped non-TDF JSON files: ${report.skippedJsonFiles}`);
  console.log(`TDF files: ${report.tdfFiles}`);
  console.log(`Changed TDF files: ${report.changedFiles}`);
  console.log(`Written TDF files: ${report.writtenFiles}`);
  console.log(`Warnings: ${report.warnings}`);
  if (!report.write && report.changedFiles > 0) {
    console.log('Dry run only. Re-run with --write to update files.');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await convertConfigDeliverySettingsDirectory(args);
  printReport(report);
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return Boolean(entryPath && path.basename(entryPath) === 'convertConfigDeliverySettings.ts');
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
