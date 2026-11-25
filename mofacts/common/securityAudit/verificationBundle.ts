import { parseBuildIdentity, type BuildIdentityV1 } from './buildIdentity.ts';
import { auditDigest, canonicalAuditJson } from './canonicalReport.ts';
import { contentDigest, proofRecord, proofString } from './proofFields.ts';

export const MAX_VERIFICATION_BUNDLE_BYTES = 256 * 1024;
const MAX_EXECUTED_VERIFICATIONS = 1024;

export type VerificationProfile = {
  mode: 'test' | 'development' | 'production';
  meteorRelease: string;
};

type ExecutionLane = 'source-checks' | 'isolated-meteor' | 'github-ci';
type Outcome = 'PASS' | 'FAIL' | 'ERROR';
export type BundleExecution = {
  verificationId: string;
  lane: ExecutionLane;
  outcome: Outcome;
  runEvidenceSha256: string;
  resultEvidenceSha256: string;
};
export type VerificationBundleV1 = {
  schema: 'VerificationBundleV1';
  variant: 'source-evidence' | 'test-fixture';
  buildIdentity: BuildIdentityV1;
  profile: VerificationProfile;
  profileSha256: string;
  expectedRegistrySha256: string;
  verificationCatalogSha256: string;
  executions: BundleExecution[];
};
type ExpectedBundle = {
  buildIdentity: BuildIdentityV1;
  profileSha256: string;
  expectedRegistrySha256: string;
  verificationCatalogSha256: string;
  sourceVerificationIds: ReadonlySet<string>;
};

function parseProfile(value: unknown): VerificationProfile {
  const record = proofRecord(value, ['mode', 'meteorRelease']);
  const { mode } = record;
  if (mode !== 'test' && mode !== 'development' && mode !== 'production') throw Error('Invalid verification profile mode');
  return { mode, meteorRelease: proofString(record.meteorRelease, /^(?:METEOR@[a-zA-Z0-9_.-]+|unversioned)$/, 80) };
}

function parseExecution(value: unknown): BundleExecution {
  const entry = proofRecord(value, ['verificationId', 'lane', 'outcome', 'runEvidenceSha256', 'resultEvidenceSha256']);
  const { lane, outcome } = entry;
  if (lane !== 'source-checks' && lane !== 'isolated-meteor' && lane !== 'github-ci') throw Error('Invalid source execution lane');
  if (outcome !== 'PASS' && outcome !== 'FAIL' && outcome !== 'ERROR') throw Error('Invalid source execution outcome');
  return {
    verificationId: proofString(entry.verificationId, /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, 160),
    lane, outcome,
    runEvidenceSha256: contentDigest(entry.runEvidenceSha256),
    resultEvidenceSha256: contentDigest(entry.resultEvidenceSha256),
  };
}

export function parseVerificationBundle(value: unknown): VerificationBundleV1 {
  const record = proofRecord(value, ['schema', 'variant', 'buildIdentity', 'profile', 'profileSha256',
    'expectedRegistrySha256', 'verificationCatalogSha256', 'executions']);
  const { variant, executions } = record;
  if (record.schema !== 'VerificationBundleV1' || (variant !== 'source-evidence' && variant !== 'test-fixture')) {
    throw Error('Unsupported verification bundle schema or variant');
  }
  if (!Array.isArray(executions) || executions.length < 1 || executions.length > MAX_EXECUTED_VERIFICATIONS) {
    throw Error('Invalid verification bundle execution count');
  }
  const profile = parseProfile(record.profile);
  if (variant === 'test-fixture' && profile.mode !== 'test') throw Error('Fixture bundle requires a test profile');
  const entries = Array.from(executions, parseExecution);
  if (new Set(entries.map(row => row.verificationId)).size !== entries.length) throw Error('Duplicate verification in source bundle');
  entries.sort((left, right) => left.verificationId < right.verificationId ? -1 : left.verificationId > right.verificationId ? 1 : 0);
  const bundle = {
    schema: 'VerificationBundleV1', variant, buildIdentity: parseBuildIdentity(record.buildIdentity), profile,
    profileSha256: contentDigest(record.profileSha256),
    expectedRegistrySha256: contentDigest(record.expectedRegistrySha256),
    verificationCatalogSha256: contentDigest(record.verificationCatalogSha256),
    executions: entries,
  } satisfies VerificationBundleV1;
  if (new TextEncoder().encode(canonicalAuditJson(bundle)).length > MAX_VERIFICATION_BUNDLE_BYTES) {
    throw Error('Verification bundle exceeds its byte limit');
  }
  return bundle;
}

export async function digestVerificationBundle(value: unknown): Promise<string> {
  return auditDigest(parseVerificationBundle(value));
}

// This only joins the source-evidence claim to its expected inputs. Image,
// staging and live authorization evidence have separate owners and bindings.
export async function requireMatchingSourceVerification(value: unknown, expected: ExpectedBundle): Promise<VerificationBundleV1> {
  const bundle = parseVerificationBundle(value);
  if (bundle.variant !== 'source-evidence' ||
      canonicalAuditJson(bundle.buildIdentity) !== canonicalAuditJson(expected.buildIdentity) ||
      bundle.expectedRegistrySha256 !== expected.expectedRegistrySha256 ||
      bundle.profileSha256 !== expected.profileSha256 ||
      await auditDigest(bundle.profile) !== bundle.profileSha256 ||
      bundle.verificationCatalogSha256 !== expected.verificationCatalogSha256) {
    throw Error('Source verification bundle identity mismatch');
  }
  if (bundle.executions.length !== expected.sourceVerificationIds.size ||
      bundle.executions.some(entry => entry.outcome !== 'PASS' || !expected.sourceVerificationIds.has(entry.verificationId))) {
    throw Error('Source verification bundle does not cover passing required executions');
  }
  return bundle;
}
