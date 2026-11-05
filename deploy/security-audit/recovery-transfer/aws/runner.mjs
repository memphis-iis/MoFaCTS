import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
const fail = category => { throw new RecoveryTransferError(category); };
export function assertRecoveryRunner(env, workflow, platform) {
  if (!['recovery-transfer.yml', 'recovery-restore.yml'].includes(workflow)) fail('runner-context');
  if (platform !== 'linux' || process.version !== 'v24.22.1' || env.GITHUB_ACTIONS !== 'true'
    || env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== 'memphis-iis/MoFaCTS' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_SHA !== env.RECOVERY_EXPECTED_COMMIT
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    || env.GITHUB_WORKFLOW_REF !== `memphis-iis/MoFaCTS/.github/workflows/${workflow}@refs/heads/main`
    || env.RUNNER_DEBUG === '1' || env.ACTIONS_STEP_DEBUG === 'true' || env.ACTIONS_RUNNER_DEBUG === 'true') fail('runner-context');
}

export async function assumeRecoverySession(env, target, sessionName, fetchToken, client) {
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
    RoleArn: target.roleArn, RoleSessionName: sessionName,
    WebIdentityToken: token, DurationSeconds: 900,
  });
  const credentials = assumed?.Credentials;
  if (!credentials || !['AccessKeyId', 'SecretAccessKey', 'SessionToken'].every(key =>
    typeof credentials[key] === 'string' && credentials[key].length > 0)) fail('aws-session');
  return credentials;
}
