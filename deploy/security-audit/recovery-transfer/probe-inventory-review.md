# Authentication probe inventory: review only

The approved Phase 1 sequencing amendment (P1-D8) needs the existing selected
authentication cases before their intent can move into the one source-owned
verification catalog. The generic V1 runner is tracked; the selected list is in
`AUDIT_AUTH_FIXTURES_JSON`. Do not invent it from surface classifications or
convert its old error/denial booleans into proof.

Source preparation is authorized. This read, its temporary access, workflow
publication/activation and execution are **not yet authorized or performed**.

## Existing source and freshness evidence

The accepted baseline is the same existing Ohio recovery secret and exact
original version retained for transfer 42024117227. Retain the dedicated
baseline label and the settled candidate-previous version. Confirmation
42052500882 already proved those two versions identical and their labels restored;
do not repeat that recovery acceptance or read the second payload again.

A fresh metadata-only GitHub query on 2026-11-08 returned fixture-secret
`updated_at=2026-08-20T14:20:17Z`. The accepted transfer ran on
2026-11-05T12:04:51Z-12:06:06Z. This supports using that accepted backup as the
starting point; metadata is not a new plaintext read or a current value comparison.
The private transfer/confirmation receipts own the exact account/ARN/version
coordinates; do not substitute a different secret or unrecorded version.

## Proposed single bounded read

Reuse the existing optional AWS SDK package, shared OIDC provider, main-only
`security-audit-recovery-rehearsal` environment with no deployment secrets, and
temporary `mofacts-recovery-restore` role. Use the existing three-operation
read-only trust/data templates: DescribeSecret, ListSecretVersionIds and
GetSecretValue on that exact secret only. The STS session is 15 minutes; trust
and data access expire within one hour of enablement. No static access key,
new dependency, paid service, permanent permission or application AWS coupling
is proposed. Retire the temporary role/policies/environment/workflow afterward;
preserve the shared OIDC provider and backup.

The [inactive workflow](probe-inventory-workflow.yml.review) runs only after its
reviewed code is published and activation/dispatch is approved. It verifies the
exact main dispatch SHA, pinned Node, Linux hosted runner and debug isolation.
Dependencies/tests are prepared before credentials are requested. No `AUDIT_*`,
Tailscale or ordinary AWS profile/access-key environment input is accepted.

The reader checks the expected two-version metadata before/after and reads
**only the exact original baseline payload once**. It validates the complete
canonical bundle/provenance/byte count in memory, passes only its fixture string
to the provider-independent formatter, and discards protected values on process
exit. It creates no version, moves no label, transfers no credential and calls
no application, provider, SSH, Tailscale, staging or production target.

## Retained metadata and limits

The formatter returns only known actor aliases, public source method/publication
IDs, argument primitive kinds/counts, legacy expectation flags, canary-presence
booleans and source route candidates. It emits no usernames, passwords, tokens,
canary values, argument/resource identifiers, configured URL/path/query values,
provider secrets or individual credential fingerprints. Unknown subjects remain
unresolved numbered rows without revealing their identifier, never omitted or
silently substituted. A source route candidate is not runtime identity proof.
The old flags remain review observations, not approved verification intent.

Input and retained inventory are each bounded to 64 KiB. Duplicate JSON/semantic
cases, unknown actor aliases, invalid or oversized structures fail without raw
diagnostics. Complete-payload digest retention reuses the existing RSA-encrypted
digest; no plaintext document hash or protected document is logged or retained.
The inventory itself contains only the bounded non-secret metadata intended for
subsequent source review. Missing/moved labels, wrong identity or a formatter
failure stop the run. No automatic retry or alternative version is selected.

Review the recovered metadata against actual source guards before writing
`verificationCatalog.ts`, pairing each denial with a real allowed baseline.
Resolve missing/obsolete subjects explicitly; this operation changes no access
policy and does not establish a passing authentication audit.

## Verification before execution

