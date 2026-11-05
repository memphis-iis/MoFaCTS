import assert from 'node:assert/strict';
import { target, credentials } from './sdk-fixtures.mjs';

// An in-memory AWS service model behind the real SDK HTTP protocol. It models
// version immutability, stage exclusivity and automatic AWSPREVIOUS movement.
export function retentionCloud({ baseline, runId, fault = () => {}, mutate = () => {} }) {
  const calls = [];
  const versions = new Map([[baseline.ClientRequestToken, { text: baseline.SecretString,
    labels: ['AWSCURRENT', 'MOFACTS_RECOVERY_BASELINE'] }]]);
  const base = { ARN: target.secretArn, Name: 'mofacts/security-audit/recovery' };
  const response = body => ({ response: { statusCode: 200,
    headers: { 'content-type': 'application/x-amz-json-1.1' }, body: Buffer.from(JSON.stringify(body)) } });
  const context = { calls, versions };
  return { ...context, handler: { metadata: { handlerProtocol: 'http/1.1' }, destroy() {},
    async handle(request) {
      assert.equal(request.hostname === 'sts.us-east-2.amazonaws.com'
        || request.hostname === 'secretsmanager.us-east-2.amazonaws.com', true);
      const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
      if (request.hostname === 'sts.us-east-2.amazonaws.com') {
        const input = new URLSearchParams(body);
        const operation = input.get('Action');
        calls.push({ operation, input: Object.fromEntries(input) });
        const fields = operation === 'AssumeRoleWithWebIdentity'
          ? '<Credentials><AccessKeyId>synthetic-access</AccessKeyId><SecretAccessKey>synthetic-secret</SecretAccessKey><SessionToken>synthetic-session</SessionToken><Expiration>2100-01-01T00:00:00Z</Expiration></Credentials>'
          : `<Account>${target.accountId}</Account><Arn>arn:aws:sts::${target.accountId}:assumed-role/mofacts-recovery-rehearsal/mofacts-retention-${runId}</Arn>`;
        return { response: { statusCode: 200, headers: { 'content-type': 'text/xml' },
          body: Buffer.from(`<${operation}Response><${operation}Result>${fields}</${operation}Result></${operation}Response>`) } };
      }
      assert.match(request.headers.authorization, /Credential=synthetic-access\//);
      assert.equal(request.headers['x-amz-security-token'], credentials.SessionToken);
      const operation = request.headers['x-amz-target'].split('.').at(-1);
      const input = JSON.parse(body);
      assert.equal(input.SecretId, target.secretArn);
      calls.push({ operation, input });
      fault('before', operation, input, context);
      let value;
      if (operation === 'DescribeSecret') value = { ...base, VersionIdsToStages:
        Object.fromEntries([...versions].filter(([, v]) => v.labels.length).map(([id, v]) => [id, [...v.labels]])) };
      else if (operation === 'ListSecretVersionIds') {
        assert.equal(input.IncludeDeprecated, true); assert.equal(input.MaxResults, 3);
        value = { ...base, Versions: [...versions].map(([id, v]) => ({ VersionId: id, VersionStages: [...v.labels] })) };
      } else if (operation === 'GetSecretValue') {
        const version = versions.get(input.VersionId);
        assert.equal(version.labels.includes(input.VersionStage), true);
        value = { ...base, VersionId: input.VersionId, SecretString: version.text, VersionStages: [...version.labels] };
      } else if (operation === 'PutSecretValue') {
        assert.equal(versions.has(input.ClientRequestToken), false);
        assert.deepEqual(input.VersionStages, ['MOFACTS_RECOVERY_CANDIDATE']);
        versions.set(input.ClientRequestToken, { text: input.SecretString, labels: [...input.VersionStages] });
        value = { ...base, VersionId: input.ClientRequestToken };
      } else {
        assert.equal(operation, 'UpdateSecretVersionStage');
        const removed = versions.get(input.RemoveFromVersionId);
        assert.equal(removed.labels.includes(input.VersionStage), true);
        removed.labels = removed.labels.filter(label => label !== input.VersionStage);
        if (input.MoveToVersionId) {
          versions.get(input.MoveToVersionId).labels.push(input.VersionStage);
          if (input.VersionStage === 'AWSCURRENT') {
            for (const v of versions.values()) v.labels = v.labels.filter(label => label !== 'AWSPREVIOUS');
            removed.labels.push('AWSPREVIOUS');
          }
        }
        value = base;
      }
      mutate(operation, value, context);
      fault('after', operation, input, context);
      return response(value);
    },
  } };
}
