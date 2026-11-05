import { STSClient, AssumeRoleWithWebIdentityCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SecretsManagerClient, DescribeSecretCommand, ListSecretVersionIdsCommand,
  PutSecretValueCommand, GetSecretValueCommand, UpdateSecretVersionStageCommand } from '@aws-sdk/client-secrets-manager';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';

const fail = category => { throw new RecoveryTransferError(category); };
const operations = {
  sts: { 'assume-role-with-web-identity': AssumeRoleWithWebIdentityCommand, 'get-caller-identity': GetCallerIdentityCommand },
  secretsmanager: { 'describe-secret': DescribeSecretCommand, 'list-secret-version-ids': ListSecretVersionIdsCommand,
    'put-secret-value': PutSecretValueCommand, 'get-secret-value': GetSecretValueCommand },
};
const silentLogger = Object.freeze({ trace() {}, debug() {}, info() {}, warn() {}, error() {} });

// Requests and credentials remain in SDK memory. No CLI, profile, files or argv.
// A request handler can be injected by synthetic tests; endpoints are not inputs.
function transport(credentials, { requestHandler } = {}, retention = false) {
  if (credentials !== null && (!credentials || !['AccessKeyId', 'SecretAccessKey', 'SessionToken']
    .every(key => typeof credentials[key] === 'string' && credentials[key].length > 0))) fail('aws-session');
  return async (service, operation, request) => {
    const Command = retention && service === 'secretsmanager' && operation === 'update-secret-version-stage'
      ? UpdateSecretVersionStageCommand : Object.hasOwn(operations, service) && Object.hasOwn(operations[service], operation)
      ? operations[service][operation] : null;
    if (!Command) fail('aws-operation');
    if ((credentials === null) !== (operation === 'assume-role-with-web-identity')) fail('aws-session');
    const Client = service === 'sts' ? STSClient : SecretsManagerClient;
    const client = new Client({
      region: 'us-east-2', endpoint: `https://${service}.us-east-2.amazonaws.com`,
      useFipsEndpoint: false, useDualstackEndpoint: false,
      ignoreConfiguredEndpointUrls: true, defaultsMode: 'standard',
      retryMode: 'standard', maxAttempts: 1, logger: silentLogger,
      credentials: credentials === null ? async () => fail('aws-session') : {
        accessKeyId: credentials.AccessKeyId, secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      },
      requestHandler: requestHandler ?? {
        connectionTimeout: 10000, requestTimeout: 20000, throwOnRequestTimeout: true,
      },
    });
    try { return await client.send(new Command(request), { abortSignal: AbortSignal.timeout(45000) }); }
    catch { fail('aws-call'); }
    finally { client.destroy(); }
  };
}

export const makeAwsClient = (credentials, options) => transport(credentials, options);

// Only this reviewed capability can move current or retire the test marker.
// The baseline pin is never an editable label, even inside the exact-secret IAM grant.
export function makeAwsRetentionClient(credentials, options) {
  const aws = transport(credentials, options, true);
  return async (service, operation, request) => {
    if (operation === 'update-secret-version-stage' && !(
      request.VersionStage === 'AWSCURRENT' && /^[a-f0-9]{64}$/.test(request.MoveToVersionId ?? '')
        && /^[a-f0-9]{64}$/.test(request.RemoveFromVersionId ?? '')
      || request.VersionStage === 'MOFACTS_RECOVERY_CANDIDATE' && request.MoveToVersionId === undefined
        && /^[a-f0-9]{64}$/.test(request.RemoveFromVersionId ?? '')
    )) fail('aws-operation');
    if (operation === 'put-secret-value' && !(request.VersionStages?.length === 1
      && request.VersionStages[0] === 'MOFACTS_RECOVERY_CANDIDATE'
      && /^[a-f0-9]{64}$/.test(request.ClientRequestToken ?? '')
      && typeof request.SecretString === 'string' && request.SecretBinary === undefined)) fail('aws-operation');
    return aws(service, operation, request);
  };
}

// A separate capability for the cold reader; IAM independently denies writes.
export function makeAwsReadClient(credentials, options) {
  const aws = makeAwsClient(credentials, options);
  return async (service, operation, request) => {
    if (service === 'secretsmanager' && !['describe-secret', 'list-secret-version-ids', 'get-secret-value'].includes(operation)) fail('aws-operation');
    return aws(service, operation, request);
  };
}
