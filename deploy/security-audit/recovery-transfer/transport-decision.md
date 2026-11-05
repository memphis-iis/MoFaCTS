# Recovery transfer transport decision

Status: proposed, not approved or implemented. The destination remains empty.
The one authorized retry and all five Meteor integration slots are spent.

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

## Recommended implementation

Replace the CLI adapter with AWS's maintained JavaScript clients:

- `@aws-sdk/client-sts` for `AssumeRoleWithWebIdentity` and `GetCallerIdentity`.
- `@aws-sdk/client-secrets-manager` for the existing describe, complete version
  list, put and exact-version get operations.

MoFaCTS already declares `@aws-sdk/client-s3` in the canonical application
manifest, but S3 does not own these APIs. Neither additional client is a direct
dependency. Do not import incidental nested implementations or add a second
manifest. Add these two audit-helper development dependencies through
`mofacts/package.json` and its lockfile, after checking official versions,
Node compatibility and dependency advisories. Scripts are excluded by the
existing Meteor ignore rule; verify actual build impact before claiming the new
clients are absent from the image.

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
This changes the helper's dependencies and transport, not the selected store,
monthly storage approval, production bindings or application runtime design.

## Approval and verification gate

[AGENTS.md](../../../AGENTS.md) requires: "New npm, Meteor, Docker, or system
dependencies require explicit approval." Approve the two clients before
installation or implementation. Also authorize one fresh Meteor integration
invocation and one further protected transfer, conditional on passing checks.
No transfer retry is implicit in approving the implementation.

After approval: implement the sole SDK transport, test actual SDK serialization
and HTTP behavior with synthetic requests (including error redaction, explicit
identity, bounded attempts/timeouts and exact string round-trip), run full lint
and source contracts, publish intentional changes and pass supported full CI.
Recheck frozen source metadata and the empty destination before recreating only
the reviewed time-bounded access and dispatching once. On either outcome remove
data access, deny trust, delete the temporary role and retire the workflow again.
Preserve a possibly written version for explicit reconciliation after a timeout.

Only a successful exact transfer makes the later
[restore rehearsal review](restore-rehearsal-review.md) actionable. It still does
not establish an accepted rollback copy or close Phase 0.
