import { pathToFileURL } from 'node:url';
import { RECOVERY_PUBLIC_VARIABLE, RECOVERY_SECRETS, RecoveryTransferError, prepareRecoveryBundle } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { transferRecoveryBaseline, validateRecoveryTarget } from './transfer.mjs';
import { makeAwsClient } from './sdk-client.mjs';
const fail = category => { throw new RecoveryTransferError(category); };

export async function runRecoveryTransfer(env, { fetchToken = fetch, client = makeAwsClient, platform = process.platform } = {}) {
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
  const assumed = await client(null)('sts', 'assume-role-with-web-identity', {
    RoleArn: target.roleArn, RoleSessionName: `mofacts-recovery-${source.runId}`,
    WebIdentityToken: token, DurationSeconds: 900,
  });
  const credentials = assumed?.Credentials;
  if (!credentials || !['AccessKeyId', 'SecretAccessKey', 'SessionToken'].every(key =>
    typeof credentials[key] === 'string' && credentials[key].length > 0)) fail('aws-session');
  return transferRecoveryBaseline({ bindings, source, target, aws: client(credentials) });
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
