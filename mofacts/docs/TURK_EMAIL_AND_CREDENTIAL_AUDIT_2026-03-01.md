# Turk Email And Credential Audit (2026-03-01)

Status: Active runbook addendum (updated 2026-03-04)  
Priority: P0 operational/security

## Scope
- MTurk credential capture, storage, and validation
- MTurk direct/scheduled message sending and delivery status reporting

## Findings
1. Critical: plaintext credential logging in `saveUserAWSData`.
2. High: missing auth/ownership checks in `turkUserLogStatus`.
3. High: credential shape mismatch between `turk_methods.ts` callers and `turk.ts` validator (`aws` object vs user object with `aws` field).
4. High: missing role/ownership validation in `turkScheduleLockoutMessage`.
5. Medium: blank profile saves can unintentionally clear credentials.
6. Medium: `saveUserAWSData` does not await `userProfileSave`.
7. Medium: `use_sandbox` is stored but not used by MTurk client configuration.
8. Low: UI reads AWS profile from `Meteor.user().profile.aws` while server stores `Meteor.users.aws`.

## Remediation Plan
1. Redact credential logs and avoid emitting raw keys.
2. Add role and ownership checks for log/status and schedule methods.
3. Normalize MTurk credential input shape in `turk.ts`.
4. Preserve existing credentials when blank save fields are submitted.
5. Await profile persistence before post-save account balance checks.
6. Honor `use_sandbox` by selecting MTurk sandbox endpoint.
7. Align client helper path to read from top-level `user.aws`.

## Implementation Notes
- Changes focus on security and correctness without changing workflow UX.
- Existing encrypted credential values remain compatible.

## Operator Runbook (2026-03-04)

This section is the operational baseline for MTurk messaging after the security hardening changes (`C-005`).

### Preconditions

1. You are signed in as admin or the owner of the target TDF.
2. The target experiment/TDF has a valid owner.
3. Owner profile has valid AWS credentials stored (`have_aws_id` and `have_aws_secret` true).
4. `mturkSandbox` default in settings and per-user `use_sandbox` value are intentionally chosen.

### Safe Credential Handling

1. Enter credentials only through approved UI/API paths.
2. Do not paste raw AWS keys into tickets, chat, or logs.
3. If rotating credentials, immediately run a send/log-status sanity check.
4. If blank credential fields are submitted unintentionally, verify stored credentials were not cleared.

### Message Send/Queue Workflow

1. Select experiment target owned by your account (or operate as admin).
2. Run status/log query before sending to confirm ownership and target validity.
3. Submit direct or scheduled message.
4. Confirm delivery state transitions:
- `attempting`
- `success` or `failed`
5. For `failed`, inspect retry/terminal failure behavior and error details in operator logs.

### Authorization Guardrails

Server methods reject access when:
- user is not admin and not owner of target TDF,
- owner profile cannot be resolved,
- owner credentials are missing/invalid.

Operational rule:
- Treat any ownership/auth rejection as a security event until proven otherwise.

### Incident Response Checklist

Use this for delivery failures, authorization errors, or suspected credential misuse.

1. Record exact method/action attempted and UTC timestamp.
2. Capture experiment/TDF identifier and acting user.
3. Confirm owner mapping for target TDF.
4. Confirm owner profile has valid AWS flags.
5. Confirm sandbox vs production endpoint intent.
6. Check whether failure is transient (retry expected) or terminal.
7. Escalate immediately for:
- repeated auth rejection with expected owner,
- suspected credential exposure,
- wrong endpoint mode (`sandbox` vs production) in active campaign.

### Evidence Fields For Tickets

- Experiment/TDF ID
- Acting user ID and role
- Owner user ID
- Delivery status (`attempting/success/failed`)
- Attempt count and last error
- Sandbox flag state

### Required Follow-up Docs

1. Cross-link this runbook from MTurk workflow UI/operator docs.
2. Add a short quick-reference table for common errors and operator actions.
3. Keep this page synchronized with server method authorization rules.
