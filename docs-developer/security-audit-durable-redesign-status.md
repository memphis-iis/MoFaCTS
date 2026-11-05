# Security Audit Durable Redesign Status

Last baseline with passing CI, Security and image checks: `2f05421196c2803e41363caf967637bf520c5a2a`.
Selected deployed staging2 application: `65875553c4f0fd37adfc407774bd4e7ff998ccfc`;
auditor policy: `c7444b4e`. Their evidence and image identities remain separate.

## Isolated read-only cold restore verified and retired (2026-11-05)

The single approved cold read, [run 42030958930](https://github.com/memphis-iis/MoFaCTS/actions/runs/42030958930),
passed on activation `6075b745c55b79276c9c6b224da14d4c86fd2932`, using reader
`2f054211` and its matching successful CI `42028678398` / Security `42028678501`.
The pre-binding tool install/audit/16 tests/lint passed on the fresh hosted runner.
The temporary environment contained zero saved secrets/variables and allowed
only main. No audit/Tailscale deployment binding, Desktop credential file or
provider/application target was a reader input.

The runner obtained its own short-lived OIDC session and recovered the exact
immutable baseline from AWS: **10,911 UTF-8 bytes, 9 secret bindings and 1 public
variable**, with recorded source commit/run/attempt, original labels and complete
canonical V1 validation. Before/after complete version inventories and metadata
checks passed. It produced a bounded unqualified-cold-read result and an
RSA-OAEP-SHA256 ciphertext of the whole-document digest under the recovered report
public key. No plaintext bundle, hash, individual-key fingerprint, secret file or
artifact was emitted/retained. The encrypted receipt is retained privately; actual
report-private-key decryption/custody was not tested. Synthetic decryption passed.

Removed the only reader policy, read back denied trust, simulated all seven
read/write actions denied, deleted the role and verified absence. Simulation is
not an actual replay of an issued session. AWS still lists the same sole original
version with AWSCURRENT and MOFACTS_RECOVERY_BASELINE, and the shared provider is
unchanged. Disabled/removed the active workflow. After checking its ID and zero
secret/variable counts, deleted the owned temporary GitHub environment and
verified only the original environments remain. Removed three owned metadata-only
policy files and ended CloudShell. Source deployment-binding names/update times
still match the frozen pre-transfer inventory; no source credential was changed.

Private cold-read, CI/source/image, encrypted-receipt and cleanup records plus a
non-secret successful-run screenshot live under the existing cold-restore-1
release-evidence directory. The verified CI source digest is
99ed01a543d12697ca83726d3ab35a14d29da8402e1ab833ff3f299293284df7, with CI image
config digest sha256:0239296f32baa589f57e7cd330b1fbfd37a9faebf5f0cc06e713f9fa8073fe43
(linux/amd64). These are CI observations, not an application release/deployment.

**New allowance balance:** primary Meteor 1/1 invoked and passed; conditional
additional Meteor 0/10 invoked, all ten still available if necessary for this
project. Protected cold read 1/1 used and passed; no automatic cold-read retry.
Outcome/documentation publication uses [skip ci] and consumes no extra invocation.
Unrelated working changes remain preserved.

The next real decision is the [storage-only retained-version rehearsal](../deploy/security-audit/recovery-transfer/restore-rehearsal-review.md#next-decision-after-the-approved-cold-read-retained-version-rehearsal):
use the existing baseline pin, create one byte-identical candidate, exercise
current-pointer movement and recovery of both explicit versions, restore original
current, and retire test-owned labels/access. This requires new explicit approval
for writes/label changes and a reviewed bounded two-version contract. It has not
been implemented or executed. No redundant baseline label, forged provenance,
accepted operational rollback label or production/provider login was introduced.
Provider credential validity, report-key custody, changed-configuration rollback,
staging2 consumer recovery and the remaining Phase 0 gates are still separate.

## Cold-reader preflight and single-run activation (2026-11-05)

Reader commit 2f054211 passed complete CI 42028678398 and Security 42028678501.
The primary new Meteor invocation passed; all ten conditional additional slots
remain unused. Source/capture/ABI/topology/startup/cleanup and retained-source
checks passed. The helper/policies/reviewed YAML are unchanged from that commit.

AWS metadata preflight verified the same account/store, sole exact baseline and
both original labels, managed encryption, no resource policy/rotation/replicas,
absent old transfer/restore roles and preserved shared provider. Created the
approved temporary GitHub environment with main-only branch policy and zero
secrets/variables. The repository OIDC subject remains unchanged. Created the
read-only role with fixed trust/data expiry 2026-11-05T13:34:58Z; read-back matches
the exact reviewed policies with no other permissions. IAM simulation allowed
all three reads and denied put/version-label update/deletion/rotation. These
are permission-model observations, not a replay with issued session credentials.

Prepared the active workflow from the verified inert review; parsed YAML is
identical. Activation and these records use [skip ci]; no second Meteor run.
The single protected cold read is reserved for this activation; no result yet.
The complete document digest will be retained encrypted under the existing
report public key, with no plaintext bundle/hash, deployment bindings, provider
login, candidate write or label change. Always retire permissions/trust/role,
workflow, empty environment and owned metadata-only policy files after outcome.
The next retention proposal remains unapproved; unrelated edits are preserved.

## Cold-restore execution and new integration allowance (2026-11-05)

Phil approved the isolated read-only cold restore, one fresh Meteor integration
invocation and, if needed for this security project, **up to ten more**. This
creates one primary slot plus ten conditional slots (11 maximum), separate from
all exhausted earlier allowances. This explicit bounded authorization supersedes
the usual fresh-per-invocation rule only within that cap/project. Reserve before
publication/dispatch, count failed invocations too, and never silently renew it.
It does not authorize production/provider logins, candidate writes, label changes,
new dependencies/spending or an automatic second protected cold-read attempt.

| Allowance | Reserved / used and evidence |
| --- | --- |
| Primary fresh Meteor invocation | 1 invoked on 2f05421196c2803e41363caf967637bf520c5a2a, CI 42028678398 / attempt 1. Test passed at 2026-11-05T12:42:45Z (975 server/1,237 client passes, zero failures/hooks, 22 pending). Complete CI, including canonical image identity/ABI/topology/startup/cleanup and retained-source protection, passed. |
| Up to 10 additional project invocations, only if needed | 0 reserved, 0 invoked of 10. Do not use merely to repeat passing checks. |
| Isolated protected cold restore | 1/1 used and passed: 42030958930, activation 6075b745. Exact version/canonical data recovered, encrypted digest retained, original state preserved and access/workflow/environment cleanup verified. No retry authorized. |

Implemented the reader and kept it outside application dependencies/build context.
Shared store checks and hosted-runner/OIDC exchange are reused by transfer and
restore. The new SDK capability rejects writes before sending; the reviewed IAM
policy independently grants only describe/list/get on one exact secret. The
reader rejects audit/Tailscale deployment bindings and ambient credential inputs,
checks the recorded immutable version/source/byte count, validates canonical V1
serialization and original strings, and emits only an encrypted whole-document digest plus
bounded counts/version/result. The digest is RSA-OAEP-SHA256 ciphertext under
the recovered report public key; neither plaintext hash nor bundle is logged.
Synthetic receipt decryption passed. Real report-private-key custody is separate. The fresh run has no production/provider/staging2
login behavior. The digest is first observed from the immutable stored version;
it is not a separately recorded original-source digest or a provider-authentication
check. The initial transfer already established exact source/write/read-back.

The inactive workflow/policies and new reader/shared helpers/tests are explicit
supplemental capture inputs. Normal application CI still installs no AWS tool.
Local optional-tool tests passed all 16 cases and dependency audit reports zero
vulnerabilities. Full lint passed. The first source-suite run failed in an existing
WSL Apache-hostname subprocess assertion; targeted rerun passed without code/test
changes. Full source re-run passed (72 passed/6 Windows skips); capture passed (92 passed/6 Windows skips). No source or test change was needed to resolve the transient WSL invocation failure.
Security 42028678501 passed all four jobs; complete CI 42028678398 passed on
2f054211. Its separate source/image observations bind the clean reader commit.
The CI image config digest is sha256:0239296f32baa589f57e7cd330b1fbfd37a9faebf5f0cc06e713f9fa8073fe43
(linux/amd64). This remains a CI observation, not a published/deployed release. Unrelated changes are preserved.

## SDK baseline transfer verified and access retired (2026-11-05)

The single authorized SDK attempt, [run 42024117227](https://github.com/memphis-iis/MoFaCTS/actions/runs/42024117227)
on activation `7c0e126b34d8fc4753767f3d8a3b0b9e9efd3621`, completed successfully.
The helper, policies and reviewed YAML are unchanged from the fully verified
`62ae8fe3` implementation. Its pre-binding install/audit/tests/lint passed, then
OIDC/session identity, destination configuration, complete input validation,
write and exact read-back passed. The serialized document contains **10,911 UTF-8
bytes**, **9 secret bindings** and **1 public variable**. It remains a new
`github-current-unqualified` baseline with no historical rollback available.
GitHub masked the JSON braces in its result log; retained only the complete
bounded result fields and cross-checked the deterministic version against AWS
metadata. No raw log or credential value was retained.

Cleanup removed the only inline data policy, read back denied trust, simulated
all four data operations as denied, deleted the role and verified `NoSuchEntity`.
This is not an actual replay of an issued session. Complete AWS version listing
including deprecated versions showed exactly one version with the exact expected
ID and `AWSCURRENT` plus `MOFACTS_RECOVERY_BASELINE`. The shared provider remains
unchanged. Disabled the workflow and removed its active source file; removed the
three owned metadata-only policy files and ended CloudShell. No AWS resource
other than the already approved recovery secret is left by this attempt.

Before/after GitHub secret/public-variable names and update timestamps match the
frozen source inventory. Credentials and the stored SSH key were not changed,
normalized, displayed or written to a plaintext file/artifact. Retained version,
byte/count, run, source, cleanup and non-secret version-table screenshot evidence
privately under the existing `sdk-1` release-evidence directory. The browser's
version table also shows the sole baseline version and both labels.

Both single-use SDK execution allowances are now spent; no automatic transfer
or Meteor retry is authorized. The next real decision is the
[isolated cold-restore scope](../deploy/security-audit/recovery-transfer/restore-rehearsal-review.md#approved-one-isolated-read-only-cold-restore):
recover this exact version on a fresh runner with no GitHub deployment-secret
bindings, in-memory validation only, narrowly scoped temporary AWS read access,
then cleanup. That proposal has not been implemented or executed. Candidate
writes, accepted-rollback labels, production/provider logins and staging2
operational rehearsal remain separate. Phase 0 remains open.

This result/cleanup publication uses `[skip ci]`; the implementation retains the
passing CI `41962552310` and Security `41962552268`. No extra Meteor invocation,
application image publication or production/original-staging/staging2 deployment
was performed. Unrelated working edits remain untouched.

## SDK transfer preflight and activation (2026-11-05)

Phil reported AWS ready and asked to continue the authorized transfer. Chrome
reconnected to the expected account; CloudShell read-only preflight verified
account identity, zero versions including deprecated versions, managed encryption,
no resource policy/rotation/replicas, absent old role and preserved shared OIDC
provider. GitHub source names/update timestamps still match the frozen inventory;
main-only environment access and the default OIDC subject are unchanged. CI
41962552310 and Security 41962552268 remain successful on 62ae8fe3; the reviewed
transfer source/policies/workflow draft are byte-unchanged from that commit.

Enabled the same one-secret temporary role with fixed trust/data deadline
`2026-11-05T13:01:19Z`. The setup response parser stopped after successfully
attaching the policy because that AWS CLI mutation has an empty success response.
Did not repeat setup, extend access or dispatch a transfer blindly. Read-only
reconciliation verified exact trust and inline policy, no other policies, and
zero destination versions. The owned metadata-only policy directory is retained
privately for cleanup. No secret values or AWS session credentials were read.

Prepared the active workflow from the tested inactive review; parsed YAML is
identical. This activation and record use `[skip ci]` and consume no additional
Meteor invocation. The one SDK transfer is reserved for this activation; no
transfer result is claimed yet. Always reconcile outcome and retire data access,
trust, role and workflow after the single attempt. Unrelated edits stay outside
this batch.

## Optional AWS SDK execution authorization (2026-11-05 UTC)

Phil approved the two SDK clients **only in the optional operator tool**, one
fresh Meteor integration invocation and one protected transfer after verification
passes. This is a new single-use allowance, separate from the exhausted five-run
ledger below. Reserve the integration before publication. Do not retry either
execution automatically. Normal application setup/CI must not install the tool.

| Execution | Reservation and outcome |
| --- | --- |
| Meteor integration, one invocation | Used on 62ae8fe3226314f55f02a0da4d349228f1d1bbc2, CI 41962552310 / attempt 1. Complete CI passed, including Test at 2026-11-05T03:39:29Z and canonical image identity/ABI/topology/startup/cleanup. Recorded Meteor run exitStatus is 0. No second invocation authorized. |
| Protected transfer, one attempt | Used once: 42024117227 on activation 7c0e126b; successful exact transfer/read-back, one expected version/labels, and complete access/workflow cleanup verified. No retry authorized. |

Implemented the shared portable bundle/AWS operations split. The optional private
package pins STS and Secrets Manager clients to 3.1162.0, with its own lockfile;
the application manifest and lockfile are unchanged. Removed the old CLI entry
point. AWS requests use fixed regional HTTPS endpoints, explicit sessions,
one SDK attempt and bounded timeouts. The shared validator can validate a
recovered V1 document without AWS operations, preserving every credential string.

Local checks: full lint passed; source suite 71 passed/6 Windows skips; capture
suite 92 passed/6 Windows skips; optional tool 10 tests passed, including actual
SDK serialization/signing against synthetic HTTP responses, OIDC exchange,
environment poisoning, exact round-trip, fail-before-network and sanitized errors.
Tool dependency audit reports zero vulnerabilities. No real credentials used in
these tests. Security 41962552268 passed all four jobs; CI 41962552310 passed both
typechecks, source/capture/protection contracts and Meteor. Its source observation
binds the clean SDK commit. Canonical Compose image identity/ABI/topology/
startup/cleanup and retained-source protection passed. Docker capture used the committed ignore
rule excluding the optional tool, while supplemental capture retained its exact
reviewed source without installed dependencies. Neither new client is in the
application lockfile. Cloud transfer acceptance remains pending. The inactive
workflow now explicitly installs/tests/audits/lints the tool before any protected
binding step. Source/capture ownership includes its
exact source/manifests/lockfile/tests as supplemental inputs. This does not add
AWS installation to normal application CI. Unrelated working edits are preserved.

The AWS preflight is waiting for the approved Chrome/CloudShell connection.
Browser inventory currently exposes only IAB and MCP Apps, with no Chrome
connection (rechecked after CI started). Phil was asked to reconnect; no alternate
profile or authentication source was substituted and the protected transfer remains unused.

CI source observation and separate image observation both bind the clean SDK
commit and source digest `a92a4df72db514a6a283001efa1f6a1a9eb6b47a8c42f7533a7174a943b1c106`.
The CI image config digest is
`sha256:35856311e95818520691e961f36101ade49860b71d182540c2e0b09619a8234c`
(`linux/amd64`). This is a CI image observation, not a published or deployed
release qualification. Meteor recorded server 975 passed/0 failed/15 pending and
client 1,237 passed/0 failed/7 pending, with zero hook failures on both sides.
Bounded evidence is retained privately under the existing release-evidence root.

The source implementation is committed/pushed as `62ae8fe3`. This follow-up
records outcomes with `[skip ci]`: no second Meteor invocation, active transfer
workflow, AWS role, cloud mutation, credential copy or application deployment.
The single protected transfer remains available under Phil's approval, subject
to fresh AWS/source preflight once the approved Chrome/CloudShell connection is
restored. Current credentials and the stored SSH key remain unchanged. The last
verified AWS destination was empty; no current usable backup or accepted rollback
copy is claimed. The later restore-rehearsal decision has not been reached.

## Integration authorization ledger and resumed execution (2026-11-04)

Phil explicitly authorized **up to five Meteor integration invocations** and asked
for a written record and continued work until a real decision point. This bounded
instruction supersedes the usual per-invocation approval rule for these five
invocations only. Earlier runs, including `41768076041`, are outside this new
allowance. Each actual invocation, including a failed invocation or retry, counts;
reserve a slot before publishing/dispatching a run and avoid duplicate dispatches.

Current allowance: **5 invoked of 5; no slots remain**. Correction CI
`41928890309` passed all Meteor/image checks; do not retry or dispatch
another integration without new permission. CI `41877424659`
completed successfully on the protected-transfer draft. Count each allocated
run conservatively against the cap until its actual invocation outcome is recorded.

| Slot | Commit | CI run / attempt | Meteor invocation and outcome |
| --- | --- | --- | --- |
| 1 | `65875553c4f0fd37adfc407774bd4e7ff998ccfc` | `41824718448` / 1 | Meteor integration and complete CI image/ABI/topology/startup/cleanup checks passed. Matching Security run `41824718440` passed all four jobs. |
| 2 | `c7444b4ec6c33feed1156f8eafb95a21320170da` | `41828857886` / 1 | Complete CI including Meteor/image checks passed. Matching Security run `41828857969` passed all four jobs. |
| 3 | `c4276fafeb3ac1ffad3003f9d57f63b2ba6237ef` | `41844153544` / 1 | Meteor integration and complete canonical image/ABI/topology/startup/cleanup checks passed. Security `41844153368` passed all four jobs. No Meteor retry. |
| 4 | `d5e8f70524854cb20e9586d2816de3832847cd79` | `41877424659` / 1 | Complete CI passed, including Meteor, both typechecks, capture/protection, canonical Compose image identity/ABI/topology/startup/cleanup. Security `41877424480` passed all four jobs. No retry. |
| 5 | `3d1008b0a7081768ceda5119be311a16bfa1ca03` | `41928890309` / 1 | Complete CI passed: Meteor, both typechecks, capture/protection and canonical Compose image identity/ABI/topology/startup/cleanup. Security `41928890286` passed all four jobs. No retry. |

Update this ledger with actual invocation start/completion and outcome as execution proceeds.
The continuation approves publication of the locally verified follow-up to the
reported image-collector failure. It does not waive failed acceptance checks,
authorize production/original-staging operations, new dependencies/spending or
unrelated changes. Staging2 deployment remains gated on passing required checks.

### AWS optionality accepted; separation plan revised (2026-11-05 UTC)

Phil approved revising the plan so AWS remains optional and separate from the
application. The [revised transport plan](../deploy/security-audit/recovery-transfer/transport-decision.md)
now assigns AWS-only code and the two proposed SDK clients to a separately
installed private operator-tool package under
`deploy/security-audit/recovery-transfer/aws/`. The prior proposal to add the
clients to `mofacts/package.json` is superseded. Normal application dependency
installation, testing, builds and runtime must not install or require this tool.
The existing optional S3 asset-storage feature is unchanged by this plan.

Inspection confirmed `MoFactsRecoveryBundleV1` has no AWS location/version fields,
but `recovery-transfer.mjs` mixes its validation with AWS storage logic. Validation
also imports the existing CI JSON parser, whose import closure includes `acorn`
and repository modules. The plan preserves shared validation and its existing
dependencies rather than claiming a dependency-free core or copying a parser.
AWS-only tests/installation will be explicit; shared bundle tests must run with
the tool absent. Build-context exclusion and supplemental capture/test closure
are acceptance checks, not properties inferred from the proposed folder layout.

Only planning documents changed in this continuation. No new package, SDK
dependency, workflow, credential access, CI invocation, AWS mutation or deployment
was created. The last observed destination state remains empty; it was not
re-queried during this documentation task. The next real decision is permission
to add the two SDK clients solely to the optional tool and implement the revised
split, together with fresh integration/transfer authorization before execution.
The spent five-run allowance and single retry are not renewed by plan approval.

### Authorized retry stopped; transport decision required (2026-11-05 UTC)

The single authorized corrected retry, [run 41941983320](https://github.com/memphis-iis/MoFaCTS/actions/runs/41941983320),
on `da8bdb957cd0669b29dd113be75aae2ce1bcb707`, passed source validation and
stopped at `aws-call`. No version was written. The corrected SSH validator and
unchanged stored key are separate from this transport failure. Complete CI and
Security on `3d1008b0` passed; all five Meteor invocations are spent.

Synthetic-only reproduction under pinned Node 24.22.1 in Ubuntu-MoFaCTS showed
that Node child stdin is a Unix socket and reopening `/dev/stdin` fails with
ENXIO. A Bash anonymous-pipe prototype passed a substitute reader but failed the
actual AWS CLI's offline skeleton validation in CloudShell (Node 20.20.2). AWS's
CLI source has two input-file loading paths; a one-shot stream cannot satisfy
both. The prototype and its tests were discarded. No credential files or raw
upstream errors were retained. This diagnosis is not a successful AWS transfer.

Removed the temporary data policy, read back denied trust, simulated denial for
all four data operations, and deleted the role. `GetRole` confirmed absence;
complete version listing including deprecated versions returned zero. Simulation
is not a replay of an issued session. The shared provider is preserved. Disabled
the workflow and removed its active file; removed the owned temporary policy
files and ended CloudShell. The existing empty paid destination is preserved,
but is **not a usable backup**. GitHub source metadata remains unchanged.

The [transport review](../deploy/security-audit/recovery-transfer/transport-decision.md)
recommends official STS and Secrets Manager JavaScript clients. Their two new
development dependencies require approval before implementation; one fresh
Meteor invocation and one further protected transfer also need authorization.
No SDK dependency, third transfer or restore rehearsal was executed. Phase 0
remains open. Cleanup/review publication uses `[skip ci]` and does not assert
release qualification for a working transfer transport. Unrelated working edits
remain outside this batch.

### CloudShell recovered; exact retry setup verified (2026-11-04)

AWS's documented CloudShell restart restored its container-delivered credentials;
STS again confirmed the expected account. A fresh CLI preflight proved the role
absent and destination still empty before enabling any new access. The expired
preparation had never created a role, so no existing grant was extended. Created
the authorized retry role with a new fixed trust/data-access deadline
`2026-11-05T01:23:58Z`. Read-back verified exact reviewed trust/permissions,
no other policies, the exact managed-encryption empty destination and absence of
resource policy, rotation and replicas. Source secret/public-variable names and
update timestamps still match the frozen inventory. The shared provider is
unchanged. Private retry setup receipts contain only these bounded facts.

Prepared the same reviewed transfer workflow for the one authorized corrected
retry; parsed YAML is semantically identical. Only its activation comment and
operator records change on publication, so this activation uses `[skip ci]` and
does not consume another Meteor invocation. Helper/policy code remains the fully
verified `3d1008b0` implementation. No retry dispatch/result is claimed yet.

### Correction fully verified; retry setup reconciliation (2026-11-04)

Correction CI `41928890309` completed successfully, including all image,
topology, startup and cleanup steps. Matching Security `41928890286` passed all
four jobs. No further Meteor allowance remains. The stored GitHub key is
unchanged; the corrected implementation has not yet used the single approved
transfer retry.

Prepared fresh temporary-policy metadata after CI passed, with a fixed expiry
`2026-11-05T00:00:10Z`. Browser control interrupted the subsequent create/attach
command, so it was not repeated blindly. A fresh console tab in the same account
showed the complete eight-role inventory and an exact-name search returned
**0 matches / No matches** for `mofacts-recovery-transfer`; the role was not
created. The prepared expiry elapsed without an enabled grant. Do not renew an
existing grant or infer that a transfer occurred. No active transfer workflow or
AWS credential transfer has been dispatched for this retry.

CloudShell's metadata commands then failed to obtain container-delivered
credentials. Retained only fixed error-class flags (container-credential and
metadata retrieval, without a key/token/error body); no profile, certificate or
network error was indicated. AWS's signed-in IAM console still worked in the
expected account. The documented CloudShell restart was initiated for the
temporary Ohio environment after verifying that no role had been created.
Recheck the resulting session/account and destination before any mutation;
do not substitute the workstation's unverified CLI profile, create static
credentials or repeat the data-transfer attempt while setup is unresolved.

### Correction published; fifth Meteor passed, image checks pending (2026-11-04)

Published the narrow validator correction as
`3d1008b0a7081768ceda5119be311a16bfa1ca03`. Normal CI `41928890309` passed lint,
both full typechecks, source/capture contracts and Meteor integration; its
canonical Compose image build/checks remain in progress at this checkpoint.
Security `41928890286` passed all four jobs. All five authorized Meteor
invocations are now used; no duplicate or retry is permitted under that budget.

Read-only retry preflight passed in the expected AWS account through the
approved CloudShell session: existing destination still empty, managed
encryption/no resource policy/rotation/replicas, temporary role absent, and shared
provider preserved. Chrome's old connection was replaced by a freshly discovered
connection to the same existing AWS tab/account. Its embedded CloudShell widget
failed to load after reconnection; the service's full CloudShell page works and
its actual STS account was verified. No credential source was substituted and no
new temporary AWS access is enabled while image checks are pending. Refreshed
GitHub subject and main-only environment rule are unchanged. Independently
validated the existing public report key as RSA of at least 3072 bits, without
logging its PEM or reading a private key.

### Format-only diagnosis confirmed terminal-LF mismatch; correction in verification (2026-11-04)

Published diagnostic activation `1fb354a154496e05123eb64d8856ed3669b0ba19` and
ran exactly one format-only workflow:
[`41928332920`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41928332920),
completed successfully. Its fixed flags report OpenSSH header/footer present,
RSA-PEM/PKCS8 boundaries absent, terminal LF absent, and CR/escaped LF absent.
Only those ten booleans were retained privately; no value, substring, length,
fingerprint or key file was emitted. Disabled the diagnostic and removed its
active workflow source; no AWS/OIDC access was granted to it.

This confirms the stored GitHub binding lacks terminal LF, while the existing
production consumer adds LF with `printf '%s\n'`. Corrected only the backup
validator's stored-string boundary contract: accept the same LF-only OpenSSH
binding with or without one terminal LF and preserve its exact original bytes.
Missing/corrupt boundaries, CRLF, escaped newlines and trailing other bytes still
fail. Added regression coverage for exact write/read-back preservation of both
representations and negative malformed cases. No GitHub credential was edited,
rotated, normalized or republished. No deployment/SSH materialization changed.
Reserve the fifth authorized Meteor invocation for normal push CI on this
locally verified correction; do not create AWS access or use the single approved
transfer retry until its required checks pass.

Local full lint passed, retaining **323 surfaces**. Full source-security suite
passed **77/83 with six documented Windows-only platform skips**, including
write/read-back preservation with and without final LF and malformed-input
denials. No TypeScript-bearing app change was made; normal CI will run both
ordinary full typechecks and the reserved Meteor/image checks. Public recovery
guidance now names the GitHub binding's optional terminal LF and assigns key-file
materialization to the existing production consumer. No TDF/config contract or
user-facing behavior changed; dependent config/wiki edits are unnecessary.

### Format-only diagnostic and one corrected transfer retry approved (2026-11-04)

Phil explicitly approved the prepared format-only diagnostic, correction of a
confirmed validator mismatch **without changing the stored key**, and exactly
one transfer retry after verification, then continuation to the next real
decision. This does not authorize key rotation/normalization or another retry
after that attempt. The original backup destination/cost and bounded temporary
access/cleanup design remain approved. Meteor allowance is separate: four of
five invocations used, one remains. Activate only the reviewed single-binding
diagnostic, with no OIDC/AWS permission; remove it after its one run.

### First transfer stopped at source validation; access cleanup verified (2026-11-04)

Published activation `7d9239da16d7ba742a22eca2b51335b321f0b103` and dispatched
exactly one protected workflow:
[`41893149595`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41893149595).
It ran on a hosted runner and completed with the bounded failure category
`ssh-key-format`. Dependency/tool preparation passed. This failure occurs in
`prepareRecoveryBundle` before OIDC/STS or any AWS request from the transfer
helper; it did not write a backup version. No automatic retry was issued and no
input value, credential substring or raw upstream error was retained.

Cleanup completed under the approved success-or-failure procedure: removed the
sole data-access policy, replaced the allow trust with explicit deny, verified
zero attached/inline policies and exact denied trust, and simulated all four
secret operations as denied. This is IAM-simulator evidence, not a claim to have
tested an issued GitHub AWS session. Deleted the temporary role and verified
`NoSuchEntity`. Verified the shared GitHub provider/audience remains unchanged
and the secret has **zero versions**, including deprecated versions. Removed
only the three owned metadata-policy files under the checked temporary path and
ended the CloudShell session. Disabled the active GitHub workflow and removed
its tracked source; retained its reviewed inactive template and immutable run.

The nine source secret names/update timestamps and sole public variable's
metadata are unchanged from before the attempt. Minimized private target,
setup, CI, run/failure and cleanup metadata is retained under native
`C:\Users\ppavl\MoFaCTS-Release-Evidence\aws-recovery-transfer-20261104`.
The credential-free console screenshot `empty-backup-status.png` visibly shows
the selected Ohio secret with **No secret versions**. No credential file or
plaintext backup was created. The approximately $0.40/month destination exists
but is empty and does not yet protect the configuration; Phase 0 remains open.

Source review found a concrete contract difference: production's existing
workflow adds LF via `printf '%s\n'` while materializing its key file, whereas the
new backup validator requires an LF-terminated, LF-only OpenSSH string in the
stored binding. The single failure category cannot establish which format/line
ending differs. Do not infer missing LF, declare the existing key invalid, alter
the stored bytes or weaken validation speculatively.

Prepared an inactive, single-binding, format-only diagnostic review: ten fixed
boolean flags, no key content/length/fingerprint/artifact, no OIDC or AWS access,
and main/manual/expected-commit gates. YAML permission/binding/output checks and
eight synthetic cases passed locally without protected input. No diagnostic run
or correction has been executed. Next review is one format-only diagnostic,
correction for a confirmed consumer-contract mismatch preserving all source
bytes, required verification and one new transfer attempt with fresh temporary
access/cleanup. A credential change remains a separate decision if needed.
This records failed operational input validation and removes temporary tooling;
it does not publish a bypass or claim transfer acceptance. No application/helper
code changed, so no new Meteor run was needed: **4 of 5 used, 1 remains**.
Existing unrelated working changes are preserved.

### CI/Security prerequisites passed; approved transfer setup verified (2026-11-04)

The previously queued runs now report complete success on the reviewed source
`d5e8f705`: CI `41877424659` passed every required application, Meteor and image
step; Security `41877424480` passed all four jobs. Repository Actions are enabled,
with no pending environment approval or reported billing restriction. The
completed-job start/end timestamps conflict with the earlier queued observations,
so delayed status reporting is a plausible explanation, not a demonstrated
repository defect. No runner/configuration/budget change or retry was made.
One existing upload-artifact action emitted a non-blocking Node 20 deprecation
notice while executing under forced Node 24; no check failed.

Under the recorded cost/access/transfer approval, opened CloudShell in the
verified account/Ohio console and independently checked its actual STS account.
Created the one empty `mofacts/security-audit/recovery` secret with managed
encryption and no value, rotation, replica, tags or resource policy. Preserved
the existing shared GitHub OIDC provider. Created the dedicated temporary role
from the reviewed templates, with identical trust/data-access deadline
`2026-11-04T19:54:28Z` and exactly four operations on the exact new secret ARN.
Read-back proved exact trust and inline permissions, no other attached/inline
policies, no resource policy and no versions, including deprecated versions.
Private target/setup/source-inventory metadata is retained in the native
`aws-recovery-transfer-20261104` evidence directory, without credential values.

Prepared the authorized one-time active workflow by copying the reviewed YAML
and replacing only its inactive-review comment. Parsed YAML comparison proves
semantic identity with the tested draft. Publishing this workflow/documentation
activation uses `[skip ci]`: application/helper/policy code is unchanged from the
passing reviewed source; no fifth Meteor invocation is needed for this copy.
Dispatch one manual transfer on its exact published commit, then verify result
and remove permissions/trust/temporary role and active workflow on success or
failure. Real credential transfer/read-back and cleanup are not yet claimed.

### Recovery transfer execution approved; prerequisite CI still queued (2026-11-04)

Phil approved the concrete one-secret paid backup, temporary AWS access and
one-time transfer/read-back/cleanup, explicitly accepting approximately
$0.40/month. This approves the previously reviewed operation after its required
checks pass; do not ask for the same setup/cost/transfer approval again. It does
not waive the pending CI/Security checks or authorize a credential-isolation
change, production probes, automatic retry, ongoing access or Phase 0 closure.

Refreshed the actual AWS console read-only: the expected account has an existing
GitHub OIDC provider whose sole audience is `sts.amazonaws.com`. Preserve this
shared provider; no new provider is needed. The complete eight-role page contains
no `mofacts-recovery-transfer` role. Refreshed GitHub metadata confirms the same
default, non-immutable subject prefix and the production audit environment's
sole deployment branch rule `main`. Current repository workflows request no
`id-token` permission, and no workflow was observed running. No AWS setup mutation
or real credential retrieval has occurred. CI `41877424659` and all four jobs of
Security `41877424480` remain queued without runner assignment at this preflight.
Keep slot 4 reserved for that existing run; do not issue a duplicate.

### Protected GitHub recovery transfer prepared; execution decision pending (2026-11-04)

Published the intentional review batch as
`d5e8f70524854cb20e9586d2816de3832847cd79` on main. Pre-commit manifest,
staged lint and secret checks passed. GitHub created normal push CI
[`41877424659`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41877424659)
and Security
[`41877424480`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41877424480).
Both remain queued at this handoff; all five jobs lack assigned runners. No
pending environment deployment approval was reported for CI. This is a pending
remote check, not a reported test failure or a passing exact-commit integration.
Slot 4 remains reserved; verify these existing runs before considering another
invocation or approved transfer activation. No duplicate dispatch was made.

Phil approved the current protected GitHub configuration as the starting point
and requested a concrete transfer for review, followed by continued work to the
next real decision. The source is explicitly a **new unqualified baseline**:
the original complete document and historical accepted copy were not located.
Do not fabricate a historical rollback by relabeling this source.

Prepared the [execution review](../deploy/security-audit/recovery-transfer/README.md),
an inactive workflow outside `.github/workflows`, temporary expiring OIDC trust
and exact-secret permissions templates, complete binding serializer/validator,
bootstrap-only transfer protocol and Linux AWS CLI/OIDC adapter. The proposal
copies all nine current production-audit secrets and its public-key variable to
the single reviewed Ohio secret, preserving their strings exactly. It measures
the entire UTF-8 document, refuses existing versions, compares exact read-back,
retains a distinctly named baseline label, logs only bounded result metadata and
stops for reconciliation after any failure. No automatic retry, deletion,
credential normalization or application/GitHub binding change is implemented.

Read-only GitHub metadata was refreshed: the exact nine-secret/one-variable
inventory remains present; default non-immutable OIDC subject prefix is
`repo:memphis-iis/MoFaCTS`; the production audit environment's only deployment
branch rule is `main`. Environment-subject trust is not workflow-specific IAM
isolation. Both policy templates expire at the same approved UTC deadline,
limited by procedure to one hour; the runner requests a 15-minute session.
Immediate permission/trust removal remains required after the attempt. No
existing workflow/environment protection, cloud resource, IAM policy or access
credential was changed by these read-only checks.

Initial synthetic checks passed: exact binding/JSON/PEM byte preservation,
65,536-byte boundary, missing/extra or incomplete bindings, duplicate fixture
keys, actor/probe/throttle completeness, wrong source/target/AWS identity,
nonempty destination, unsafe encryption/replica/rotation metadata, altered
read-back and ambiguous-write refusal, secret-free CLI arguments/child environment,
hosted/manual/main/commit gates and inactive workflow/policy structure. Full
source-security suite passed **76/82, six documented Windows platform skips**;
full lint passed with **323 surfaces** unchanged. Final combined source-security
and supplemental-capture regression run passed **90/97 with seven documented
Windows platform skips**; final full lint passed. Three explicit supplemental
inputs bind the draft workflow/policy bytes into the existing CI test capture.
No TypeScript-bearing app edit was made; queued full CI is intended to supply its
ordinary typechecks and one reserved Meteor run. Its completed outcome remains
pending and must be recorded after observation.
Synthetic adapters do not prove
live OIDC, IAM or Linux CLI/AWS behavior; real values and size remain unobserved.
Final API review also established that `DescribeSecret` omits deprecated versions.
The draft therefore uses a bounded `ListSecretVersionIds` call with
`IncludeDeprecated: true` before and after writing; an extra version, missing
version list or any next-page token fails. Its exact-secret policy includes that
read-only action. Negative tests cover unlabelled data and an empty paginated
page; neither may be treated as an empty destination.

Next execution decision: approve the single paid destination (review baseline
about $0.40/month plus API calls), temporary provider/role setup and one protected
credential transfer with read-back and cleanup. No active export workflow, real
secret retrieval, paid resource creation or cloud identity mutation has occurred.
Proposed operator setup uses CloudShell from the verified console session with
an explicit account-identity check, not the unverified local AWS CLI profile.
The proposal also preserves a subsequent restore isolation gate: the full source
contains production-audit access and cannot be injected wholesale into staging2.
Operational baseline acceptance and current/accepted-rollback rehearsal remain
open, as do broader Phase 0 gates. No app/runtime/config schema changed, so no
dependent config or user-facing wiki change is needed; public procedures and the
controlling plan are updated. Existing unrelated working changes are preserved.

### AWS account readiness accepted; recovery-source provenance pending (2026-11-04)

Phil confirmed the fresh physical USB-key sign-in passed and answered **Yes, all
three are ready** for independent AWS password access, root-email access and
separate hardware-key custody. Fresh browser inventory showed the prior signed-
out page and a new authenticated Console Home tab in the expected account/Ohio
region. Accepted the account-access prerequisite with explicit evidence bounds:
key use and recovery arrangements are operator-confirmed; the authenticated
console/account is directly observed. No automated PIN/touch or simulated device
loss is claimed. Four MFA registrations and the new key's FIDO L2 certification
were verified at enrollment; no factor was removed.

Saved a separate minimized `account-readiness-accepted.json` in the native AWS
preflight evidence directory, preserving the earlier pending enrollment
observation. It includes no account/contact identifiers, device ARNs or credential
values. The current and retained-version Secrets Manager recovery rehearsal is
still not complete; accepting account access alone does not close Phase 0.

Continued source/configuration preflight. Read-only GitHub metadata lists nine
secrets and the report-encryption public-key variable in
`production-security-audit`, matching its source-owned setup contract. Bounded
filename and key-name searches in the approved private Desktop folder, canonical
config repo and local audit work directories did not locate the complete original
fixture/provider document or its last-accepted copy. The smaller staging2 working
credential set is not a substitute. GitHub's normal secret APIs return metadata,
not values; no secret export, production run, secret-value retrieval or credential
rotation was attempted. Asked Phil for the original file/vault-item location or
confirmation that it is unavailable/unknown, without requesting secret values.

Prepared the public [recovery-store review](../deploy/security-audit/recovery-store-preflight.md):
proposed one-secret Ohio destination, managed encryption, current/retained-version
requirements, current name-only binding inventory, baseline cost and provenance
gate. An alternative one-time transfer from protected GitHub deployment copies
requires its own concrete data-transfer/access review if originals are unavailable;
it is not authorized or implemented by this checkpoint. No paid resource, IAM
role, static credential, upload or application behavior changed. AWS CLI identity
has not been assumed from the browser session. No Meteor invocation was needed;
**3 of 5 used, 2 remain**. Unrelated working changes remain preserved.

### AWS physical-key enrollment verified; recovery acceptance pending (2026-11-04)

Phil reported completing the physical-key enrollment and requested continuation.
Live AWS read-back confirmed **Passkey MFA device assigned**, the expected
`root-backup-usb-key` identifier, **four MFA registrations**, and **FIDO: L2**
certification for the new entry. Both original virtual registrations and the
earlier Dashlane passkey remain present. This verifies registration; it does not
prove a fresh physical-key sign-in or workstation-independent account recovery.

Retained only a minimized nonsecret `enrollment-observation.json` under native
`C:\Users\ppavl\MoFaCTS-Release-Evidence\aws-recovery-preflight-20261104`.
It contains counts, label/certification checks and explicit pending acceptance
fields, without account/contact identifiers, device ARNs, PINs or credential
material. No authentication prompt or private credential value was captured.

Read-only recovery-store preflight used the same account and selected Ohio
region: Secrets Manager explicitly displayed **No secrets**. No secret values
were opened and no AWS resource, permission or paid service was created. The
installed AWS CLI is **2.34.3**, with one configured profile; only version/profile
metadata was checked. No credential value was read, no CLI cloud API was called,
and no assumption was made that this profile matches the verified browser
account or is the approved credential source for later setup.

Refreshed the official service contract: a secret can hold up to 65,536 bytes;
the AWS-managed `aws/secretsmanager` encryption key has no separate key cost;
baseline storage is $0.40/secret/month plus $0.05/10,000 API calls. These are
preflight facts, not spending/provisioning approval. Complete portable current
and retained-rollback documents, exact size/binding validation and scoped
setup/restore permissions are still pending. Do not infer portable-document
fit from local file sizes or upload a partial credential set as complete proof.

Opened the existing account's Sign out menu for the operator. Requested a fresh
sign-out/sign-in using the physical USB key and confirmation that the AWS password
and root-email inbox remain accessible without this PC/main phone, with the key
kept separately. Authentication and physical custody are operator steps; no
password/PIN/code is requested. These results are pending, so the Phase 0 account
recovery gate remains open. No application code, deployment or Meteor test ran;
**3 of 5 authorized Meteor invocations used, 2 remain**. Unrelated working changes
remain preserved.

References: [secret creation and managed-key cost](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html),
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).

### Dashlane passkey registered; physical-key enrollment remains unverified (2026-11-04)

Phil reported that the browser directed the enrollment into Dashlane rather
than onto the physical USB/NFC key. Live AWS read-back shows **Passkey MFA device
assigned** and **three MFA registrations**: the two original virtual factors
plus the newly assigned passkey/security-key entry. AWS's generic type and the
chosen device name do not prove physical-key storage. Dashlane storage is the
operator's reported result; physical-key enrollment and independent recovery
remain unverified. Preserved all three registrations; nothing was removed.

Prepared a separate `root-backup-usb-key` attempt and advanced to AWS's setup
step to inspect provider selection. The page exposes an otherwise empty
`dashlane webcard` accessibility container and waits for browser instructions;
it exposes no provider-selection controls. No Confirm, PIN, touch or completed
credential registration was automated. This attempt is pending, not a fourth
accepted MFA registration. The native authentication chooser remains an operator
step. Asked for visible popup button/link labels only, without credentials, to
identify the actual hardware-key path rather than guess at its controls.

Current official AWS guidance supports both synced password-manager passkeys
and hardware keys; Dashlane documents handling browser passkey-creation requests.
This does not establish that AWS rejected the physical key or identify the exact
browser/provider setting responsible. No extension, security protection or MFA
factor was disabled. A Dashlane passkey could supply a recovery path only after
its independent availability and a fresh sign-in are verified; it is not silently
substituted for the selected physical-key plan. No paid service, application code
change, deployment or Meteor invocation occurred. **Two Meteor authorizations
remain unused**, and unrelated working changes remain preserved.

### Physical AWS backup key confirmed; operator enrollment handoff (2026-11-04)

Phil confirmed the existing item is **a physical USB/NFC security key**. Prepared
the root-account MFA selection form with device name `root-backup-security-key`
and the existing selected **Passkey or security key** method. Stopped before
Next/credential registration and handed enrollment to Phil for the browser's
physical-key selection, touch and any private PIN prompts. No credential prompt,
PIN, seed or code was captured. A nonsecret preparatory-form screenshot is stored
only in the native private evidence directory, outside source control.

At handoff, both original virtual MFA registrations were preserved; no new MFA
registration or successful backup sign-in is claimed. Asked Phil to reply
`registered` after completing AWS enrollment. Next acceptance must independently
check the new device entry and require a fresh backup-key sign-in, then confirm
independent email/password recovery and separate physical custody. Reusing this
hardware does not require resetting its existing OpenAI registration. No purchase,
AWS secret/resource creation or Meteor invocation occurred; **two authorized
Meteor invocations remain**. Unrelated working changes remain preserved.

### AWS account verified; backup-key type awaiting clarification (2026-11-04)

Phil completed normal AWS sign-in and asked whether an existing OpenAI security
key can also be used. Confirmed in the live console that this account contains
the existing Ohio Lightsail instance with staging2's recorded static IP. The
security-credentials page identifies the signed-in identity as **Root user** and
shows **two existing Virtual MFA registrations**. Both remain unchanged; their
independent availability has not been established.

Current official AWS documentation explicitly permits using a compatible FIDO
security key already used with other services; AWS creates a separate credential
for its own registration. This does not establish that Phil's item is a physical
FIDO device. Asked whether it is a physical USB/NFC key, an app-stored passkey or
an API secret string, without requesting any secret value. The Assign MFA device
screen is open at method selection; no name was entered, no enrollment was
started and no credential/account setting changed. A physical key can be prepared
for operator enrollment after confirmation; a passkey requires its actual
independent-storage/recovery path to be checked, and an API key is not an MFA
device. No purchase, AWS resource or Meteor invocation occurred; two Meteor
authorizations remain unused.

### Independent AWS recovery missing; setup preflight started (2026-11-04)

Phil answered **"No, we need to set that up"** when asked whether AWS sign-in
could be recovered after losing this PC and the primary MFA device. This is a
confirmed missing prerequisite, not an established recovery capability.
The selected AWS Secrets Manager design remains unchanged. No new AWS resource,
permission, credential upload, paid service, password reset or MFA change ran.

Rechecked current official AWS guidance: another registered MFA device can
preserve access; root-account lost-MFA recovery also depends on the account email
and primary contact telephone. The actual sign-in identity and independent
availability of those channels still require verification. Opened the existing
staging2 AWS console URL in Chrome; it reached an unsigned IAM sign-in page.
That page does not establish which identity Phil normally uses. Requested normal
operator sign-in and availability of an existing separate security key or spare
phone/tablet, without asking for credential values. The signed-in account and
hardware inventory must be known before selecting or changing an MFA method.

Prepared the public [account-recovery readiness procedure](../deploy/security-audit/account-recovery.md):
preserve the working factor, add an independent operator-held backup, verify a
fresh sign-in and independent email/password recovery, and retain only nonsecret
check results. Credential enrollment/physical interactions remain operator steps;
no QR/seed, code or key capture is permitted. A local save or device-list entry
will not be treated as successful recovery. No Meteor invocation was needed;
**3 of 5 used, 2 remain**. Unrelated working changes remain preserved.

### Isolated staging2 GitHub access accepted (2026-11-04)

Phil approved the separate GitHub staging2 audit identity. Fresh browser
inspection found the expected signed-in tailnet, staging2/production/operator
devices connected, and the live two-grant/12-test policy. Preserved exact prior
bytes privately, added only `tag:staging2-audit` ownership, the single TCP 22 grant
to `tag:staging2`, and three positive/negative policy test groups. The saved
policy has three grants and 15 tests; prior grants, tests and SSH rules are
preserved. Prior policy SHA-256
`e1d1221202c4a9115721fb882d4b68130ec8fadb57fdc7e0856c1f441a2ea576`;
submitted policy SHA-256
`7815553ed1d1110d6fdaa7aa387069f12514a21ee166dd2e74832300d24b4cd5`.
An independent saved-editor read-back matches the approved proposal exactly
as JSON. Tailscale reformatted its whitespace; exact read-back bytes have SHA-256
`d2ba5ce743f15c9618a865f0f0488c6b5cd36e9db54308929b5ef322215fe0c7`.
Prior, submitted and saved-read-back files and policy/scopes screenshots remain
outside the repository. No prior policy rule was silently rewritten.

Created the separate OAuth client with only `auth_keys` and the audit tag; no
device-management/policy-write privilege or production credential was added.
Saved its local secret as a Windows DPAPI-encrypted credential with operator,
SYSTEM and Administrators DACL and verified encrypted read-back before closing
the one-time display. No secret screenshot or plaintext credential file was
created. The browser process's initial GitHub CLI publication attempt failed;
publication then succeeded using the existing authorized CLI sign-in from the
operator shell. All six environment secrets were explicitly republished without
shell-added line endings. The later key-format diagnosis below corrects the
ordinary-stdin private-key transfer; secret values were withheld.

Created `staging2-security-audit` with an explicit `main`-branch restriction,
six dedicated staging secrets and four explicit private IPv4/IPv6 denial targets.
The production environment and existing production OAuth client were untouched.
The manual workflow reuses the pinned Tailscale action and current host auditor;
it has no schedule, deploy, report ingestion, application install or Meteor step.
Its retained result is a minimized **unqualified** access/receipt observation.

Local positive/negative validator cases, workflow parsing and the existing saved
live nine-control/receipt observation pass. Source-security passed 70 total,
64 passed/6 platform skips; full lint, boundary/manifest checks and all 323
surface classifications passed. Workflow YAML parses without duplicate keys.
Slot 3 was reserved before the normal push-triggered CI run; the separate manual
access workflow itself invokes no Meteor. The completed acceptance follows below.
See the public
[procedure and recovery owners](../deploy/security-audit/staging2-access.md).

Published this batch as `c4276fafeb3ac1ffad3003f9d57f63b2ba6237ef`.
Slot 3 [CI `41844153544`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41844153544)
and matching Security `41844153368` passed completely, including both typechecks,
the Meteor integration, source/capture/native contracts and canonical Compose
image identity, ABI, topology rejection, Change Streams startup and cleanup.
Manual access run `41844189772` joined with the isolated identity and logged out
successfully, but failed at the combined SSH/receipt boundary before artifact
publication. Its raw diagnostics were withheld. A follow-up splits fixed SSH
failure categories from host-result validation; no permission, receipt check or
network requirement is relaxed. This observation-only follow-up skips automatic
Meteor CI while its local regression/source checks and manual access test run;
it does not consume another Meteor invocation or qualify the release.

The diagnostic correction `e745f4a8` passed three targeted validator/diagnostic
tests and full lint (323 surfaces). Its manual run `41844927542` identified
`host-ssh-key-format`; tailnet join/logout passed. Bounded server journal counts
showed no accepted/failed audit-key authentication attempt during the first run,
and staging2 remained healthy. The saved key itself has valid LF OpenSSH format
and parses locally. Verified the installed GitHub CLI 2.81.0 source: ordinary
`secret set` stdin calls `bytes.TrimRight(body, "\\r\\n")`, dropping the required
terminal newline. Republished only the unchanged SSH key through supported
in-memory dotenv input, which preserves its escaped terminal LF. No plaintext
dotenv file, new key, host authorization change or runner repair path was added.
A fresh manual access retry used the same diagnostic revision and accepted
receipt digest. These manual runs invoke no Meteor.

**Live acceptance passed:** manual run
[`41845349663`](https://github.com/memphis-iis/MoFaCTS/actions/runs/41845349663),
attempt 1, exact source `e745f4a8323a8d02167e60e9f148ec45a9d4fbb2`. All nine
host controls PASS; the receipt matched the explicit workstation record digest.
Forced-command isolation, PTY and forwarding refusal passed; all 44 TCP negative
probes timed out. Only TCP setup was attempted against the existing production
and operator peers, with no authentication or application requests. No production
configuration or credential was changed. Ephemeral runner logout passed; fresh
Machines-page inspection showed only the three original connected devices.

Retained the minimized artifact under native
`C:\Users\ppavl\MoFaCTS-Release-Evidence\staging2-audit-access-41845349663`;
`staging2-access.json` SHA-256
`511fc17fbbef41e90938d6d3498db1e20471725ee8ef4019539fc7d808776fcb`.
Acquisition checked its 16 KiB bound, nine passing statuses, fixed tag, expected
receipt and 44-probe count. Result is **staging2-access-accepted-unqualified**,
not a production report, report-ingestion activation or release qualification.
Full CI for `c4276faf` passed. The follow-up `e745f4a8` changes only bounded
failure diagnostics and their targeted coverage, with full local lint and the
real manual access acceptance passing on that revision. No fourth Meteor run
has been issued; **3 of 5 used, 2 remain**. Unrelated working changes remain preserved.

**Next real decision/input: independent AWS account recovery.** The selected
Secrets Manager design requires recovery even after loss of this workstation
and the primary MFA device. Asked Phil whether a separately stored AWS recovery
method already exists, needs setup, or is uncertain; no passwords/codes/keys are
requested. Phil subsequently confirmed it needs setup; see the current checkpoint
above. This cannot be established from a working browser sign-in alone.
Existing encrypted local and GitHub copies do not satisfy that gate. AWS secret
creation, new IAM access, credential upload, recovery rehearsal and new spending
have not been authorized by this staging2-identity approval and have not run.
The selected one-secret design remains unchanged. Official pricing/size limits
were rechecked: baseline $0.40/secret/month plus $0.05/10,000 API calls, 65,536-byte
value limit; account/region, complete-document fit, scoped permissions and final
costs still need preflight before provisioning approval. No new paid service or
application/learner/storage behavior was introduced in this batch.

### Completed staging2 rehearsal and prior access decision

Both allocated runs passed without a retry: **2 of 5 invocations used, 3 remain**.
Run 1 tested the selected application/build-source correction; run 2 tested the
scoped DHCPv6 classification and Unix policy line-ending correction. Full lint,
both application/vendor typechecks, source-security, Phase 0/capture contracts,
native permission fixtures and canonical Compose image checks passed in CI.
The security surface remains 323 entries. No additional Meteor invocation was
needed for the live staging2 acceptance below.

The exact captured `65875553` application was built through canonical Compose,
published to the approved separate staging2 repository, and deployed to staging2
only. Actual server Docker-save config-byte identity matches
`sha256:25f1e6396fe55c4f2191a668461e3603dd69cc95077a1084427ab3a46388c6b7`.
Only the four nonsecret image/revision runtime keys changed; other environment
bytes, Apache/CSP, MongoDB and Redis were preserved. The prior `a3155584` image
tar, env/settings and Compose configuration remain root-protected, with an
application-only rollback command. A bounded pre-switch metadata check found
no SPARC library/version records or pending administrative cleanup to transform.
No destructive learner migration or production-data copy was performed.

Actual Chrome acceptance passed and is retained as minimized local JSON:

- Login/reload/reconnect preserve enforced CSP and do not recreate `x_mtok`.
- Owner upload, forged-owner rejection, duplicate-ID rejection, anonymous and
  other-user/admin denial, owner reconnect/resume after a real same-image server
  restart, completed-asset abort denial, pending abort and public/private delivery
  passed. HTTP transport rejects explicitly and retired upload routes return 410
  with or without a synthetic old cookie. Only disposable uploaded assets were
  removed through guarded asset-management methods.
- Direct Google voice samples actually played; replacing a preview stopped the
  earlier audio, and a deliberately blocked sample produced inline failure text.
- A disposable theme was copied through the visible UI; confirmation appeared,
  Cancel/Escape preserved it with focus return, and Confirm removed only that
  theme with appropriate focus. No backend cleanup supplied acceptance evidence.
- Synthetic learner reload resumed the rendered trial; Anki analysis, normal
  DDP content-media upload and image decoding, hosted-font loading and actual
  YouTube playback in the existing synthetic lesson passed. No paid synthesis
  or new lesson import was used; temporary synthetic TTS preferences were restored.

The dedicated restricted audit key passed authentication, arbitrary-command
isolation, PTY refusal and forwarding refusal after the firewall cutover and
again after receipt installation. All **nine live host controls PASS**; Sidecar
is absent as required. Private operator access, final application health and
public HTTPS passed; UFW remains active and its temporary rollback timer is
stopped. Public TCP 22 did not connect. The separate Lightsail cloud TCP 22 rule
was not removed: a fresh browser check reached AWS sign-in, so no cloud change
was attempted. Host firewall enforcement remains in place; cloud-rule cleanup
can follow an operator AWS login.

The staging2-only authoritative record is
`C:\Users\ppavl\MoFaCTS-Release-Evidence\staging2-release-record.json`.
The supported history writer published/read back its first immutable history
entry, retaining exact source/image evidence references and the independently
observed workstation/registry/host tuple. Authority/receipt record digest:
`5090b3fa162cffe158cd5ec3dbb27de1a160875bbbe14c1ad22d1585b39552e6`.
The old Desktop bootstrap status was preserved, not substituted for this record.
Credentials remain in the separately approved Desktop credential folder.

The root-owned 0600 receipt was installed through its supported owner and read
back as **observed/MATCH**, including through the restricted audit channel.
A valid-shaped transfer with the wrong image config was rejected without
changing accepted receipt bytes; transient lock cleanup passed. The audit account
was denied direct reads of both private audit configuration and receipt. Final
bounded observations are retained under the native `staging2-65875553` evidence
directory. A local acceptance assertion initially addressed the digest at the
wrong JSON level; correcting it to the documented nested receipt field passed
against the same observation, without changing the host or parser.

The record remains **consistent-unqualified**. Receipt MATCH and nine passing
host controls do not authenticate the complete verification catalog, integrate
the receipt into the V1 report assembler, activate Phase 1, or close Phase 0.
AWS secret-recovery provisioning/MFA recovery and production integration remain
separate gates. Production and the older staging installation were untouched;
unrelated staging/replica initialization, deployment docs and SPARC working
changes remain outside this batch. No new application fields, dependencies,
storage migration or user-facing behavior were introduced by this continuation;
public deployment guidance owns its documentation, so no wiki edit is needed.

**Next real decision: isolate GitHub's staging2 audit access.** Read-only GitHub
inspection found only the `production-security-audit` environment. The saved
accepted Tailscale policy permits the operator PC's staging2 SSH path; it has no
`tag:ci` to `tag:staging2` grant and no staging2 audit-runner tag. This is a saved
accepted-policy observation, not a fresh assertion about the live control plane.

Recommend a separate `staging2-security-audit` GitHub environment and
`tag:staging2-audit` ephemeral runner identity. A staging-only Tailscale OAuth
client would issue that tag; a single grant would permit it to reach
`tag:staging2` on TCP 22. Store only the dedicated forced-command key, pinned host
identity and staging-only connection credentials in that protected environment.
Retain production rules/credentials and test explicit denial of production and
staging application/database ports. Reuse the existing host auditor; do not give
the runner a general shell or Tailscale SSH. This creates a new persistent access
and secret boundary, so stop before creating the tag/client/environment/secrets
or dispatching its workflow. Re-read live policy before applying any approved
change. Scope the client to writable `auth_keys` and the single staging audit tag,
following [Tailscale's OAuth client contract](https://tailscale.com/docs/features/oauth-clients)
and the existing pinned GitHub Action's pattern; no policy-write scope is needed.
No new paid service is proposed; existing GitHub/Tailscale plan limits
must be checked during that preflight.

### Intermediate correction/setup checkpoints (superseded by completion above)

The correction passed complete CI `41824718448` (attempt 1, job `126556407720`)
and all four jobs of Security `41824718440`: server 975 passed/15 pending,
browser 1,237 passed/7 pending, zero failures; image identity/ABI/topology/startup
and cleanup passed. Independent clean Linux capture of `65875553` was verified:
source `a6dca6e331f1b7cab5f319cd4541b95f42ab1d525df56866765255a63678649a`,
test contract `2529596a73165daf8fe8d0935b034f0fa4d256b7caf9871bd8b0b201f30091d6`,
supplemental `0c24ed19c4c40cb430edd8d888f088a4d2fa265fa96414f23676f85506e93dd3`.
The supported GET-only helper accepted the actual CI artifacts against that
independent observation and captured Linux test inventory. Retained under native
`C:\Users\ppavl\MoFaCTS-Release-Evidence\staging2-65875553`: source-acquisition
digest `9e6cb25709533a860ada4bde2b1d64cbc206963bfae0df182da00141df01fd3b`,
image-acquisition `6f8d0b711209a025a6cbe2af39d04516bd1c6e1a323e7815782210924fc4affb`,
image-observation `758aaf398adaab64b06b948487e88b88b2b1cfb9cc77eb4f266bfe067cc2ed06`.
State is **acquired-unqualified**, separate from workstation release qualification.
The exact captured-source canonical Compose workstation build is in progress;
no new application candidate has yet been published or deployed.

Installed the reviewed host files from the same commit through a hash-checked,
root-owned source archive (SHA-256
`46b6f270f79b108912a5e5115a17cab0239f37d34ccb27e375f3bf8db43f402c`). Support
files are root-owned 0644 and scripts 0755. Created the root-only 0600 audit config
using staging2's actual matching runtime database/replica/credentials, the accepted
Apache site and explicit Sidecar-absent policy. Created the dedicated MongoDB
metadata observer with only viewUser on the application database and viewRole on
admin. Installed/executed the committed shared app-role helper and definition;
its single getDefaultRWConcern privilege was verified. No learner data was read
or migrated for this setup, and the optional Sidecar account remains absent.

The dedicated SSH audit key and encrypted metadata-observer credential are in
the approved Desktop credential directory. An initial Windows ACL-copy attempt
required unavailable SeSecurityPrivilege; explicit protected DACLs were then
applied and verified for operator/SYSTEM/Administrators only. No parent-folder
permission was broadened. SSH audit account, private key restriction tests,
firewall cutover, release-record publication and protected receipt acceptance
remain pending; the first actual host observation is diagnostic, not acceptance.

The selected application candidate remains the independently captured and fully
CI-tested `65875553` source. Its workstation canonical Compose build completed
successfully. Subsequent host-policy changes are a separately verified auditor
revision; they must not substitute their CI smoke image/evidence for this selected
application's source/image tuple.

Actual host observation passed config, app loopback, Docker ports, Apache route,
MongoDB roles/auth and Redis checks. It exposed an unclassified scoped link-local
systemd-networkd DHCPv6 client (UDP 546), inactive UFW, and a Sidecar observation
error. The Sidecar error was traced to Windows Git archive converting the valid
LF committed jq policy to CRLF: the installed file had 123 CRLF lines, and jq 1.7
refused compilation. This was a packaging error in the owner-operated transfer,
not missing evidence of an actual helper. Re-exported the unchanged `65875553`
host sources from the verified Linux checkout; hash
`7c527365c261510bfb6f292592a02f3cdb87534b2d2ef51ba373e76680c23fe4` was checked
on both sides before explicit reinstall, with prior bytes retained. Sidecar absence
then passed against all four existing containers. No parser check was removed.

Prepared a narrow DHCPv6 classification beside the existing DHCPv4 rule: only UDP
546, a scoped IPv6 link-local address, and the systemd-networkd process signature.
Positive and six negative fixtures preserve findings for wildcard/global/unscoped
addresses, other processes, wrong protocols and server port 547. No network or
firewall permission is added by this classification. Unix AWK/jq files now have
explicit LF attributes, and public host-transfer guidance identifies the Linux
archive owner. Local source-security tests passed 68 total/62 passed/6 platform
skips. This routine preservation correction uses reserved integration slot 2;
the new listener policy is not yet installed. Firewall and receipt acceptance
remain unfinished and are not claimed passing.

The `65875553` workstation image passed embedded-source comparison, platform and
revision checks, Node 24.22.1/Undici 7.30.1 ABI/tool-removal checks, absence of
private runtime environment fields, and isolated synthetic Change Streams startup
and health with owned-container/network cleanup. Published through the approved
separate repository as `ppavlikmemphis/mofacts-staging2:staging2-65875553`:
index `sha256:dd255300197b9d2bb52fd638749ea64cd70b51d7fe7d48d68d0fdf2c8e7eafa9`,
amd64 manifest `sha256:5ae6a40c9116ad55b95fe8d854c56e162b3e623f22e1aac3bf0d00881b055da9`,
config `sha256:25f1e6396fe55c4f2191a668461e3603dd69cc95077a1084427ab3a46388c6b7`.
Independent registry inspection matches the actual config-byte observation.

The dedicated locked `mofacts-audit` account now has a root-owned restricted key
and only the exact no-argument host-audit sudo command. Private authentication,
forced-command isolation, PTY denial and forwarding denial passed. Applied the
approved active default-deny UFW policy: public TCP 80/443 and TCP 22 only on
tailscale0 from the configured tailnet IPv4/IPv6 ranges. Prior UFW configuration
was saved privately; a five-minute automatic disable guard was armed before
activation. Fresh private operator/audit access and public HTTPS 200 passed, while
public TCP 22 did not connect; the guard was then cancelled. UFW control now
passes. The separate Lightsail network-firewall rule has not been changed here.

Retained the prior `a3155584` image tar, runtime settings/env and Compose files in
a protected server release directory. Pulled the new candidate by immutable index
digest and verified its platform, source revision, embedded source digest and
Node on staging2 without starting its application. A bounded metadata-only check
found all three SPARC source/target libraries empty, with zero retired figure
versions or pending administrative cleanup; no library migration was invoked by
this check. The running app remains `a3155584` pending host-policy CI and the
controlled application switch. No authoritative release record/receipt exists yet.

## Compatibility batch published; Meteor passed, CI image collector failed (2026-11-03)

Committed and pushed the 14 intentional compatibility/setup documentation files
as `4d4c265bde969a8f2b24ce74642199d84d05b136` on main. Pre-commit lint, manifest
artifact rejection and staged-secret scanning passed. Unrelated staging/replica
initialization and SPARC working changes remain outside the commit.

The one authorized push-triggered [CI run 41768076041](https://github.com/memphis-iis/MoFaCTS/actions/runs/41768076041),
attempt 1/job `126371060971`, completed with **failure**. Its Meteor integration
passed: server **975 passed / 15 pending**, browser **1,237 passed / 7 pending**,
zero failures. Lint, both typechecks, Phase 0/capture contracts including the native
protected host receipt fixture, source/run binding and canonical Compose image
construction passed. The next step, **Assert image source matches tested input
identity**, failed with the collector's generic sanitized error. Image ABI,
standalone-Mongo rejection and replica-set image startup checks were skipped;
cleanup completed. This is not a passing release candidate or image qualification.
The matching [Security run 41768075941](https://github.com/memphis-iis/MoFaCTS/actions/runs/41768075941)
passed all four jobs. No retry or duplicate dispatch was issued.

Independent clean Linux capture/verification of `4d4c265b` produced source
`e85be40bb861e45f3cc3af5cf31b50f6e7f5dc67fbd348386b47e8758b4572f5`, test contract
`2529596a73165daf8fe8d0935b034f0fa4d256b7caf9871bd8b0b201f30091d6`, and supplemental
`79efc68773c22379c865106f8769a1546928e5dcbb66d4046e34382252dc215a`, matching CI's
recorded observation. The source artifact `13293812032` (177,547 bytes; ZIP SHA-256
`201e629b74b141002e63f7a33223c2d7011febb6c0e2cb1cd3aee8207d423f70`, expiry November 18)
was read through the native bounded ZIP reader only for failure diagnosis. It is
retained under the native evidence directory as **failed-ci-diagnostic-only**;
the acquisition helper's successful-run requirement was not bypassed or relabeled.
No CI image observation artifact exists for this run. Replaying the actual source
and joined Meteor evidence reached the controlled Docker boundary, confirming
that the collector's preceding source/run validation accepts those bytes.

Reproduced a concrete inspection compatibility defect using Engine API 1.47 on
the existing workstation: `{{json .Descriptor}}` fails because that optional key
is omitted. `{{json (index . "Descriptor")}}` succeeds and emits explicit null.
Corrected both the workstation/CI projection and protected receipt projection
locally. Null still requires actual config bytes to hash to the native ID; no
index or manifest is substituted. This defect is consistent with CI's immediate
failure, but the original generic error does not prove it was the only cause.
A fresh CI run remains necessary to confirm that boundary. Added fixed, bounded
failure stages for the collector/CI CLI, without retaining raw Docker diagnostics,
and two regression tests for stage propagation and privacy.

Follow-up local verification: typecheck/lint passed (323 surfaces), image-observer
suite **21/21**, Phase 0 **156 total / 149 passed / 7 platform skips**, source
security **67 total / 61 passed / 6 platform skips**, zero failures; shell syntax
and diff checks passed. The revised collector still resolves the live published
`630eabdb` image to config `f3bef1d2...` correctly. The follow-up is uncommitted;
the failed required CI check blocks publication/deployment until Phil accepts
this identified failure for the correction and authorizes one fresh run.

Staging2 private preflight remains healthy: HTTPS 200, sufficient disk, no host
MongoDB/Redis publications, protected `/etc/mofacts` parent, and expected absent
audit account/config/receipt/tooling. Its old application still has the original
single scoped readWrite role; the approved modern read-concern grant remains
unapplied. Prepared a private `4d4c265b` build-only profile beside the prior profile,
without changing credentials; no local application build, image push, deployment,
record publication, account/role/firewall change or receipt installation followed
the CI failure. The previously published `630eabdb` image and retained `a3155584`
staging2 application are unchanged. The one Meteor authorization is consumed.
Phase 0 remains open.

## Docker image identity correction implemented locally; CI authorization boundary (2026-11-03)

Phil approved the compatibility correction and continuation to the next decision
point. Implemented one standalone, observation-only Docker-save metadata reader
shared by the CI collector, workstation observation command and protected receipt
reader. It hashes the actual config bytes and validates the selected OCI
index/manifest/config links; classic stores explicitly require the raw engine ID
to equal the config hash. Missing, tampered, ambiguous, unsafe or excessive archive
evidence fails. Layers stream past without extraction or decompression. Limits:
2 GiB export, 4,096 entries, 1 MiB per retained metadata entry, 32 MiB retained
metadata, and a two-minute command timeout. No dependencies were added.

The CI workflow now calls its raw Docker `.Id` an `image_reference`, passing it
as an immutable engine handle. Only the shared reader emits `configDigest`.
The protected receipt script validates the root-owned reader and uses the running
application's Node to resolve that same config identity. Receipt `imageId`, proof
coordinates and historical schemas remain unchanged; no stored observations or
receipts were rewritten. The collector and host install procedures are updated in
the public deployment guides. No user-facing application behavior, config-repo
schema, learner persistence, access classification or wiki procedure changed.

Read-only live evidence:

- The workstation's Docker 29.7.2 containerd store resolves published candidate
  engine reference `sha256:c1889f350a9cfe2bd2d8e74ece2e13db9e1f816a6afff6af5da793fab5f087b7`
  to config `sha256:f3bef1d283b7885a7994060bb31eab3f859a2251b09d72128b252ca982840ef9`,
  exactly matching the earlier independent registry manifest observation.
- Staging2's Docker 29.8.2 also reports an OCI index. Its unchanged retained
  `a3155584` application's engine reference
  `sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`
  resolves to config
  `sha256:42930ed1249c3e21179a3f26b95f3edfe9bd1d2ea506957369675234c5c1447b`.
  Earlier `.Id` observations of `5eadcf85` must be read as engine/index identity,
  not configuration identity. The first probe's final assertion incorrectly
  required a classic store and failed; correcting that probe assertion exposed
  the successful parser result. No runtime workaround or host configuration
  change was made. HTTPS `/health` remained 200.

Verification with pinned Node 24.22.1:

- Full application typecheck and lint passed; security-surface contract remains
  323 surfaces.
- Phase 0 suite: 154 tests, 147 passed, 7 existing platform skips, zero failures.
- Capture suite: 98 tests, 92 passed, 6 platform skips, zero failures.
- Source-security suite: 67 tests, 61 passed, 6 platform skips, zero failures.
  An initial WSL connection timeout was followed by a successful read-only
  connection probe and passing rerun; no JEDM configuration was changed.
- Image-observer regression suite: 19/19 passed, covering classic/manifest/index
  identity, altered or missing content, ambiguous platforms, limits, unsafe tar
  entries and native-reference/config separation. Shell syntax check passed.
- Extended the Linux protected-host fixture to exercise all three image formats,
  protected parser permissions, malformed exports and actual config mismatch.
  Native execution in Ubuntu-MoFaCTS stopped at its existing `jq` prerequisite;
  that environment does not have jq. No dependency was installed and this fixture
  is not claimed passing. The supported hosted Linux CI run remains required.

The next boundary is explicit permission to commit/push this intentional batch
and run one fresh Meteor integration/CI execution, which also exercises the Linux
host fixture and changed workflow. No current single-use authorization remains.
No commit, push, CI dispatch, application deployment, release-record publication
or protected receipt installation was performed in this correction batch. Related
setup/evidence documentation is also local; unrelated working changes remain
preserved. Passing observations remain separate from release qualification.
Phase 0 remains open.

Phil subsequently approved committing/pushing this correction batch and one fresh
Meteor integration run, with continuation to the next decision point. The push
will trigger the canonical main CI and Security workflows; no duplicate dispatch
or retry is authorized. The following execution checkpoint will record results.

## Public staging2 image published; Docker identity compatibility decision reached (2026-11-03)

Phil approved publishing the verified application candidate to a separate public
Docker Hub repository `ppavlikmemphis/mofacts-staging2`, using the existing sign-in.
The canonical Compose captured-source build completed successfully for `630eabdb`.
The resulting image passed embedded-source comparison with the independent Linux
and accepted CI observation, linux/amd64 and revision checks, Node 24.22.1/Undici
7.30.1 ABI checks, and verification that npm/npx and private runtime environment
fields are absent. The exact candidate also passed an isolated synthetic MongoDB
replica-set startup and HTTP health check, using the existing CI startup contract.
Its first preparation attempt was rejected by the readiness helper's required
`mofacts-ci-*` container-name contract; owned fixtures were cleaned, the names were
corrected, and the startup check then passed. No Meteor integration was invoked.

Created the explicitly public repository using Docker Hub's documented namespace
API and the existing Docker Desktop access token in memory only. Anonymous
visibility read-back passed. Tagged and pushed the exact tested candidate as
`ppavlikmemphis/mofacts-staging2:staging2-630eabdb`; push exited zero. The prior
production repository's tags/configuration were not changed. No new token or
credential was stored. Runtime secrets/settings remain in their existing private
locations and were not included as build arguments or image environment fields.

Independent registry inspection established this actual linux/amd64 mapping:

- Published OCI index:
  `sha256:c1889f350a9cfe2bd2d8e74ece2e13db9e1f816a6afff6af5da793fab5f087b7`.
- Platform manifest:
  `sha256:72ff37bb61b105b51c6b4eecb85aa3ecc668fecc620c0672159b2615ee67e660`.
- Platform configuration:
  `sha256:f3bef1d283b7885a7994060bb31eab3f859a2251b09d72128b252ca982840ef9`.

The workstation uses Docker Engine 29.7.2 with the containerd snapshotter. Default
`docker image inspect .Id` and `.Descriptor.digest` identify the **index** above;
`--platform linux/amd64` identifies the **platform manifest**, also not its config.
Earlier operational output called the default `.Id` a config ID; that label was
incorrect. The publication/source/startup checks remain actual passing observations,
but no release-proof tuple was issued from that mislabeled value. Registry index
and manifest observations were retained under the native release-evidence folder.

This exposes the next compatibility decision: the current draft collectors treat
`.Id` as `configDigest`, including `observeCiImage.mjs`, and need a reviewed image
identity observation owner that distinguishes classic and containerd stores and
follows index -> selected platform manifest -> config without substituting any
coordinate. Regression coverage must exercise both stores and missing/ambiguous
mapping; historical proof/receipt semantics must remain explicit. Do not change the
Docker backend, disable provenance or relabel the index to satisfy the proof.

Stopped before deployment, release-record publication and protected receipt
installation. Read-only staging2 preflight still showed the healthy retained
`a3155584` application and HTTPS 200. Production and older staging were not deployed.
No additional CI/Meteor authorization remains. The next proposed batch is the
image-identity compatibility correction; Phase 0 remains open. These outcome and
setup documentation changes are local/uncommitted; unrelated working changes are
preserved.

## Docker integration applied; Linux source and CI evidence matched (2026-11-03)

Phil brought the Docker settings page onscreen and approved its actual
**Apply & restart** action after being told it could interrupt the shared local
JEDM/MoFaCTS engine. Applied only `Ubuntu-MoFaCTS` integration; default-distribution
and `Ubuntu-JEDM` integration remained off. Linux Docker connected to the same
observed engine identity as Windows. The restart returned some services automatically;
the remaining previously running JEDM containers were explicitly started, and the
MoFaCTS watcher was restored through `deploy/hotfix-local.ps1 -Action start`.
All nine previously running containers returned; configured JEDM/Mongo health checks
passed and the canonical localhost helper reported full watcher readiness. No
previously stopped application was started for this recovery.

The clean Linux `630eabdb` checkout passed `prepare-tests` and `verify-tests` with
the existing helper, builder and source-digest rules. The complete independent
observation equals CI's observation: source snapshot
`cffa1f80f3c637fef52adcc12e6b3289cc9be860d18f451b2ed6c464481705fb`, test contract
`2529596a73165daf8fe8d0935b034f0fa4d256b7caf9871bd8b0b201f30091d6`, supplemental
`b5f9d7c2e8575454d37cb37623869fd7889b04e9d736e5ec8f34656ca7759814`.
This resolves the independent Windows/Linux source mismatch without substituting
a digest or weakening checks. The earlier archive-only comparisons were not accepted.

The approved GET-only CI image acquisition helper then accepted CI `41702322064`
and Security `41702321872`, using the independent Linux observation and captured
test-module inventory. Retained source bundle digest:
`ba887ed3dc7a895a86d312c64e5a6696fc845f910fd125a1b69358ec9f752f62`;
image bundle digest `69bbe53fd54b712057238bbec64d57645499d4007f5ae1cd87de7e3c1a4b7967`;
exact image-observation digest
`6d2f9a623b86a4e7facd784a1f9a42399b67599d4f5ad4492851927fa563f494`.
The state remains `acquired-unqualified`, not release qualification. Evidence is in
the operator's native `C:\Users\ppavl\MoFaCTS-Release-Evidence\staging2-630eabdb`.
OneDrive's reparse-point chain was rejected by the ZIP reader. LocalAppData also
failed canonical-path checking because the desktop app redirects it into its
package cache. The native user-home evidence folder passed unchanged path/ZIP
checks. Credentials remain in the designated personal Desktop directory. Failed
acquisitions produced no accepted proof; no path or ZIP checks were disabled.

A separate staging2-only private build profile was prepared beside the existing
Desktop profile, preserving its credentials/settings and changing only the image
tag and source revision. The canonical captured-source Compose build was started
for `mofacts-local/mofacts-mini:staging2-630eabdb`; its result is still pending at
this checkpoint. No additional Meteor integration was invoked.

The next decision is publication transport. Existing production instructions use
Docker Hub `ppavlikmemphis/mofacts-mini`; staging2 has used local image archives.
The approved release-proof shape requires a real published manifest/index and its
config association. Phil was asked whether to use a separate public Docker Hub
repository `ppavlikmemphis/mofacts-staging2` with the existing sign-in, or discuss
private-registry storage first. No image was published or deployed, and no host
receipt was installed. Phase 0 remains open. These follow-up notes remain local.

## Docker integration selected; shared-engine restart decision pending (2026-11-03)

Phil brought Docker Desktop's WSL Integration page onscreen. The visible page
showed default-distribution integration disabled, `Ubuntu-JEDM` disabled, and
`Ubuntu-MoFaCTS` disabled. Selected only `Ubuntu-MoFaCTS`; the page now presents
**Apply & restart**. It has not been applied. Existing local JEDM containers and
the MoFaCTS development stack share that engine, so the restart can interrupt
their current work. Phil was asked to approve the actual restart or defer until
local JEDM work is idle. No Docker restart or staging2 deployment occurred.

Bounded pre-restart container/image identities and startup/health observations
were saved in the already approved personal Desktop credential/recovery directory;
no container environments or database records were retained. The dedicated Linux
checkout's supplemental digest was rechecked and still matches CI. Full capture
awaits the applied integration and verified Docker engine identity. Source-digest
rules and existing verification gates remain unchanged.

## Dedicated Linux environment created; Docker UI integration pending (2026-11-03)

Phil approved a separate `Ubuntu-MoFaCTS` WSL environment after discussing the
effect of adding release tools to `Ubuntu-JEDM`. WSL's installed version does not
support `--install --name`; that invocation printed usage and made no installation.
The documented WSL import route then created the named environment from Canonical's
official Ubuntu 24.04 amd64 WSL root filesystem, with its published SHA-256 checked
before import. Its storage is under the operator's LocalAppData MoFaCTS directory.
`Ubuntu-JEDM` remains the default distribution and was not modified for this setup.

Installed official Node 24.22.1 for Linux x64 under `/opt`, verified against the
official SHA-256 `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`.
Node 24.22.1 and npm 11.19.1 passed checks under the dedicated `mofacts` user.
That user is the new environment's default; only the new distribution was
terminated/restarted to verify this. No additional Meteor invocation occurred.

A clean Linux Git checkout of tested revision `630eabdb` on branch `main`, under
`/home/mofacts/releases/git-630eabdb`, has a clean working tree and supplemental
digest `b5f9d7c2e8575454d37cb37623869fd7889b04e9d736e5ec8f34656ca7759814`,
matching CI. The earlier Linux archive comparison differed and was not accepted.
The source-capture guide now requires a clean Git checkout for this comparison.
Full build-source capture and accepted CI acquisition remain pending Docker access.

Docker Desktop's existing JEDM containers remained running with unchanged uptime.
No Docker engine restart, integration setting change, JEDM package/configuration
change, staging2 release or receipt installation was performed. Desktop automation
could read Docker's accessibility controls but failed with `coordinate input
geometry is unavailable`; reselect/activate/Raise did not recover a visible target.
Phil was asked to bring Settings > Resources > WSL Integration onscreen and reply
ready so only `Ubuntu-MoFaCTS` can be selected reliably. Integration remains pending;
no unsupported settings-file edit or alternate Docker bridge was introduced.
These setup notes are local/uncommitted. Unrelated working changes remain preserved.

## Audit batch published; CI passed; Linux release-setup decision reached (2026-11-03)

Phil authorized publication of the reviewed batch and canonical staging2 profile,
one fresh Meteor integration run, and continuation to the next decision point.
Published MoFaCTS `630eabdb9f9a9ffe8d1f013f0d7eba112864ee07` on `main` and
config `9a35460cecf6b403e5ab7359d3d2a7a10574cc1d` on its existing `master` branch.
Commit hooks passed. Unrelated working changes in both repositories were preserved.

[CI 41702322064](https://github.com/memphis-iis/MoFaCTS/actions/runs/41702322064),
attempt 1, job `126148511434`, passed. This consumed the single authorization;
there was no rerun. Meteor outcomes were **975 server passed / 15 pending** and
**1,237 browser passed / 7 pending**, with zero failures. Lint, application/vendor
typechecks, Phase 0/capture/application contracts, source protection/binding,
canonical Compose amd64 image construction, image source/runtime identity,
standalone-Mongo rejection, Change Streams startup/health and cleanup passed.
[Security 41702321872](https://github.com/memphis-iis/MoFaCTS/actions/runs/41702321872)
passed all four jobs, including the native Linux host-auditor contracts.

Artifact metadata observed: source `13263439675`, 177548 bytes, ZIP SHA-256
`52f078dad7dd865b4cc7bbcd19cf8be639655a57a2c4bbd3461d12e856d2edcd`;
image `13264052735`, 604 bytes, ZIP SHA-256
`b007fa83df3243c8d968063bfe2f607617e52ec8dd1d4752f3c898a363e1d1df`.
Both expire 2026-11-17. The source artifact was downloaded for bounded progress
inspection; this is not accepted acquisition or release qualification.

A separate source-only capture used a committed Git archive, excluding unrelated
working changes, and passed the existing local capture/verify-tests checks.
However its identity differs from CI: Windows snapshot
`983dd741210c731022dccb04ca16c05934eaef38cfb598d01a1b4e4cafa571d3`,
CI snapshot `cffa1f80f3c637fef52adcc12e6b3289cc9be860d18f451b2ed6c464481705fb`.
The test-input contract digest agrees, while supplemental digests differ.
Native Docker tar inspection confirms ordinary Windows-source files such as
`Dockerfile` enter Docker as mode `0755`; Git records that file as `100644`.
Windows filesystem inspection reports mode `0666`. Passing the Windows round trip
does not establish a match with Linux CI. No digest was substituted, no acquisition
was accepted against conflicting source, and no application candidate was deployed.

The next decision is a Linux release/capture environment. Existing WSL distro
`Ubuntu-JEDM` has Git and a Docker CLI, but no `node` executable and no Docker daemon
connection (`/var/run/docker.sock` is absent). Recommended: approve the pinned Node
runtime plus Docker Desktop integration for that existing distro, then run the
existing capture workflow with Linux source modes. The earlier Node-only question
was superseded by this complete prerequisite question. `AGENTS.md` requires explicit
approval for the new runtime dependency. Neither prerequisite has been installed or
enabled, and no source-digest rule has been changed.

Repeated read-only staging2 preflight confirms the retained `a3155584` image/config
ID, healthy HTTPS 200 and Node 24.15.0. Protected audit configuration, forced-command
entry point, receipt and receipt tooling remain absent. The approved host setup and
current-release/receipt qualification will resume after the Linux-source decision
and matching evidence; production and older staging remain excluded. Phase 0 is open.

## Explicit Sidecar absence implemented locally; publication and qualification pending (2026-11-03)

Phil selected keeping the optional database-tooling Sidecar absent on staging2
and explicitly auditing that condition. The controlling decision is recorded in
the plan. This authorizes the absence contract; it does not establish successful
host installation, actual absence, a current qualified release or a completed
Phase 0 gate.

The local correction requires `MOFACTS_SIDECAR_EXPECTED_STATE=absent|configured`
in the protected configuration, without an inherited or inferred default. The
existing Sidecar username remains required and distinct from app/audit users.
Absent mode requires its password and role unset/empty and checks both the
reserved principal and actual host/container evidence. It must reject known
helper containers even if stopped or unpublished, reserved endpoint declarations
or publications including host remapping, and relevant TCP/UDP listeners even
on loopback. Configured mode retains genuine credential/scoped-role verification
and the existing zero-or-two-loopback listener contract; it is not uptime proof.
Metadata command/query failures and malformed or over-bound inventory remain
`ERROR`. Observed unexpected presence or permissions remain `FAIL`; no omitted
authentication receives a fabricated connectivity exit code or passing result.

The modern app-role correction uses the single deployment-owned definition in
`deploy/mongodb/read-default-concern-role.json`. It requires the exact app
database role plus `admin.mofactsReadDefaultConcern`, and verifies the latter's
one cluster `getDefaultRWConcern` action with no inherited roles. The observer
does not invoke provisioning or mutate roles. Its historical `ADMIN_USER` setting
needs only `viewUser` on the app database and `viewRole` on `admin`, without
collection data or user-management permissions.

Matching installation guidance now includes root-owned mode-0644
`host-sidecar-policy.jq`, `host-mongo-roles.js` and the shared role-definition JSON,
in addition to the existing policies and host command. All protected settings
are cleared before reading the configuration. Configuration and executable
policy files require exact ownership/mode, a single regular non-symlink file,
and protected ancestors. Mongo reads have bounded execution times. Oversized,
NUL-bearing, malformed or contradictory metadata cannot become passing evidence.

Verification used pinned Node **24.22.1**:

- Full application typecheck and lint passed; lint still covers **323** security
  surfaces. Its first run found two new-test formatting errors; both were
  corrected before the final passing run.
- Final source-security suite: **61 passed / 6 platform skips / 0 failed**.
  The skips are five standalone Linux jq cases and the hosted root-fixture
  wrapper. The actual root Bash/jq fixture was separately executed on staging2:
  **54 cases passed**, using synthetic commands under temporary root-only paths,
  SHA-256-verified source transfer, and no installed-tooling or live-data changes.
  Cases include absent/configured modes, stopped/unpublished/remapped helpers,
  failed observations, exact role/exit interpretation, omitted absent-mode
  authentication metrics, inherited settings, byte bounds, symlinks, hardlinks,
  writable ancestors and policy-file permissions.
- Phase 0 qualification tests: **138 passed / 7 existing platform skips**;
  source-capture tests: **92 passed / 6 existing platform skips**. Runtime image
  capture roots and Dockerfile wiring remain unchanged. The whole Mongo source
  directory mount already includes the adjacent role JSON. The batch does not
  import or depend on the unrelated untracked replica-init test.
- A separate live read-only preflight inspected **4** containers, with **0**
  helper containers, endpoint declarations/publications or port-8931/8932
  listeners. The actual Mongo observer ran under mongosh using the existing
  protected administrative connection for this preflight only. It returned
  `sidecarUserAbsent:true` for reserved principal `mofacts_sidecar`, and
  `appRolesExact:false`, `readConcernRoleExact:false` for the retained older app
  installation. This is expected evidence that the modern role requirement is
  still unmet, not a passing full host audit. No account or grant was created,
  and no raw credentials, database records or container environments were retained.

Publication is the next boundary: this batch and the accepted canonical staging2
profile remain local/uncommitted. `AGENTS.md` requires explicit commit/push
permission and one fresh authorization for the next Meteor integration run.
After those checks pass, resume the protected-reader/receipt and current-release
qualification gates. No protected host tooling, app release, UFW cutover or new
Meteor execution occurred in this correction. Prior infrastructure edits and
unrelated application/config/wiki working changes remain preserved. Phase 0 is
still open.

## Staging2 private access and Apache/Certbot setup verified (2026-11-03)

After Phil completed enrollment and requested continuation, actual host/client
observations confirmed the single `mofacts-staging2` node online with only
`tag:staging2`. Its SSH host key matched the previously saved public-route pin.
Fresh operator SSH succeeded through MagicDNS and through private IPv6, using
that pin rather than trusting a newly scanned key. Tailscale SSH, accepted
routes/DNS replacement and exit-node advertising remain disabled. Production and
the older staging host were not changed.

The approved Apache/Certbot operation is complete for the existing application
image. Ubuntu packages are Apache **2.4.58-1ubuntu8.17**, Certbot **2.9.0-1**, and
the matching Apache plugin. Apache owns public HTTPS with a valid staging2
certificate; its packaged renewal timer is enabled and active, with a scheduled
next trigger. The actual packaged command includes
`--no-random-sleep-on-renew`; the legacy cron entry excludes systemd hosts, so no
second renewal schedule was added. The native renewal dry-run succeeded through
the Apache authenticator/installer. Both virtual-host files remained byte-for-byte
unchanged through that test, and the certificate key is root-owned mode 0600.
Caddy is stopped and disabled for boot; its prior configuration, TLS state,
service unit/drop-ins and enabled/active state remain in protected recovery
storage. The accepted new host configuration also has a root-only archive with
successful checksum read-back. No Caddy private key was copied into Apache.

Preflight identified that the existing app lacked `HTTP_FORWARDED_COUNT`. A
staging2 runtime overlay now supplies the documented single trusted proxy hop.
Before recreation, the resolved base Compose image and every declared app
environment value matched the running container; comparison proved the overlay
changed only that setting. Supported Compose recreated only the app with
`--no-build --no-deps --wait`, preserving the exact image and existing data.
The running image remains `a3155584`, config ID
`sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`;
no newer application candidate was built or deployed.

The accepted canonical profile is in `C:\dev\mofacts_config\staging2`, with the
matching runtime overlay installed alongside the existing hosted base Compose.
The HTTPS site preserves staging2's actual CSP/HSTS values, including its existing
instructional-resource origins. Apache's late response-header expression retains
an application-owned stricter CSP, with exactly one header. An explicit HTTP Host
guard rejects other hostnames before proxying. The existing WebSocket mappings
precede `/`, and the ACME challenge exclusion remains owned by certificate
renewal. Global hardening is maintained in the existing `security.conf` owner;
the server-name file no longer duplicates those settings.

Executed acceptance:

- Six isolated native Apache cases passed: ordinary 200, strict-policy 200 and
  404, upstream 502 without CSP, local 404, and wrong-Host 421. Each returned one
  expected CSP, and the wrong Host/local error did not contact the synthetic
  upstream. Both temporary loopback fixture listeners were removed.
- External pinned-Node probes passed valid HTTPS health **200**, exact existing
  CSP/HSTS, HTTP **301** to the intended HTTPS origin, and wrong HTTP Host with
  correct TLS SNI **421**. Certificate validation remained enabled.
- Both real public `/websocket` and SockJS WebSocket routes upgraded over valid
  TLS. The server-side checks also verified their WebSocket accept digests.
- Chrome rendered the sign-in page with semantic email/password fields and no
  captured CSP or WebSocket errors. No credentials were entered. Authenticated
  learner/media/provider behavior was not repeated in this infrastructure-only
  operation and is not claimed as fresh acceptance.
- Apache configuration tests, native renewal dry-run, package renewal lifecycle,
  private management access and final app health passed. No Meteor invocation
  was performed; its last single authorization remains consumed by the passing
  `b5dc39c0` CI run recorded below.

Preparation failures were retained rather than relabeled: an Apache package hook
attempted to bind Caddy's occupied ports, leaving a stopped/disabled failed unit
while Caddy continued returning 200; that state was reviewed and reset before
activation. The isolated fixture initially raced its upstream startup and was
corrected with bounded readiness. Verification assumptions about a hidden Certbot
flag/package command and the external probe's TLS SNI were corrected against the
actual version/behavior. An external version-header check found the packaged
security file overrode an earlier duplicate; settings were moved to their owner
and the duplicate removed. Final native/external checks passed with no relaxed
policy, alternate runtime or disabled certificate validation.

At this infrastructure checkpoint, the remaining decision was Sidecar policy.
Staging2 had no genuine optional database-tooling Sidecar service/identity, while
the auditor required its credentials even when the helper was absent. Phil
subsequently approved explicit audited absence, as recorded above. No unused
Sidecar credential was fabricated and no check was
silently skipped. The modern application's exact read-concern role correction is
also required before a new release/full host audit; the existing read-only
permission must not be removed to satisfy the outdated one-role predicate.

Protected host-reader credentials/configuration, receipt tooling, matching
current release/source/host proof and the firewall cutover remain incomplete.
UFW remains inactive and public maintenance access remains available until both
private operator and restricted audit access have been proved. This does not
close Phase 0. This operation's public notes and canonical staging2 profile are
local/uncommitted; unrelated application, config and wiki edits remain preserved.

## Hostname batch passed; staging2 enrollment pending operator handoff (2026-11-03)

The approved hostname correction and audit notes were committed/pushed as
`b5dc39c0b13347024accdd276e71cf7ac65542eb`. The exact commit's
[CI 41649356781](https://github.com/memphis-iis/MoFaCTS/actions/runs/41649356781)
and all four jobs in
[Security 41649357129](https://github.com/memphis-iis/MoFaCTS/actions/runs/41649357129)
passed on attempt 1. This consumed the single fresh Meteor authorization; no
retry or second invocation occurred. Hosted results: **975 server passed / 15
pending**, **1,237 browser passed / 7 pending**, harness **26/26**, Phase 0
**145/145**, capture **98/98**, source-security **44/44**, zero native skips or
failures, and **323** classified surfaces. Canonical Compose amd64 image
construction, embedded/tested source matching, runtime/ABI checks, standalone
Mongo rejection, Change Streams health, source protection and cleanup passed.
These checks do not qualify or deploy a workstation/staging2 release image.

Observed artifact metadata from that exact run/attempt (not downloaded or
acquired as an evidence bundle): source artifact `13236283794`,
`source-observation-41649356781-1`, ZIP digest
`038f4efe08cf80c90cfca07bb9388203bed68bc48940878038a33639d51af0d5`;
image artifact `13237766403`, `image-observation-41649356781-1`, ZIP digest
`2cb66c83bc423417b21d06cc8edb83a2f7df3ec137124d781322ee2c9e2ebaf0`.

After the shared policy save, actual private TCP 22 connectivity from the
expected PC source to the existing production node succeeded over both IPv4 and
IPv6. No production shell command, configuration or account change was made.
The native policy assertions cover the retained CI path; no additional
production audit workflow was dispatched. The node named **Elric** is this
operator PC and remains necessary for the approved private management paths;
it is not a retired server to remove.

The official Tailscale Ubuntu Noble stable repository supplied staging2 package
**1.104.5**. Repository/key files were absent before installation, protected
recovery checksums passed, and the daemon is active. Its current backend is
`NeedsLogin`: enrollment requested private name `mofacts-staging2`, only
`tag:staging2`, ordinary OpenSSH, no accepted routes/DNS replacement or exit-node
advertising. The one-time enrollment URL/output is retained only in protected
server state and the designated OneDrive credential directory, never in this
record. The browser enrollment flow requires operator authentication; its tab is
handed back after Phil reported automation interfered with manual sign-in. No
successful enrollment, actual node tag or private staging2 login is claimed.
Public SSH, Caddy, UFW and the application were unchanged; HTTPS health is 200.

Phil also explicitly approved Certbot and its Apache integration for certificate
issuance/automatic renewal. That approval persists; installation has not yet
occurred. A private Apache candidate preserves staging2's actual CSP/HSTS rather
than dropping its existing instructional-resource origins through a different
host's template. It has not been installed or syntax/runtime qualified.

A further bounded source-compatibility observation is recorded before any app
upgrade: existing staging2 has one scoped `readWrite` app role and no custom
read-concern role. Current canonical provisioning adds the exact read-only
`admin.mofactsReadDefaultConcern` role, while the old host audit requires exactly
one app role. A modern release therefore needs a maintained role-contract
correction before claiming full host acceptance; do not remove that required
runtime permission to satisfy the old predicate. No database user/role was
changed by the read-only prerequisite probe. Protected receipt installation and
release/source/host proof remain incomplete; Phase 0 remains open.

## Tailnet partition and hostname publication authorized (2026-11-03)

Phil approved saving the reviewed staging2 isolation policy, then continuing the
already authorized server setup. He also explicitly approved committing/pushing
the hostname correction and audit notes and one fresh Meteor integration CI
execution. This supersedes the pending-permission checkpoint below. The one CI
authorization is reserved for the push-triggered combined workflow; no dispatch,
retry or second Meteor invocation is included.

The initial native Tailscale save rejected the draft's positive assertions that
paired explicit IPv4 sources with IPv6 destinations and vice versa. Read-back
confirmed the old policy remained active. The assertion correction tests each
explicit address family separately and retains all 12 TCP/UDP cases, both
address families, and tag-based cases. The two grants, SSH stanza and tag owners
are unchanged from the approved proposal. The rejected original and corrected
candidate are retained separately in the designated OneDrive directory. No
rejected candidate was treated as applied or passing.

The corrected policy was accepted and retained by Tailscale. A fresh server
read-back, parsed after Tailscale's formatting, matched the entire corrected
candidate including both grants, unchanged SSH rules/tag ownership and all
12 assertions. The separate Tests view lists the retained corrected cases.
Exact accepted policy text and a screenshot of that view were saved beside the
original/candidates in the designated OneDrive directory. This is native policy
acceptance, not staging2 enrollment or proof of its actual tag/SSH/firewall state.

## Production-like staging2 setup approved; recovery state preserved (2026-11-03)

Phil approved the expanded setup recommended after the failed conditional
preflight below, and selected the existing Tailscale network already connected
on this PC. The scope includes Apache/private management, dedicated restricted
audit access and protected configuration, necessary scoped database audit access,
and a verified staging2 release with retained evidence. Production, the older
staging installation, new spending and unrelated access remain excluded; fresh
single-use Meteor and explicit commit/push boundaries remain in force.

Read-only reinspection confirmed Ubuntu 24.04/amd64, about 3.7 GiB RAM and
65 GiB free disk. The app still runs the previously observed `a3155584` image,
healthy, with HTTPS `/health` **200**. Compose project `staging2` uses
`/opt/mofacts/deploy/docker-compose.yml`; the app publishes exactly
`127.0.0.1:3000`, and MongoDB/Redis publish no host ports. UFW is inactive, and no
dedicated MoFaCTS audit account was found. Apache, Tailscale and Certbot are not
installed on the server. The PC's existing Tailscale connection is online with
MagicDNS enabled; that does not establish server enrollment, plan entitlement or
appropriate access rules.

Before changing services, the deployment owner preserved the prior app image
and host configuration in a root-owned mode-0700 recovery directory. Its image,
configuration and identity archives are mode 0600; checksum read-back passed.
Configuration includes the existing Caddy TLS state, private app inputs, Compose,
SSH and UFW files. These bytes remain protected on staging2; no private values or
database records were copied into local diagnostics. A bounded recovery index
was saved in the designated personal OneDrive Desktop credential directory.
This is preservation of the existing usable state, not a restore rehearsal or a
qualification of the old release. The application/proxy/firewall remained
unchanged and health stayed **200**.

The maintained auditor hardcodes the production public hostname in its Apache
check. A narrow local correction now requires `MOFACTS_PUBLIC_HOSTNAME` in the
protected configuration and clears any inherited value before sourcing that
file. One Apache policy follows the existing AWK policy-file pattern: it validates
bounded lowercase DNS syntax and compares the hostname and enabled-site path
literally. Environment carriage avoids AWK backslash decoding. Missing/invalid
identity fails through the existing configuration `ERROR` path; there is no
default. Control IDs and report field names are unchanged. Template, installation
guidance, source-capture input selection and regression tests were updated.
Existing hosts must set the explicit hostname and install the new policy before
upgrading the auditor. No production file was changed.

Independent source review found no blocking issue. This correction preserves the
existing single-vhost Apache output contract; it does not add detection of every
extra active HTTPS vhost elsewhere. The local checks do not establish actual
Apache routing or full restricted-reader acceptance on staging2.

Local verification under pinned Node 24.22.1/npm 11.19.1 passed: full application
typecheck and lint (**323** classified surfaces), source-security **44/44** with
zero skips, supplemental source-input tests **14 passed / 1 existing Linux-only
skip**, Phase 0 **138 passed / 7 platform-specific skips / 0 failed**, host-script
Bash syntax and diff whitespace checks. The pending supported CI run must cover
the Linux-only cases; no fresh Meteor run is authorized by the setup approval.
The correction and audit notes remain uncommitted. Publication requires explicit
commit/push permission and fresh single-use Meteor authorization because a code
push triggers the combined CI workflow. Only reviewed committed tooling may be
installed; this local correction has not been transferred to staging2.

Phil completed the Tailscale browser sign-in. The console shows the existing PC
and production server, with their IPv4/IPv6 identities independently matched to
the local client. Its current Personal plan displays 1/6 seats and 0/50 included
tagged resources; no purchase or plan change was made. This is the observed
account capacity, not an executed enrollment.

The live policy contains a blanket `*` source / `*` destination / all-protocol
grant. It would include a newly tagged staging2 host. A narrower grant alone
would not restrict the blanket grant: Tailscale grants are additive. Enrolling
staging2 in that state would undermine the selected isolation boundary. No
enrollment, key creation or live policy save was performed.

A concrete replacement is prepared as an **unsaved** console draft. It preserves
all current connectivity among the verified PC and production IPv4/IPv6
identities and the existing `tag:ci` runners, then permits only the PC's addresses
to initiate TCP 22 to `tag:staging2`. There is no grant from staging2 to those
existing identities or from production/CI to staging2. The existing SSH stanza
and `tag:ci` ownership are preserved; the new tag has the same existing owner.
This avoids silently narrowing production/CI behavior during staging2 setup.
New identities outside those sets would require explicit grants.

The complete previous policy text, candidate JSON and preview screenshot are
saved in the designated OneDrive Desktop credential directory, outside the
repository. The candidate contains 12 TCP/UDP assertion cases covering preserved
IPv4/IPv6 paths, PC-to-staging2 SSH and denied private cross-target/service paths.
Its editor read-back matched the saved draft exactly and the console displayed
the changes preview. These assertions have **not** been reported as executed or
passed by Tailscale; server acceptance and live reachability remain pending.

Independent static review found no blocking issue in the complete candidate.
Enrollment acceptance must verify staging2 has only `tag:staging2`: assigning it
`tag:ci` would put it into the preserved production/CI group and violate the
selected boundary. No additional node tag is approved by this proposal.

This is the next decision point: approve the specific shared-tailnet partition
before Save. It affects a policy also used by production, even though existing
production paths are intended to remain unchanged. Retain the prior policy for
recovery and prove existing production/CI connectivity plus new private operator
access after any authorized cutover. Ordinary OpenSSH and its forced audit-key
boundary remain the selected staging2 SSH path. Do not enable a separate
Tailscale SSH authentication path as part of this setup.

The console draft is left open for review. The earlier commit/push and fresh
Meteor-run request is still pending; the sign-in reply did not authorize those
actions. No server package, account, permission, audit configuration, receipt
tooling or release candidate has yet been installed. Phase 0 remains open.

## Authorized staging2 preflight stopped before installation (2026-11-02)

Phil authorized staging2 preflight and receipt-tool installation/testing only if
the documented prerequisites pass, with continuation to the next decision point.
Read-only SSH used the existing deployment identity from the designated personal
OneDrive Desktop folder and strict verification against its saved host key. No
new credential, key, account, permission, host file or service was created.

The actual application is healthy: HTTPS `/health` returned **200**; Docker
reports the `mofacts` service in Compose project `staging2` running and healthy.
Its image is `mofacts-local/mofacts-mini:staging2-a3155584`, Docker image ID
`sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`,
with revision `a3155584ca26bbd03b83a123f9852aeddaa29a50`, platform linux/amd64
and Node **24.15.0**. This was discovery of the actual container, not a substitute
for the missing protected selector and not an OCI/config-mapping qualification.

The protected receipt prerequisites did **not** pass:

- `/etc/mofacts` is root:root mode 0700, but
  `/etc/mofacts/security-audit.conf` is absent. There is no existing protected
  `MOFACTS_APP_CONTAINER` selection for this tooling.
- `/etc/mofacts/release-receipt.json` and its lock are absent. Both receipt helper
  files, their `/usr/local/libexec/mofacts-security-audit` directory and
  `/usr/local/sbin/mofacts-host-exposure-audit` are absent.
- Docker, jq, stat and SHA-256 tools are available. Caddy is active; Apache and
  Tailscale are not installed. The reviewed full host-audit template expects an
  Apache HTTPS site and private-management configuration, in addition to scoped
  database/Redis settings. That compatibility cannot be silently assumed.
- The desktop `mofacts-staging-deployment.json` identifies the **older staging**
  hostname and is awaiting acceptance; it was excluded. The staging2-specific
  `deployment-status.json` still identifies `e3029421`, not the running `a3155584`
  image. Its a315 notes match the actual Docker image ID but do not supply the
  current acquisition-record references. No accepted matching release carrier
  with the independent source/evidence prerequisites was identified in these
  designated records.
- Exact-commit historical [CI 37917879685](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879685)
  and [Security 37917879795](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879795)
  passed on 2026-10-09. The CI artifact list now has **zero retained artifacts**;
  that historical success does not supply the new source/image acquisition
  bundles or an independent current workstation observation.

Installation, receipt projection/publication, mismatch testing and recovery
mutation were not attempted: their pre-write gates are unmet. No protected
configuration contents, container environments, SSH keys or learner records were
copied or logged. Read-only output was limited to allowlisted identity,
ownership/mode/link/size/digest and tool/service/health summaries. No Meteor
integration run, build, image publication or deployment occurred. Unrelated
working changes remain preserved.

The next decision is expanded staging2 audit setup, not permission to bypass a
receipt check. The approved rehearsal assumed an existing protected audit
boundary; creating one entails new persistent security configuration/access,
and the actual Caddy/public-management environment needs an explicit compatibility
decision before reusing production-specific host checks. Matching accepted
release/source evidence also needs to be established for the actual test image.
Do not install a minimal substitute configuration, fabricate old metadata, use a
production record, or treat CI's smoke image as staging2 proof. Phase 0 remains
open; the conditional installation authorization did not activate.

Proposed next scope (not approved): make staging2 a production-like security
test target, with the production proxy/private-management arrangement, dedicated
restricted audit identity/key and sudo binding, root-only audit configuration,
necessary scoped database audit access, and a current verifiable staging2 release
while preserving the usable prior image/configuration. This keeps one maintained
host-audit path. Account/access/cost prerequisites must be verified before their
operations; no new spending is authorized by this recommendation.

Keeping Caddy is an alternative design requiring explicitly scoped maintained
Caddy-compatible host auditing. Apache/Tailscale are not requirements of the
standalone receipt parser/installer; they are assumptions of the full host auditor
used by the approved restricted-reader flow. That auditor returns before emitting
`releaseReceipt` when its required configuration is incomplete. A new receipt-only
SSH route or minimal selector-only config would be a different access contract,
not successful execution of the approved rehearsal. No such route was created.

## Candidate preparation published and verified; staging2 rehearsal ready for approval (2026-11-02)

Phil confirmed commit/push and CI for the candidate-preparation batch. It is
committed/pushed as `d87eabc7647bb8e955429348d8a469b1862746d0`; manifest,
lint-staged and staged-secret hooks passed. The exact candidate's
[CI 41553749307](https://github.com/memphis-iis/MoFaCTS/actions/runs/41553749307)
and all four jobs in [Security 41553749287](https://github.com/memphis-iis/MoFaCTS/actions/runs/41553749287)
passed. This consumed the single fresh Meteor authorization, with no retry or
second invocation and one canonical Compose application compilation.

Hosted results: **975 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **145/145**, capture **98/98**, zero hosted
skips. The new Meteor parity case explicitly retained the image-acquisition
locator while preserving the earlier observation-only form. Full app/vendor
typechecks, lint, protected-source checks, image observation, ABI/runtime checks,
standalone-Mongo rejection, replica-set health and cleanup passed.

Published artifact metadata observed for that exact commit/run/attempt:

- Source `13192614690`, `source-observation-41553749307-1`, ZIP digest
  `6c813962c3fd641ec7c55502cd19128daea44636989afcc76a761159f8b817d3`.
- Image `13194555561`, `image-observation-41553749307-1`, ZIP digest
  `0c66d2b600a7cb27990bce96795d34c168c1338f5fa6c872269b1b8218dec798`.

This turn did not repeat the prior live acquisition/preparation probe or capture
an independent workstation release candidate. The passing hosted fixture suite
and prior exact-byte live probe remain distinct evidence; neither qualifies a
release or supplies staging2's actual image identity.

Continuation prepared and independently reviewed the concrete
[staging2 rehearsal plan](../deploy/security-audit/release-records.md#staging2-rehearsal-prerequisites-and-procedure).
It reuses prepare/store/history/project/install/read owners and retains existing
interruption/history fixtures instead of repeating their covered faults on the
live host. Its actual-host acceptance focuses on real identity, protected file
ownership, restricted-channel output, rejection without replacement and recovery.
Preflight must identify suitable actual staging2 metadata and independent source
evidence before writes; CI smoke images, production records and synthetic probe
records cannot substitute. Unexpected customization or unsafe ownership stops
execution. No new credential, permission, service or container selector is
proposed. Only allowlisted identity/permission/hash summaries may be retained;
prior receipt/tool bytes stay in owner-protected recovery storage.

The proposed host tooling is pinned to reviewed source at `d87eabc7`:

- `deploy/security-audit/release-receipt.sh`, 4,959 bytes, digest
  `74643c30068d7d126bad6f510e2296d2f7c6ed871d0bb6559510d313a6fa840c`.
- `mofacts/scripts/security-audit/qualification/releaseReceipt.mjs`, 2,700 bytes,
  digest `bf1265cbe40573f7023ba06e2c50b8f4a259ddd6f83bc2fbf03c478eb6563199`.
- `deploy/security-audit/host-exposure-audit.sh`, 28,057 bytes, digest
  `d83daf7f8df05872209b2e45c6a3168cfa874a277d9ac54b8b2c8eb25c7c92e5`.

No staging2 preflight, protected installation, command-sheet/authoritative-record
write, registry publication or deployment ran. No new architectural choice was
identified: the next boundary is explicit operational approval for staging2's
protected preflight/install/read rehearsal, subject to its stop conditions. The
standing staging2 lifecycle permission does not itself authorize protected-host
installation. AWS recovery setup and Phase 1/catalog activation remain separate.
Phase 0 remains open.

These outcomes and the reviewed plan are a documentation-only follow-up to the
tested code candidate; its commit skips CI to avoid an unauthorized additional
Meteor invocation. Unrelated staging/Mongo/SPARC and wiki work stays preserved.

## Candidate-preparation publication and one Meteor run authorized (2026-11-02)

Phil explicitly confirmed committing/pushing the reviewed candidate-preparation
batch and running CI. The single fresh Meteor authorization is available for the
new candidate and is not an authorization to retry. Only this batch's intentional
changes are included; unrelated working changes stay preserved. Exact committed
identity and CI/Security outcomes will be recorded after execution. No release
record write, protected installation, image publication or deployment is implied.

## Image helper passed; release-evidence candidate preparation continued locally (2026-11-02)

The authorized image helper is committed/pushed as
`39faaebef1cdc37613981b22ae4f16d2caf5c948`. Manifest, lint-staged and staged-secret
hooks passed. [CI 41541002426](https://github.com/memphis-iis/MoFaCTS/actions/runs/41541002426)
and all four jobs in [Security 41541002444](https://github.com/memphis-iis/MoFaCTS/actions/runs/41541002444)
passed. One Meteor invocation and one canonical Compose application compilation
ran, without retry or another invocation.

Hosted results: **974 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **138/138**, capture **98/98**, zero hosted
skips. Full app/vendor typechecks, lint, source protection, image observation,
ABI/runtime checks, standalone-Mongo rejection, replica-set health and cleanup
passed. These results apply to the committed helper, not the continuation below.

Continuation completes a local opt-in candidate-preparation draft, without
changing the production writer or writing release authority:

- A V2 image observation reference hashes exact statement bytes, while the
  preserved image bundle is named by its acquisition-record hash. The raw
  observation reference alone could not locate the bundle. A bounded optional
  `ciImageAcquisitionDigestSha256` now supplies that locator; it requires the raw
  observation reference. Both have explicit distinct roles, with no new index,
  rekeying, storage owner or retention policy. Older V2 forms, six/eight-field
  records and V1 parsing/goldens remain unchanged. Review treated this as routine
  completion under controlling decision 9, not a new user policy choice.
- `deploy/prepare-release-evidence.ps1` and its Node owner accept a fresh candidate
  without existing qualification, acquire through the existing fresh collector,
  bind full identity and exact source/image bytes, and emit only bounded candidate
  JSON. Inputs remain unchanged. Existing proof is rejected, not migrated or
  stripped. Actual deployment/image fields are preserved; no workstation tuple
  is invented and no storage/project/install action is called.
- Local tests: Phase 0 **144 passed / 1 hosted-only skip** (145 total), capture
  **94 passed / 4 hosted-only skips**, source-security **41/41**, full app
  typecheck and lint passed, with the unchanged 323-surface contract. Independent
  review found no remaining correctness/security blocker. One new shared Meteor
  parity case is prepared but has not run; no second invocation was authorized.

The actual new artifacts were acquired and linked using the real PowerShell
wrapper and existing stored sign-in. The input was an isolated synthetic
eight-field candidate, with the hosted run's saved source observation and local
module inventory. Independent assertions verified all eight fields unchanged,
both bundle locators resolvable, no actual workstation tuple, proof classification
`incomplete-unqualified` and identity evaluation `ERROR/proof-unavailable`.
This does not independently capture/attest current dirty workstation source or
establish release qualification. Evidence remains ignored under
`tmp/ci-helper-evidence-41541002426`.

- Source artifact `13185643183`, ZIP digest
  `c9ffbb952dcec73bb0b5c514d9cd4d2ecd9ac34fcab20f23d8553a0e7413c1e7`.
- Image artifact `13185867970`, ZIP digest
  `dced56e91b4a232a1a931a2b66f2cb34ce0c2485bf928bcfe145b27a83b54a2f`.
- Source-acquisition digest
  `20353a18b2f774a00859cedcc3f3f004ea4c4de5ca47e4a775e8f5c89d659288`;
  image-acquisition digest
  `abca16d4f5d8df1159e4af4de3ed393e40c662aa5b893448a4e876639a28a514`;
  exact image-observation digest
  `2817b3f2874cd7b46a886e60a7866dd1ff97517c62d3f44230d87a715d0e7f0a`.
- CI image config ID
  `sha256:dd72f063aa3627895d1848b97c1ea32b36dfe0cb801ce39242ad01d948d67544`,
  source snapshot `e43b9c56b42e28691ac6aaac171a03dc7fa9ce5dfe49e9f568f404a36d3db959`;
  joined source-evidence digest
  `953d70ef5cf4032f86dc2e4e59ac3dc41ab0e10f05e34068027af8c212ec5a07`.

Two initial fixture-admission checks failed before acquisition: an untagged
synthetic image and, after fixing that fixture through PowerShell conversion,
a timestamp whose fractional representation was coerced away. Only the synthetic
input was corrected; parser checks were not relaxed. Public preparation guidance
now preserves emitted JSON rather than date-coercing/reencoding an inspected
object. The corrected end-to-end wrapper check passed.

The preparation/reference continuation remains uncommitted. Unrelated
staging/Mongo/SPARC and wiki edits are preserved. No authoritative release record,
command sheet, protected host, registry image or deployment changed. No new
design choice remains in this slice; the next gate is fresh publication/Meteor
authorization for this exact candidate before integrating the opt-in action into
a release procedure. Actual workstation/registry/running-image proof, complete
catalog/authentication, external reader confirmation, protected installation,
secret-recovery acceptance and the remaining Phase 0 gates remain open.

## Image evidence helper publication authorized (2026-11-02)

Phil authorized committing/pushing the reviewed image evidence helper and one
fresh Meteor integration execution, then continuation within the approved design
until the next decision. This authorizes one invocation without an automatic
retry. The committed candidate and exact CI/Security outcomes will be recorded
after execution; no deployment or authoritative release-record write is implied.

## Release-record V2 passed; CI image acquisition continued locally (2026-11-02)

The accepted checksum correction and release-record draft are committed/pushed as
`29394ded1d0a0d65876a6e78529063eb368bd0a9`. Manifest, lint-staged and staged-secret
hooks passed. [CI 41537962904](https://github.com/memphis-iis/MoFaCTS/actions/runs/41537962904)
and all four jobs in [Security 41537962905](https://github.com/memphis-iis/MoFaCTS/actions/runs/41537962905)
passed. This used the single fresh Meteor authorization and one canonical Compose
application compilation, with no retry or second invocation.

Hosted results: **974 server passed / 15 pending**, **1,237 browser passed /
7 pending**, including the three new V2 parity cases; harness **26/26**,
Phase 0 **129/129**, capture **98/98**, zero hosted skips. Full application/vendor
typechecks, lint, protected-source checks, image observation, ABI/runtime checks,
standalone-Mongo rejection, replica-set readiness and cleanup passed. The old
checksum false-positive run remains failed historical evidence; the exact
correction now has its own passing hosted scan.

Continuation adds the opt-in `deploy/collect-ci-image-evidence.ps1` wrapper and
Node owner. They reuse the source acquisition policy and native ZIP reader,
retain a separate immutable image bundle, match full source/run/attempt identity
and the exact source-evidence bytes, and reobserve remote workflow/job/artifact
metadata before publication. No release authority or workstation image is
inferred. The closed native image profile accepts only the workflow's canonical
`mofacts-ci-image-observation.json`, at most 16 KiB in a 64 KiB archive; the default
source profile is unchanged.

The first live check exposed a draft consumer filename mismatch: it guessed
`image-observation.json`. It failed before image publication and preserved the
valid source bundle. The consumer/profile now require the actual published name,
with a workflow-path regression test and rejection of the guessed alias. The
corrected real wrapper then successfully acquired both artifacts through the
existing stored sign-in. Local-only evidence is under ignored
`tmp/ci-image-evidence-41537962904`; no raw API payload or credential is retained.

- Source artifact `13185470896`, ZIP digest
  `5aafe5fa41add1df0ce323cfdbd56a5c2a919988ebd3abcec05055401de76a36`.
- Image artifact `13186670126`, ZIP digest
  `478a301b3c8c0dfff13d08f7c3ac8e9163381385c1e01548b5c65861bd1ce48d`.
- Preserved source-acquisition record digest
  `74803d78ae169e337041bde3052dc9bf3157526596dceeb80130b0f49a3453b7`;
  image-acquisition record digest
  `429ac5fb3c7a044a56f65452b1a80d59a81547d71472b76f73e9b8c6a3605777`.
- Exact image-observation digest
  `a902e86ebb6c0a474213bfef3b6bc7ff0560772796f40f817bbe1f25799e4c9d`;
  joined source-evidence digest
  `b59cd1313dc859ca473aa1606fdbd3dd6a1c6ebde25c748d871841f09dafbb29`.
- CI image config ID
  `sha256:ddca907e649ab39a513fcc91bcd79362bc6fe076ae3f9c6062e5cf9c8eb0de4c`,
  source snapshot `942554ecaf8937af72b3717451a91514e197709bf1afc7934286721c30e030eb`.

This live helper check used the hosted run's saved source observation and local
module inventory. It did not independently capture/attest the current dirty
workstation source or qualify a release. Success remains `acquired-unqualified`.
Local checks: Phase 0 **137 passed / 1 hosted-only skip** (138 total), capture
**94 passed / 4 hosted-only skips**, source-security **41/41**, native ZIP
**31/31**. Independent review found no remaining binding/ownership blocker. The
new workflow-path test initially failed full lint's regex-spacing rule; its
equivalent counted-space expression and focused suite now pass. Final full lint
passed, including the unchanged 323-surface contract. No TypeScript app source
changed in this continuation; the pushed V2 app typechecks passed in CI above.

The acquisition continuation remains uncommitted. Unrelated staging/Mongo/SPARC
and wiki edits are preserved. No command-sheet edit, authoritative-record write,
protected-host installation, registry publication or deployment ran. Bounded
reader searches in the canonical config/wiki repos found the two existing
command-sheet writers only; this does not prove absence of external readers.
Next is publication/verification of this helper, then explicit release-reference
binding and protected installation. No new architectural choice was established;
fresh publication/CI authorization is required before another push triggers
Meteor. Full catalog/authentication, workstation/registry/running-image proof,
live receipt/recovery and remaining Phase 0 gates stay open.

## Release-record draft publication authorized (2026-11-02)

Phil accepted the identified public-checksum false positive and authorized
committing/pushing its exact correction with the release-record V2 draft below,
followed by one fresh Meteor integration execution. The previous failed Security
run remains historical evidence; a passing result for this new candidate is still
required. This authorization permits one invocation, without an automatic retry,
and continuation within the approved design until the next decision boundary.
The exact candidate and hosted outcomes will be recorded after execution.

## Image observer CI passed; Security checksum finding repaired locally (2026-11-02)

The authorized image-proof batch is committed/pushed as
`c58205128cd489b83d8bc821657a62236cf84a19`.
[CI 41524323711](https://github.com/memphis-iis/MoFaCTS/actions/runs/41524323711)
passed completely, including the first real collector/isolated image read and
separate image-artifact publication. It used the one authorized Meteor invocation
and one canonical Compose compilation; no retry or second invocation ran.
Pre-commit manifest, lint-staged and secret checks passed.

Hosted outcomes: **971 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **120/120**, capture **98/98**, zero hosted
skips. Source/protection, application/vendor typechecks, lint, image ABI,
standalone-Mongo rejection, replica-set health and cleanup passed.

Both published artifacts were downloaded, checked against their reported digests
and read with native ZIP integrity validation:

- Source artifact `13178688049`, `source-observation-41524323711-1`, ZIP digest
  `62a34a9a14ffd7deaa0bf9bbd7e5144477baebb620393a0ce2c3149dbdbcf917`.
- Image artifact `13178359523`, `image-observation-41524323711-1`, ZIP digest
  `561d1f3d1e243d241bb2ba0dbd71c9656cd309b835e149edde5a99933a9aba09`.

The parsed image record remains `observed-unqualified`, lane `ci-test-image`.
Its exact-file digest is
`97cd7e46c3b32841a6df2346d1a2efee2acdbb6d5c8ae45415cbf2b2cfd43349`.
Independent validation matched source identity, commit/run/attempt and the digest
of the exact joined source-evidence bytes:
`49bc1f2808be9f37b868140f6bc71d9cadbc4dc84f8c2ea11f8a58eb799b4948`.
The source snapshot is
`e0bc88c613d5b70392e96ac321375b7faee3ee69ac24685dd6fdfc3dc9c7d442`;
the observed linux/amd64 config ID is
`sha256:59da16c04448bfaa58b44533a9b580c4f9b6f4a0ac6cbdeacf6ec240bfc985c1`.
No registry or workstation release-image identity is inferred from this record.

[Security 41524324580](https://github.com/memphis-iis/MoFaCTS/actions/runs/41524324580)
has three passing jobs and one failed gitleaks job. A read-only, fully redacted
scan reproduced its sole finding at historical commit `56006374`, status-file
line 28: the known public ZIP checksum of artifact `13177217912`, previously
independently verified against GitHub. It is not a credential. The local repair
adds only that exact historical fingerprint to `.gitleaksignore` and rewords the
current checksum note; no detector or broad path is exempted. The paired source
test now requires the exact reviewed membership. The pinned scanner's full local
history scan passed: **785 commits, approximately 34.75 MB, zero findings**.
The hosted failure remains recorded; it is not relabeled green or waived.

Continuation implemented the next local contract/storage draft without changing
the production writer or authoritative record:

- `ReleaseQualificationV2` discriminates the same optional extension. It retains
  one build identity and bounded source/image digest references, with the actual
  workstation identity tuple absent until acquired. Historical six/eight-field
  records and V1 parsing/evaluation/golden fixture remain unchanged.
- Valid incomplete V2 observations may be preserved as `incomplete-unqualified`;
  identity evaluation stays `ERROR/proof-unavailable`. Any supplied actual tuple
  must pass the existing consistency checks. CI image references never supply
  workstation built/published/running identity.
- The existing exact-byte history, atomic replacement and credential-free receipt
  projection remain in use. Synthetic tests verified prior-byte retention,
  inconsistent-input rejection before allocation, and unchanged receipt identity.

Local checks: Phase 0 **128 passed / 1 hosted-only skip** (129 total), capture
**94 passed / 4 hosted-only skips**, source-security **41/41**, full application
typecheck and lint passed. A first source-test run caught the old seven-entry
fingerprint count; the reviewed eight-entry expectation was updated and the full
suite rerun successfully. Three new V2 Meteor parity cases are prepared but have
not executed. Independent review found no remaining V2 correctness blocker.

This correction and V2 continuation remain uncommitted. No additional CI run,
release-record write, production command-sheet edit, host installation, image
publication or deployment occurred. The previous all-green baseline above stays
unchanged. No new design choice was established; a fresh publication/execution
approval is required to verify the corrected candidate before live integration.
Do not bypass the failed hosted Security result or reuse the consumed Meteor
authorization. Referenced-byte acquisition/binding, external reader confirmation,
full catalog/authentication and protected release/recovery gates still remain.

## Image observation publication — one fresh execution authorized (2026-11-02)

Phil explicitly authorized committing/pushing the reviewed image-proof draft and
one fresh Meteor integration run, then continuing until the next design decision.
The existing local checks below remain distinct from hosted execution. The exact
pushed candidate, new artifact and CI/Security outcomes will be recorded after
execution. This is one invocation without an automatic retry or live deployment.

## Helper published and verified; image observation continued locally (2026-11-02)

The authorized helper batch is committed/pushed as
`0f8f1c30c9d98e0f8865025751510d9a5cf4d0de`.
[CI 41520033283](https://github.com/memphis-iis/MoFaCTS/actions/runs/41520033283)
and all four jobs in exact-commit
[Security 41520033398](https://github.com/memphis-iis/MoFaCTS/actions/runs/41520033398)
passed. This consumed the one fresh Meteor authorization; no retry or second
invocation was launched. Pre-commit manifest, lint-staged and secret checks passed.
Unrelated staging/Mongo/SPARC and wiki edits remain preserved.

Hosted outcomes: Meteor **966 server passed / 15 pending**, **1,237 browser
passed / 7 pending**; harness **26/26**; Phase 0 **109/109**; capture **98/98**,
with zero hosted skips. Dependency setup, full lint/application/vendor typechecks,
pre/post source checks and protection assertions passed. One canonical Compose
application compilation and the source/image/ABI/standalone-Mongo/replica-set
runtime checks passed, followed by cleanup. Linux amd64 built/tested image
**config** ID:
`sha256:4eba2ae1e2df9c0b5c6464ea6520e73eb8ac3adf13f26b02ff26e88e082d9c60`.
This is a runner-local smoke image, not a registry manifest/index identity or a
workstation-built/published/deployed image claim.

The authenticated source artifact is `13177217912`,
`source-observation-41520033283-1`. The downloaded ZIP checksum matches GitHub's reported digest:
`1a6c0798d40f01677c653f3a17340a9fa930de8aa8fa6c71e54f3a0cf7ba53e8`.
Native ZIP validation passed. The helper then successfully acquired and
revalidated the exact CI/Security tuple and payloads, retaining acquisition
record SHA-256
`ca62215317e78269b7f0f73fe30a5c8c8ef38e24ec581d8c3f1209f6ce4ea6ee`.
Source snapshot is
`b3a92b7245de790abb0845b71301c44c361aae62c1fd720ea8081a5f64f588ba`.
The records remain `completed-with-pending` / `acquired-unqualified`. The live
read used the retained expected observation and a module-name inventory; it is
not independent proof that later working-tree edits equal this tested source.

After Meteor passed, continuation implemented a separate local draft:

- A strict shared `PostBuildImageObservationV1`, explicitly `ci-test-image` and
  `observed-unqualified`, reusing the existing image shape/parser and referencing
  the exact pre-build source-evidence digest and CI coordinates.
- A collector which observes the actual immutable Docker config/platform and
  fixed bounded embedded-source file, without network or writable filesystem.
  Unique probe ownership is verified before failed/cancelled probe removal by
  immutable ID; foreign ownership or cleanup uncertainty cannot produce proof.
- A CI hook replacing the previous inline image-source assertion, executed from
  the verified captured test application for its installed parser dependencies.
  A distinct image artifact publishes after the existing smoke/protection checks.
- Pure/injected regression tests and five additional common Meteor parity cases.
  CI numeric IDs reject trailing line terminators rather than partial matches.

The local Phase 0 suite is **119 passed / 1 hosted-only skip** (120 total),
including ten new image-observer groups and the CI-reference regression. Capture
checks remain **94 passed / 4 hosted-only skips**. Full application typecheck,
lint, source-security **41/41**, diff checks and YAML/dependency/publication-order
validation passed locally, separately from the passing helper CI. The
new workflow hook and five Meteor parity cases have not executed in CI. No real
image probe/build, image artifact publication, registry push or live deployment
was performed for this continuation. No workstation release record changed.

No new architecture choice was needed: the plan already separates CI smoke
observations from actual workstation build/registry/running-image proof. The next
required gate is fresh CI authorization for the changed workflow/shared contract
before publishing this later draft. Do not reuse the helper's consumed permission
or relabel its passing CI as verification of later edits. Catalog closure,
production image linkage, protected receipts/recovery and Phase 0 remain open.
This outcome-only status update is published with CI skipped; the image-proof
code and workflow draft remain local and uncommitted. Recording results must not
consume an unauthorized second Meteor execution.

## Helper publication — one fresh execution authorized (2026-11-02)

Phil explicitly authorized committing/pushing the reviewed acquisition helper
and one fresh Meteor integration invocation, followed by continued Phase 0 work
until the next design decision. The prior local/live-read results below remain
a separate checkpoint. The exact pushed commit and hosted result will be
recorded after execution; this authorization includes no automatic Meteor retry
and no live deployment.

## Approved GitHub CLI acquisition — implemented locally (2026-11-02)

Phil approved GitHub CLI and his existing stored sign-in as a prerequisite for
the optional helper. This closes the dependency decision below. The local
`deploy/collect-ci-evidence.ps1` now owns explicit read-only acquisition of the
selected CI and Security runs. Node composes bounded, sanitized source-evidence
references; PowerShell/.NET owns streaming ZIP validation. No new token, access
permission, runtime installation, active application surface or release authority
was introduced. Public helper/development guidance, AGENTS.md and the controlling
plan record the narrow dependency exception.

The helper validates exact commit/repository/workflow/attempt and successful job
membership, ZIP size/digest/entry types and CRC, strict JSON including duplicate
keys, caller-supplied expected producer observation and independent module-name
inventory, then re-observes remote metadata before exclusive publication. It
retains the validated ZIP/three payloads with a read-only, content-addressed small
record. Existing identical evidence may be referenced after byte verification;
collisions and changes are never overwritten. No automatic pruning occurs.
Raw API/CLI output and sign-in credentials are never retained.

Live GET-only acceptance against the previously completed CI `41511591350` and
Security `41511591390` passed using stored CLI sign-in, pinned Node **24.22.1**
from the existing Meteor tool bundle (the Meteor CLI was not run), and installed
PowerShell **7.6.5/.NET 10.0.11**. It produced acquisition record SHA-256
`c616f27348aaa138e2687cd4599bd34c928f1916b256c6721a096aeede8d85cd`,
state `acquired-unqualified`, preserving the exact `5557ae4b` identity and recorded
server/browser results. The demo used the previously retained expected observation;
it does not prove the current working tree matches that earlier candidate or an
independently captured release candidate. Local demo files remain ignored in tmp.

Verification: **21 new Node checks** pass on pinned Linux; Windows process/file
flows were also exercised with the pinned Node binary. Full Phase 0
suite **108 passed / 1 hosted-only skip**; capture **94 passed / 4 hosted-only
skips**; source-security **41/41**; full application typecheck and lint pass.
Native PowerShell ZIP tests **16/16**, including a forged central-directory length
which the standard reader initially accepted without explicit CRC verification.
All three PowerShell scripts parse. Initial test-fixture wiring and an unused
argument warning were corrected; final checks pass. The CRC concern did not
require a new runtime decision: Microsoft's .NET Core 3.1 source already exposes
the public checksum property, so the existing PowerShell 7 capability gate is
sufficient. No custom ZIP parser or archive dependency was added.
Final review also aligned the Linux output-directory owner/nonshared-write check
with the existing release-record store; its adversarial mode-0777 regression passes.
Cancellation now waits for child close before temporary cleanup, preventing a
Windows file-handle race. A delayed-termination child fixture proves the ordering.

No commit, push, Meteor invocation, new workflow execution, image build or
deployment occurred for this working batch. Existing staging/Mongo/SPARC and
wiki changes remain preserved. The authoritative release record and production
command sheet are unchanged; Windows ACL/cloud durability, required-test catalog
closure and independent image/release proof remain unproven.

Next: publish/verify this helper, then retain structured external post-build image
proof and link bounded source/image references into the existing optional release
extension. Those owners are already selected; no further architecture choice was
established here. The previous Meteor allowance is exhausted, so a push that
starts CI needs a fresh explicit execution authorization before publication.
This is the next operational gate; do not reopen the accepted GitHub CLI choice
or weaken qualification to avoid it.

## Evidence publication and next acquisition boundary (2026-11-02)

The structured-evidence batch is committed/pushed as
`5557ae4b6dd23bc4e874478c987325621e9bd987`; its wiki update is `d02ed42`.
[CI 41511591350](https://github.com/memphis-iis/MoFaCTS/actions/runs/41511591350)
is the third and final attempt in the renewed three-attempt allowance.
The entire CI job passed, including Meteor, evidence validation/publication,
canonical Compose construction, source/image/runtime smoke and cleanup. All four jobs in exact-commit
[Security 41511591390](https://github.com/memphis-iis/MoFaCTS/actions/runs/41511591390)
passed. No further Meteor retry is authorized by that exhausted allowance.
The pre-commit manifest, lint-staged and staged-secret checks passed. Only the
intentional batch was published; unrelated app/configuration/wiki edits remain.

Final hosted results: harness **26/26**, Phase 0 **88/88**, capture **98/98**,
with zero hosted skips; lint, full application/vendor typechecks and the other
required workflow checks passed. Exactly one Meteor invocation and one canonical
Compose application compilation ran in this attempt. The built/tested Linux
amd64 image **config** ID is
`sha256:c114758fe210923e4eb71cd1c07cc07baa8bef7065c381b2db072f80cda65a14`.
The embedded source identity, pinned Node/Undici and runtime-tool removal,
standalone-Mongo rejection and replica-set readiness checks passed against that
config ID. Retained-source protection held through image checks; cleanup passed.
This is not a registry manifest/index digest, registry publication, deployment,
staging2 acceptance or a completed Phase 0 qualification. No live host changed.

The authenticated artifact inspection is complete: artifact `13173322371`
(`source-observation-41511591350-1`) contains exactly the source observation,
bounded raw Meteor run and joined evidence record. Its downloaded ZIP SHA-256
matches GitHub's artifact metadata:
`31416e7cacedd8d919a2549aef3404a7022d5c9424830ec275a6815fdf5e615e`.
Independent local revalidation reproduced the joined record from its raw bytes
and source observation. Source SHA-256 is
`fbd7265f2a050032c23f35b7e762cf0188c780b294bbc1b1c176d78d0f9fd4f0`.
Run `41511591350`, attempt `1`, clean source and the exact commit agree.
Server: **151 modules, 966 passed / 15 pending**. Browser: **213 modules,
1,237 passed / 7 pending**. Zero test or hook failures. The state correctly stays
`completed-with-pending`, qualification `unqualified`. This is verified outcome
provenance, not required-catalog closure or an authenticated release qualification.
The existing 22 pending cases belong to the separately gated Change Streams
qualification lane; this run does not establish those protocol/recovery cases.

The next durable workstation acquisition helper must authenticate its GitHub
artifact download. Using the existing GitHub CLI login for today's operational
inspection is permitted; making `gh` a permanent prerequisite for the optional
qualification helper is a new system dependency. AGENTS.md requires approval,
and the approved helper design currently says not to add a dependency. Native
REST would instead need an explicitly selected credential source; no new token
or storage mechanism has been selected. Recommendation: narrowly approve the
existing GitHub CLI sign-in as the optional helper's prerequisite, with no new
GitHub permissions, tokens or application integration. No helper implementation
or dependency change has been made at this boundary. Existing workstation
release-record authority, protected host channel and unsigned/unqualified
evidence scope remain selected; they are not reopened by this question.

Work stops at that dependency/credential-source decision after completing the
authorized CI review. This outcome-only documentation is committed with CI
skipped so recording it does not launch an unauthorized fourth attempt. The
tested code candidate remains the exact commit above; a later documentation
commit is not relabeled as independently integration-tested.

## Structured Meteor test evidence — local implementation (2026-11-02)

The approved next slice is implemented locally. A test-entry-only Mocha reporter
records each environment's discovered modules, hashed registered test IDs,
passed/failed/pending outcomes and hook failures. The CI wrapper independently
inventories the reviewed server/common/standalone/client discovery scopes,
requires both environment reports, and rejects duplicate/malformed reports,
filters, missing outcomes, failed hooks disguised as success and incomplete
execution. Existing pending tests remain pending. It waits for child stdout to
close before validating/writing a fresh bounded outcome file outside source.

After existing source verification, CI binds those outcomes to the clean source
identity, test-input contract and supplemental digests, and GitHub repository,
commit/run/attempt. The existing 14-day source-observation artifact gains the raw
bounded run and joined record. No titles, assertion payloads, fixture values or
new application endpoint are introduced in those records. Browser worker startup
and premature-exit failures now complete as failure rather than waiting for the
wrapper timeout. Public development/capture and package-maintenance guidance and
the canonical wiki developer guide describe the contract.

Local verification on the canonical Linux watcher container:

- Harness **26/26**, including negative reporter/discovery/result/source-binding
  cases, real synthetic browser-worker processes and a synthetic executable
  exercising the actual wrapper's stdout, evidence and manifest-cleanup path.
- Full application typecheck and lint passed; source-security **41/41**.
- Phase 0 **87 passed / 1 hosted-only skip**; capture **94 passed / 4 hosted-only
  skips**. These local checks do not replace native hosted CI fixtures.
- Small synthetic tests exercised the reporter constructor/completion/event
  interfaces of the exact cached Mocha 10.2.0 server and browser implementations.
  They did not start Meteor or a browser and are not Meteor integration evidence.
- CI YAML parses and the diff has no whitespace errors. Unrelated staging/SPARC,
  Mongo initialization, and companion-wiki edits are preserved.
- Final review restricted evidence setup/enforcement to the explicitly selected
  reporter. Interactive tests retain their ordinary focus/delay/dry-run policy;
  the added regression passes. The stopped canonical localhost watcher was
  restored through `hotfix-local.ps1`; its readiness checks passed before the
  final harness/typecheck/lint verification.

This working batch has not been committed, pushed, run through Meteor CI, built,
published or deployed. The prior renewed authorization still has one unused
attempt; this turn did not consume it. The last passing CI baseline above is
unchanged. The new records explicitly remain **unqualified**: authentication,
an independently reviewed required-test catalog (including allowed pending
cases), independent Security-workflow evidence joining, and protected final
release/image proof are subsequent gates. Runtime-registered test IDs alone do
not prove that the required security cases are complete. Phase 0 remains open.

Publication is now explicitly authorized for this batch, followed by the one
remaining CI attempt and continued audit work until a design decision. The
local-only results above remain a separate checkpoint; the exact pushed commit,
hosted outcomes and artifact review must be recorded after execution. No live
deployment is authorized by this publication step.

## Renewed authorization — successful second attempt (2026-11-02)

The preparation blocker is repaired and verified on the supported GitHub runner.
Commit `936a64aa3939fda466e4dc5091f8d29719b729cc` passed
[CI 41465187050](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187050)
and all four jobs in [Security 41465187121](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187121).
This uses **2 of the 3** renewed authorizations. One Meteor integration invocation
and one canonical Compose application compilation ran in this successful attempt.
The third authorization was not used; work stopped on success. Earlier failed
checkpoints below remain historical evidence, not the current outcome.

Exact executed outcomes:

- Meteor server **966 passing / 15 pending**, browser **1,237 passing / 7 pending**,
  harness **17/17**; zero failures. The pending counts match the recorded baseline.
- Phase 0 contracts **88/88**, capture/private/shared-parent protection **98/98**,
  with zero skips on Linux. The native protected-receipt shell/permission fixtures
  and real shared-parent regression executed successfully.
- Dependency installation/synchronization, lint, full application and vendor
  typechecks, source verification before/after tests, and retained-protection
  assertions passed.
- The same protected candidate was built once through canonical Compose with
  its capture override. Embedded source identity, runtime ABI/Node/Undici,
  removal of npm/npx, standalone-Mongo rejection, replica-set startup/health and
  exact-image smoke passed. The protected source stayed intact through image
  checks. Profile/container/network/unseal/workspace cleanup and action cleanup
  passed.

Recorded identities (integrity coordinates, not authentication attestations):

- Source snapshot SHA-256: `e82ff98816b8acae09a764bfb6c741b74b23b70a960111b5a87eccd7c8483e50`.
- Built/tested Linux amd64 image **config** digest: `sha256:22557a736a7350405c36967c6b73017df7885a733e5ad5313b4f3fc2c4bd3c50`.
- Base commit is the exact clean checkout above; dirty provenance is false.
  This is not a registry manifest/index digest or a published/running-server claim.

The confirmed mechanism was inherited shared propagation creating a hidden peer
when binding the test child. Making each newly owned parent private before child
creation contained it without altering host-parent propagation or weakening any
gate. The old failure was reproduced locally before the fix, and the fixed path
passed modern/classic native APIs and the actual CI regression.

All implementation changes are committed/pushed; unrelated staging/SPARC edits
remain preserved. This outcome-only documentation is committed with CI skipped,
so no third attempt is launched merely to record results. No image was published
to a registry or deployed; no protected host receipt was installed. Complete
authenticated test/catalog evidence, published/running release-proof joining,
live host acceptance and remaining Phase 0 redesign gates are still open. This
success closes the CI preparation blocker, not Phase 0 or full release qualification.

## Renewed authorization — attempt 1 and reproduced cause (2026-11-02)

Commit `cffb3c2a3d5a32c475eca1377f56be5ea81b812f` published the per-operation
observations. [CI 41463643345](https://github.com/memphis-iis/MoFaCTS/actions/runs/41463643345)
stopped before Meteor; the trace shows binding the test child creates two
distinct records with the same backing root. The visible record is a child of
the captured parent; the hidden peer is outside it. This consumes the first of
the renewed three attempts; two remain.

The exact trace/failure was reproduced locally by making the disposable
container's synthetic temporary parent a shared mount. It failed under both
modern and classic APIs before the repair. Making only the helper-owned checkout
and capture bind mounts private before creating descendants makes both native
reproductions pass with strict three-mount validation, actual source write/chmod
denial, writable test output and cleanup. Host parent propagation is not changed.
This establishes shared propagation as the cause of the reproduced extra peer;
the repaired hosted CI execution is still pending.

The repair also validates private propagation, updates the command model to
require isolation before child creation, and adds a real shared-parent Linux CI
fixture. That fixture isolates its own synthetic parent bind before making that
parent shared; it never changes propagation on the host's original temporary
mount. No new package or executable dependency is introduced.
Local capture now passes **94/98 with 4 CI-only skips**; full lint passes
(323 surfaces). One new parser fixture initially omitted its options column;
the fixture was corrected and the suite passed without weakening the parser.
Both actual shared-parent native reproductions pass after the repair.
[Security 41463643187](https://github.com/memphis-iis/MoFaCTS/actions/runs/41463643187)
passed all four jobs for the first renewed attempt.

## Renewed three-attempt authorization (2026-11-02)

The user explicitly authorized another three CI attempts after the previous
three-attempt group below was exhausted. These include scoped diagnostic/fix
commits, Meteor and Compose construction if reached, with no deployment. Count
this renewed group independently; stop on success, a design decision or attempt 3.

The first renewed candidate records bounded mount snapshots after each setup
operation: fixed roles, ordinal parent/backing relationships, read/write flags
and the visible mount selected by an opened directory's `mnt_id`. It omits raw
paths, roots, devices, kernel IDs and file contents. Snapshot data is retained
only internally and emitted on failure; native protection validation is unchanged.
Mock tests explicitly inject visibility observation; Linux production observes
the real kernel. Local capture **94 passed / 3 CI-only skipped** (97 total),
including parent/hidden/visible mapping and diagnostic-redaction coverage.

## Final outcome of the three authorized attempts (2026-11-02)

All three authorized attempts have been executed. None reached Meteor or image
construction. All three passed their separate Security workflow; none passed
the combined CI preparation gate. No additional retry is authorized or scheduled.

| Attempt | Published source | CI | Security |
| --- | --- | --- | --- |
| 1 | `ef8875764bb473ee7925fb48b1a9235e642339aa` | [41456899578](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899578): failed source protection | [41456899480](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899480): passed |
| 2 | `c0ca87e0b47f85927a460600ecb6751a2cbf9453` | [41458037001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037001): failed source protection | [41458037098](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037098): passed |
| 3 | `0cdfd81fa38c8984538f6c1606cdaa506bb7c65c` | [41459078479](https://github.com/memphis-iis/MoFaCTS/actions/runs/41459078479): failed source protection | [41459078330](https://github.com/memphis-iis/MoFaCTS/actions/runs/41459078330): passed |

The confirmed runner observation is `duplicate-test-derivative`; attempts 2/3
also distinguish `different-kernel-id`. Source capture and cleanup succeeded.
Explicit remount operands and writable-child-before-parent protection did not
resolve that runner observation. The published changes are not a confirmed
repair. The strict mount and write-protection gates remain enforced.

Local checks of the final candidate pass: full lint (323 surfaces), capture
**93 passed / 3 CI-only skipped** (96 total), and actual kernel protection,
writable test output and cleanup under both modern and forced classic mount(2)
APIs in a disposable network-isolated container. These checks do not reproduce
the hosted runner layout or establish CI acceptance. No application image was
built/pushed/deployed, and no Meteor integration invocation ran in these attempts.
Unrelated working changes were preserved.

Next investigation should collect bounded role/permission/mount-parent relations
after each privileged operation on the supported CI runner and establish exactly
which operation creates or reveals the second derivative record. Do not ignore
the record, relax validation, or try another command variation without that
evidence. A further CI execution needs new user authorization. This final outcome
is published as documentation only with CI skipped to avoid starting attempt 4;
the failed code candidate remains explicitly identified above. Phase 0 and batch
3 release qualification are still incomplete.

## Three-attempt authorization — attempt 2 and final candidate (2026-11-02)

Commit `c0ca87e0b47f85927a460600ecb6751a2cbf9453` was pushed. [CI 41458037001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037001)
again rejected `duplicate-test-derivative`, with `different-kernel-id` confirming
two distinct mount records. Explicit remount operands alone did not resolve it.
[Security 41458037098](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037098)
passed. This consumes attempt 2 of 3. No Meteor invocation/build/deployment ran.

The final candidate creates the writable test child while the capture parent is
still writable, then makes the parent read-only. It removes the child rw-remount
operation entirely. The same strict three-mount topology and write/chmod denial
checks remain; no duplicate is ignored or accepted. Setup completes before any
dependency/test code runs. The command model now rejects binding the child from
an already-read-only parent, and failed-parent-protection cleanup is covered.

Both old and new setup passed in the disposable local Linux fixture using the
modern and explicitly forced classic mount(2) APIs. Thus those local tests
establish final protection/writable-child/cleanup behavior, not reproduction of
the hosted runner's extra layer. Only the authorized final CI attempt can verify
this candidate on that runner. One authorized attempt remains before publishing
this candidate; no fourth attempt is permitted without further instruction.

## Three-attempt authorization — attempt 1 (2026-11-02)

Commit `ef8875764bb473ee7925fb48b1a9235e642339aa` published the refined layout
diagnostics. [CI 41456899578](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899578)
failed before Meteor with `duplicate-test-derivative`; [Security 41456899480](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899480)
passed all jobs. This consumes the first of the user's three explicitly
authorized attempts. Two remain; no Meteor invocation or image build ran.

The next candidate supplies both source and destination to each bind remount,
following the classic util-linux interface without ambient target-only lookup.
The privileged-command regression now enforces those exact operands. Local
capture checks and actual kernel protection/writable-derivative/unseal in the
disposable isolated Linux fixture pass. CI compatibility of this change is
unverified until attempt 2. Duplicate diagnostics additionally distinguish same
versus different kernel mount IDs using fixed labels, never emitting IDs/paths.

## Diagnostic execution checkpoint — `f66aac03` (2026-11-02)

The user authorized the diagnostic publication and fresh combined attempt.
Commit `f66aac03bb919a59d9fca67aeb671483762c5dea` was pushed. Both pre-commit
checks and [Security run 41452105014](https://github.com/memphis-iis/MoFaCTS/actions/runs/41452105014)
passed. [CI run 41452104938](https://github.com/memphis-iis/MoFaCTS/actions/runs/41452104938)
again stopped before Meteor/build, now with `stage=mount-topology`. All mount
setup commands returned successfully; kernel mount-layout validation rejected
the resulting state. No exact missing/duplicate/flag cause is established yet.
Cleanup succeeded. No Meteor invocation, app compilation or deployment ran.

An isolated local Linux reproduction used the existing pinned development image
in a disposable container with network disabled, read-only source-module mounts,
no Docker socket/credentials, and a temporary native filesystem. SYS_ADMIN was
limited to that container's mount namespace for the synthetic fixture. The same
bind/remount sequence, kernel checks, native write/chmod denial and unseal passed
using direct root mount commands. It did not reproduce the hosted runner state
or establish the runner's sudo/mount behavior. The container was removed.
The disposable image reports Ubuntu 26.04/util-linux 2.41.3; the CI runner
reports Ubuntu 22.04. This difference is not itself a confirmed cause.

A further local diagnostic refinement distinguishes only fixed missing,
duplicate, unexpected or incorrect-mode roles without exposing paths/mount
inventories. Capture tests pass **93/96, 3 CI-only skips**. The protection policy
is unchanged. This refinement and checkpoint have not been committed or rerun;
Full lint and diff checks pass. The user subsequently explicitly authorized
three further CI attempts, including narrow diagnostic/fix commits, Meteor and
the Compose build if reached, with no deployment. Count these separately and
stop on success, a new design decision or exhaustion of those three attempts.

## Published execution checkpoint — `ca49f3a7` (2026-11-02)

The user explicitly authorized committing/pushing this audit batch and one
combined CI execution, including a fresh Meteor invocation and Compose image
build. Commit `ca49f3a7e8b5320bfd0c028389395f8b058fdac4` was pushed to `main`.
Pre-commit manifest, staged lint and secret checks passed. The reviewed audit
decision documents were included; unrelated staging and SPARC working changes
were preserved outside the commit.

[Security run 41447040939](https://github.com/memphis-iis/MoFaCTS/actions/runs/41447040939)
passed all four jobs: secret scan, application dependency gate, Mongo sidecar
dependency gate and source/scanner contracts. This does not mean no dependency
alerts exist or that deferred development advisories were repaired.

[CI run 41447041117](https://github.com/memphis-iis/MoFaCTS/actions/runs/41447041117)
failed in **Protect retained source and capture receipts**, immediately after
successful build/test-input capture. Meteor installation, integration tests,
native protection/host receipt fixtures, Compose construction and image smoke
were skipped. Release-protection cleanup reported seal absent; owned workspace
cleanup succeeded. No image was built or deployed. This is a failed acceptance
gate, not a successful integration run or permission to bypass protection.

The helper emitted only a generic sanitized failure, so the exact failing
operation/native cause is not established by retained logs. A local diagnostic
correction now reports only registered stage names, allowlisted errno/native
exit categories and fixed native-error classifications. It never emits raw
stderr, arguments, paths or supplied exception text. Local capture tests pass
**92/95 with 3 CI-only skips**; its added redaction/CLI regressions pass.
The user subsequently authorized publishing this diagnostic correction and one
fresh combined CI attempt. The protection remains enforced; no failure is waived.
The outcome of that next execution must be recorded separately.
All further Meteor invocations retain the fresh single-use authorization rule,
even though this failed attempt did not reach Meteor itself.

## Current execution entry point (2026-11-02)

Every AI worker must first read and follow [AGENTS.md](../AGENTS.md) and any applicable deeper AGENTS.md instructions, then the plan's [controlling decision register](security-audit-durable-redesign-plan.md#0-controlling-decisions-and-worker-entry-point-2026-11-02), this current status and the [Phase 0 contracts](security-audit-phase0-contracts.md). The dated checkpoints below remain evidence of what ran at those times; their older pending-design/permission statements do not override Phil's later explicit decisions.

Settled: workstation release authority and protected credential-free server projection; retain all small accepted release metadata without automatic pruning and the previous usable rollback image/evidence; no old-format report UI/download/archive work; simplest storage with proven safe application rollback; staging2 offline/reset/rebuild permission for this security work; conditional immutable scanner selection; consolidated ambiguous/proposed policy review by Phil; routine engineering discretion within approved boundaries. Existing records are not authorized for deletion. These are design decisions and bounded standing permission, not implementation or qualification claims.

**Secret recovery design selected; setup/recovery verification pending (2026-11-02).** Phil approved AWS Secrets Manager and is the accountable recovery owner. Use one encrypted secret for complete current fixture/provider configuration and a dedicated-labeled retained last accepted rollback version; `AWSPREVIOUS` alone is insufficient. GitHub secrets remain deployment copies. Follow the plan's [controlling recovery decision and gates](security-audit-durable-redesign-plan.md#aws-secrets-manager-recovery-design-approved-2026-11-02): verify account suitability, independent account/MFA recovery, document-size fit and staging2 restoration of both versions. Provisioning, permissions, upload, spending approval and required setup remain pending; no secret/access change or successful recovery is claimed. Do not reopen the selected design; continue independent work while concrete operational gates are prepared.

Batch 2's protected-source/Compose path passed exact-commit CI at `936a64aa` as recorded above. Batch 3's receipt/history tooling and hosted Linux synthetic fixtures passed; live installation, complete acquisition/proof joining and qualification remain pending. Preserve the active thread's concurrent edits and read the latest batch evidence before continuing. Only the previously authorized three-batch implementation scope is recorded here; later-phase implementation/activation requires its own scope and gates.

Each `npm run test:ci` invocation, including retries, still requires fresh, explicit, single-use authorization. Apply the standing staging2 offline/reset/rebuild permission only within its security-work scope; original staging/production, irreversible deletion, new persistent access/security-sensitive permissions and spending are excluded. Commit/push, workflow actions, protected-host installation and other operational restrictions remain as specified by AGENTS.md and plan Section 0. Failed acceptance is reported, never waived. This decision-record update ran no code/tests/build/deploy/host operation and grants no new execution permission.

## Earlier reconciliation and canonical Compose implementation checkpoints

The committed baseline has successful [CI run 41244691248](https://github.com/memphis-iis/MoFaCTS/actions/runs/41244691248)
and [Security run 41244691001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41244691001).
CI's server tests passed **966**, with 15 pending; browser tests passed **1,237**,
with 7 pending; harness tests passed **17**. Post-test source verification,
embedded image-source identity, Docker smoke and cleanup passed. The toolchain
is now Meteor **3.5.4**, Node **24.22.1**, npm **11.19.1**. The dated checkpoints
below are historical; statements that source acquisition or image-side comparison
have never run are superseded by these linked executions. A green production
audit workflow proves scanner execution, not absence of report findings.

### Batch 1 initial implementation checkpoint — superseded by the successful run above

Batch 1 first changed the existing `docker-amd64-smoke` job to build its one app image with the
canonical base `deploy/docker-compose.yml`, `build --no-cache mofacts`, and the
post-test source identity. No image/service definition or private production
command is changed. The prior direct `docker build` invocation is removed.
The existing source/runtime/topology/health checks now consume the built image's
immutable config digest, not a tag that could be replaced between checks.

`ciComposeProfile.mjs` owns a temporary build-only interpolation profile outside
the checkout. It uses existing CI settings and fresh synthetic database/Redis
credentials plus a generated replica-set keyfile; no protected environment or
settings are read. Its role is to satisfy the canonical Compose model during
config/build, not start the Compose stack. Profile state is distinct from the
source capture and is never uploaded. Always-run cleanup validates its marker
and exact temporary parent and unlinks only the fixed owned files. No new
application, Meteor, Docker or system dependency is introduced.

Verification in the already-running Linux development container, using the
pinned toolchain: full typecheck and lint pass (323 syntactic surfaces);
Phase 0 **72/72**, source-security **41/41**, capture/profile **84 passed,
0 failed, 1 Linux-CI-only skip** (85 total). An initial Windows Phase 0 check
failed its unchanged version assertion under host Node 24.15.0; the same suite
passes under the existing pinned Linux Node 24.22.1 without relaxing the test.
Actual Compose `config --format json` resolution with the generated synthetic
profile also preserved canonical context, recipe, image and identity arguments;
its temporary files were removed. Workflow/YAML/shell and diff checks pass.
These local checks include the preserved unrelated working changes and are not
CI evidence for a new committed candidate.

No new Meteor integration, Docker build, push, deployment or protected-host
operation ran for this batch. End-to-end execution of the revised CI job remains
pending fresh authorization. Ordinary production builds remain available without
qualification metadata. Existing `source-matched-unqualified` observations are
not relabeled release PASS. Stronger pre-test sealing, complete/authenticated
evidence, protected release/host ownership and rollback/history compatibility
remain open Phase 0 requirements.

## Active three-batch plan

The user authorized continuing through these three implementation batches. Apply the plan Section 0 decisions and routine engineering discretion; stop for a new unavoidable design conflict or at completion, not for an already settled choice. This does not expand implementation to later phases. No commit/push, fresh Meteor integration invocation, production action or other excluded operation is implied. The separate bounded staging2 permission remains as recorded above.

1. **Canonical Compose CI construction — implemented and CI verified at `936a64aa`.** Replace
   the direct build with canonical Compose and check its exact image config ID.
2. **Retained, protected source — implemented and verified in CI at `936a64aa`.** The user approved combining tests
   and construction in one job. Retain the original captured candidate and
   receipts read-only, keep test outputs in a writable derivative, build through
   the existing capture override, and release mounts before owned cleanup.
   Write rejection, shared-parent isolation, lifecycle failures, workflow wiring
   and exact-image checks passed in the successful execution recorded above.
3. **Release evidence binding — compatibility and approved storage implemented; execution/proof joining pending.**
   Traced the current writer and corrected the draft reader for its eight fields
   while retaining historical six-field support. Join tested/built/published/running
   identities only where evidence is actually acquired. The user approved the
   protected host projection and accepted-record history described below. Source
   matching alone remains unqualified; normal startup behavior is unchanged.

## Batch 2 decision — approved: combine testing and construction

Continued source tracing reached a design decision before changing sealing code.
The current test job cleans its owned capture before finishing; the dependent
image job runs on another hosted worker and performs a fresh checkout. The
embedded digest comparison verifies matching content but does not implement
the approved requirement to retain one sealed candidate for construction.
Changing file permissions alone would also not supply the promised stronger
seal against ordinary same-user writes or a change-and-change-back race.

Recommended direction: combine source verification and image construction in
one CI job, retain a protected read-only candidate separate from writable test
outputs, and supply its context through the existing capture Compose override.
This needs no source-snapshot upload, additional storage service or credentials.
The tradeoff is that an image-build failure normally requires rerunning the
combined job, including the separately authorized Meteor invocation.

Alternative: retain the two-job split and transfer a protected sealed snapshot.
That preserves build-only retries but requires a storage/access/retention
decision; do not upload raw captures as public artifacts or infer authority
from a checksum alone. No storage backend or privilege grant was selected.
The user approved the recommended combined-job approach after discussion of
the retry tradeoff. Implementation has resumed; batch 3 follows after its local
checks unless another design decision is encountered. All observations remain
explicitly unqualified until the separate evidence requirements are met.

### Batch 2 implementation and local verification

One `lint-test-and-image` job now owns capture, protection, the existing test
sequence, canonical Compose construction and exact-image smoke. The checkout
and retained capture/receipts have read-only Linux bind mounts; only the separate
test derivative is writable. Kernel mount observations and real write/chmod
probes are required. Source bytes/modes are preserved. Unknown/nested mounts,
stale receipts and replaced ownership fail explicitly. Partial setup rolls back
its own mounts; an interrupted teardown leaves its receipt for always-run unseal.
Workspace cleanup refuses an outstanding seal before deleting test outputs.
Fresh verification exports use owned temporary siblings outside the protected
capture. The build uses the existing capture override and source-bound Compose
comparison, not a new checkout/context. No extra compilation or Meteor invocation
is added. There is no protection claim against privileged runner compromise.

Final local checks in the existing pinned Linux container: full typecheck and
lint pass (323 surfaces); Phase 0 **74/74**; source-security **41/41**;
capture/profile/seal **91 passed, 0 failed, 3 Linux-CI-only skips** (94 total).
Those three require the hosted CI lane: actual Docker filtering, actual kernel
write/chmod/unlink/replacement denial, and verification while the capture is
read-only. They were added/wired but have not executed here. The mocked lifecycle
tests exercise failed remount, failed probes, interrupted teardown, foreign
mount refusal, missing protection and cleanup ordering. Workflow YAML/shell,
single-suite/build ordering and diff checks pass. Read-only GitHub queries found
no branch protection or branch rules requiring the removed job name.

No fresh Meteor integration, Docker build, push, deployment, privileged local
mount operation or protected-host change ran. Revised CI acceptance remains
pending fresh single-use Meteor authorization and separately requested execution.
All unrelated working-tree changes are preserved. This contributor workflow and
draft reader change affects no UI, learner data, TDF/config schema, localization
or account permissions; public deployment/capture guidance is updated, and no
user-facing wiki change is needed.

### Batch 3 findings and approved storage arrangement

The current canonical config procedure is `deploy production.txt`. It writes
the original six fields plus `imageId` and the fixed operator acceptance note.
The draft reader's exact six-field contract rejected that current record.
It now accepts either historical six fields or the current paired additions,
preserves their values and the PowerShell timestamp, rejects partial/unknown
fields, and checks `imageId` against qualification's running config when proof
is supplied. An operator note alone remains `proof-unavailable`. Regression
fixtures cover both shapes and image disagreement. No stored record, command
sheet or production process was rewritten. Source searches found the existing
command-sheet writer and draft parser/tests; external readers remain unverified.

Tracing also confirmed that the existing host forced-command reader emits host
observations but does not install/read release receipts. The production procedure
replaces its latest workstation record and has no immutable accepted-history
owner. Those were unresolved at source tracing; the controlling 2026-11-02 answers now settle workstation authority, restricted projection and metadata/rollback retention. Implementation still must validate protected destination/reader ownership and access controls. Fabricating published/running proof from CI's
local smoke image would be incorrect; complete/authenticated test evidence also
remains open.

**Approved by the user:** retain the existing workstation record as
the sole authority; preserve each previous accepted record in an immutable
sibling history directory under that same operator-owned location before atomic
latest-record replacement (retain all small metadata records initially; no
automatic pruning). Give the server only a bounded, credential-free projection,
root-owned mode 0600 at `/etc/mofacts/release-receipt.json`, read through the
existing forced-command audit channel. This creates no new service or credentials
and copies no learner data. Installation/replacement must have explicit owning
tooling and collision/interruption/read-back tests. Apply the bounded staging2 lifecycle permission while retaining fresh integration, protected-host installation and production-action approvals as applicable. Do not reopen settled authority/channel/retention choices, and leave production unchanged until its own authorization. No new config key is needed. This decision
is implemented in the opt-in tooling below; it is not a live installation.

### Batch 3 storage implementation

`releaseRecordStore.mjs` reuses the existing parser/identity consistency checks.
It keeps exact previous record bytes in `<record>.history/<sha256>.json`, archives
the new record before publication, and atomically replaces latest with file
sync/read-back (and directory sync on Linux). History is exclusive and read-only;
no update/prune path exists. It uses a visible exclusive lock, rejects links,
multi-link input, unsafe Linux owner boundaries, oversized/invalid records and
inconsistent supplied qualification. An ordinary unqualified record remains
supported. Windows native filesystem checks pass; cloud synchronization and
directory-fsync equivalence are not claimed. The record owner can still change
permissions; this is append-only tooling, not owner-compromise protection.

`releaseReceipt.mjs` owns one standalone, bounded wire parser, reused by the
workstation projection and host-side Node execution. The projection contains
only known image/revision/deployment identifiers and the exact record-byte hash.
It never infers a missing `imageId` or forwards the acceptance note, qualification
tuple, command output, learner data or credentials. `MATCH`/`MISMATCH` means only
config/revision consistency; missing/malformed evidence remains unavailable.

`deploy/security-audit/release-receipt.sh` provides owner-only install and
observation-only read. It validates root ownership, modes, ancestor directories,
single-link files, input bounds and the existing protected container selection.
It pins the inspected running container ID, checks image/revision independently,
executes the protected parser using the app's existing Node, and rejects name
replacement during observation. Installation syncs a root-only same-directory
temporary file, atomically replaces `/etc/mofacts/release-receipt.json` and reads
it back. It uses existing Linux/coreutils, Docker and jq; no package is installed.
The existing forced-command script now exposes the bounded `releaseReceipt`
observation when this trusted tooling is installed. It keeps its no-argument
boundary, original V1 controls and application access behavior.

Recovery is explicit and documented: a killed writer's lock is never taken over
automatically; its owner verifies the process stopped, checks latest/history,
and removes only that writer's identified temporary state. Both archives exist
before latest replacement; post-replace read-back failure can leave a complete
new latest and is not called rollback. This does not create a cross-host
transaction or automatic application rollback. See the public
[release-record procedure](../deploy/security-audit/release-records.md).

No production command-sheet hook, actual release-record write, host transfer,
installation, deployment, Docker build, Meteor integration, commit or push ran.
The current V1 assembler does not consume/retain the new optional host receipt
field yet. Authenticated complete test evidence, inspected OCI publication/config
mapping, final candidate proof joining and historical scanner/runtime compatibility
remain open gates; this storage work does not close batch 3's full qualification
integration or Phase 0. CI/runtime acceptance must precede production hook adoption.

Final local verification of this storage slice: full typecheck and lint pass
(323 surfaces); Linux Phase 0 **87 passed, 0 failed, 1 hosted-Linux-only skip**
(88 total); source-security **41/41**; capture **91 passed, 0 failed, 3 CI-only
skips** (94 total). Native Windows store/parser suite **10 passed, 0 failed,
3 Linux-only skips** (13 total). Its initial file-symlink fixture failed with
Windows EPERM because that operation requires privileges unavailable here; it
was separated into an explicit Linux test so hard-link, junction, size and UTF-8
checks continue to run on Windows without granting privileges or weakening the
storage rejection policy. Actual Linux process-death/lock recovery passed.
Host shell syntax, one-suite CI wiring and diff checks pass.

The skipped host fixture requires the existing hosted runner's jq and sudo; jq
is absent from the local development container, and nothing was installed to
substitute for it. The fixture exercises the actual shell/parser and root-owned
temporary files against synthetic Docker observations, including refused
mismatch/unsafe links/modes/over-limit input, failed rename and serialized
installation. It remains unexecuted, as do real app-container/staging2 host
receipt acceptance and revised combined CI. Fresh single-use authorization is
still required for the Meteor integration invocation in that CI execution.
Unrelated working-tree changes and both companion repositories were preserved.
Public deployment/recovery guidance is updated; this infrastructure-only change
does not require a learner/admin UI wiki change or a data migration.

## Image-side source comparison implementation — 2026-10-13

The preceding authorized fresh CI execution on `e9bdfb9e` completed successfully
([run 38427845958, attempt 2](https://github.com/memphis-iis/MoFaCTS/actions/runs/38427845958/attempts/2)):
server 811 passed/15 pending, browser 1,104 passed/7 pending, harness 16 passed,
zero failures; Phase 0 72/72 and capture 75/75 on Linux. Toolchain, locked package
install, lint/typechecks, post-test source verification, metadata retention,
Docker smoke and cleanup passed. This evidence applies to that previous source.

The next slice adds optional image-side comparison before compilation. Shared
Docker inputs now own the recipe/ignore metadata; a pinned Node observation
stage hashes that exact tree, and compiler copies consume the observed inputs.
Runtime receives a bounded JSON observation outside the input hash. Requested
comparison requires the existing digest, base revision and explicit dirty
provenance; mismatch aborts construction. Ordinary builds record comparison
unavailable without requiring a proof or changing startup/permissions.

The capture Compose override changes only context and two provenance arguments;
all other resolved build/image/runtime values remain checked. CI's successful
source job exposes its existing identity through job outputs, the single smoke
build receives those values, and a runtime metadata assertion compares them.
No extra Meteor invocation, image compilation, dependency or production record
is introduced. No acquisition or image result is relabeled security PASS.

Local checks pass: full app typecheck and lint (28 existing vendor warnings,
zero errors, 318 syntactic surfaces), Phase 0 72/72, source-security 41/41, and
capture **78 passed, 0 failed, 2 Linux-only skips** (80 total). Tests cover normal
unavailable observations, exact bytes/empty directories, malformed provenance,
output self-reference/replacement rejection, Compose mutation boundaries and
existing synthetic capture/build wiring. Workflow/YAML/shell validation and
diff hygiene pass. An initial old COPY-path assertion failed after the deliberate
stage change, was updated to assert observed-source consumption, and passed on
rerun. This revised Docker/CI path has not executed yet; no build or deployment
ran in this slice.

Image-side comparison remains `source-matched-unqualified`. Required next work:
fresh authorized CI/Docker execution, final canonical Compose candidate proof,
stronger pre-test sealing and complete test-evidence validation, then protected
release/host and historical compatibility gates. Staging2 and production remain
unchanged. No user-facing UI/content/schema or database migration changed.

## Consolidated repair release sequence — 2026-10-09

The approved six-step sequence is: commit the current changes; verify exact-commit
CI and Security; build one canonical Compose image and deploy it to staging2 with
rollback retained; run consolidated staging browser/security acceptance; record
outcomes and close only the accepted repair batch; then resume remaining Phase 0
work, stopping at unresolved decisions. Production and original staging remain
outside this sequence.

Step 1 review: the upload/browser repairs are already committed in `309f89c2`.
The remaining checkout changes implement Prolific test-study setup and include
public authoring guidance; the wiki already describes this workflow. Reviewed
methods require admin/teacher roles, rate limits and owner-bound operations.
Focused synthetic Prolific tests passed **48/48**. Real provider test-study launch
is not established by those tests and is outside the upload/browser acceptance
session; no provider credentials or external creation calls are needed here.

The first October 9 native Meteor invocation ended abnormally before final suite
totals. The separately authorized retry completed with **exit 0**: harness
**16 passed, 0 failed**; server **775 passed, 15 pending, 0 failed**; browser
**1,092 passed, 7 pending, 0 failed**. This result covers the working checkout,
including the Prolific setup changes; exact-commit CI remains the next gate.
Full app typecheck and lint passed (28 upstream vendor warnings, no errors),
with **310** syntactic security surfaces. Source-security passed **41/41**,
Phase 0 contracts **72/72**, source-capture contracts **50/50**. The production
dependency audit reported **seven moderate**, no high/critical findings.

Both invocations' orphan test Mongo processes were ownership-verified before
stopping; database files were retained. Test ports are clear, the manifest guard
passes, and the canonical watcher is ready with health, browser bundle, HMR,
supervisor and four active Change Streams. No further native Meteor invocation
is planned unless new changes or failures justify one and authorization is fresh.
Phase 0 remains open. Later step outcomes will be recorded here as they occur.

### Staging2 candidate and acceptance checkpoint

Steps 1–3 are complete. Commit `a3155584ca26bbd03b83a123f9852aeddaa29a50`
was pushed to main. Its [CI run](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879685)
and [Security run](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879795)
both passed. One clean Git archive was built with the supported Compose workflow,
without cache. The resulting staging2 image has source revision `a3155584` and
Docker image identity `sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`;
the remote identity matches. The runtime bundle dependency audit reported zero
vulnerabilities; this is distinct from the application/build dependency audit.
The previous image and protected deployment configuration were retained.
Only the staging2 application was replaced; existing database volumes remain.

Before deployment, world-writable root-owned deployment inputs were corrected
after inventory: directories 755, non-secret regular files 644, shell scripts
755. The private environment file remains 600. Compose validation passed and the
ordinary operator can no longer write the Compose definition. An initial command
omitted the existing Compose project name and hit a container-name conflict;
only its newly created, unattached empty resources were removed. Deployment then
used the recorded `staging2` project and completed with a healthy application.

Step 4 completed for the representative repair acceptance scope:

- Synthetic DDP probes passed **28/28**, including anonymous/cross-user/admin
  denials, forged owner rejection, duplicate identifier rejection, completed
  asset abort denial, public byte integrity, private download denial, retired
  HTTP endpoint 410 and persisted owner continuation after reconnect and an
  application-only restart. Completed synthetic assets were removed through the
  separately guarded management operation.
- Chrome voice preview played unmuted with advancing playback time and no player
  error. Blocking the sample request produced the localized inline failure;
  temporary diagnostics and the original audio preference were restored.
- Visible theme confirmation passed initial Cancel focus, Cancel/Escape
  preservation and return focus, and Confirm deletion of only the named disposable
  theme. Confirm returned focus to Export Active Theme. The original Default
  theme was restored and all three system themes remain. Deletion acceptance used
  the UI, not a backend cleanup call.
- The first file-chooser attempt timed out when targeting the package input.
  The user confirmed extension file access was already enabled. Retrying through
  the visible drop-zone control succeeded: package upload as a separate synthetic
  copy, media upload and Anki analysis all passed. The wizard identified one note,
  one card, one media file and its fields. The disposable package copy was removed
  through the visible guarded confirmation. No extension change was required.
- The existing synthetic learner resumed its lesson after reload, submitted a
  correct response and returned to a dashboard with the saved progress. YouTube
  playback advanced to the ten-second question checkpoint. Player/Plyr resources
  returned 200. This is representative coverage, not every lesson or provider.
- A temporary theme loaded the Google stylesheet and font files with 200 responses
  and applied Roboto. The browser's intentional personal Default override initially
  kept the server theme from appearing; selecting the temporary theme exercised the
  font. Both server/browser Default were restored and the disposable theme deleted.
- The served CSP and nosniff header remain intact; ordinary JavaScript evaluation
  and inline script execution were denied. The retired cookie was absent after
  login, reload and an explicit supported Meteor disconnect/reconnect; reconnection
  restored an authenticated connection. Temporary diagnostic state was removed.

The healthy candidate remains on staging2 with the verified image identity and
rollback retained. Step 5 closes the identified upload/voice/theme repair batch;
it does not qualify every security surface or close Phase 0. Production and
original staging were not changed. No new Meteor invocation was needed.

GitHub separately reports high development-dependency alert 155, `node-forge`
(`GHSA-86w9-cpqp-85rv`), in `mofacts/package-lock.json`, with no patched version
listed at this checkpoint. This is not the runtime bundle audit's zero-findings
claim. Reachability/remediation remains a separate dependency-triage task; the
alert has not been dismissed or treated as fixed.

Step 6 resumes at the existing approved source-test design: acquire supplemental
test inputs, run the complete supported Linux source-test lane against a writable
derivative, seal the candidate and bind final in-image source proof. This remains
unfinished implementation, not release evidence supplied by this staging session.
Release-record readers, protected host receipt ownership/retention and V1 history
approval remain separate unresolved decisions. New concurrent SPARC source and
wiki documentation changes were preserved; they are not in candidate `a3155584`.

## Phase 0 continuation — supplemental test inputs, 2026-10-09

The user chose to defer development alert 155. Prior dependency/source/runtime
triage located `node-forge` under Rspack's development HTTPS-certificate helper;
the deployed application bundle did not contain that package. The alert remains
open, with no dependency override, dismissal or claim of repair in this batch.

The first source-test implementation slice adds the opt-in `collect-tests`
capture action. It verifies the existing capture, copies it into a separate
owned derivative and adds the reviewed root/test/deployment fixtures needed by
the existing checks. Supplemental files cannot replace captured build files
with different bytes or native modes. Missing inputs, links, private/cache paths
and resource-bound violations fail explicitly. Failed acquisition removes its
incomplete derivative; an existing derivative is never silently replaced.
The receipt binds the build identity, reviewed selection contract and resulting
local tree digest. Every success remains `test-inputs-captured-unqualified`.

Verification: full application typecheck and vendor typecheck pass; lint passes
with the existing 28 upstream vendor warnings and 310 syntactic surfaces;
Phase 0 tests pass **72/72** and source-security tests **41/41**. The expanded
capture suite passes **66**, fails **0**, and skips **1** Linux-native file-mode
test on Windows (67 total). Synthetic integration covers fresh capture
verification, receipt identity, reuse rejection and failed-derivative cleanup.
No real Docker capture, Meteor integration, build or deployment ran for this
slice. No dependency, application behavior, data contract or security surface
changed; the maintainer capture guide documents the new action.

Remaining implementation: exercise collection on the supported Linux lane,
complete test discovery/evidence checks and runner cleanup, enforce stronger
sealing, and bind final source proof inside the canonical image build. This
checkpoint does not establish full test-input closure or close Phase 0.
External release/host evidence ownership and V1 historical-reader decisions
remain open. The normal build and production command sheet are unchanged.

## Phase 0 efficiency revision — reuse existing Linux CI, 2026-10-09

The user approved reusing an existing automated lane and limiting staging2 to
deployment-specific acceptance. Source review confirms ordinary CI already runs
the full Meteor server/browser suite on Ubuntu with the pinned toolchain,
Chromium and a disposable MongoDB replica set. The independent Security workflow
already runs the source-security suite, surface classification and secret and
dependency scans. The manual Change Streams qualification injects database
faults/restarts and therefore retains a distinct, explicitly authorized purpose.

The CI definition now adds the Phase 0 and capture contract suites to its existing
test job, without adding a second Meteor invocation or duplicating Security's
source-security suite. The [lane contract](security-audit-phase0-contracts.md#23-supported-source-test-lane-and-evidence-binding)
and public deployment/capture guides now select existing Linux CI as the primary
full suite for committed releases. This supersedes the preceding proposal to
implement another routine full runner locally or on staging2. Dirty-source
qualification remains a separate opt-in future capability, not a requirement
for ordinary committed releases or a reason to borrow clean-commit evidence.

Remaining source qualification still requires capture/protection of actual
build/test inputs, complete test outcome/discovery evidence, and matching source
digests inside the final canonical Compose image. A passing commit SHA or CI's
separately built smoke image does not establish those missing bindings. Staging2
continues to own deployed image/configuration identity, readiness and affected
HTTPS/browser/security acceptance. Unchanged candidate/configuration acceptance
can be reused; full regression repetition is not a routine staging gate.

Local verification passes: workflow YAML and exactly one ordinary Meteor
invocation validated; Phase 0 **72/72**, capture **66 passed, 1 Linux-mode skip**,
and source-security **41/41**. Diff hygiene passes. No app source or dependency
changed, so full app typecheck/lint were not repeated for this workflow/document
revision. No new Meteor run, Docker command, workflow dispatch, server connection
or deployment ran. GitHub execution of the revised workflow remains pending
fresh authorization; the development alert remains deferred and open.

## Phase 0 source observation implementation — 2026-10-09

The separately authorized push of `a6135d0b` completed successfully.
[CI run 37974478896](https://github.com/memphis-iis/MoFaCTS/actions/runs/37974478896)
and [Security run 37974478765](https://github.com/memphis-iis/MoFaCTS/actions/runs/37974478765)
both passed for that exact revision. Linux Phase 0 tests passed 72/72 and capture
tests 67/67 with no skips; harness 16 passed, server 775 passed/15 pending,
browser 1,092 passed/7 pending, zero failures. Docker smoke and cleanup passed.
Those results establish the previous CI revision, not execution of the following
new capture integration or qualification of the staging2 image.

The next implementation slice integrates the existing capture helper with that
same CI job. `prepare-tests` atomically owns capture/collection cleanup; every
ordinary source/test command uses its writable test derivative. `verify-tests`
checks supplemental source/recipe/ignore bytes and uses Docker's real filter to
re-export tested build inputs. Their native digest must match the original build
identity after dependency synchronization and again after testing. Cache/output
exclusions remain Docker-owned; no second ignore interpreter or arbitrary
manifest normalization is introduced. CI retains only bounded digest metadata,
associated with the run/attempt, for 14 days. No raw source or private files are
uploaded; this does not choose protected release/host retention ownership.

Owned test cleanup removes installed dependency/cache links without following
their targets, while captured build-source cleanup retains its strict link
rejection. Synthetic regression coverage verifies mismatched supplemental
inputs, altered Docker-observed build bytes, changed ignore rules, failed
combined acquisition and preservation of external cleanup-link targets.

Local verification passes: full app typecheck; full lint with the existing
28 vendor warnings, zero errors and 310 syntactic surfaces; Phase 0 72/72;
source-security 41/41; capture **72 passed, zero failures, 1 Linux-mode skip**
(73 total). Workflow YAML, captured command working directories, single Meteor
invocation and shell syntax validate. PowerShell syntax and diff hygiene pass.
No new Meteor integration, actual Docker acquisition/build, push or deployment
has run for this implementation. No app behavior, dependencies or data changed.

The retained state is `test-inputs-verified-unqualified`, not a passing source
qualification or production proof bundle. Remaining gates include an authorized
Linux trial, stronger candidate sealing, complete discovery/outcome evidence,
matching final canonical Compose image source, and protected release/host and
historical compatibility work. Staging2 and production remain unchanged.

## Third authorized Meteor invocation — 2026-10-07

The third freshly authorized `npm run test:ci` finished with **exit 1**.
Harness: **16 passed, 0 failed**. Server: **721 passed, 15 pending, 4 failed**.
Browser: **1,086 passed, 7 pending, 5 failed**. All three rendered theme
confirmation tests now pass, including Cancel/Escape, selected-row deletion,
duplicate submission protection and focus retention. The upload ownership,
transport/cookie, download boundary and voice-preview tests also pass.

The remaining failures concern concurrent work outside this repair batch:
three analytics-method history selectors, one dashboard assessment-history count,
and five learner-history construction tests whose fixtures now lack required
feedback text. Full application typecheck also failed on a removed
`createAssessmentModelEvidenceRecord` export used by the resume integration test
and a duplicate `levelUnitType` property in `server/publications.ts`; lint failed
on that duplicate property. These are results from the checkout at check time,
which includes concurrently edited source. No unrelated code was changed to
obtain passing checks. Source-security tests passed **34/34**, and standalone
voice-preview tests passed **2/2**.

The runner removed test-driver resolutions, and the manifest artifact guard
passed. The orphan MongoDB process was matched to this invocation's temporary
database directory, test port and exited parent before stopping it; no database
files were removed. Neither test port remains listening. The canonical local
watcher was already running when restoration was requested; status verified app
health, executable browser bundle, HMR, active supervisor and 37 Change Streams.

Required verification failures still block commit, push and staging2 release.
No commit, push, image build or deployment occurred. This invocation consumed
its single-use authorization. Staging Chrome playback, visible theme deletion
and the remaining remote security/browser acceptance checks remain outstanding.
This result does not close Phase 0 or establish committed-image release confidence.

## Authorized Meteor rerun — 2026-10-07

The second freshly authorized invocation finished with **exit 1**: harness
**16 passed, 0 failed**; server **722 passed, 15 pending, 0 failed**; browser
**1,073 passed, 7 pending, 3 failed**. The corrected admin fixture reached the
real rendered confirmation. Two cancellation assertions incorrectly expected the
shared component's section to be removed: its intentional contract retains a
hidden section. Those tests now inspect only `aria-hidden="false"` confirmations.

The Confirm test exposed an actual focus issue: restoring focus to Delete was
followed by disabling the row during the command, leaving focus on the document
body. The existing Export Active Theme button now carries the controller's
already-defined return-focus marker. Confirm places focus there before starting
delete; Cancel/Escape retain their row-trigger focus behavior. No control was
added, no authorization changed, and the inline controller is preserved. The
regression now also removes only the selected synthetic row on command completion
and checks that focus remains on that stable control while the other row remains.

These source/test corrections have not had another Meteor run. Commit/push and
staging2 release remain blocked by the required failed integration check; the
single-use authorization was consumed by this invocation. Full application typecheck and lint passed after these corrections (55 upstream
lint warnings, no errors). The canonical watcher was restored and verified: app
health, executable browser bundle, HMR on 8082 and supervisor are ready, with four
active Change Streams. No listener remains on the test ports.

The test runner removed driver resolutions; the artifact guard passed and the
version manifest has no semantic diff. The owned orphan test MongoDB was matched
to this rerun's temporary directory, test port and exited parent before stopping
it. No database files were removed. Upstream package npm cache remains ignored.
Production, original staging, provider credentials and unrelated changes remain
untouched. Phase 0 and this candidate's browser/security acceptance remain open.

## Authorized Meteor integration result — 2026-10-07

One freshly authorized `npm run test:ci` invocation finished with **exit 1**.
Harness: **16 passed, 0 failed**. Server: **722 passed, 15 pending, 0 failed**.
Browser reporter: **3 failures**, all in the new theme-confirmation tests. The
browser passing/pending totals were not retained in the bounded output; no
combined passing count is claimed. The package-method, upload ownership and
server download-boundary tests completed without server failures. The full run
used the working checkout, including unrelated concurrent changes, and does not
qualify a future committed-source image.

All three failures occurred before opening a confirmation: the selected theme's
Delete button was absent. Source inspection identified a test-fixture error:
Blaze checks `__helpers.has(name)` before `__helpers.get(name)`, but the synthetic
admin fixture stubbed only `get`. The fixture now declares helper presence as well
as its value. Application authorization and the confirmation repair are unchanged.
This correction still requires another authorized Meteor run; the failed run does
not establish confirmation rendering, focus or deletion acceptance.

The watcher was already stopped before this invocation, with an earlier MongoDB
connection-pool failure recorded. It was explicitly kept stopped during testing.
The runner removed transient test-driver resolutions; the manifest artifact guard
passed. The remaining test MongoDB process was verified against this invocation's
temporary database directory, test port and exited parent, then stopped without
removing database files or affecting another process. The canonical watcher was restored: app health, executable browser client bundle,
Rspack HMR on port 8082 and supervisor are ready, with two active Change Streams.
Full application typecheck and lint passed after the fixture correction; lint
retains 55 upstream warnings and no errors. The corrected fixture is not yet
Meteor-verified.

No commit, push, image build or staging2 deployment occurred. Required integration
failure blocks release. The new package retains upstream `.gitignore` so generated
Meteor npm cache/shrinkwrap output stays untracked. Production, older staging,
provider credentials, learner histories and unrelated source edits are preserved.
Phase 0 and all candidate browser/remote acceptance checks remain open.

## Upload/browser repair implementation checkpoint — 2026-10-06

The approved repair batch is implemented in the working checkout, not yet
committed or deployed. Production and the older staging installation are unchanged.
Phase 0 remains open. See [the upload guide](../docs/uploads.md) and the maintained
package's [provenance and upgrade instructions](../mofacts/packages/ostrio-files/MAINTENANCE.md).

- Maintained upstream `ostrio:files` 3.0.1 source is pinned to
  `442a08912595c552c49fabebf8684bf896ee0fb5`, preserving its license and dependencies.
  DDP start establishes the caller as pending owner; write/finish/abort authorize
  from persisted ownership before stream/file access. No administrator bypass is
  present. Duplicate identifiers and client filename substitution are rejected;
  abort cannot remove completed assets. Missing owners require a new upload.
- HTTP upload code and file-cookie authentication are removed. Explicit HTTP
  transport fails, the app-owned retired endpoint returns 410 before lookup,
  and the client expires the former host-only `x_mtok` cookie without renewing it.
  Existing download visibility and URLs are preserved.
- Voice preview uses only the ten offered direct documentation URLs, owns one
  audio instance and reports failure in localized inline TTS status. Theme
  confirmation now reads its reactive view before checking nonreactive scope.
- Real Meteor tests were added for generated package handlers with Mongo and file
  streams, missing-owner rejection and persisted continuation, DDP-only/cookie
  behavior, download boundaries and Blaze confirmation rendering. They are
  automatically discovered by the existing test entries; they have not yet run.
- Full application typecheck: **passed**. Voice-preview lifecycle tests: **2 passed**.
  Source-security tests: **34 passed**. Full lint: **passed**, with 55 retained
  upstream-style warnings and no errors; the security contract covers **305**
  syntactic surfaces including the package's four generated methods and raw asset
  route. The disabled generated Remove method is classified explicitly. This is
  a narrow package binding, not completion of the runtime-registry redesign.

Fresh single-use authorization is still required for the Meteor suite. Commit,
push, committed-source Compose build, rollback retention and staging2 deployment
remain pending the required checks. Chrome playback and visible theme deletion,
wire-level owner/other-user probes, actual process-restart continuation and the
existing CSP/learner/Anki/fonts/YouTube regressions remain **NOT RUN** for this
candidate. Prior baseline checks below do not establish acceptance for this code.
No security item is marked closed by the local source checks. Unrelated concurrent
content, video and launch work is preserved and excluded from this batch.

## Current checkpoint — 2026-10-04

**Phase 0 remains open.** An authorized isolated non-production target, referred to here as `staging2`, is now provisioned and running. This resolves the missing test-host prerequisite; it does not complete the security qualification lanes. Production and the older frozen staging installation were not changed.

The signup form repair was committed and pushed as `e30294210c36a02350486efe68955b9666d50827`; its wiki FAQ update was committed and pushed separately as `7448876`. The application image was built on the workstation through the canonical base Compose workflow from a Git archive of the application commit, transferred directly to the test host, and loaded without a registry publication. The archive SHA-256, transferred image identity, running image identity, and source-revision label were checked. Docker-inspected image ID: `sha256:1c37cc58e98b645d254dc10c4a6f3c971e6dd4132f7511a423245ff472c4e614`, Linux/amd64. This is an observed deployment identity, not the planned authenticated source-test/image/release proof.

The separately authorized native Windows Meteor integration invocation completed with exit 0: harness **16 passing, 0 failing**; server **695 passing, 15 pending**; client **1,019 passing, 7 pending**; final server and client failure counts **0**. Full app typecheck and lint passed; lint covered **300 syntactic security-surface entries**. The runner removed transient test-driver resolutions, the artifact guard passed, the owned orphan test MongoDB process was stopped, and the canonical local watcher was restored with health, browser bundle, HMR, supervisor and Change Streams ready. The suite ran against the working checkout, including unrelated local changes; those changes were excluded from the committed deployment. This run therefore does not establish the unfinished exact-snapshot Linux qualification contract. No additional test invocation is authorized by recording this result.

| Recorded check on 2026-10-04 | Result | Limit |
| --- | --- | --- |
| Canonical application image build | PASS; Meteor compiled on attempt 1 | Ordinary cached build; not a new source-capture/default-path equivalence qualification |
| Configured runtime npm audit | PASS; zero reported vulnerabilities | Separate build-time dependency audit reported 31 vulnerabilities, including 16 high; GitHub dependency alerts also remain. No whole-image security claim |
| Image transfer and running identity | PASS; archive checksum and image/revision observations matched | Direct transfer only; published registry/platform mapping and final proof binding remain open |
| App, authenticated MongoDB replica set, Redis | Healthy; replica initialization exited 0; 10 active Change Streams observed | Runtime health does not establish authorization, report integrity or full application readiness |
| Public HTTPS | Valid certificate; landing, health, signup and SockJS info endpoints returned 200 | Browser interaction, WebSocket session behavior, headers/CSP, cookies and effective host exposure qualification remain pending |
| Host compatibility | Maintained Ubuntu AWS LTS kernel `6.8.0-1066-aws` installed and booted successfully | The initially provisioned `7.0.0` kernel was rejected by MongoDB; the supported kernel track was changed with explicit authorization |
| Pre-upgrade backup | Created; required database, asset and configuration archives present; previous image retained | Restore and rollback were not exercised; this operational safeguard is not an added scanner control |
| Administrator/learner browser flow and email delivery | NOT VERIFIED on this target | Chrome blocked the automated visit; an available administrator credential does not prove signup, verification, assigned role or successful login |
| Authenticated deployment readiness and security probes | NOT RUN on this target | Earlier local application smoke results do not substitute for these remote checks |

Evidence comes from the authorized execution results and the private deployment checkpoint, which is kept outside Git. No credentials, private runtime settings, learner records, host addresses or credential-file contents are included here. The initial records reconciliation performed no new host inspection, test, build, deployment, commit or push. The separately authorized baseline checks below supersede the corresponding pending observations above. The Phase 0, capture and source-security suite counts in the September checkpoints are historical results, not October 4 reruns.

The dated checkpoints below retain their original execution scope. Older `NOT RUN`, frozen-target and authorization statements describe those earlier checkpoints; they must not override this current checkpoint. Provisioning/deployment permission for `staging2` does not authorize every future security probe, host-audit installation or workflow dispatch. Every new `npm run test:ci` invocation still requires fresh, single-use authorization.

### Authorized staging baseline — 2026-10-04

**Partial; Step 2 remains open.** The following bounded checks used only the isolated target. No application repair, service restart, deployment, Meteor integration invocation, full security scanner, restricted audit-helper installation or production action occurred.

| Baseline check | Current result and evidence |
| --- | --- |
| Administrator access | PASS: the existing signed-in browser session reached admin pages and successfully invoked admin-only deployment readiness. This does not establish a fresh login or a learner denial test. |
| Email verification | The configured owner's email is verified: a minimized read-only database query returned existence/verification booleans only. Mailbox receipt, link handling and a fresh delivery test were not independently observed. |
| Deployment readiness | PASS: all 11 checks passed at `2026-10-04T14:46:09.666Z`, including authenticated MongoDB 8.0.32, strict Change Streams (12 observers, four collections, zero rejected starts), owner role, storage and Redis PING. Content validation covered zero TDFs; it is not learner-flow evidence. |
| Runtime health | App, MongoDB and Redis were healthy. The supported AWS LTS kernel remains `6.8.0-1066-aws`. |
| HTTPS and WebSocket proxy | HTTPS returned 200 with normal certificate validation; HTTP redirected with 308. The secure `/websocket` request returned 101; the insecure request returned 308. The secure curl probe timed out after receiving the upgrade because it intentionally left the connection open for only three seconds; no application message/session persistence test was performed. |
| Security headers | One-year HSTS, frame denial, MIME protection, referrer and permissions headers match the existing baseline policy. **FAIL: the main document supplies neither a CSP response header nor a CSP meta tag.** The existing `external.csp` control requires frame/object/base/form restrictions and would fail on this response. A coherent proxy policy repair and functional verification remain separate work. |
| Cookies | Cookie values were withheld. Observed `x_mtok`: Secure, SameSite=Lax, not HttpOnly. Three experiment-context cookies: Secure, SameSite=Strict, not HttpOnly, consistent with the client cookie helper. Authentication-token ownership and whether a changed cookie contract is appropriate remain unqualified; observation alone is not a complete session-security verdict. |
| Host listeners and exposure | App and Caddy management bind to loopback; MongoDB/Redis have no published host ports. From the permitted workstation, TCP 22/80/443 were reachable and 3000/27017/6379/2019 were not. UFW is inactive, so the cloud firewall remains the SSH exposure boundary. The AWS console session expired and the configured CLI identity was denied `lightsail:GetInstancePortStates`; saved cloud rules, access from another source and IPv6 restriction were not freshly established. |
| Synthetic learner flow | NOT RUN: the normal UI showed one administrator account and no lessons. A two-card package was prepared privately from the prior bounded synthetic fixture structure. The browser file-chooser event timed out before selecting/uploading it; no upload receipt or new learner account exists from this execution. Complete the normal upload/account setup before testing lesson entry, answer persistence and reload/resume. |

The upload page is retained for user handoff. Browser policy requires the user to enter and submit any new learner credential. The prepared package, screenshot and operational checkpoint stay outside Git. Only this status record was edited; unrelated application work was preserved. These results do not close Phase 0 or qualify the pending source-bound, report-contract, provider, restricted-host or runtime-authorization lanes.

### Staging baseline continuation — 2026-10-04

After the user restored AWS access and uploaded the prepared package, the saved Lightsail rules were inspected in the authenticated console: TCP 80 and 443 accept IPv4/IPv6; TCP 22 permits only the operator workstation's IPv4 `/32`; no IPv6 SSH rule or database/Redis opening was present. This supersedes the earlier unavailable cloud-policy observation. It verifies configured rules, not an independent connection from a second source or every IPv6 probe.

The normal Content page listed the uploaded **Staging2 Baseline Synthetic** package. Using the existing administrator session, the bounded lesson smoke passed: dashboard lesson discovery, Start, instruction rendering, instruction reload, Continue into practice, one correct typed response, next-item progression, save/return, and dashboard reload with **one practiced item and 100% accuracy** retained. Reopening the captured instruction URL resumed the practice unit with retained accuracy. Adaptive item selection changed on resume; exact next-card equivalence was not asserted. The synthetic trial remains attached to the administrator account; it is not evidence from a distinct learner role or a real learner history.

A fresh unauthenticated DDP connection invoked `deploymentReadiness` and `getDeploymentBrandProfileDraft`. Both denied access, with `not-authorized` and `unauthorized` respectively. Only those two anonymous method boundaries were checked; cross-user, learner, publication and download coverage remain pending.

Readiness passed **11/11** again at `2026-10-04T19:20:47.452Z`: MongoDB 8.0.32 authenticated; 17 strict Change Streams observers across seven collections; zero rejected starts; one probability expression in one TDF validated; remaining settings, owner, storage, backup configuration and Redis checks passed. No restart, integration-suite invocation, scanner dispatch or deployment occurred.

**Step 2 remains partial.** The existing authentication scanner consumes protected pre-created identities and does not provision accounts. Normal public signup and admin CSV import both require a new password and send verification mail when required. No database role/verification modification, invented account bypass or replacement account-provisioning path was introduced. A distinct verified learner identity is still required for learner-versus-admin tests and independent email-delivery evidence. The absent CSP remains a confirmed failure of the existing external policy; cookie-contract qualification remains open. Private screenshots and the deployment checkpoint retain operational evidence outside Git. Unrelated working-tree changes were preserved, including concurrent deployment-documentation and content-mapping work.

### Synthetic learner baseline completion — 2026-10-04

**The bounded Step 2 checks have now been executed; the security baseline is not clean.** The earlier learner-setup blocker was resolved through the application's existing `signUpUser` API over HTTPS/WSS, using a generated synthetic credential and an operator-controlled mailbox alias. This used normal password validation, account creation and verification mail; no database identity/role/verification edits, disabled authentication or new application provisioning code were used. Credential creation through the server API was separate from browser password entry; subsequent sign-in used the existing generated credential. The private durable credential uses Windows DPAPI encryption. Temporary plaintext login transport files were removed after use.

The targeted verification message arrived in the operator mailbox. Following its normal staging verification link produced a session explicitly labeled **Learner**. A separate password-login DDP probe succeeded and then tested `deploymentReadiness` and `getDeploymentBrandProfileDraft`; both denied the learner with `not-authorized` and `unauthorized`. The probe session logged out. A browser visit to `/admin/tests` redirected the learner to `/home`, where admin controls were absent. These are representative method/route checks, not full surface, cross-user, publication or download authorization coverage.

The distinct learner passed lesson discovery/start, instruction reload and Continue, a correct typed response and next-item progression, save/return, dashboard reload with **one practiced item and 100% accuracy**, and cold instruction-URL resume into the practice unit with retained accuracy. The synthetic lesson and its two synthetic account histories remain available for later qualification. No raw history export or production data was used. The learner browser session was logged out and the original administrator was restored through normal browser password login; the final dashboard showed the administrator role.

Remaining findings are the absent CSP and the unqualified cookie/token contract. Full TLS cipher/protocol enumeration, probes from another source, complete IPv6 reachability, session expiration/revocation, provider, cross-user and full report-contract lanes remain separate qualification work. All 11 readiness checks passed after upload; no additional readiness claim is made for every possible application feature. No integration-suite rerun, service restart, deployment, application repair, commit or push occurred. Documentation whitespace checks passed; unrelated work was preserved.

### Staging CSP repair and file-cookie investigation — 2026-10-04

**The approved CSP repair is deployed on the isolated target; Phase 0 remains open.** The canonical self-hosted Caddy example now supplies a deferred default `Content-Security-Policy`. Application endpoints that return their own stricter policy retain that policy. Script execution is limited to the application and reviewed YouTube player paths; WebAssembly compilation is permitted for Anki analysis. Inline script/style blocks and ordinary JavaScript evaluation remain prohibited. Dynamic style attributes have a separate, bounded exception. Frame, object, base and form restrictions are enforced, with reviewed external font, media and browser API destinations documented in the reverse-proxy guide. No dependency or application authentication contract changed.

The candidate was validated with the installed Caddy, and a loopback-only response probe confirmed exactly one default CSP on ordinary responses and preservation of a stricter downstream CSP. The existing host configuration was retained privately, then Caddy was reloaded successfully. The public document returns 200 with one enforcing policy and the existing security headers; HTTP redirects with 308 and health returns 200. The temporary probe listener was removed. The application image remains `sha256:1c37cc58e98b645d254dc10c4a6f3c971e6dd4132f7511a423245ff472c4e614`; no application rebuild, restart, production deployment or old-staging change occurred.

| Verification after CSP deployment | Result and limit |
| --- | --- |
| Source security regression suite | PASS: `npm run security:test:source`, 32 passing tests, exit 0; includes the proxy policy contract. This is source evidence, not complete browser coverage. |
| Configured lint | PASS: `npm run lint`, exit 0; server boundary, transient test-artifact guard and 300 security-surface entries checked. |
| Administrator login / readiness / WSS | PASS: fresh browser password login restored the administrator role; authenticated WSS probes completed; all 11 deployment-readiness checks passed after the proxy reload. |
| Independent learner flow | PASS: a second synthetic account used normal signup, verification mail/link and password login. Lesson start, instruction reload, typed correct response, next-item progression, save/return, dashboard reload and cold instruction-URL resume retained 100% accuracy and one practiced item. No exact adaptive next-card equivalence claim. |
| Themes and hosted fonts | PASS: theme activation/restoration and a temporary font theme loaded Google's stylesheet and font files with HTTP 200. Server/browser defaults were restored and the temporary custom theme removed. |
| Anki / WebAssembly | PASS: normal file selection and Analyze Deck parsed a one-note synthetic APKG with one image into the setup page. No CSP rejection observed. Full generated-package publication and modern compressed APKG formats were not tested. |
| Local media | PASS: normal Manage Media upload reported success, the synthetic PNG rendered through its served asset URL, and normal file deletion returned the lesson to zero attached media. |
| YouTube / Plyr | PASS: a synthetic lesson referencing an existing authored video loaded the iframe API, player script, privacy iframe, metadata and Plyr icons; playback advanced and reached the synthetic checkpoint. This is representative playback, not every video/resume/provider combination. |
| Public voice sample | NOT QUALIFIED: Test voice issued the expected public sample request, but Chrome reported `net::ERR_BLOCKED_BY_ORB`. No CSP rejection was observed; an independent HTTPS request returned audio with status 200. Audible playback and its browser failure cause remain unresolved. |
| Credentialed providers | NOT RUN: staging provider keys/model bindings are absent. Policy destinations were reviewed; no production credential or paid provider call was added. |

The `x_mtok` cookie is owned by `ostrio:files@3.0.0`, whose deployed client writes the current DDP session ID and whose server resolves it to a live session's user ID for HTTP file requests. It is a file-session bearer capability, separate from the persistent Accounts login token. Its client writer requires JavaScript access; adding HttpOnly blindly would not preserve this contract. The three experiment cookies remain client-owned routing/context fields, not independently demonstrated authentication tokens. No cookie flags, account storage, package implementation or file visibility rule was changed.

Two verified synthetic learners and disposable files established the following bounded outcomes:

- Anonymous DDP writes and owner DDP writes after logout were denied with 403.
- **Confirmed ownership gap:** learner B could write a chunk to learner A's in-progress upload through `_FilesCollectionWrite_Assets` when supplied A's upload identifier. The test used the same synthetic bytes, did not establish identifier discovery, and touched no other upload. The deployed package checks authentication while continuing an upload but does not enforce the initiating owner's identity in this path. A focused owner-bound upload repair and regression coverage are required; authentication redesign was outside this approved investigation.
- Private-marked downloads returned 404 for anonymous, other-learner and owner requests; the app-owned raw asset route deliberately serves only `meta.public === true`. A public-marked synthetic download returned 200 with exactly matching bytes. This does not qualify all export/download surfaces.
- HTTP upload requests with missing, invalid, live, logged-out and disconnected file cookies all returned 404. The app-owned raw `/cdn/storage/Assets` route intercepts the package upload URL, including its authenticated positive control. These responses **cannot establish cookie expiry or revocation**. The supported browser uploads exercised here use DDP; any retained HTTP upload contract needs explicit route ownership review before qualification. No alternate route or bypass was added.

Disposable upload probes, temporary media and the font theme were cleaned up; synthetic identities and lesson fixtures remain for later qualification. Durable credentials are DPAPI-encrypted in the approved private Desktop folder. Temporary plaintext credential transport files were removed. Private receipts and screenshots contain no cookie/login token values or raw learner history. The theme's Delete action did not expose a visible confirmation during cleanup; the owned temporary theme was removed through the existing admin-guarded `deleteTheme` method, with deletion and restored defaults verified. Its UI behavior was not redesigned or attributed to CSP without evidence.

The reverse-proxy guide and source regression test were updated. No app TypeScript changed, so this slice did not require another full typecheck. No Meteor integration invocation was run: each still requires fresh single-use authorization. No commit or push was performed. All unrelated working-tree edits, including concurrent content/import/routing and deployment-documentation work, were preserved. Cookie expiry, the HTTP route contract, upload ownership remediation, voice playback, credentialed providers and the broader Phase 0 qualification gates remain open.

## Phase 0 closeout checkpoint — 2026-09-09

The previously open local execution gates have now been run and passed. The authorized Meteor integration suite completed with exit 0 (harness 16 passing/0 failing; server 675 passing/15 pending; client 972 passing/7 pending). The canonical Docker qualification cycle also passed: fresh application build, all 11 readiness checks before and after restart, authenticated admin/learner flow, package upload, instruction reload/resume, response persistence, dashboard count, cold content resume and cleanup. The local candidate was not pushed to a registry or deployed remotely.

The Phase 0 contract and capture suites pass locally: `security:test:phase0` 72/72, `security:test:capture` 50/50, `security:test:source` 30/30, and `security:surfaces` reports 297 covered syntactic entries. Full typecheck and lint also pass. These results close the local characterization and bounded Docker/Meteor gates, but they do not close Phase 0 itself.

Remaining Phase 0 exit items are decisions and protected-lane work: supplemental test-input acquisition and source-bound Linux qualification, final in-image proof binding, external release-record/host-receipt ownership and retention, V1 historical-reader approval with previous-image storage qualification, and authorized non-production HTTPS/host/provider/composition qualification. No production restriction or new security denial was introduced by this closeout work.

## Meteor integration checkpoint — 2026-09-09

The user-authorized `CI=1 TEST_SETTINGS_FILE=<absolute settings.ci.json> npm run test:ci` run completed with exit 0. Harness preflight: **16 passing, 0 failing**. Meteor server suite: **675 passing, 15 pending**. Browser/client suite: **972 passing, 7 pending**. Final runner summary reported **SERVER FAILURES: 0** and **CLIENT FAILURES: 0**. The harness removed/verified no transient `meteortesting:*` entries in `.meteor/versions`; the artifact guard passes.

This was the supported native Meteor integration environment, not Docker or production evidence. No source fixes were required during the run. A post-run supported watcher restart briefly encountered a locked log during rotation; the lock was traced to two diagnostic shell readers, which were terminated, and the canonical watcher was restarted. Final status: port 3200 app health, Rspack HMR, browser bundle, supervisor and Mongo Change Streams all ready. No commit or push was made.

## Full application smoke checkpoint — 2026-09-09

### Authorized repair cycle — 2026-09-09

Shared launch preparation now owns first-instruction initialization through `initializeLessonLaunchEntry`; dashboard and route callers consume the resulting entry decision rather than writing duplicate instruction Session state. Cold instruction URLs with saved progress use the existing content-resume lifecycle and retain the lesson/course descriptor. Caller-specific audio warmup, learner overrides and loading feedback remain in place. Canonical history validation and existing completion restrictions are unchanged.

The item-count failure was `Number(null) === 0` in the client formatter, not evidence of lost stimulus data: the snapshot deliberately supplies an unknown total. `practiceMetrics.ts` now displays the practiced count alone for an unknown total; supplied totals and non-applicable states retain their meanings. No broad stimulus fetch, schema change, data migration, new permission or deployment workflow was introduced.

Regression checks: 18 checked-in decision/formatting tests passed through an isolated TypeScript harness with explicit Meteor/engine boundary doubles; three additional local checks of the actual router bootstrap function passed with mocked I/O, including redirect ordering and course descriptor preservation. These 21 checks are not Meteor integration. Full lint passed. An initial test-only optional-undefined type error was corrected; full typecheck passed afterward. The wiki developer guide documents initialization ownership and unknown-total semantics. Unrelated concurrent course-assignment and existing security/deployment edits were preserved.

### Fresh Docker smoke result — PASS, bounded application smoke

The authorized canonical base Compose build completed with exit 0, using the existing endpoint-bound local Docker builder and ordinary runtime target. Caching was allowed; this was not a new no-cache equivalence run. Meteor compilation succeeded on attempt 1; manifest/toolchain checks and the hardened runtime bundle's configured npm audit passed (zero reported vulnerabilities in that audited bundle). Build-time dependency/deprecation, CSS-order and asset-size warnings remain; this is not a claim that every dependency scope or image layer is vulnerability-free.

Local candidate: `mofacts-qualification-local/mofacts-smoke:qualification-20260909-launch-display`. Docker-inspected immutable image ID and running container image reference: `sha256:a3e88cdf43a104a047da11abb04057c6167ce764014ffe74238e856602774be7`, Linux/amd64. BuildKit separately emitted config digest `sha256:cccdb8cb945093db79223009637a131ba93cba7cb34d6d75d670e022b1a7b01e`. The first startup command incorrectly used that config digest as the addressable image ID and failed before app creation; inspection established the image-store ID above, and the corrected command started that exact candidate. This setup correction did not rebuild or substitute another candidate. Source was the dirty checkout based on `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`, including unrelated in-progress edits; this is not a clean-commit release artifact.

Disposable project `mofacts-smoke-fix-20260909` used fresh synthetic accounts/settings and data, loopback port 3321, authenticated MongoDB replica set and Redis. Dynamic assets used the mounted `/root/dynamic-assets` path in this cycle. The independent native port-3200 watcher was left running.

| Live check | Result |
| --- | --- |
| Compose app/MongoDB/Redis health and exact image reference | PASS |
| All 11 application readiness checks before and after app restart | PASS |
| Admin and learner UI signup/login; connected Meteor client | PASS |
| Admin-only method allows admin, rejects learner with `unauthorized`, also after restart | PASS |
| Synthetic two-card ZIP upload through the normal admin UI | PASS |
| First instruction page reload restores unit 0; Continue reaches practice | PASS — previous failure resolved in this image |
| Correct typed response saves and shows 100% accuracy | PASS |
| Dashboard shows `1`, not `1 / 0`; retained through browser reload | PASS — previous failure resolved in this image |
| Cold instruction URL after practice resumes saved unit 1 through content | PASS |
| App restart followed by fresh logins, retained lesson/progress, corrected count and readiness | PASS |
| Uncaught browser errors in instrumented smoke runs | None observed |

Both browser runs exited 0. No Meteor `test:ci` rerun, registry push or remote/production deployment occurred. This validates the bounded two-card learning flow, not every unit type, real course-assignment scenario, OAuth provider, backup/restore, media durability, all security surfaces, or the unfinished source-bound release-proof design. Phase 0 and overall release qualification therefore remain open.

Cleanup completed with exit 0: four ownership-checked containers, five disposable volumes and the project network were removed; post-cleanup project-filtered inventories are empty. Synthetic database contents were discarded, while the image and ignored local fixture scripts remain. The independent watcher remained running with HTTP health and HMR ready; source/wiki diff whitespace checks passed. No commit or push was made.

### Historical failed image — retained evidence

**Overall: FAIL; not release-qualified.** The authorized isolated application smoke used exact image config ID `sha256:3877cc8a3ba671795d271e8045a477d94e1956532dd0c68971d33c1969cbef60` from the successful dependency-fetch repair build. No new build, push, production connection, or production deployment occurred.

The canonical base Compose services ran in disposable project `mofacts-smoke-20260909`, with a test-only override, fresh authenticated MongoDB replica set, Redis, synthetic accounts/settings and a two-card synthetic ZIP package. Only the app port was published, at loopback `127.0.0.1:3321`. The existing native watcher on port 3200 was not replaced or stopped. Browser observations used installed Playwright/Chromium; these exploratory scripts are not a maintained qualification suite.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Exact image and startup | PASS | Image ID matched; Compose readiness completed and app/MongoDB/Redis were healthy. |
| Application readiness | PASS | All 11 `deploymentReadiness` checks passed before and after restart, including authenticated MongoDB 8.0.29, strict Change Streams with 12 active observers and zero rejected starts, and Redis PING. Storage checks establish readability/writability, not backup/restore or media-volume durability. |
| Browser and accounts | PASS | Landing and account pages loaded; synthetic admin and learner signed up and signed in through UI. Meteor connections were live. No uncaught page errors were observed on instrumented checks. Signup intentionally redirects to login; the initial auto-login wait was a harness error, not an app defect. |
| Representative server authorization | PASS | `getDeploymentBrandProfileDraft` succeeded for admin; learner received the expected `unauthorized` error, including after restart. This is not complete security-surface coverage. |
| Content upload and normal lesson entry | PASS | Admin saved a synthetic creator display name and uploaded a two-card package through the real ZIP input. Learner saw the lesson; dashboard entry, instructions Continue, and practice rendered. |
| Response and dashboard persistence | PASS, bounded | A correct typed answer advanced to the next card and showed 100% accuracy. Save/return, dashboard reload, and post-restart login retained the in-progress lesson and its displayed statistics. Raw history equivalence, full lesson completion, and all unit types were not tested. |
| Cold instruction-page reopening | FAIL | Reopening `/instructions/:tdfId` in a fresh page rendered instructions, but Continue displayed the lesson-load error. Admin-enabled client verbosity exposed `History record has undefined canonical core fields: levelUnit`. Normal dashboard entry had current unit 0 and continued successfully. |
| Dashboard item total | FAIL / diagnosis pending | After the answer, the dashboard displayed `1 / 0 items practiced`; this persisted through reload and restart despite the two-card fixture. Cause is not established. The displayed total-trial count also includes more than the single answered card; its semantics were not audited. |
| Restart | PASS, bounded | Exact app container restarted; subsequent Compose readiness also recreated the disposable Redis container and reran replica initialization. Readiness, fresh login, permissions, lesson visibility and displayed progress passed. This is not whole-stack disaster recovery or media restoration. |

### Failure boundary and next repair cycle

The instruction failure is consistent with incomplete cold-route initialization: `router.ts` calls `selectTdf` with `isRefresh=true`, while `lessonLaunchRunner.ts` initializes the first instruction unit inside its `!isRefresh` branch. `instructions.ts` takes `levelUnit` directly from `Session.get('currentUnitNumber')`; canonical history validation rejects the undefined value before submission. This source trace supports the diagnosis but is not a tested repair.

Next: define and test the shared instruction/content cold-route resume contract, including fresh entry, instruction reload, persisted unit identity, and course/assignment launch context; repair the owning initialization boundary without inventing a default unit number or relaxing history validation. Investigate the zero item-total independently. Rebuild a new candidate and repeat the failed and previously passing smoke cases. Do not relabel this existing immutable image as passing based on later source edits.

No production application source or permission rule changed during this run. No new dependency, migration, `test:ci`, commit or push was performed. The synthetic admin's client verbosity was set to 1 solely inside the disposable database to expose the failure. Synthetic settings used the CI local dynamic-assets path; media persistence/recreation was not qualified. Existing unrelated working-tree changes were preserved. Typecheck/lint were not rerun because this cycle changed only ignored test scaffolding and this status report.

Cleanup completed: the four project-owned containers, five volumes and one network were removed; filtered resource inventories are empty. Disposable database contents are not retained or recoverable; synthetic fixture scripts/settings remain in ignored local `tmp/`, and the candidate image is retained. The independent watcher reported PID 303704, supervisor 330140 active, HTTP health/client bundle/HMR ready and nine active Change Streams. `git diff --check` passed.

This is the evidence/status companion to the [durable redesign plan](security-audit-durable-redesign-plan.md). The plan owns target contracts; this file records what has actually been inspected, implemented and verified. Do not infer deployment from source completion or documentation review.

## Current position

### Dependency transport repair — 2026-09-08

The separately authorized dependency-fetch repair is implemented in the canonical Dockerfile's `meteor_builder` stage. Git deterministically maps the SSH and SCP-style URLs for the existing public `unetworking/uWebSockets.js` repository to its HTTPS URL. It preserves the repository/ref and does not add SSH, credentials, a different dependency/version, an alternate repository or a new retry loop. The setting is confined to the intermediate builder's Git configuration: workstation Git, base Compose, production command sheet and runtime configuration are unchanged.

Diagnosis: the exact npm implementation bundled in the pinned Meteor base image tries HTTPS and then SSH for hosted Git resolution errors. No existing URL rewrite was present in that image. The historical first HTTPS error was not retained, so its underlying cause remains unknown. A direct HTTPS lookup and an SSH-form lookup under the new transport rule both resolved v20.66.0 to `a63031f40f76dc2422e8da736c04217053e9db2b` in the pinned Linux base image. This fixes the unsupported SSH transport, not all possible GitHub/network failures. [Git's documented URL mapping](https://git-scm.com/docs/git-config#Documentation/git-config.txt-urlltbasegtinsteadOf) preserves the suffix/ref; HTTPS failures still fail the build.

Verification: **31 source-security tests and 50 capture/builder tests passed**, full lint passed, and `git diff --check` passed. The new regression reads the actual Dockerfile settings, checks HTTPS/SSH/SCP forms and unchanged refs, confirms an unrelated repository is unaffected, and denies HTTPS before network access to prove failure is not converted into SSH success. Real source capture and Windows/Linux round trip passed with digest `8db404370c25d5fe66118a775e5c29309fa2ddeac2d6021fc9baf555b191038b` (2,166 entries). The source target still performs source copies only, without executing the new Git configuration or application compilation.

**Affected ordinary build: PASS.** The unchanged base-only Compose `build --no-cache mofacts` procedure, explicitly bound to the same local engine and using synthetic build-only settings and a unique local tag, exited 0 in **259.33 seconds**. Pinned Meteor/Node/npm checks, manifest checksums, dependency installation, Meteor compilation, server hardening and the existing high-severity npm audit all passed. No capture override or proof gate was added to this ordinary build. No dependency-install retry was added or manual build retry needed after the repair.

Image `mofacts-qualification-local/mofacts-capture:qualification-20260908-fetch-fix` has config ID `sha256:3877cc8a3ba671795d271e8045a477d94e1956532dd0c68971d33c1969cbef60`. Exact-ID structural smoke passed in a disposable read-only, network-disabled, capability-dropped container: Linux/amd64, expected revision/entrypoint/command, Node 24.15.0, bundle entry, seven executable CRLF-free shell scripts passing `bash -n`, npm removed, and no builder Git configuration in runtime. This did not start the app or connect to databases.

The dependency-fetch blocker is resolved, and ordinary compilation/runtime-profile compatibility now has a passing result. This does **not** establish bit-for-bit equivalence with yesterday's different-source image, full app readiness/auth/browser behavior, or release qualification. No push, deployment, commit, fresh Meteor integration run, dependency-version change or private command-sheet change occurred. Existing unrelated edits were preserved. Supplemental test-input closure, final in-image proof binding, full isolated application smoke and protected image/host proof remain open; the prior same-source comparison failure remains historical evidence rather than being relabeled PASS.

### Builder integration repair and captured-image checkpoint — 2026-09-07

The authorized repair is implemented in `qualification/localDockerBuilder.mjs` and wired into all capture CLI actions. It validates a running, single-node, local Linux context-backed `docker` builder; observes matching engine identity through its named context and explicit endpoint; and binds capture and Compose to that endpoint. The engine's built-in builder uses the explicit `default` alias on that bound endpoint. No builder/context is created or switched, no failure-triggered alternate route is attempted, and unsupported builder families fail explicitly. This resolves the context/host conflict documented in the capture guide without changing Docker installations, the Dockerfile, base Compose or the private production command sheet.

Verification: **50 capture/builder tests pass**, including six new endpoint/driver/identity/failure tests; full app lint exits 0 with server-boundary and test-artifact guards passing. The actual wrapper's endpoint-bound source round trip passed. A fresh capture containing the repair has 2,166 entries and 174,517,347 file bytes; source digest `0780154a1b8be35ea323741d9e67f8e4ce2b5c53c0cb852aee1741a63c93c20e`. A subsequent live-source capture reproduced this digest before default-path comparison.

The captured-context **no-cache Compose app build passed**, exit 0 in 387.09 seconds including pre-build source verification and post-build integrity checking. Meteor compilation, pinned toolchain/manifest checks, server dependency hardening and the existing high-severity npm audit passed. The ordinary runtime target was selected; the separate `source_capture` target was not in the app construction dependency chain.

Local-only image `mofacts-qualification-local/mofacts-capture:qualification-20260907-wz8jff` has config ID `sha256:776f9b0f328f4d2d8a3fd68b8a8370a42405b6f8513c9d10e3a46df0540b0253`. Observed profile: Linux/amd64, expected base-revision label, `/docker/entrypoint.sh`, `node main.js`. An exact-config-ID, read-only, network-disabled, capability-dropped disposable container passed **structural smoke**: Node 24.15.0, bundle entry present, all seven shell scripts executable/CRLF-free and valid under `bash -n`, runtime npm removed. It did not start Meteor, connect to databases, mount settings or publish ports; this is not full application-readiness/auth/browser smoke.

The helper correctly returned `built-unqualified`: supplemental source-test closure, embedded proof/final in-image source binding, full isolated application smoke and protected published/running identity remain open. No Meteor integration rerun, registry push, production deployment or application permission/startup change occurred. This checkpoint supersedes the builder-blocked state below; it does not close Phase 0 or activate production integration.

**Default-path comparison: FAILED, separate dependency-fetch blocker.** The explicitly authorized ordinary base-only Compose `build --no-cache mofacts` used the live checkout, the same explicitly bound local engine, and a distinct synthetic local-only tag ending `-default`. No capture override, proof check or builder-selection helper was on this build path. It failed with exit 1 after 119.63 seconds during `meteor update --npm`, before app compilation. Meteor's `ddp-server` requested pinned `uWebSockets.js` v20.66.0 via a Git HTTPS dependency; npm's failing Git invocation used an SSH URL and reported `ssh: not found` (npm error 128). The captured build had completed this same step successfully. The cause of that transport selection has not been established; do not infer a source mismatch, missing private credentials or a transient network problem from this error alone.

No default comparison image was produced. A fresh post-failure source capture reproduced the same digest as before the build. Default-build equivalence remains unproven and blocks overall Docker qualification, despite the successful captured build and structural smoke. No SSH package, credential, alternate source/version, retry policy or Dockerfile change was introduced. Repairing this separate dependency-fetch behavior requires a scoped follow-up decision. Three superseded/comparison temporary captures were removed through the helper's checked cleanup; original source and the repaired candidate remain intact. Local candidate image/workspace are retained for continuation, not published. Final watcher health, browser bundle, HMR and supervisor checks passed; the selected global context remained `desktop-linux` and unrelated working-tree edits were preserved. `git diff --check` passed. No TypeScript source changed in this repair, and no fresh Meteor integration invocation was authorized or performed.

### Authorized Docker qualification checkpoint — 2026-09-07

**Partial execution; not qualified.** The workstation's selected `desktop-linux` builder resolves to the local Docker Desktop Linux-engine named pipe. Installed versions: Docker client/engine 29.7.2, Docker Desktop 4.87.0, Buildx 0.36.1-desktop.1, BuildKit 0.32.2 and Compose 5.4.0; host Node 24.15.0. No builder was created or switched.

- Real PowerShell `prepare` passed in 14.61 seconds: 2,164 entries, 174,510,326 file bytes, dirty base `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`. Source digest: `cdfb842535ccdb9e2630c234a77b4fe8ba3bed653fc73ed6470edd417eae787c`.
- Real `verify` passed in 27.50 seconds: Windows extraction and fresh Linux BuildKit re-export produced the identical source digest, including paths, modes, directories and exact bytes. Subsequent verification exports also passed. This establishes the current snapshot's round trip, not all synthetic/edge-case acceptance fixtures.
- Source export used only the source target; BuildKit recorded nine completed steps, without app compilation. The measured snapshot is within current entry/byte limits. Windows uses inherited temporary-directory ACLs; this does not establish strong immutable sealing.
- A synthetic build-only environment selected the previously absent local tag `mofacts-qualification-local/mofacts-capture:qualification-20260907-9xztxa`. Real resolved Compose comparison found only the intended build-context difference. Compose dry run accepted the arguments; it is not build evidence.
- The actual helper build action failed before app compilation. Direct diagnosis of the same Compose build returned exit 1 from Buildx builder validation: `use docker --context=desktop-linux buildx to switch to context desktop-linux`. Explicit process `DOCKER_CONTEXT` and an explicit Docker `--context` invocation did not resolve it. No ordinary-build retry, alternate builder, dependency update or recipe change was used to bypass this failure.

The owned temporary candidate is retained locally for continuation; no raw inventory or private configuration is retained in this document. The localhost watcher remained running with health, browser bundle, HMR and supervisor ready. No app image was built, container started, push/deploy performed or Meteor integration rerun. Existing working-tree changes and the private production command sheet are unchanged. Actual app-build/default-path equivalence and exact-image smoke remain **NOT RUN**, pending resolution of the Compose/Buildx builder-selection blocker. This checkpoint supersedes older blanket Docker NOT RUN statements below, but does not close Phase 0 or authorize production integration.

### Authorized Meteor integration checkpoint — 2026-09-07

One explicitly authorized `npm.cmd run test:ci` invocation completed with **exit 0** from the app directory, with `CI=1` and the absolute checked-in `settings.ci.json` path. Toolchain: Meteor 3.5, Node 24.15.0, npm 11.12.1; installed Playwright Chromium. Harness: **16 passing**. Final Meteor report: **SERVER FAILURES: 0; CLIENT FAILURES: 0**. Client reporter: **961 passing, 7 pending**. The separate server passing count was not retained in the bounded output; do not treat 961 as a combined server/client total.

The canonical watcher was stopped before the run and restored afterward. Verified readiness: app health, executable browser bundle, HMR and supervisor ready; four active Change Streams. The harness removed test-driver resolutions, and the manifest checker confirms none remain; the pre-existing `.meteor/versions` diff is unchanged. An orphaned native test MongoDB process was matched to this run's temporary test directory, test port and exited parent, then stopped; no database files or unrelated processes were removed. No isolated Docker test container was created. Watcher restoration used its existing local Compose dependency lifecycle only.

This is a one-off authorized native Meteor integration result, not Linux CI, Docker capture/default-image equivalence or production qualification. No rerun, image build, push, remote deployment or code fix was performed. All pre-existing working-tree edits were preserved. This checkpoint supersedes the earlier NOT RUN Meteor entries below; Docker/image/host and source-capture integration gates remain open.

Phase 0 is in progress: the workflow/compatibility revision, pure draft release-identity contracts, local characterization foundation and approved opt-in source-capture prototype are implemented. The root Dockerfile shares the same source-copy owner with the capture target; ordinary build arguments/context and runtime instructions remain unchanged. The pre-existing manifest omissions are corrected. V1 report production/receipt and the production command sheet remain unchanged. Docker builds, native Meteor tests and isolated remote deployment have now been executed as recorded in the dated checkpoints. Phase 0 is **not complete**: supplemental source-test acquisition, source-bound Linux qualification, final in-image proof binding, release/host evidence ownership and retention, report-history compatibility and the protected remote security lanes remain open. See [the contract notes](security-audit-phase0-contracts.md) and [capture helper guide](../deploy/security-audit/source-capture.md) for exact scope and limitations.

| Phase | Source/documentation | Local execution | CI | Non-production / staging | Production | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 0: decisions and characterization | Draft contracts, characterization, manifest correction and opt-in capture prototype implemented; source-bound Linux runner/final proof unfinished | September checkpoint: 72 Phase 0, 50 capture, 30 source tests; October 4: full typecheck/lint and native Meteor run passed | Source-bound Linux qualification not run; native test result is separate | Isolated `staging2` deployed with matching image and healthy HTTPS/runtime; authenticated readiness and security lanes pending; older staging remains frozen | No production inspection or changes in this continuation | October 4 checkpoint, September checkpoints and contract notes |
| 1: P0 item 3, catalog/V2 | Not started; existing implementation remains V1 | Not run | Not run | Not run | Not deployed | `mofacts/common/securityAuditReport.ts`; V1 ingestion owner |
| 2: P0 item 2, authorization evidence | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 7 and 12 |
| 3: P0 item 1, runtime registry | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 8 and 12 |
| 4: closure | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 16–21 |

## Verified workflow and compatibility decisions

- App source baseline: `main` at `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`. Original audit baseline was `fa8dc09156500bb0458de3028a9e0ee11e4ae5c7`; the original plan was committed as `7070b8a7`.
- The operator identified config repo `deploy and build.txt`. Its production app section was read statically with private values omitted from retained evidence; no commands in it were executed. Last commit affecting that file: `ef2c3c6` (2026-08-23); no working-tree change to that file was present at review.
- It is a PowerShell command sheet, not `autobuild.sh` or the generic remote validator. It builds/pushes on the workstation and deploys via SSH/Compose. Local watcher, staging and sidecar sections are separate tasks.
- Existing behavior intentionally includes clean and uncommitted local builds, distinct tags, a base-commit OCI label, no-cache base-Compose build, production runtime overlay, post-push environment tag update, remote `--no-build --wait`, running tag/revision checks, Apache/CSP validation and a deployment-record write. The plan preserves them.
- The existing release record owns `deployedAtUtc`, `baseCommit`, `includedUncommittedLocalChanges`, `image`, `tag` and `digest`. Qualification will extend that owner; any host receipt is a bounded projection, not a competing release record.
- Current captured registry digest and running tag/revision checks do not establish the full published-platform/config-to-running-image mapping. A dirty build's base commit does not identify all its source. These are qualification gaps, not evidence that current deployments failed.
- The file does not itself establish explicit native-command exit propagation for every Docker/SSH/SCP call. Actual shell-session behavior was not inspected or assumed. No app-image rollback routine was found in its production section; existing Apache configuration rollback is distinct.
- CI builds a separate unpublished smoke image. Its source/test results cannot certify the exact workstation image.
- Existing staging remains frozen in the command sheet. The later explicit authorization provisioned and deployed a separate `staging2` target; it did not unfreeze the original target or authorize production changes.
- Missing audit identity/bundle/registry/test proof must produce truthful audit `ERROR`, not new startup, health, deploy, sign-in or learner restrictions. Existing security checks remain intact.
- Method/publication context and errors, synchronous collection rules, HTTP stacks/order/prefix/fallthrough and framework-owned authentication must remain equivalent. Final registry sealing follows all declared registration completion, not the end of `serverComposition.ts`.
- Active default-branch scanner code must remain compatible with the deployed receiver during development. The plan prefers keeping current active paths unchanged until atomic cutover; explicit scanner-release selection needs separate approval if that isolation is insufficient.

## Historical foundation evidence

This table preserves the earlier foundation checkpoint. Later dated checkpoints supersede its execution status; in particular, its combined Docker/staging/production `NOT RUN` row is not the current status of `staging2`.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run security:test:phase0` | PASS, 72 tests, exit 0 under Node 24.15.0 | Draft proof shape/consistency, current V1 membership and defect witnesses, selected synthetic policy/callback behavior and reviewed manifest entries |
| `npm run security:test:capture` | PASS, 44 tests, exit 0 | Synthetic bounded archive/digest checks and injected prepare/verify/build failure sequences; no actual Docker invocation |
| PowerShell wrapper syntax | PASS, parser only | Wrapper parses; not execution or Docker compatibility |
| `npm run security:test:source` | PASS, 30 tests, exit 0 before and after foundation changes | Existing source-security suite remains unchanged and passing |
| `npm run typecheck` | PASS, exit 0 | Full app TypeScript verification, including new shared contracts and pending Meteor parity cases |
| `npm run lint` | PASS, exit 0; server boundary and test-artifact checks pass | Full configured lint workflow; unrelated pre-existing harness changes preserved |
| `npm run security:surfaces` | PASS, exit 0 after reviewed manifest correction | Exact discovered-name agreement for the current syntactic checker; not runtime coverage or proof of every classification |
| `git diff --check` and document path/link checks | PASS | Source/document hygiene only |
| Meteor integration | PASS, authorized native run on 2026-09-07; exit 0, zero server/client failures | Existing full test-module discovery, including common tests; not Docker/Linux release evidence |
| Docker, staging, production | NOT RUN | No image, deployed behavior, host or release-confidence claim |

At that foundation checkpoint, the syntactic checker discovered 225 method entries, 27 publication entries, 6 HTTP entries, 18 export entries and 21 management-route entries (297 category entries). October 4 lint reports 300 entries. Neither count establishes unique, runtime-proven security surfaces: categories overlap and the checker still misses registration families.

The formerly stale manifest now includes the eight reviewed category entries:

- Methods: `exportDeploymentBrandProfile`, `getDeploymentBrandProfileDraft`, `getProgressiveAssignmentLaunch`, `importDeploymentBrandProfileDraft`, `publishDeploymentBrandProfile`, `saveDeploymentBrandProfileDraft`.
- Publication: `deploymentBrandProfile`.
- Export facet: `method:exportDeploymentBrandProfile` (also counted as a method above).

The five Brand Profile methods and export facet are `admin-only`: each calls the shared admin guard before accessing drafts. Progressive launch is `authenticated-self`: it derives availability from the caller's assigned/public course snapshot and checks release/member constraints; this label does not imply ownership of the assignment. The Brand Profile publication is `public` and selects the published settings key, not the draft. The reviewed DDP limiter registers method rules, not publication rules, so the checker now accepts a plain `public` label without claiming throttling. Labels are audit metadata, not enforcement. No application permission or rate-limit rule changed.

Existing `public-rate-limited` entries elsewhere have not been recertified by this correction; the coarse V1 labels still need owning-phase policy/evidence review. The manifest check failure is resolved, but this does not repair the checker's known discovery defects or establish a clean production security report. No staging, commit or push was attempted.

V1 full membership is frozen as 52 test-fixture IDs; exposure retains 20 scheduled controls plus two existing NOT_APPLICABLE placeholders. Eight WITNESS tests establish current false-green/coverage defects, not their remediation. Eleven selected compatibility tests characterize existing behavior, and one test checks the reviewed manifest entries; they are not complete Meteor/HTTP/provider integration coverage. The remaining 52 tests cover fixture/proof contracts, digest/import checks and negative mutations.

## Next Phase 0 work

1. **Current reconciliation completed:** baseline `18677291` has passing CI/Security, Linux capture and embedded image-source checks. Preserve all dated results as historical evidence; they do not establish the deployed revision or qualify later working edits. The current toolchain is recorded at the top of this document.
2. **Preserve the verified canonical Compose CI path.** Exact-commit CI and Security passed on `936a64aa`, including one Meteor invocation, one application compilation and native protection/receipt fixtures. No routine rerun or production procedure change is required merely to resume planning.
3. Validate complete/authenticated test evidence and join the protected candidate's source/config identity to final release proof. Pre-test sealing and the combined Compose lane now have passing CI evidence; qualification is still unqualified until remaining proof gates close. Retain recorded staging2 acceptance for its exact candidate/configuration; repeat only affected/unresolved acceptance with authorization. Ordinary build/startup behavior remains available without qualification metadata; dirty-source qualification stays separately opt-in.
4. Confirm external release-record readers and finish integration of the approved existing-record authority, bounded protected projection and immutable small-metadata history. Preserve the opt-in tooling implementation recorded above; validate concrete reader/destination access controls and rollback-image/evidence availability before live operation. Live command-sheet/host integration and acquired proof remain pending; private staging checkpoints are not authoritative release extensions.
5. Apply the settled no-historical-access/archive decision and qualify simplest safe new-report storage against the previous production image; do not delete/rewrite records. Secret recovery design/owner are selected as AWS Secrets Manager/Phil. Complete the [account/MFA recovery, size-fit, dedicated rollback retention and two-version staging2 restore gates](security-audit-durable-redesign-plan.md#aws-secrets-manager-recovery-design-approved-2026-11-02) under concrete setup/operation permissions before claiming recovery. GitHub copies and local DPAPI credentials do not establish those gates. Original staging remains frozen.
6. Complete remaining invocation/HTTP/provider/composition compatibility and remote qualification. Use staging2 with synthetic accounts/resources under the bounded offline/reset/rebuild permission; inventory enabled providers before binding tests. Preserve fresh per-invocation Meteor authorization, workflow/protected-host/production approvals, and exclusions for irreversible deletion, new persistent access/security-sensitive permissions and spending. Phil reviews one consolidated ambiguous/proposed policy-change list; clear preservation work proceeds with documented evidence.
7. Review the evidence against every Phase 0 exit requirement and close the gate before beginning Phase 1 / P0 item 3. Phase 1 remains independently deployable after its own qualification and coordinated cutover, without waiting for items 2 and 1. No passing health endpoint, native suite or local fixture suite alone closes Phase 0.

## Source references

The initial capture-design continuation was documentation-only. Its subsequent approved implementation added the opt-in helper, shared Docker source stage and an initial 44 synthetic capture tests, then reran the existing source checks. Later dated checkpoints record the expanded 50-test suite and actual Docker capture/round-trip/build execution. An initial lint error in the new path-validation expression was corrected without relaxing validation; full lint was rerun. The October 4 deployment used the ordinary canonical build rather than claiming completion of the unfinished qualification helper.

These are source pointers, not executable deployment instructions. Private hosts, image repository values, settings, credentials and raw records are deliberately omitted.

| Source | Relevant reviewed area |
| --- | --- |
| Config repo `deploy and build.txt` | Lines 75–77: staging freeze; 188–195: clean/dirty identity; 240–258: build/push/digest/tag update; 260–300: runtime transfer/deploy/verification; 302–322: existing release record |
| `deploy/docker-compose.yml`, root `Dockerfile` | Base build/image/source-label contract and current startup/dependency checks |
| `.github/workflows/ci.yml` | Source verification and separate runner-local Docker smoke job |
| `.github/workflows/production-security-audit.yml` | Scheduled default-branch checkout and independent scanner execution |
| `deploy/security-audit/host-exposure-audit.sh` | Current Docker config image-ID observation |
| `mofacts/server/main.ts`, `serverComposition.ts`, `startup/serverStartup.ts` | Static and startup registration ownership/order |
| `mofacts/server/publications.ts`, `methods/backupMethods.ts`, `lib/authSupport.ts` | Publication readiness, invocation context and authorization/validation order |
| `mofacts/common/Collections.ts` | Synchronous collection access rules |
| `mofacts/server/runtime/dynamicAssetsRoute.ts`, `http/health.ts`, `http/pwa.ts`, `http/socialPreview.ts`, `lib/memphisSaml.ts` | HTTP stack, mounted-prefix, dispatch, fallthrough and protocol behavior |
| `mofacts/packages/mofacts-microsoft-oauth/server/microsoft.js` | Package-owned OAuth service registration |

## Verification and scope limits

The Phase 0 foundation added pure shared modules, local tests, the phase0 test script and developer guidance. The manifest correction added eight entries and `public` classification support. The approved capture slice adds the shared Docker input stage, two source-acquisition modules, an opt-in PowerShell entry point, a capture-test script and maintainer documentation. V1 parser/assembler, registration paths, existing deployment scripts and workflows are untouched. No production application path loads the draft proof data. No dependency was added, no migration ran and no user-visible behavior or locale string changed.

An initial TypeScript syntax error in the new contract was caught by both Node and full typecheck, corrected, and both were rerun successfully. Final results are recorded above. No Meteor CI, Docker command, workflow action, host connection, build, push or deployment was run. The baseline surface-check failure was resolved through source-policy review and an explicit manifest/checker correction.

Unrelated pre-existing app-repository CI/test-harness edits were preserved, including the existing package lint/test-artifact edits; the new phase0 and capture test script entries are scoped additions to that file. The config command sheet, production overlay, private settings and environment files were not edited. The public capture guide documents the new opt-in commands and their limitations. Existing production/wiki procedures remain unchanged until actual qualification and command-sheet integration.


## 2026-11-05 � approved storage-retention rehearsal, verification reservation

Phil approved one byte-identical candidate/current-pointer rehearsal in the
existing optional AWS recovery store. Conditional Meteor slot **1 of 10 is
reserved**, not yet invoked; nine remain unreserved. One protected retention
attempt is authorized only after committed-source verification passes. The
[execution contract](../deploy/security-audit/recovery-transfer/restore-rehearsal-review.md#approved-retention-execution-contract--2026-11-05)
requires exact two-version inventory, pin preservation, explicit-version byte
comparison, original-current restoration, marker retirement and temporary-access
cleanup. No application/deployment/schema or source credential change is planned.
Provider validity, accepted operational rollback and staging2 consumer recovery
remain separate. Phase 0 remains open.