Synthetic formatter tests prove omission of protected fields and preservation of
unresolved cases. Optional-tool tests exercise the actual SDK request protocol,
one selected GetSecretValue, unchanged versions/labels, runner isolation and
independent write denial. Full lint and affected source checks are required.
No Meteor integration run is proposed by this diagnostic preparation.

## Feasibility checkpoint (2026-11-08)

All 42 optional SDK/formatter tests, nine affected source regressions, full app
lint and optional-tool lint pass. No protected request occurred. The first
synthetic reader test exposed the legacy userHistory/current-manifest mismatch;
the formatter now preserves an unresolved row without its identifier value.

Fresh GitHub metadata shows the latest scheduled audit 42453904351 never started:
its check annotation reports an account billing lock, and it has zero job steps.
The prepared hosted workflow remains inactive and is not an executable lane
while that block remains. No IAM access was enabled or dispatch attempted.

Proposed next step is a separately approved read-only AWS CloudShell preflight
for the same account: identity, Node/AWS CLI versions and credential-variable
names (no values). No secret read, file/software install or IAM change belongs
to that preflight. Observe those facts before implementing a distinct reviewed
operator entry point; never spoof the existing hosted-runner guard or silently
use another profile. CloudShell itself has no additional charge per the
[AWS pricing page](https://aws.amazon.com/cloudshell/pricing/). The actual
protected read and any runtime/bootstrap/access changes retain separate approval.

## Observed CloudShell preflight (2026-11-08)

The separately approved preflight passed. STS caller identity matched the retained
backup target account, with root as caller. CloudShell has Node 20.20.2 and AWS
CLI 2.39.3; the container-credential variable names are present. Their values,
the backup and IAM inventory were not read. No install or IAM change occurred.
The prepared reader requires the repository-pinned Node 24.22.1/npm 11.19.1.

[AWS's role-switching contract](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-api.html)
states that the root user cannot assume an IAM role. The existing reviewed OIDC
workflow is not an operator runner; its strict guard remains unchanged. A direct
root backup read would not provide the planned independently restricted session.
It is not the proposed operator lane. Before implementing that lane, separately
authorize inspection of existing non-root operator identities. Select an existing
usable identity before proposing creation or new access. Then prepare/test the
adapter and exact ephemeral runtime/access/read/cleanup operation for review.
No permission for those operations is inferred from successful preflight.

## Existing operator sign-in inspection (2026-11-08)

The separately approved read-only metadata inspection completed: twelve IAM users,
four existing console login profiles, eight explicitly absent profiles and no
unresolved profile reads. Names remain in the private review record. The global
eight-role inventory returned no SSO-provisioned or wildcard-principal role; the
one non-service trust is an unrelated GitHub OIDC wiki publisher and is untouched.
The Ohio Identity Center instance list is empty. Other regions were not queried,
so this does not establish that Identity Center is absent everywhere.

Two conservative one-off CLI classifications initially left negative profile
responses unknown. Actual diagnosis showed AWS CLI 2.39.3's explicit max-retries
suffix; only unresolved profiles were checked again. Unknown errors were never
treated as absent profiles or successful denials. No permanent CLI parser was
added, and this observation-only diagnostic is not application authorization proof.

Next, Phil must identify an existing console account he owns and can use, or
confirm none. An existing profile is not credential-custody, CloudShell permission
or role-assumption proof. No identity is selected, password reset, MFA operation,
permission change, software install or protected backup read is authorized by
that inspection. Prepare the supported operator lane after this missing fact is
resolved; retain separate concrete runtime/access/read/publication approvals.

## Proposed temporary console operator design (2026-11-08)

Phil confirmed none of the four existing console users is an identity he owns
and can use. That closes the custody question. Existing users, root MFA and the
unrelated wiki-publishing role remain outside the proposed change.

**Status: proposed for design approval only. No account, credential, policy,
session, runtime install or protected read has been created/authorized.**

Subsequent decision: Phil approved this design for source preparation/testing.
The original proposal below is retained; this approval creates no AWS access.
The [completed source procedure](operator-runbook.md) and operator modules now
implement the separate console lane, exact-environment/MFA/expiry policies,
single-use attempt receipt and ownership-checked cleanup. Eight new operator
cases plus the retained optional suite pass (50 total); full app/optional lint
and rejected bootstrap preflights pass. No runtime was installed or backup read.
Publication, fresh shared-runtime Meteor proof and the concrete AWS operation
remain separate unapproved gates. The original GitHub reader stays strict.

Create a temporary IAM console login named mofacts-recovery-operator inside the
same existing AWS account, solely to run the optional inventory reader. Require
absence of that name and the proposed role before creation; a collision stops
preparation rather than taking over an existing identity. Phil enters its new
password and registers MFA himself. Create no IAM access key. AWS documents
[console-only users without access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html);
it generally recommends federation for human access. This temporary, removed-
after-use identity is proposed for the bounded operation rather than expanding
this batch into a permanent Identity Center deployment. A durable operator
identity would be a separate explicitly selected account-management project.

The user's only permissions would be the minimum
[CloudShell launch/session/credential-forwarding actions](https://docs.aws.amazon.com/cloudshell/latest/userguide/sec-auth-with-identities.html)
and sts:AssumeRole on the exact mofacts-recovery-restore role. No direct backup,
application, server, IAM-administration or other service access is granted.
Both the operator permissions and role trust/data authorization expire within
one hour of the approved activation. Require MFA for role assumption and verify
it through the actual console session; missing MFA evidence stops execution.
The assumed session lasts 900 seconds. Role trust is bound to the exact newly
created operator, independently from the existing GitHub OIDC runner contract.

The role retains the existing exact-secret three-read policy: DescribeSecret,
ListSecretVersionIds and GetSecretValue. The operator adapter must verify the
exact source and assumed identities, account and expiry, then reuse the existing
in-memory reader, metadata-before/after checks and sanitized formatter. Read the
one original accepted baseline version only; no labels or versions are written.
Keep encrypted complete-document digest retention and omit all protected values.
Never impersonate GHA, use another profile, or read the backup directly as root.

Prepare and test the full procedure before requesting execution permission:

1. Verify the complete adapter/policy/cleanup candidate with injected AWS/CLI
   boundaries, root/identity/profile/expiry denials, actual SDK read/write-denial
   regressions and required application checks. Obtain publication and the new
   shared-runtime Meteor proof separately. Current allowance remains zero.
2. Use a private ephemeral CloudShell workspace with the pinned Node 24.22.1/
   npm 11.19.1 and only the two already-approved optional SDK clients, verified
   from the committed source/lockfile. Runtime acquisition/install is an explicit
   later approval; no global CloudShell setup or app dependency is introduced.
3. After concrete access approval, provision the exact temporary identity and
   expiring policies. Phil handles password/MFA enrollment and sign-in. Verify
   identity, MFA and least privilege before enabling the one protected read.
4. Run one reviewed inventory operation. Preserve only the sanitized inventory,
   encrypted document digest and non-secret acceptance/cleanup metadata. An
   incomplete check stops the operation; no automatic retry or alternate actor.
5. Retire the temporary access, remove its role/policies and console login/user,
   detach only its new MFA registration, and remove the owned ephemeral workspace.
   Verify absence. Preserve the physical key's root/OpenAI registrations, shared
   OIDC provider, all pre-existing identities, backup versions/labels and earlier
   accepted recovery evidence. If cleanup cannot be verified, report the exact
   uncertainty and recovery owner; expiry is a limit, not proof of cleanup.

The design choice is whether to use this temporary console operator for the
one bounded read. Design approval permits source preparation only; concrete
publication, runtime acquisition, identity/access creation, protected execution
and cleanup require the completed reviewed procedure and their explicit approval.
AWS remains an optional operator tool, separate from MoFaCTS and its dependencies.
