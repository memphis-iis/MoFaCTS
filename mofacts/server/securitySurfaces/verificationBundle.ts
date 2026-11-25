import { auditDigest } from '../../common/securityAudit/canonicalReport.ts';
import { MAX_VERIFICATION_BUNDLE_BYTES, parseVerificationBundle, type VerificationBundleV1 } from '../../common/securityAudit/verificationBundle.ts';
import { readEmbeddedSourceBytes } from '../securityAudit/securityAuditReceiverIdentity.ts';

const EMBEDDED_BUNDLE = '/opt/mofacts-verification-bundle.json';
type Observation = { state: 'unavailable'; reason: 'not-embedded' | 'malformed' } |
  { state: 'observed'; bundle: VerificationBundleV1; digestSha256: string };

export function createVerificationBundleLoader(
  readBytes: () => Promise<Buffer | undefined> = () => readEmbeddedSourceBytes(EMBEDDED_BUNDLE, MAX_VERIFICATION_BUNDLE_BYTES),
): () => Promise<Observation> {
  let pending: Promise<Observation> | undefined;
  return async () => {
    pending ??= (async () => {
      try {
        const bytes = await readBytes();
        if (bytes === undefined) return { state: 'unavailable', reason: 'not-embedded' };
        if (!bytes.length || bytes.length > MAX_VERIFICATION_BUNDLE_BYTES) throw Error('Invalid verification bundle length');
        const bundle = parseVerificationBundle(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        if (await auditDigest(bundle.profile) !== bundle.profileSha256) throw Error('Verification bundle profile mismatch');
        return { state: 'observed', bundle, digestSha256: await auditDigest(bundle) };
      } catch {
        return { state: 'unavailable', reason: 'malformed' };
      }
    })();
    return structuredClone(await pending);
  };
}
