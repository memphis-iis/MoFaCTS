import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError,
  prepareRecoveryBundle, transferRecoveryBaseline, validateRecoveryTarget,
} from './recovery-transfer.mjs';

const fail = category => { throw new RecoveryTransferError(category); };

// Inactive CLI adapter: Linux Node child stdin is not a reopenable input file.
// The protected workflows are retired pending the reviewed transport decision.
// Never substitute secret-bearing argv or a plaintext file to activate it.
export function makeAwsClient(credentials, env, spawn = spawnSync) {
  return async (service, operation, request) => {
    const allowed = {
      sts: ['assume-role-with-web-identity', 'get-caller-identity'],
      secretsmanager: ['describe-secret', 'list-secret-version-ids', 'put-secret-value', 'get-secret-value'],
    };
    if (!allowed[service]?.includes(operation)) fail('aws-operation');
    const childEnv = {
      PATH: env.PATH, HOME: env.HOME, LANG: 'C.UTF-8',
      AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
      AWS_EC2_METADATA_DISABLED: 'true', AWS_MAX_ATTEMPTS: '1',
      AWS_CLI_AUTO_PROMPT: 'off', AWS_PAGER: '',
    };
    if (credentials) Object.assign(childEnv, {
      AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: credentials.SessionToken,
    });
    else if (operation !== 'assume-role-with-web-identity') fail('aws-session');
    let result;
    try {
      result = spawn('aws', [service, operation, '--region', 'us-east-2',
        '--endpoint-url', `https://${service}.us-east-2.amazonaws.com`,
        '--cli-input-json', 'file:///dev/stdin', '--output', 'json', '--no-cli-pager',
        '--cli-connect-timeout', '10', '--cli-read-timeout', '20',
        ...(operation === 'list-secret-version-ids' ? ['--no-paginate'] : []),
        ...(credentials ? [] : ['--no-sign-request']),
      ], { input: JSON.stringify(request), encoding: 'utf8', env: childEnv,
        timeout: 45000, maxBuffer: 512 * 1024, windowsHide: true });
    } catch { fail('aws-call'); }
    if (result.error || result.status !== 0 || result.signal) fail('aws-call');
    try { return JSON.parse(result.stdout); }
    catch { fail('aws-response'); }
  };
}

export async function runRecoveryTransfer(env, { fetchToken = fetch, spawn = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'linux' || process.version !== 'v24.22.1' || env.GITHUB_ACTIONS !== 'true'
    || env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== 'memphis-iis/MoFaCTS' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SHA !== env.RECOVERY_EXPECTED_COMMIT
    || env.GITHUB_WORKFLOW_REF !== `memphis-iis/MoFaCTS/.github/workflows/recovery-transfer.yml@refs/heads/main`
    || env.RUNNER_DEBUG === '1' || env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') fail('runner-context');
  const source = {
    repository: env.GITHUB_REPOSITORY, environment: 'production-security-audit',
    commit: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
  };
  const bindings = Object.fromEntries([...RECOVERY_SECRETS, RECOVERY_PUBLIC_VARIABLE].map(key => [key, env[key]]));
  const target = validateRecoveryTarget({
    accountId: env.RECOVERY_ACCOUNT_ID, roleArn: env.RECOVERY_ROLE_ARN, secretArn: env.RECOVERY_SECRET_ARN,
  });
  prepareRecoveryBundle(bindings, source); // No token or AWS request before validation.
  let token;
  try {
    const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com')
      || url.username || url.password || (url.port && url.port !== '443')
      || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) fail('oidc');
    url.searchParams.set('audience', 'sts.amazonaws.com');
    const response = await fetchToken(url, {
      headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    if (!response.ok || Buffer.byteLength(body) > 32768) fail('oidc');
    token = JSON.parse(body).value;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) fail('oidc');
  } catch { fail('oidc'); }
  const assumed = await makeAwsClient(null, env, spawn)('sts', 'assume-role-with-web-identity', {
    RoleArn: target.roleArn, RoleSessionName: `mofacts-recovery-${source.runId}`,
    WebIdentityToken: token, DurationSeconds: 900,
  });
  const credentials = assumed?.Credentials;
  if (!credentials || !['AccessKeyId', 'SecretAccessKey', 'SessionToken'].every(key =>
    typeof credentials[key] === 'string' && credentials[key].length > 0)) fail('aws-session');
  return transferRecoveryBaseline({ bindings, source, target, aws: makeAwsClient(credentials, env, spawn) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runRecoveryTransfer(process.env))}\n`); }
  catch (error) {
    // Never log upstream exceptions, AWS stderr, OIDC responses or binding values.
    const category = error instanceof RecoveryTransferError ? error.category : 'unexpected';
    process.stderr.write(`Recovery transfer stopped: ${category}; reconcile before retry\n`);
    process.exitCode = 1;
  }
}
