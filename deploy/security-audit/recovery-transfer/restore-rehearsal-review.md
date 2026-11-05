# Recovery rehearsal: isolation decision

Status: Phil approved the isolated read-only cold restore (steps 1–2), one fresh
Meteor integration invocation and, if necessary for this security project, up to
ten additional invocations. Each invocation is reserved and counted in the
status ledger. The baseline transfer succeeded in `42024117227`; its access and
active workflow are retired. Reader 2f054211 passed complete CI 42028678398 and Security 42028678501.
The protected cold read 42030958930 passed on activation 6075b745: exact original
version/10,911-byte V1 document recovered, encrypted digest receipt retained,
original version/labels unchanged, and temporary access/workflow/environment
removed. The primary Meteor slot is used/passed; ten conditional slots remain.
Candidate writes, label changes and operational rehearsals remain unapproved.

## Approved: one isolated read-only cold restore

The approved execution covers only steps 1–2 below first. Use a temporary main-only
environment named `security-audit-recovery-rehearsal`, with no stored deployment
secrets, and temporary role `mofacts-recovery-restore`. The role may only describe,
list versions and read the exact existing secret in the already verified Ohio
account, using a 15-minute OIDC session and fixed trust/data deadline at most one
hour after enablement. It cannot write versions, change labels, access other
secrets or administer IAM. Preserve the shared OIDC provider.

Read only the explicit version retained privately for successful transfer
`42024117227`; require both original labels. The new reader uses the existing
optional SDK package and shared V1 validator. It accepts no GitHub `AUDIT_*` or
Tailscale deployment bindings, Desktop credential file or production target as
input. Keep the complete document in memory; retain only the bounded result,
version, encrypted complete-document digest and cleanup evidence. No individual credential
fingerprints, raw values, secret artifacts, Tailscale connection, provider login,
application login or production/staging request belongs in this cold read.

The reader is implemented in the existing optional package as `aws/run-restore.mjs`.
It reuses shared hosted-runner/OIDC and store checks and adds a read-only SDK
capability. Its [inactive workflow](restore-workflow.yml.review),
[trust policy](restore-trust-policy.example.json) and
[data policy](restore-permissions-policy.example.json) are captured supplemental
inputs. Keep the application manifest/lockfile and its normal dependency setup
unchanged. Explicit tool tests exercise actual SDK serialization with synthetic
responses before protected execution.

Verify the committed reader before enabling its access. Publication and the
newly authorized Meteor integration invocation provide normal complete CI;
the preceding SDK implementation's invocation remains spent. Then dispatch
one protected cold read after checks pass. Remove data permissions, deny trust,
delete the temporary role, disable/remove the active workflow and remove the
temporary empty GitHub environment on either outcome. No automatic retry.


The result retains the digest as RSA-OAEP-SHA256 ciphertext under the report
public key already contained in the recovered document. Only that 64-byte ASCII
whole-document hash is encrypted; the bundle itself is never emitted or uploaded.
State/version/byte/count metadata remain bounded. The existing report private key
stays outside the runner and backup, and is required to decrypt that receipt
later. Synthetic encryption/decryption is tested; this check does not establish
real report-private-key custody or decryption availability. This preserves private
digest retention despite public workflow logs without adding a credential source,
dependency, artifact or general encryption subsystem.

This establishes recoverability without GitHub deployment copies or this PC.
It does not prove provider credentials work, accept a rollback version, change
labels, create a candidate or perform the later staging2 operational rehearsal.
Steps 3–6 remain a later proposal and need their own concrete review/approval.
Any later candidate must satisfy the portable schema and truthful provenance;
do not add an unrecognized rehearsal field or forge a GitHub source identity.

