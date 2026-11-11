# Temporary operator preparation and execution review

The design and source preparation are approved. The security-audit standing
mandate of 2026-11-11 covers intentional publication and its existing Linux
verification allowance. Creating the temporary AWS identity, preparing its
CloudShell runtime, reading the protected backup and retiring that access form
one operational review below. Phil explicitly approved setup, one read and
owned cleanup on 2026-11-11. Record and execute only that operation. The GitHub
runner remains strict and inactive.

## Source acceptance before operational approval

The optional operator cohort is published in 070a1c9a. Its unchanged optional
SDK suite passed 50 cases, and the new shared-runtime outcome cases have native
Meteor acceptance on that commit (1,011 server and 1,245 client passes). Reuse
that accepted evidence while its relevant source stays unchanged. The later
admin presentation uses its own integration milestone under the standing run
ledger. Record the actual operator checkout SHA separately from the original
backup-transfer SHA and operation ID.

The optional package reuses the two pinned SDK clients and the existing exact-
version inventory reader. The new entry point is:

```text
node deploy/security-audit/recovery-transfer/aws/run-operator-inventory.mjs <private-workspace>
```

It requires Linux, Node 24.22.1, AWS CLI v2, the CloudShell context in Ohio,
the exact new IAM user, clean expected committed source and the configured loopback
container credential provider. Profiles, static keys, GHA context, Node injection
and non-loopback/custom-query metadata providers fail before credentials are
requested. AWS CLI gets a narrow environment with alternate credential/config
files disabled, EC2 metadata disabled, one attempt and the fixed STS endpoint.
Its credential output is bounded and remains in memory. No CLI error text is
classified as a security result; failed commands stop acquisition.

