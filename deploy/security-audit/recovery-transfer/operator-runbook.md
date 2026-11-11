# Temporary operator preparation and execution review

The design and source preparation are approved. The security-audit standing
mandate of 2026-11-11 covers intentional publication and its existing Linux
verification allowance. Creating the temporary AWS identity, preparing its
CloudShell runtime, reading the protected backup and retiring that access form
one operational review below. Those steps require the separate approval for
new security-sensitive access. The GitHub runner remains strict and inactive.

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

It requires Linux, Node 24.22.1, AWS CLI 2.39.3, the CloudShell context in Ohio,
the exact new IAM user, clean expected committed source and the configured loopback
container credential provider. Profiles, static keys, GHA context, Node injection
and non-loopback/custom-query metadata providers fail before credentials are
requested. AWS CLI gets a narrow environment with alternate credential/config
files disabled, EC2 metadata disabled, one attempt and the fixed STS endpoint.
Its credential output is bounded and remains in memory. No CLI error text is
classified as a security result; failed commands stop acquisition.

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

## Concrete staged access procedure to approve later

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
3. Render an initial bootstrap policy with `recoveryOperatorBootstrapPolicy`.
   Its one-hour/MFA/Ohio grant allows only launching the new user's CloudShell;
   it has no role/secret or environment-delete permission. Create the exact new
   user with that inline policy and no groups, managed policy or API key. Record
   the returned immutable UserId/ARN in the protected creation receipt.
4. Phil enters the new console password and enrolls his physical key himself,
   naming only this registration `mofacts-recovery-operator-key`. Record its ARN,
   require a fresh MFA sign-in and launch that user's new Ohio CloudShell. Capture
   the actual environment ID from its visible terminal/tab or AWS metadata; never
   substitute the root user's environment. This is a new per-user environment.
   With separate runtime approval, prepare a clean checkout in its private /tmp
   directory and run prepare-operator-runtime.sh with the reviewed commit once
   there. It uses the package's Node/npm pins, official HTTPS Node archive/exact
   vendor checksum, isolated npm runtime/cache, lockfile npm ci without lifecycle
   scripts and synthetic tests. It installs no system tool or root-user runtime
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

Steps 3 onward create/remove security-sensitive access and remain unexecuted.
The final operational review must contain actual source/policy/receipt hashes,
private target coordinates, one unused operation ID, activation/expiry window,
the human password/MFA handoff and the explicit setup/read/cleanup authorization.
No such permission is implied by this document or passing synthetic tests.