This is the AWS rehearsal for Phil's selected operator store, not a mandatory
AWS procedure for all MoFaCTS installations. The
[approved separation direction](transport-decision.md#selected-separation-portable-bundle-optional-operator-tool)
requires portable bundle validation and a separately installed AWS tool. Other
stores need equivalent current/accepted-rollback restoration and credential
isolation evidence. The application must not acquire an AWS dependency through
this rehearsal.

## Next decision after the approved cold read: retained-version rehearsal

This later proposal is not authorized by the read-only approval. Recommend a
single storage-only rehearsal in the same secret, using the **existing**
`MOFACTS_RECOVERY_BASELINE` retention pin. Do not add a redundant verified-baseline
label or call this an accepted operational rollback configuration before its
separate operational checks.

On an isolated runner with explicitly approved, temporary one-secret access:
read the original exact version, create **one byte-identical complete copy** as a
new AWS candidate version, move `AWSCURRENT` to that candidate and verify that
the original baseline pin still references the original version. Recover both
explicit versions and compare every byte. Restore `AWSCURRENT` to the original
version and retire the test candidate's temporary label; preserve every original
label/version and all GitHub deployment copies. No provider/application login.
A candidate version may remain in AWS history after its test label is removed;
do not promise immediate version deletion or hide it from complete inventory.

This uses the same valid V1 document and truthful original provenance. Editing
an invented rehearsal field or forging a new GitHub origin would be invalid.
The future rehearsal reader must explicitly validate the two known version IDs
and reviewed label states instead of weakening the current one-version cold
reader or ignoring unexpected versions. The fresh writer would need only
read/describe/list, `PutSecretValue` and `UpdateSecretVersionStage` on this secret;
no secret deletion, IAM administration, other-secret access or static key.
Implement and verify the restoration/cleanup failure contract before enabling
any new write permission. Count any necessary new Meteor invocation against
Phil's remaining conditional allowance.

This proves storage retention and current-pointer recovery using an identical
configuration. It does not prove rollback between different configurations,
provider credential validity, report-private-key custody, historical recovery or
Phase 0 completion. Accepted operational rollback labeling and the staging2
consumer rehearsal remain later gates in the controlling plan.

## Why a decision is needed

The complete backup contains production-audit credentials. Staging2 has its own
smaller synthetic credential set. Loading the complete production bundle into
staging2 would cross that boundary. The selected recovery design still requires
current/retained-version recovery and staging2 operational verification; those
claims need distinct tests and honest evidence limits.

Recommendation: prove complete configuration recovery on a clean, isolated
GitHub runner using AWS alone, then use only staging2's own credentials for its
operational checks. This needs no additional Amazon server and does not change
the production deployment copies. It changes where the **complete** bundle is
recovered, so it is a design decision, not permission inferred from transfer.

## Concrete proposed scope

1. Create a temporary GitHub environment restricted to main, with **no saved
   deployment secrets**. Give its reviewed workflow short-lived OIDC access to
   read only the exact existing recovery secret. It cannot use the production
   audit environment, Desktop credential files or GitHub deployment copies as
   recovery inputs. Preserve the shared provider and other roles.
2. On a fresh hosted runner, recover the explicit transferred version from AWS
   into memory. Validate the complete document, source/version identity, binding
   inventory, original strings and size. Retain only bounded private metadata,
   including the whole-document digest; never retain individual-key fingerprints,
   raw values or plaintext artifacts. Do not join Tailscale, authenticate with
   recovered provider credentials, or contact application/provider targets.
3. Review the storage-only retention proposal above. Keep the existing baseline
   pin; accepting an operational rollback version remains a later decision.
4. If separately approved, create one byte-identical complete candidate version,
   temporarily move current to it, verify the original pin and recover both
   exact versions. Use no new document field or falsified source identity.
5. Restore original current and preserve the baseline pin. Retire only test-owned
   labels and account explicitly for the candidate remaining in version history.
6. Exercise the applicable staging2 recovery/consumer path with its own approved
   synthetic bindings. Record exactly which operational checks pass and which
   production-provider claims remain outside the test. Do not call a storage-only
   cold read a completed staging2 operational restore.
7. Remove the temporary data permissions/trust/role, active workflow and empty
   GitHub environment on completion or failure. Preserve private version/digest,
   read-back, label-survival, restoration and cleanup receipts. A failure stops
   the rehearsal; an uncertain write is reconciled before any retry. The named
   recovery owner is Phil, using the accepted independent AWS account access.

The runner would have only `GetSecretValue`, `DescribeSecret` and
`ListSecretVersionIds` on one exact secret. Candidate writes and label changes
would use the explicitly reviewed operator setup path; they are not permissions
in the existing transfer role. They require their own execution scope. The
existing one-secret monthly charge remains; versions have no separate storage
fee, with ordinary API charges still applicable. No static access key, runtime
AWS integration, custom KMS key, replica or credential rotation is proposed.

AWS documents that [custom labels retain their versions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/whats-in-a-secret.html)
and that [moving the current label also moves the previous label](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_UpdateSecretVersionStage.html).

## Acceptance boundaries

| Evidence | What it establishes | What remains separate |
| --- | --- | --- |
| Fresh runner, AWS-only complete recovery | Recovery does not depend on GitHub deployment copies or this PC | Actual provider authentication and application behavior |
| Retained baseline survives a candidate and both versions recover | Current/accepted-rollback storage and label procedure works | Historical input that was never located |
| Staging2 synthetic recovery/consumer checks | The named staging2 paths work with their own credentials | Production credentials and production-target probes |

Only the observed boundaries may be accepted. Full Phase 0 closure still requires
the controlling plan's remaining gates; this proposal does not waive them or
redefine a partial test as complete recovery.
