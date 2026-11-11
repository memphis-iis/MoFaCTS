import readPolicy from '../restore-permissions-policy.example.json' with { type: 'json' };
import { validateRestoreTarget } from './restore.mjs';
import { RecoveryTransferError } from '../../../../mofacts/scripts/security-audit/recovery-transfer.mjs';
import { canonicalAuditJson } from '../../../../mofacts/common/securityAudit/canonicalReport.ts';

export const RECOVERY_OPERATOR = 'mofacts-recovery-operator';
const fail = () => { throw new RecoveryTransferError('operator-contract'); };
export function operatorWindow(deadline, runId, now = new Date()) {
  const time = now.getTime(), expiry = Date.parse(deadline);
  if (typeof deadline !== 'string' || !Number.isFinite(time) || !Number.isFinite(expiry)
    || new Date(expiry).toISOString() !== deadline || expiry - time < 900000 || expiry - time > 3600000
    || typeof runId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(runId)) fail();
  return { deadline, runId, sessionName: `mofacts-inventory-${runId}` };
}

// One exact principal, one expiring grant and the existing three-read policy.
// This renders data only; it does not create users, passwords, keys or permissions.
export function recoveryOperatorBootstrapPolicy({ target, deadline, runId }, now = new Date()) {
  validateRestoreTarget(target); operatorWindow(deadline, runId, now);
  return { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: [
    'cloudshell:CreateEnvironment', 'cloudshell:CreateSession', 'cloudshell:GetEnvironmentStatus',
    'cloudshell:StartEnvironment', 'cloudshell:PutCredentials', 'cloudshell:DescribeEnvironments',
  ], Resource: '*', Condition: { DateLessThan: { 'aws:CurrentTime': deadline },
    StringEquals: { 'aws:RequestedRegion': 'us-east-2' }, Bool: { 'aws:MultiFactorAuthPresent': 'true' } } }] };
}

export function recoveryOperatorPolicies({ target, deadline, runId, environmentId }, now = new Date()) {
  validateRestoreTarget(target);
  const window = operatorWindow(deadline, runId, now);
  if (typeof environmentId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(environmentId)) fail();
  const operatorArn = `arn:aws:iam::${target.accountId}:user/${RECOVERY_OPERATOR}`;
  const expires = { DateLessThan: { 'aws:CurrentTime': window.deadline } };
  const assume = { ...expires, Bool: { 'aws:MultiFactorAuthPresent': 'true' },
    StringEquals: { 'sts:RoleSessionName': window.sessionName } };
  const userPolicy = { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Action: ['cloudshell:CreateSession',
      'cloudshell:GetEnvironmentStatus', 'cloudshell:StartEnvironment', 'cloudshell:PutCredentials',
      'cloudshell:DeleteEnvironment'], Resource: `arn:aws:cloudshell:us-east-2:${target.accountId}:environment/${environmentId}`,
    Condition: { ...expires, StringEquals: { 'aws:RequestedRegion': 'us-east-2' },
      Bool: { 'aws:MultiFactorAuthPresent': 'true' } } },
    { Effect: 'Allow', Action: 'cloudshell:DescribeEnvironments', Resource: '*',
      Condition: { ...expires, StringEquals: { 'aws:RequestedRegion': 'us-east-2' }, Bool: { 'aws:MultiFactorAuthPresent': 'true' } } },
    { Effect: 'Allow', Action: 'sts:AssumeRole', Resource: target.roleArn, Condition: assume },
  ] };
  const trustPolicy = { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Principal: { AWS: operatorArn }, Action: 'sts:AssumeRole', Condition: assume },
  ] };
  const rolePolicy = structuredClone(readPolicy);
  rolePolicy.Statement[0].Resource = target.secretArn;
  rolePolicy.Statement[0].Condition.DateLessThan['aws:CurrentTime'] = window.deadline;
  return { operatorArn, userPolicy, trustPolicy, rolePolicy };
}

// Cleanup requires the creation receipt and exact current identities. Name reuse,
// extra credentials/associations, policy drift or an unrelated MFA device stops it.
export function verifyRecoveryOperatorCleanup({ target, deadline, runId, created, current }, now = new Date()) {
  const activatedAt = new Date(created?.activatedAt);
  if (!Number.isFinite(activatedAt.getTime()) || !Number.isFinite(now.getTime()) || activatedAt.getTime() > now.getTime()) fail();
  // Expired access must remain removable. Reconstruct the originally reviewed
  // grant at its recorded activation, rather than demanding a fresh live lease.
  const expected = recoveryOperatorPolicies({ target, deadline, runId, environmentId: created.environmentId }, activatedAt);
  if (created?.operatorArn !== expected.operatorArn || created.roleArn !== target.roleArn
    || !/^AIDA[A-Z0-9]{17}$/.test(created.userId ?? '') || !/^AROA[A-Z0-9]{17}$/.test(created.roleId ?? '')
    || current?.userArn !== created.operatorArn || current.userId !== created.userId
    || current.roleArn !== created.roleArn || current.roleId !== created.roleId
    || current.accessKeyCount !== 0 || current.groupCount !== 0 || current.attachedUserPolicyCount !== 0
    || current.attachedRolePolicyCount !== 0
    || canonicalAuditJson(current.userInlinePolicyNames) !== canonicalAuditJson([RECOVERY_OPERATOR])
    || canonicalAuditJson(current.roleInlinePolicyNames) !== canonicalAuditJson(['mofacts-recovery-restore'])
    || !Array.isArray(current.mfaSerials) || current.mfaSerials.length !== 1
    || current.mfaSerials[0] !== created.mfaSerial
    // AWS assigns FIDO registrations a generated suffix in the u2f/user ARN
    // namespace, including WebAuthn keys. Bind the recorded registration to
    // this account/user/name and require its exact current association above.
    || typeof created.mfaSerial !== 'string' || created.mfaSerial.length > 256
    || !new RegExp(`^arn:aws:iam::${target.accountId}:u2f/user/${RECOVERY_OPERATOR}/${RECOVERY_OPERATOR}-key-[\\w+=,.@-]+$`).test(created.mfaSerial)) fail();
  for (const key of ['userPolicy', 'trustPolicy', 'rolePolicy']) {
    if (canonicalAuditJson(current[key]) !== canonicalAuditJson(expected[key])) fail();
  }
  return { userName: RECOVERY_OPERATOR, roleName: 'mofacts-recovery-restore', mfaSerial: created.mfaSerial };
}
