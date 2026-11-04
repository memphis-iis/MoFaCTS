# One-time protected recovery transfer — execution review

Status: **execution and approximately $0.40/month cost approved** by Phil on
2026-11-04, conditional on required checks passing. CI `41877424659` and Security
`41877424480` passed on reviewed source `d5e8f705`. The empty secret was created;
the first transfer, `41893149595`, stopped at `ssh-key-format` validation before
requesting AWS credentials or writing a version. Temporary data access was
removed, trust denied, and the role deleted; the active workflow was disabled and
removed. The shared provider and protected GitHub source were preserved. The
destination remains **empty, not a usable credential backup**. A format-only
diagnostic and another transfer attempt require the review below. Phil approved
the current GitHub configuration as the starting point.
This establishes
a new source baseline; no historical last-accepted configuration was located.
Account recovery is accepted separately. This draft does not close Phase 0.

## Proposed operation

Transfer the nine existing `production-security-audit` secrets and its one
report-encryption **public** key variable into one encrypted Secrets Manager
secret, `mofacts/security-audit/recovery`, in the verified staging2 owner's AWS
account, Ohio (`us-east-2`). See the [binding inventory, account prerequisite and
cost review](../recovery-store-preflight.md). Expected storage price is about
$0.40/month, plus small API charges. No application, deployment binding, scheduled
audit, password, firewall or Tailscale rule changes are part of this operation.

The transfer receives temporary AWS credentials through GitHub OIDC, requests a
15-minute session, writes one initial version, and compares every serialized byte
on read-back. It does not write a plaintext credential file or upload an artifact.
Only bounded result metadata (state, version ID, byte/count totals) can be logged.
The AWS secret value is encrypted by the AWS-managed `aws/secretsmanager` key.
Root-account credentials, MFA material and the report-decryption private key are
excluded. No static AWS access key, custom KMS key, replica, rotation Lambda or
runtime AWS integration is proposed.

The [workflow draft](workflow.yml.review) is deliberately outside
`.github/workflows`. The [core](../../../mofacts/scripts/security-audit/recovery-transfer.mjs)
and [Linux runner](../../../mofacts/scripts/security-audit/transfer-recovery-baseline.mjs)
are reviewable source, not evidence of a successful cloud operation.
The three policy/workflow inputs are included in the existing supplemental test
capture contract so CI tests the reviewed bytes without adding them to runtime
build inputs or changing source-digest rules.

## Access to approve

- The operator creates an **empty** secret with no `SecretString`, `SecretBinary`,
  tags, rotation, replicas or explicit `KmsKeyId`. Record its exact returned ARN
  privately. AWS supports creating an empty secret without an initial version;
  omitting the key selects its managed key. The transfer cannot create resources.
