# Recovery transfer transport decision

Status: Phil approved the two SDK clients solely in the optional tool, one fresh
Meteor integration invocation and one protected transfer after verification.
The split is implemented in source; full CI and cloud acceptance are pending.
The destination was last verified empty. The prior five-run allowance and CLI
retry are spent; the new authorization is separate and permits no automatic retry.

## Verified failure

The SSH format diagnostic `41928332920` confirmed valid OpenSSH boundaries with
no stored terminal LF. Validator correction `3d1008b0` preserves the stored
string exactly and passed complete CI `41928890309` and Security `41928890286`.
The key was not changed. Corrected transfer `41941983320`, on `da8bdb95`, then
failed at `aws-call` before any destination version existed.

The CLI adapter passes request JSON through Node child stdin and asks AWS CLI
to reopen `file:///dev/stdin`. Synthetic reproduction under pinned Node 24.22.1
in Ubuntu-MoFaCTS confirmed that stdin is a Unix socket; reopening it fails with
ENXIO. No real credentials or AWS calls were needed for that reproduction.

A Bash anonymous-pipe prototype passed a substitute reader, then failed the
real AWS CLI's offline skeleton validation in CloudShell (Node 20.20.2). It was
discarded. The CLI has both generic parameter-file loading and a separate JSON
input-file load, so a one-shot stream is unsuitable. These tests establish an
input interoperability defect, not a successful authentication or transfer.
AWS documents that skeleton generation sends no API request. Relevant sources:
[CLI input-file loader](https://github.com/aws/aws-cli/blob/v2/awscli/customizations/cliinput.py),
[argument unpacking](https://github.com/aws/aws-cli/blob/v2/awscli/clidriver.py),
[parameter files](https://github.com/aws/aws-cli/blob/v2/awscli/paramfile.py),
[offline skeleton behavior](https://docs.aws.amazon.com/cli/latest/reference/secretsmanager/put-secret-value.html).

After failure, the operator removed data permissions, denied trust and deleted
the temporary role. Role absence and zero versions including deprecated versions
were verified; all four data operations were simulated denied. Simulation is
not replay of an issued session. The shared provider and unchanged GitHub source
were preserved. The active workflow is disabled and removed. The existing empty
paid secret is preserved; no usable credential backup or restore is claimed.

## Selected separation: portable bundle, optional operator tool

AWS Secrets Manager is Phil's selected recovery store for this installation,
not a requirement for MoFaCTS users. Ordinary application installation, tests,
image builds, startup and deployment must work without the recovery tool, its
AWS dependencies, an AWS account or AWS credentials. This decision does not
remove the application's existing, separately configured S3 asset-storage option.

Keep the existing `MoFactsRecoveryBundleV1` representation: schema, provenance,
the complete named secret strings and the report-encryption public variable.
Its JSON contains no AWS ARN, region, role, AWS version or staging label. These
are storage coordinates and stay outside the portable document. Preserve the
current provenance and unqualified-baseline meaning; portability does not make
this installation's GitHub identity or fixture inventory universal defaults.
Keep existing exact-string, duplicate-key, completeness, key-format and bounded
size checks. Do not change schema or reinterpret an old bundle in this batch.

Split the existing mixed recovery module by responsibility:

| Owner | Responsibility | Dependency boundary |
| --- | --- | --- |
| Shared recovery validation under `mofacts/scripts/security-audit/` | Existing bundle construction, validation and exact serialization, reusable for non-AWS recovery | Existing repository validation dependencies; no AWS SDK, network, credential acquisition or provider import |
| Optional tool under `deploy/security-audit/recovery-transfer/aws/` | AWS identity/target checks, storage operations and AWS-specific read-back/version/label verification | Its own private `package.json` and lockfile, installed explicitly from this directory |
| Reviewed protected workflow | Explicitly selects Phil's AWS tool and supplies approved bindings | No application startup hook, default provider selection, schedule or automatic activation |

The optional tool may import the shared repository validator. The shared
validator and application must never import the AWS tool. Retain the existing
parser and probe-ID validation rather than copying them or writing a second
JSON parser. Current parser reuse goes through `ciEvidence.mjs`, which imports
`acorn` and other repository modules: audit that import closure during the split.
Do not claim a dependency-free or standalone bundle validator. Preparing existing
repository validation dependencies for the optional operation is acceptable;
installing the AWS tool through normal application dependency preparation is not.

Other operators may store and recover the same validated document using their
own protected store. They must preserve the complete document, exact credential
strings, authenticated access, encryption, current/accepted rollback identities,
retention and tested restoration. AWS labels implement those requirements only
for this adapter. Document the provider-neutral contract; do not add a second
backend, automatic provider selection or a new plugin framework in this batch.
Portable JSON describes the content, not permission to save plaintext secret
files, publish exports or inject production credentials into staging2. Authorized
recovery validates the document before handing its strings to the named consumer;
operational qualification remains separate from a byte-correct storage round trip.

## Proposed optional AWS implementation

Replace the CLI adapter with AWS's maintained JavaScript clients:

- `@aws-sdk/client-sts` for `AssumeRoleWithWebIdentity` and `GetCallerIdentity`.
- `@aws-sdk/client-secrets-manager` for the existing describe, complete version
  list, put and exact-version get operations.

The earlier proposal to add these clients to `mofacts/package.json` is
superseded. Leave the application manifest and lockfile unchanged. Declare the
two clients only in the optional tool's private manifest and dedicated lockfile,
after checking official versions, Node compatibility and dependency advisories.
Use the repository-pinned Node/npm versions and an explicit tool-directory
`npm ci --ignore-scripts`; no root npm workspace, automatic postinstall hook,
dynamic download or incidental nested SDK imports. Existing S3 dependencies
remain owned by the application and are not the tool's dependency source.

Move the AWS-only target/transfer logic and runner into this tool, removing their
old entry points and updating all callers/tests together. Keep one implementation
of each validation rule. The known broken CLI adapter is replaced, not retained
as an alternate transport. Review the inactive workflow for the explicit install
and new runner path; it remains inactive until execution approval.

Exclude the optional tool from the application Docker build context and verify
that its SDK packages are not installed in the application image by this change.
Keep its exact source, manifests, lockfile, tests and reviewed workflow in the
supplemental audit-tool test capture, with installed `node_modules` excluded.
Update capture readers and coverage intentionally; do not weaken source identity
rules or infer isolation merely from a directory name or Meteor ignore rule.

SDK clients serialize and sign requests directly in memory, removing the custom
CLI input bridge. Keep the existing core validation and exact read-back contract:

- Preserve every source string, including the SSH key, without normalization.
- Validate the complete serialized document against 65,536 UTF-8 bytes.
- Use explicit web-identity token and then explicit returned session credentials;
  no ambient credential chain, profile, static key or alternate authentication.
- Fix the verified account, region and regional HTTPS endpoints. Keep the same
  temporary one-secret IAM scope, deadline and cleanup; no extra AWS permissions.
- Set one SDK attempt, bounded request timeouts and no SDK logger. Catch raw
  upstream exceptions at the existing sanitized error boundary.
- Map SDK Date values and optional response fields deliberately to the core's
  existing response contract. Do not reshape secret contents.
- Never write credentials to a file or command argument, print request/response
  bodies, weaken TLS, or reactivate the known broken CLI route as recovery.

Official API ownership:
[STS client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/),
[Secrets Manager client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/).
This changes only the optional helper's dependencies and transport. It preserves
Phil's selected store/monthly approval and the production bindings. AWS is not
the required recovery provider for other installations.

## Approval and verification gate

[AGENTS.md](../../../AGENTS.md) requires: "New npm, Meteor, Docker, or system
dependencies require explicit approval." Phil has now approved the two clients
only in the optional tool and the two single-use executions stated above.
Record the integration reservation and each actual execution/result in the
status ledger. No transfer or integration retry is implicit in this approval.

After approval, implement the split and sole SDK transport. Verify:

1. Shared bundle tests pass without installing the optional tool or either new
   SDK client. Normal application setup and CI never install that tool. Test
   portability with synthetic serialized bytes and no AWS coordinates or calls;
   reject missing, duplicate, extra or corrupt data with sanitized errors.
2. A separate explicit tool test command exercises actual SDK serialization and
   synthetic HTTP responses, including error redaction, explicit identity,
   bounded attempts/timeouts and exact string round-trip. Ordinary source tests
   must not import an SDK-dependent test. Run tool dependency auditing explicitly;
   normal application CI must not gain an AWS install requirement.
3. Full lint/source contracts, capture closure and supported full CI pass on the
   intentional committed source. Verify normal image construction excludes the
   tool and its additional SDK dependencies; use only authorized image checks.
   Run one newly authorized Meteor invocation, not a repeat under the spent cap.

Recheck frozen source metadata and the empty destination before recreating only
the reviewed time-bounded access and dispatching once. On either outcome remove
data access, deny trust, delete the temporary role and retire the workflow again.
Preserve a possibly written version for explicit reconciliation after a timeout.

Only a successful exact transfer makes the later
[restore rehearsal review](restore-rehearsal-review.md) actionable. It still does
not establish an accepted rollback copy or close Phase 0.
