# AWS account recovery readiness

This is the account-access prerequisite for the selected Secrets Manager recovery
store. It creates no AWS resource and does not establish that recovery works.
The operator confirmed on 2026-11-04 that an independent recovery path still
needs setup. Secret provisioning, permissions, upload and spending remain separate.

## Preserve access and identify its owner

First identify the actual AWS account and sign-in type through the existing
operator session. An IAM sign-in page is not evidence of the identity normally
used, and an IAM user's working MFA does not establish root-account recovery.
Confirm the intended account privately; never put account contact details,
passwords, MFA seeds/codes, security-key data or recovery keys in audit evidence.

Preserve the existing working MFA device. Do not remove it, reset a password,
disable MFA or invoke the lost-device process to simulate a failure. Establish
and verify the additional path before changing the current one.

## Establish an independent path

AWS supports multiple registered MFA devices. Select an operator-held backup
that remains available if both the workstation and primary phone are lost:

- An existing compatible hardware security key stored separately, or
- A separate phone/tablet with an appropriately protected authenticator.

Confirm available equipment before selecting a method. Do not assume a spare
device exists, install an authenticator, buy a key or create another paid service
without the corresponding approval. A second authenticator on the same primary
phone or an export readable only by this Windows profile is not independent.

The operator performs credential enrollment and physical interactions directly,
including authentication codes, QR/seed handling, PINs and security-key touches.
The agent can navigate, explain the steps and inspect nonsecret completion
metadata afterward. Do not capture the enrollment display or credential values.

The operator must also retain a usable route to the account's root email,
password/password manager and registered recovery contact outside the two lost
devices. Record only whether each requirement is confirmed. AWS documents a root
MFA recovery process using the account email and primary contact telephone; that
is not a substitute for verifying that those channels remain accessible.
IAM users require the applicable administrator recovery owner.

## Acceptance and record

Require a fresh successful sign-in using the backup factor, preferably from the
separate device, and confirmation that the account/password/email recovery path
does not depend on the lost workstation or primary phone. A signed-in console,
an MFA device-list entry or a new cloud secret alone is insufficient.

Retain only a dated check result: account ownership confirmed, existing factor
preserved, independent backup enrolled, fresh backup sign-in passed, independent
email/password recovery confirmed, and responsible operator. Keep private
recovery instructions in the operator's approved private storage, with the
independent copy/location selected by the operator. Do not infer cloud sync or
physical custody from a local file save. If any requirement is unverified, leave
the Phase 0 recovery gate open.

Only after account readiness should the operator approve the concrete Secrets
Manager resource, scoped access, cost and complete current/retained-rollback
document transfer. The selected one-secret/two-version recovery design remains
unchanged; no application-runtime AWS credentials or automatic rotation is added.

References: [AWS MFA guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html),
[lost-device recovery](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_lost-or-broken.html),
and [root-user practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html).
