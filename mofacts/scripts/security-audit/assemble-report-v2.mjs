import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { auditTargetOrigin } from '../../common/securityAudit/reportV2.ts';
import { proofRecord, sourceCommit } from '../../common/securityAudit/proofFields.ts';
import { assembleAuditReportFilesV2, parseAuditFileV2, readAuditFileV2 } from './core/producerFilesV2.mjs';

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const runGit = promisify(execFile);

export async function runAssemblyCommandV2(args, env, execute = runGit) {
  if (args.length !== 3) throw new Error('V2 assembly requires metadata, producer directory and output paths');
  const target = auditTargetOrigin(env.AUDIT_TARGET);
  const [metadataPath, artifactDirectory, outputPath] = args;
  const metadata = proofRecord(parseAuditFileV2(await readAuditFileV2(metadataPath)), [
    'reportId', 'reportType', 'startedAt', 'completedAt', 'deployedApplicationRevision', 'deployedImageDigest', 'toolVersions',
  ]);
  const { stdout } = await execute('git', ['-C', sourceRoot, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 1024,
    env: {
      PATH: env.PATH, SystemRoot: env.SystemRoot, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    },
  });
  await assembleAuditReportFilesV2({ artifactDirectory, outputPath,
    envelope: { ...metadata, scannerSourceRevision: sourceCommit(stdout.trim()) },
    env: { AUDIT_TARGET: target } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runAssemblyCommandV2(process.argv.slice(2), process.env);
    process.stdout.write('V2 audit report assembled.\n');
  } catch {
    process.stderr.write('V2 audit assembly failed.\n');
    process.exitCode = 1;
  }
}
