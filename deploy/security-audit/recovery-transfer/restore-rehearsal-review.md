# Recovery rehearsal: isolation decision

Current status (2026-11-05): transfer, isolated cold read and the fresh two-version
confirmation have completed. Confirmation 42052500882 passed; failed mutation run
42036927727 stays failed. The original current/baseline pin and candidate previous
labels are verified and temporary access is retired. The primary Meteor run and
conditional slots 1-2 passed; eight conditional slots remain.

Use the [reconciled checklist](../../../docs-developer/security-audit-durable-redesign-status.md#reconciled-phase-0-checklist-2026-11-05)
as the current task list. The dated proposals/approvals below retain history;
their unspent/pending statements apply only to their original checkpoints.
Staging2's dedicated access test already passed separately. The later proposal
for another staging2 AWS backup was withdrawn and creates no new prerequisite.
Neither result proves production-provider validity or accepted operational
rollback; no further protected execution is implied.

## Approved: one isolated read-only cold restore

The approved execution covers only steps 1â€“2 below first. Use a temporary main-only
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
Steps 3â€“6 remain a later proposal and need their own concrete review/approval.
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


## Approved retention execution contract — 2026-11-05

Phil approved the bounded byte-identical candidate and current-pointer rehearsal.
Reserve conditional Meteor slot 1 of 10 for the committed implementation; one
protected retention invocation is authorized after checks pass. No protected
retry is inferred from the Meteor allowance. No application/provider logins,
staging2 consumer test, accepted operational rollback designation or production
change is authorized by this approval.

Use `aws/run-retention.mjs`, the inactive [workflow](retention-workflow.yml.review),
[trust](retention-trust-policy.example.json) and
[data policy](retention-permissions-policy.example.json). The temporary role is
`mofacts-recovery-rehearsal`, with the same empty main-only GitHub environment,
15-minute sessions and fixed trust/data deadline within one hour. IAM permits
stage edits only for `AWSCURRENT` and `MOFACTS_RECOVERY_CANDIDATE`, never the
baseline pin. PutSecretValue has no supported stage condition; the reviewed SDK
capability requires exactly the candidate label and a deterministic new version
ID. No new dependency or resource is needed.

The runner first verifies exactly the original version, pin, current label and
canonical V1 bytes. It creates one identical version without changing document
provenance, validates the candidate read-back, moves current once and recovers
both explicit versions while verifying the original pin. Complete values remain
in memory; the public receipt encrypts only the whole-document digest.

The transaction owns compensating recovery: after any mutation attempt, observe
both DescribeSecret and complete bounded ListSecretVersionIds inventories. Only
exact known states may be reconciled. If candidate is current, move it back to
the original once, observe the result, then remove only the test marker. Never
repeat an uncertain mutation, infer a missing owner, edit the baseline label or
ignore an extra version. A response failure remains a failed test even when
metadata proves restoration. An unknown state or failed restoration stops with
`reconciliation-required` for Phil; it is not a passing result. Retire access and
record the observed state on either outcome.

Successful final inventory has original `AWSCURRENT` plus baseline pin, and the
identical test version at `AWSPREVIOUS` without the candidate marker. The test
version remains in history. The original strict one-version bootstrap/cold reader
still refuses this two-version inventory; use this explicitly reviewed reader
for the rehearsal, never weaken the old checks to ignore history.

AWS documents [automatic previous-label movement and stage removal](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_UpdateSecretVersionStage.html)
and the [stage condition supported for UpdateSecretVersionStage](https://docs.aws.amazon.com/service-authorization/latest/reference/list_secretsmanager.html).


## Retention execution outcome — 2026-11-05

The one authorized protected attempt, 42036927727 on activation 60dd1e58,
failed final metadata observation after both versions were recovered and compared
successfully. It remains FAILED. Subsequent independent operator inventories and
the refreshed AWS Versions page verified the intended final state: original
current/baseline pin, identical test version only at previous, no test marker.
CloudTrail metadata records all three expected label changes successful; the
precise immediately mismatching response was not captured. Eventual consistency
is a supported explanation, not a proven raw-response diagnosis. No new repair
write or protected retry was made. Temporary role/data/trust access, workflow,
empty environment and owned policy files are retired; source credentials are
unchanged. Full evidence and cleanup-script corrections are in the status ledger.
CI/Security for a983d97e passed; conditional Meteor slot 1/10 passed, nine remain.
The existing writer's final-observation behavior is not live-qualified for reuse.

## Next decision: read-only confirmation of existing versions

Recommendation: approve publication of the cleanup/results despite the identified
failed required check, then prepare **one fresh AWS-only, read-only confirmation**
of the two already present versions. Do not create another candidate or move any
label. This preserves the failed run and avoids repeating successful mutations.

Concrete scope for approval:

1. Extend the optional tool with a separately named two-version read-only reader.
   Its metadata inputs are the trusted original version/provenance/byte receipt
   and this rehearsal's exact candidate ID; no credential values or deployment
   bindings are inputs. Preserve the original one-version readers unchanged.
2. Require exactly those two immutable versions and the observed final label
   sets. Recover both explicit versions into memory, validate the original V1
   shape/provenance/byte count, compare every byte, then re-observe the complete
   inventories. Emit only bounded metadata and an encrypted whole-document
   digest; no plaintext file, fingerprint or artifact.
3. Verify synthetic success/rejection cases, read-only SDK enforcement and complete
   source-capture wiring. Use the existing conditional Meteor allowance if needed,
   reserving/counting before publication; no new dependency or application change.
4. After checks pass, temporarily restore the same empty main-only GitHub
   environment and a read-only role limited to DescribeSecret, ListSecretVersionIds
   and GetSecretValue on the existing secret. Use a 15-minute OIDC session and
   fixed trust/data deadline within one hour. No write/label/deletion permission.
5. Dispatch **once**, remove temporary permissions/trust/role/workflow/environment
   on either outcome, and record independent results alongside failed 42036927727.
   A success does not rewrite that failed run or prove provider authentication,
   operational rollback between different configurations or staging2 recovery.

Future mutation tooling must account for AWS metadata visibility with bounded
read-only settling, exact known transition states and sanitized phase diagnostics;
never repeat an uncertain mutation or accept unexpected versions/pin movement.
That is separate from this proposed confirmation, which performs no mutation.
Do not activate new permissions or dispatch this follow-up until approved.


## Read-only confirmation approved — 2026-11-05

Phil approved cleanup/results publication despite the identified failed immediate
metadata check, and one read-only confirmation under the concrete scope above.
Preserve the failed run and its evidence. Use only the existing two versions;
no version creation, stage edit, application/provider login or deployment. The
new temporary access is limited to the three named reads, with a 15-minute
session and fixed expiry within one hour. Verify implementation before enabling
access and count any needed Meteor invocation against the nine remaining slots.


The approved reader is `aws/run-confirm.mjs`; the
[inactive confirmation workflow](confirm-workflow.yml.review) has ten explicit
metadata inputs, including the prior candidate version ID. It reuses the
read-only cold-reader role/trust/data policy and SDK capability. The exact final
inventory is checked before and after both reads; canonical V1 validation and
whole-document encrypted digest handling share the original helpers. No mutation
or automatic retry is present. Conditional Meteor slot 2/10 is reserved for this
implementation before protected access is enabled.


## Approved confirmation completed — 2026-11-05

The single protected read-only run 42052500882 passed on activation ab92fdcd,
with reader 60dfd6f0 and matching passing CI/Security 42048015246/42048015262.
Both exact existing complete 10,911-byte V1 documents were recovered into memory,
validated and compared byte for byte. Exact original current/baseline pin and
candidate previous labels were verified in complete inventories before and after.
No version or stage mutation occurred. The bounded receipt contains an encrypted
whole-document digest, never plaintext; no artifact was uploaded. Real private-key
custody/decryption and provider/application logins remain untested.

Three-read exact-secret access, trust, role, active workflow, empty main-only
environment and owned policy files were removed/absence checked; shared provider,
original environments, source credential metadata, versions and labels are
preserved. Conditional Meteor slot 2/10 passed; eight remain. Failed mutation run
42036927727 stays failed; future mutation verification still needs its explicit
visibility contract. This completes the approved read-only follow-up only.
Operational rollback acceptance and staging2 consumer recovery are later gates;
no production-audit credential may be loaded into staging2 under this scope.


## Metadata verification repair (2026-11-05; source verification only)

The optional retention transaction now waits for each reviewed metadata
transition through bounded read-only observations. Each observation checks the
complete DescribeSecret and ListSecretVersionIds maps independently, including
all immutable version IDs and the original baseline pin. Only the exact source
or intended target phase is accepted while waiting; unknown versions, labels,
pagination or configuration changes fail immediately. Success requires both
views to reach the target. There are at most eight paired observations with
9.75 seconds of pauses per settling operation; no mutation or payload read is
retried. The strict read-only confirmation keeps its immediate exact-state check.

Compensation first proves the target of the last attempted write. Cached source
metadata cannot establish that a write with a lost response never happened. An
unconfirmed target exhausts the read budget and remains reconciliation-required;
it does not trigger a repeated write or guessed cleanup. A failed write response
still makes the rehearsal fail even when metadata later proves safe recovery.
Bounded result metadata now preserves the original failure category, a separate
reconciliation failure category and the last verified phase; it contains no
secret values or raw SDK diagnostics.

Verification: all 32 optional-tool tests passed on Windows and the dedicated
Ubuntu-MoFaCTS Linux environment with pinned Node 24.22.1; optional-tool ESLint,
full application lint and source-security tests passed. Synthetic SDK fixtures
cover delayed/disagreeing views through every transition, permanently stale
metadata, uncertain writes and at-most-once compensation. The existing explicit
source-capture input list already includes every changed module/test.
No Meteor invocation, cloud grant, protected execution, application image or
provider call was needed. These checks repair the source verification contract;
they do not live-qualify a future writer. Run 42036927727 remains FAILED. The
successful separate read-only confirmation and retired-access evidence stand.
Any future protected writer use needs its own reviewed authorization and baseline.