- Inspect the account's existing GitHub OIDC provider. If absent, create it for
  `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
  Do not replace an existing provider or change other roles using it.
  The read-only approval preflight found the existing GitHub provider with its
  sole audience `sts.amazonaws.com`; preserve it during setup and cleanup. The
  account's complete eight-role list did not contain the proposed transfer role.
- Create temporary role `mofacts-recovery-transfer` with the reviewed
  [trust policy](trust-policy.example.json) and only the four operations in the
  [permissions policy](permissions-policy.example.json), on the **exact** secret
  ARN. Replace placeholders with verified private coordinates before approval
  of actual AWS mutations. Set the same UTC deadline in both policies, at most
  one hour after role enablement: trust and data access expire at that deadline,
  including access by an earlier issued session. Do not extend it automatically.
  No wildcard resources, secret creation/deletion,
  rotation, replication, IAM administration or other-secret access is granted.
- On 2026-11-04 read-only GitHub metadata confirmed the default, non-immutable
  OIDC subject prefix `repo:memphis-iis/MoFaCTS`, and this environment's sole
  deployment branch rule `main`. Recheck before activation. The trust uses exact
  audience and `repo:memphis-iis/MoFaCTS:environment:production-security-audit`.
  Do not change repository-wide subject settings to make this draft work.

An environment subject does **not** enforce a unique workflow or branch in AWS.
GitHub's environment branch rule and the draft's main/manual/reviewed-commit checks
provide those gates. Another workflow in this environment with `id-token: write`
could use this role while it is enabled. Before activation review all such
workflows, other in-flight runs, environment access and reviewers; the existing
production audit has no OIDC permission. Do not silently broaden or alter its
protection rules. Keep the role enabled only for this approved attempt, with no
other writer to the empty destination. This trust limitation is part of the
execution review, not a claim of workflow-specific IAM isolation.

Sources: [GitHub OIDC and environment-subject rules](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws),
[AWS trust setup](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html),
[time-limited IAM conditions](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition_operators.html#Conditions_Date),
[empty-secret creation and default encryption](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_CreateSecret.html),
[DescribeSecret default-key and omitted-field semantics](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_DescribeSecret.html).

## Controlled execution and cleanup

1. Obtain approval for the paid destination, temporary role/provider setup and
   one credential transfer. Proposed setup access is **CloudShell in the already
   verified AWS console**, using that console session's temporary credentials.
   Record `aws sts get-caller-identity` and compare the account before mutation;
   do not assume the local PC's CLI profile belongs to that account. CloudShell
   itself has no additional service charge; other resources and data transfer
   retain their usual costs. Use it only for metadata/policies/resource setup,
   not to retrieve or display the bundle. End the session after cleanup. See
   [CloudShell credentials and pricing](https://docs.aws.amazon.com/cloudshell/latest/userguide/).
   If that setup path is unavailable, stop for an explicit authentication choice;
   do not create a static access key or silently use a different profile.
2. Recheck exact source inventory: all nine environment secret names and only
   the documented public-key variable. Freeze configuration edits during the
   attempt. Listing metadata does not validate values; missing environment
   bindings must not be supplied by repository/organization secrets. If inventory
   differs, stop and review completeness before dispatch.
3. After the empty secret/role exist, review the substituted policies and their
   actual read-back, GitHub branch rules, OIDC subject and exact source commit.
   Confirm no attached policies/resource policy broaden access. Confirm debug
   logging is off. Install the reviewed draft at the exact workflow path named
   above, publish the intentional change, and dispatch once on that full main
   commit with verified account/role/secret coordinates. No schedule is added.
4. The runner uses pinned Node 24.22.1, the existing lockfile/dependencies, and
   existing AWS CLI v2. Dependency preparation occurs before secret bindings are
   exposed to a step. No Tailscale connection, application login, scanner probe,
   paid synthesis or Meteor invocation is part of the transfer workflow.
5. It validates all ten nonempty bindings, duplicate-free bounded fixture JSON,
   documented actors/probe groups/throttle identifiers/mailbox/canaries, basic
   OpenSSH framing/final LF and the report's RSA public key. Preserve original
   strings exactly. Measure the **complete serialized document** in UTF-8 against
   65,536 bytes; reject excess rather than truncating or splitting. Structural
   validation does not prove credentials work, SSH key authenticity, synthetic
   account isolation or future verification-catalog coverage.
6. Verify the temporary AWS caller/account, empty secret, encryption, absence of
   rotation/replicas and destination ARN. A bounded version-list call includes
   deprecated/unlabelled versions; a nonempty or paginated result blocks writing.
   `DescribeSecret` alone lists only labelled versions and cannot prove emptiness.
   Write one version using a deterministic
   run-bound idempotency token and `MOFACTS_RECOVERY_BASELINE`. AWS assigns
   `AWSCURRENT` to the initial version; the helper does not request moving it
   from another version. Read by exact version and baseline label, compare exact
   bytes and require the sole version to have both labels. Repeat the complete
   version-list check afterward; any other version or page fails acceptance.
7. On success **or failure**, remove the role's data-access policy and disable
   its trust, then delete the temporary role. Verify removal/read-back. Removing
   the workflow or trust alone is insufficient for already issued sessions;
   remove data permissions too, allow for IAM propagation and verify denial.
   The requested session expires after 15 minutes and the data permission has
   the same fixed UTC deadline as trust. Delete only a newly created,
   unused OIDC provider after checking for other consumers; preserve shared ones.
   Remove the active transfer workflow after retaining its reviewed source here.
   Never retain a live transfer role just to make a retry convenient.
8. Retain only minimized private metadata under the native release-evidence
   directory: reviewed source commit/run/attempt, verified account/region/ARN,
   exact version ID, bytes/counts, label/read-back outcomes and access-removal
   observations. No values, child-process output, OIDC token or AWS session
   credentials belong in evidence or public logs. The approved Desktop folder
   remains the location for operator credential files if later needed; this
   transfer creates none.

Any failure stops without deletion, automatic retry, label repair or GitHub
updates. A timeout may have written the baseline; inspect metadata under approved
operator access before deciding what to do. Existing versions block bootstrap,
including a rerun after success. Keep a successfully written version after a
subsequent read-back failure for explicit reconciliation. A later transfer of
changed source is a separate reviewed operation, not an overwrite retry.

AWS documents [idempotent version writes and initial/current labels](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_PutSecretValue.html)
and [complete version listing](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_ListSecretVersionIds.html),
plus [CLI input files](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-parameters-file.html).
The adapter feeds JSON through an anonymous Linux stdin pipe, captures responses
in memory, disables CLI retries/profiles/metadata credentials and uses fixed
regional HTTPS endpoints. Live hosted-runner CLI/OIDC behavior remains untested
until an authorized execution; synthetic adapter tests do not establish it.

## Acceptance after transfer

Success means `recovery-baseline-transferred-unqualified`: an exact copy of the
current GitHub source exists at an explicit version. It is **not** a recovered
historical rollback version or an accepted operational restore.

The next separately scoped operation is a protected restore rehearsal. The full
bundle contains production-audit access; never inject it wholesale into staging2,
authenticate to production or run its production-target probes as a staging test.
Review a credential-isolated restoration/validation environment and the exact
staging2 synthetic bindings before operational use. Restore and validate the new
baseline, establish an accepted state through real authorized checks, then retain
that accepted version with a dedicated rollback label. Demonstrate current and
accepted-rollback restoration and survival of the retained label through a later
candidate update. Preserve accepted state afterward. That rehearsal and the
broader Phase 0 gates remain open; baseline and accepted rollback labels have
different meanings and must never be substituted for each other.

## Next decision after the first attempt

The stopped attempt proves that at least one of the validator's OpenSSH boundary,
LF-only or terminal-LF checks did not match the protected source. It does not
identify which check, establish that the key is unusable or justify changing the
credential. The existing production workflow explicitly uses `printf '%s\n'`
when materializing its SSH key file; the backup validator instead requires the
stored string itself to end with LF. This is a source-contract difference and a
possible false rejection, not proof that missing LF caused this particular run.

Prepared [an inactive format-only diagnostic](ssh-format-diagnostic.yml.review)
for one separately approved protected run. It binds only the existing SSH-key
secret and emits ten fixed boolean flags: recognized OpenSSH/RSA-PEM/PKCS8
boundaries and LF/CR/escaped-newline shape. It emits no value, key fragment, byte
length, fingerprint or file/artifact, requests no OIDC permission and has no AWS
access. Its YAML permission/binding checks and eight synthetic cases passed
locally. It has not been activated or run against protected input.

Recommended authorization: one format-only diagnostic; a correction only for a
confirmed mismatch between backup validation and the existing consumer contract,
preserving the original stored bytes; required checks for that correction; and
one new transfer attempt with fresh temporary access and the same cleanup. Use
the remaining Meteor slot only if the correction requires another integration
run; it is not needed merely to prepare this inactive diagnostic. If the result
instead requires changing or replacing the credential, stop for that distinct
source-repair decision. Do not silently append/trim newlines, convert encodings,
rotate a key or republish production bindings to get a passing backup.
