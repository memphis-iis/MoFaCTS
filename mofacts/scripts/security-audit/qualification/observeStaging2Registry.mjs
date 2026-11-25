import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAuthorizationActorPageV2, validateAuthorizationActorPageV2 } from '../authentication/browserV2.mjs';
import { parseAuthorizationActorBindingV2 } from '../authentication/bindingsV2.mjs';
import { parseCiEvidenceJson } from './ciEvidence.mjs';
import { readCiFile, writeNew } from './collectCiEvidence.mjs';
import { compareRuntimeVerification } from './compareRuntimeVerification.mjs';
import { canonicalAuditJson } from '../../../common/securityAudit/canonicalReport.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle } from '../../../common/securityAudit/verificationBundle.ts';
import { verificationBundleHash } from './imageVerificationBundle.mjs';

const stagingOrigin = 'https://staging2.optimallearning.org';
const maxResponseBytes = 600 * 1024;

// Compare the installed registry through the existing administrator method in
// a private browser session. Only the bounded result leaves this function.
export async function observeStaging2Registry(page, adminUserId, expected) {
  const requireActor = async () => {
    if (await validateAuthorizationActorPageV2(page, stagingOrigin, 'admin', adminUserId) !== 'matched') {
      throw Error('Staging2 registry administrator session did not match');
    }
  };
  await requireActor();
  const json = await page.evaluate(async ({ origin, adminUserId, maxResponseBytes }) => {
    const matches = () => location.origin === origin && globalThis.Meteor.status().connected && globalThis.Meteor.userId() === adminUserId;
    if (!matches()) throw Error('Staging2 registry actor changed');
    let timeout;
    try {
      const value = await Promise.race([
        globalThis.Meteor.callAsync('admin.securityAudits.surfaceInventory'),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Staging2 registry observation timed out')), 10000); }),
      ]);
      const text = JSON.stringify(value);
      if (!matches() || typeof text !== 'string' || new TextEncoder().encode(text).length > maxResponseBytes) throw Error('Invalid staging2 registry observation');
      return text;
    } finally { clearTimeout(timeout); }
  }, { origin: stagingOrigin, adminUserId, maxResponseBytes });
  await requireActor();
  return compareRuntimeVerification(parseCiEvidenceJson(Buffer.from(json), maxResponseBytes), expected);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [adminFile, bundleFile, resultFile] = process.argv.slice(2);
  try {
    if (process.argv.length !== 5 || !adminFile || !bundleFile || !resultFile) throw Error();
    const admin = parseAuthorizationActorBindingV2(parseCiEvidenceJson(await readCiFile(adminFile, 4096), 4096));
    const bundleBytes = await readCiFile(bundleFile, MAX_VERIFICATION_BUNDLE_BYTES);
    const bundle = parseVerificationBundle(parseCiEvidenceJson(bundleBytes, MAX_VERIFICATION_BUNDLE_BYTES));
    if (bundle.variant !== 'source-evidence' || !bundleBytes.equals(Buffer.from(canonicalAuditJson(bundle)))) throw Error();
    const expected = { buildIdentity: bundle.buildIdentity, profile: bundle.profile,
      inventorySha256: bundle.expectedRegistrySha256, bundleDigestSha256: verificationBundleHash(bundleBytes) };
    const browser = await (await import('playwright')).chromium.launch({ headless: true });
    try {
      const { page } = await openAuthorizationActorPageV2({ browser, target: stagingOrigin, actor: 'admin', binding: admin });
      if (!page) throw Error();
      const result = await observeStaging2Registry(page, admin.userId, expected);
      await writeNew(resultFile, Buffer.from(canonicalAuditJson(result) + '\n'));
    } finally { await browser.close(); }
  } catch {
    process.stderr.write('Staging2 runtime registry did not match the retained build proof.\n');
    process.exitCode = 1;
  }
}