CloudShell automatically updates its installed CLI. The optional tool requires
the documented CLI v2 interface and validates the account, role and returned
session fields independently. The live preflight on 2026-11-11 observed 2.39.6;
the earlier 2.39.3 patch pin incorrectly rejected that managed update. Node/npm
and SDK package pins retain their existing exact values. See AWS's
[managed software contract](https://docs.aws.amazon.com/cloudshell/latest/userguide/vm-specs.html)
and [AssumeRole command](https://docs.aws.amazon.com/cli/latest/reference/sts/assume-role.html).

The existing baseline/target variables remain unchanged. Two new optional-tool
inputs are necessary: `RECOVERY_OPERATION_ID` is the unique decimal identifier
for this operator attempt; `RECOVERY_ACCESS_DEADLINE` is the shared UTC expiry
of the reviewed permissions, at most one hour away and at least 15 minutes away
when starting. They are not GitHub run identity or application settings.
`RECOVERY_EXPECTED_COMMIT` binds the actual checkout. Namespaces do not grant
execution authorization. The operator cannot set a different IAM user/role name.

An exclusive mode-0600 attempt file is reserved in the mode-0700 workspace before
credentials. The same file cannot be retried even after failure. Success replaces
its started marker with only the existing sanitized inventory/encrypted digest.
After each request boundary, expiry is checked before another operation starts.
The existing SDK capability independently denies writes; the IAM role must do so
as well. No second backup version or alternate actor is tried.

## Approved staged access procedure (2026-11-11)

1. Confirm the expected account, no existing `mofacts-recovery-operator` user and
   no `mofacts-recovery-restore` role. Read-only name inventories establish absence;
   failed queries do not. A collision stops preparation. Preserve root, the four
   other users, the shared OIDC provider and unrelated wiki-publishing role.
2. Use the existing pinned Linux source-verification worker to render the policy
   JSON from the reviewed committed source. Keep the selected private coordinates,
   unused operation ID, one shared activation/expiry window and output hashes in
   the protected review record. No new root CloudShell runtime is needed for
   policy rendering, and this is not a second Meteor invocation. Retain the full
   verified optional-tool source tests before provisioning any AWS access.
3. Create the exact new user without permissions, groups, managed policies or
   API keys. Record the returned immutable UserId/ARN in the protected creation
   receipt. Complete the password and hardware-key handoff before starting the
   expiring grant, so human enrollment cannot consume its access window.
4. Phil enters the new console password and enrolls his physical key himself,
   naming only this registration `mofacts-recovery-operator-key`. Independently
   verify the login profile and actual MFA association against the recorded
   immutable UserId; an open wizard or a reported enrollment is insufficient.
   Record its actual FIDO registration ARN, including AWS's generated suffix.
   Physical-key/WebAuthn registrations use `u2f/user/<user>/<name>-<suffix>`,
   rather than the virtual-authenticator `mfa/` namespace. Cleanup validates this
   account/user/registration name and the exact recorded current association.
   See AWS's [FIDO device metadata example](https://docs.aws.amazon.com/cli/latest/reference/iam/get-mfa-device.html).
   Then render and attach the initial bootstrap policy with
   `recoveryOperatorBootstrapPolicy`, starting the one shared activation/expiry
   window. Its one-hour/MFA/Ohio grant allows only launching the new user's
   CloudShell; it has no role/secret or environment-delete permission. Require
   a fresh MFA sign-in and launch that user's new Ohio CloudShell. Capture
   the actual environment ID from its terminal or AWS metadata; never substitute
   a terminal-session UUID or the root user's environment. The verified CloudShell
   environment identifier has the form `e-` followed by 32 lowercase hex digits;
   retain its exact value privately. This is a new per-user environment.
   With separate runtime approval, prepare a clean checkout in its private /tmp
   directory and run prepare-operator-runtime.sh with the reviewed commit once
   there. It uses the package's Node/npm pins, official HTTPS Node archive/exact
   vendor checksum, its verified bundled npm and isolated cache, the app production
   lockfile for shared strict-JSON dependencies, the optional SDK lockfile and
   synthetic tests. Both installs disable lifecycle scripts and preserve their
   lockfiles. It installs no system tool or root-user runtime
   and forwards no credentials to npm/tests. Capture the returned private
   workspace, runtime prefix, source SHA and test receipt. A preparation failure
   preserves that named workspace for review without selecting another runtime.
   This preparation must pass before the read grant starts.
5. Render `recoveryOperatorPolicies` using that exact environment ID, operation ID
   and the original shared expiry, with no automatic extension. At least 15 minutes
   must remain; otherwise stop for an explicit new-window approval. Replace the
   bootstrap policy with its reader policy. Session,
   credential-forwarding and cleanup writes bind to that one CloudShell ARN;
   only the documented environment-list operation uses a wildcard resource.
   Creation is no longer allowed. Create the exact new recovery role using its
   MFA/exact-principal/exact-session/expiring trust and the existing exact-secret
   three-read policy. Record its immutable RoleId/ARN and activation timestamp.
   No other trust, user group, managed policy, key, provider or secret is added.
6. Before the read, independently fetch the installed user/role policies and
   association counts and inline policy names under the management identity.
   Use mofacts-recovery-operator for the user inline policy and
   mofacts-recovery-restore for the role inline policy. Compare exact documents,
   identities, environment ID, key/group/policy counts and MFA association with
   the generated grant/creation receipt. The installed trust must exclude root,
   foreign and non-MFA identities and grant only the intended three reads.
   Policy comparison/simulation is not a real adversarial-identity probe; do not
   claim such a probe without its own executed evidence. Real MFA role assumption
   by the approved new operator remains required before the payload read.
7. With the specific protected-read approval, run the operator entry once. The
   source IAM identity must match the new user; the returned STS session identity
   must match the exact role/session, last about 900 seconds and expire within
   the access deadline. The existing reader independently verifies that identity,
   both-version metadata before/after, the original version/pin and complete bundle.
   Retain the sanitized inventory/encrypted digest and source/access/expiry proof.
   No password, API credential, raw payload, private canary or resource value goes
   into a public log or artifact. Do not repeat old recovery acceptance.
8. Review cleanup ownership with `verifyRecoveryOperatorCleanup` using the
   creation receipt and freshly fetched immutable IDs, exact policies and counts.
   It works after expiry; stale leases do not prevent removal. Replaced IDs,
   unexpected keys/groups/policies or another MFA registration stop cleanup
   instead of deleting unrelated access. Exact inline policy names are checked by
   the same verifier; the newly created environment identity must also be checked
   in the management procedure.
9. Remove the owned ephemeral runtime/source workspaces, preserve their non-secret
   receipts outside them, and use the temporary user's CloudShell Actions menu to
   delete **only its new environment** while the exact-environment grant is live.
   Then retire role access, remove its inline role policy/role, deactivate only
   the temporary MFA association, remove the user policy/login profile/user.
   Verify object absence and exact backup-version/label preservation. Do not
   remove the physical key's other registrations. If cleanup needs recovery after
   expiry, prepare an explicit exact-environment cleanup grant for approval; no
   silent extension or broad administrative grant is permitted.

The approved operation records actual source/policy/receipt hashes, private
target coordinates, one unused operation ID, activation/expiry window and the
human password/MFA handoff before its respective boundaries. Source tests are
retained separately from actual runtime, restricted-session and cleanup proof.
