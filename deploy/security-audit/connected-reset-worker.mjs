import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withScannerMailHandoffV2 } from './connection/scannerClient.mjs';
import { fixtureNamespaceV2 } from '../../mofacts/scripts/security-audit/authentication/stagingFixturesV2.mjs';
import { captureCurrentResetV2 } from '../../mofacts/scripts/security-audit/authentication/currentResetV2.mjs';
import { createCurrentResetBrowserTransportV2 } from '../../mofacts/scripts/security-audit/authentication/currentResetBrowserV2.mjs';
import { parseResetMailboxBindingV2, readVerificationMailboxMessageV2 } from '../../mofacts/scripts/security-audit/authentication/mailboxV2.mjs';
import { captureUnusedExpiredResetV2 } from '../../mofacts/scripts/security-audit/authentication/expiredResetV2.mjs';
import { evaluateResetProtocol, unusedExpiredResetPrecondition } from '../../mofacts/common/securityAudit/resetProtocol.ts';
import { evaluateSourceVerificationVector } from '../../mofacts/common/securityAudit/authorizationVerification.ts';
import { RESET_PROTOCOL_VERIFICATIONS, AUTHENTICATION_RESET_POLICY } from '../../mofacts/common/securityAudit/verificationCatalog.ts';

const unavailable = () => new Error('Connected reset qualification requires owned recovery');

