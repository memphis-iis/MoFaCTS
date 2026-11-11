import { fileURLToPath } from 'node:url';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { evidenceCommand } from '../../../../mofacts/scripts/security-audit/qualification/collectCiEvidence.mjs';
import { parseCiEvidenceJson } from '../../../../mofacts/scripts/security-audit/qualification/ciEvidence.mjs';
import { recoveryReadInputs } from './runner.mjs';
import { validateConfirmationCandidate } from './confirm.mjs';
import { operatorWindow, RECOVERY_OPERATOR } from './operator-policies.mjs';

const fail = category => { throw new RecoveryTransferError(category); };
const root = fileURLToPath(new URL('../../../../', import.meta.url));
export function recoveryOperatorInputs(env, runtime = { platform: process.platform, node: process.version }, now = new Date()) {
  if (runtime.platform !== 'linux' || runtime.node !== 'v24.22.1' || env.AWS_EXECUTION_ENV !== 'CloudShell'
    || env.AWS_REGION !== 'us-east-2' || env.AWS_DEFAULT_REGION !== 'us-east-2'
    || typeof env.PATH !== 'string' || !env.PATH.length || (env.NODE_OPTIONS ?? '') !== ''
    || Object.keys(env).some(key => /^(GITHUB_|ACTIONS_|RUNNER_)/.test(key)
      || ['NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
        'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE'].includes(key))) fail('operator-context');
  const { target, expected } = recoveryReadInputs(env);
  const candidateId = validateConfirmationCandidate(env.RECOVERY_CANDIDATE_VERSION_ID, expected);
  const window = operatorWindow(env.RECOVERY_ACCESS_DEADLINE, env.RECOVERY_OPERATION_ID, now);
  if (!/^[a-f0-9]{40}$/.test(env.RECOVERY_EXPECTED_COMMIT ?? '')) fail('operator-source');
  let uri;
  try { uri = new URL(env.AWS_CONTAINER_CREDENTIALS_FULL_URI); } catch { fail('operator-credentials'); }
  if (uri.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)
    || uri.username || uri.password || uri.search || uri.hash || uri.href.length > 2048
    || typeof env.AWS_CONTAINER_AUTHORIZATION_TOKEN !== 'string' || !env.AWS_CONTAINER_AUTHORIZATION_TOKEN.length
    || env.AWS_CONTAINER_AUTHORIZATION_TOKEN.length > 8192) fail('operator-credentials');
  const commandEnv = { PATH: env.PATH, LANG: 'C', LC_ALL: 'C', AWS_REGION: 'us-east-2', AWS_DEFAULT_REGION: 'us-east-2',
    AWS_EXECUTION_ENV: 'CloudShell', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_EC2_METADATA_DISABLED: 'true', AWS_PAGER: '', AWS_MAX_ATTEMPTS: '1',
    AWS_CONTAINER_CREDENTIALS_FULL_URI: uri.href, AWS_CONTAINER_AUTHORIZATION_TOKEN: env.AWS_CONTAINER_AUTHORIZATION_TOKEN };
  return { target, expected, candidateId, window, sourceCommit: env.RECOVERY_EXPECTED_COMMIT, commandEnv };
}

// AWS CLI owns its documented container provider. All alternate profile/static/
// instance providers are excluded. Output containing STS credentials stays in
// memory; stderr is bounded and discarded by the existing command runner.
export async function acquireRecoveryOperatorSession(input, { command = evidenceCommand, now = () => new Date() } = {}) {
  const { target, window, sourceCommit, commandEnv } = input;
  operatorWindow(window.deadline, window.runId, now());
  const plainEnv = { PATH: commandEnv.PATH, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const source = (await command('git', ['-C', root, 'rev-parse', 'HEAD'], 128, plainEnv)).toString().trim();
  const status = await command('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], 65536, plainEnv);
  if (source !== sourceCommit || status.length !== 0) fail('operator-source');
  const version = (await command('aws', ['--version'], 1024, plainEnv)).toString();
  // CloudShell manages CLI patch updates. The documented v2 command contract
  // is required; every identity and session response is validated below.
  if (!/^aws-cli\/2\.[0-9]+\.[0-9]+\s/.test(version)) fail('operator-context');
  const aws = async args => parseCiEvidenceJson(await command('aws', [...args, '--region', 'us-east-2',
    '--endpoint-url', 'https://sts.us-east-2.amazonaws.com', '--output', 'json', '--no-cli-pager',
    '--cli-connect-timeout', '10', '--cli-read-timeout', '20'], 32768, commandEnv), 32768);
  const identity = await aws(['sts', 'get-caller-identity']);
  if (identity?.Account !== target.accountId
    || identity.Arn !== `arn:aws:iam::${target.accountId}:user/${RECOVERY_OPERATOR}`) fail('aws-identity');
  operatorWindow(window.deadline, window.runId, now());
  const assumed = await aws(['sts', 'assume-role', '--role-arn', target.roleArn,
    '--role-session-name', window.sessionName, '--duration-seconds', '900']);
  const credentials = assumed?.Credentials, expiry = Date.parse(credentials?.Expiration), time = now().getTime();
  if (assumed?.AssumedRoleUser?.Arn !== `arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-restore/${window.sessionName}`
    || !credentials || !['AccessKeyId', 'SecretAccessKey', 'SessionToken'].every(key =>
      typeof credentials[key] === 'string' && credentials[key].length > 0 && credentials[key].length <= 16384)
    || !Number.isFinite(expiry) || !Number.isFinite(time) || expiry - time < 840000 || expiry - time > 960000
    || expiry > Date.parse(window.deadline)) fail('aws-session');
  return credentials;
}