// Private operator control only. Actor credentials enter after the cloud reader
// is ready and the fixture owner creates the account under the held lease.
// Neither account-management credentials nor Gmail authority reach this worker.
export async function runConnectedResetWorkerV2({ namespace, deadlineMs, socketPath, leaseDirectory,
  scope = 'current', input = process.stdin, output = process.stdout }, dependencies = {}) {
  fixtureNamespaceV2(namespace);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= Date.now() || deadlineMs - Date.now() > 7200000) throw unavailable();
  if (!['current', 'protocol'].includes(scope) || scope === 'protocol' && deadlineMs - Date.now() < 3900000) throw unavailable();
  let pending, buffer = Buffer.alloc(0), failed = false;
  const reject = () => { failed = true; if (pending) { const current = pending; pending = undefined; current.reject(unavailable()); } };
  const receive = bytes => {
    try {
      if (failed || !pending || buffer.length + bytes.length > 65536) throw unavailable();
      const previous = buffer; buffer = Buffer.concat([buffer, bytes]); previous.fill(0);
      const end = buffer.indexOf(10); if (end < 0) return;
      if (end !== buffer.length - 1) throw unavailable();
      const frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end)));
      if (!frame || typeof frame !== 'object' || Array.isArray(frame) || frame.operation !== pending.operation) throw unavailable();
      const current = pending; pending = undefined; buffer.fill(0); buffer = Buffer.alloc(0); current.resolve(frame);
    } catch { reject(); }
  };
  const ask = operation => new Promise((resolve, fail) => {
    if (failed || pending || Date.now() >= deadlineMs) { fail(unavailable()); return; }
    pending = { operation, resolve, reject: fail };
    output.write(JSON.stringify({ operation, namespace }) + '\n', error => { if (error) reject(); });
  });
  input.on('data', receive); input.on('error', reject); input.on('end', reject); output.on('error', reject);
  const timer = setTimeout(reject, Math.max(1, deadlineMs - Date.now()));
  const own = dependencies.withHandoff ?? withScannerMailHandoffV2;
  const capture = dependencies.capture ?? captureCurrentResetV2;
  const captureExpiry = dependencies.captureExpiry ?? captureUnusedExpiredResetV2;
  const transportFactory = dependencies.transportFactory ?? createCurrentResetBrowserTransportV2;
  const launch = dependencies.launch ?? (async () => (await import('/opt/browser/node_modules/playwright/index.mjs')).chromium.launch({ headless: true }));
  try {
    const result = await own({ socketPath, leaseDirectory, namespace, deadlineMs,
      run: async ({ acquireMail, acquireVerificationMail, beginResetWindow, beginExpiryWindow, confirmMailLease }) => {
        let browser, owner, currentActorId, currentMetadataVerified = false;
        try {
          browser = await launch();
          const scenario = async (operation, alias, collect) => {
            const frame = await ask(operation);
            try {
              if (Object.keys(frame).sort().join(',') !== 'actor,newPassword,operation,verification') throw unavailable();
              const binding = parseResetMailboxBindingV2(frame.verification);
              if (binding.namespace !== namespace || binding.recipient !== frame.actor?.username || binding.deadlineMs > deadlineMs
                || !binding.recipient.endsWith(`+${namespace}-${alias}@gmail.com`)
                || alias === 'expiry' && frame.actor.userId === currentActorId) throw unavailable();
              if (alias === 'reset') currentActorId = frame.actor.userId;
              owner = transportFactory({ browser, target: 'https://staging2.optimallearning.org', actor: frame.actor });
              const mail = await acquireVerificationMail(binding);
              const capability = readVerificationMailboxMessageV2(binding, mail.metadata, mail.plainText);
              mail.plainText = '';
              let verification;
              try { verification = await owner.verifyEmail(capability.token); }
              finally { capability.token = ''; }
              if (verification?.state !== 'owned-fixture-email-verified' || verification.nativeVerificationSucceeded !== true
                || verification.ownedIdentityMatched !== true) throw unavailable();
              output.write(JSON.stringify({ operation: 'fixture-verified', actor: alias, verification, receipt: capability.receipt }) + '\n');
              await beginResetWindow();
              return await collect({ namespace, target: 'https://staging2.optimallearning.org', actor: frame.actor,
                newPassword: frame.newPassword, transport: owner.transport, acquireMail });
            } finally {
              frame.actor = null; frame.newPassword = null; frame.verification = null;
              await owner?.close(); owner = undefined;
            }
          };
          const current = await scenario('fixture-needed', 'reset', options => capture({ ...options,
            acquireMail: scope === 'current' ? acquireMail : async binding => {
              const mail = await acquireMail(binding), frame = await ask('current-age-needed');
              if (Object.keys(frame).sort().join(',') !== 'metadata,operation') throw unavailable();
              const metadata = frame.metadata;
              unusedExpiredResetPrecondition(metadata);
              if (!metadata.owned || !metadata.unused || metadata.lifetimeMs !== AUTHENTICATION_RESET_POLICY.lifetimeMs
                || metadata.ageMs > 120000 || metadata.remainingMs <= 0) throw unavailable();
              currentMetadataVerified = true; return mail;
            },
          }));
          if (scope === 'current') return current;
          const cases = RESET_PROTOCOL_VERIFICATIONS.filter(row => row.verificationId.startsWith('authn.reset.current.'));
          const vector = evaluateSourceVerificationVector(current.current.results.map(({ verificationId, outcome }) => ({ verificationId, outcome })), cases);
          if (!currentMetadataVerified || vector.status === 'ERROR' || vector.results.some(row => ['authn.reset.current.password-before', 'authn.reset.current.accepted'].includes(row.verificationId)
            && row.outcome !== 'ALLOWED')) throw unavailable();
          await beginExpiryWindow();
          const expiry = await scenario('expiry-fixture-needed', 'expiry', options => captureExpiry({ ...options, leaseDirectory, confirmMailLease,
            observeTokenAge: async () => {
              const frame = await ask('expiry-age-needed');
              if (Object.keys(frame).sort().join(',') !== 'metadata,operation') throw unavailable();
              return frame.metadata;
            },
          }));
          const protocol = evaluateResetProtocol({ bindingsVerified: true, environmentLeaseHeld: true,
            currentTokenOwned: true, currentTokenUnused: true, expiredToken: expiry.expiredToken,
            results: [...vector.results.map(({ verificationId, outcome }) => ({ verificationId, outcome })), ...expiry.results] });
          return { ...current, protocol, expiryDelivery: expiry.delivery };
        } finally {
          try { await owner?.close(); } finally { await browser?.close(); }
        }
      },
      verifyClean: async () => {
        const frame = await ask('cleanup-required');
        return Object.keys(frame).sort().join(',') === 'namespace,operation,verified'
          && frame.namespace === namespace && frame.verified === true;
      },
    });
    output.write(JSON.stringify({ operation: 'finished', result }) + '\n');
    return result;
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer); buffer.fill(0); pending = undefined;
    input.removeListener('data', receive); input.removeListener('error', reject); input.removeListener('end', reject);
    output.removeListener('error', reject); input.pause();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [namespace, rawDeadline, socketPath, leaseDirectory, scope = 'current', ...extra] = process.argv.slice(2);
  try {
    if (extra.length || process.version !== 'v24.22.1') throw unavailable();
    const result = await runConnectedResetWorkerV2({ namespace, deadlineMs: Number(rawDeadline), socketPath, leaseDirectory, scope });
    if (['current', 'session', 'lifetime'].some(key => !result?.[key] || result[key].status === 'ERROR')) process.exitCode = 1;
    if (scope === 'protocol' && ['current', 'replay', 'expired'].some(key => !result?.protocol?.[key] || result.protocol[key].status === 'ERROR')) process.exitCode = 1;
  } catch { process.stderr.write('Connected reset qualification incomplete; owned recovery may be required.\n'); process.exitCode = 1; }
}
