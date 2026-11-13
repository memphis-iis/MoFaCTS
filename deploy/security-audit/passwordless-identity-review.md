# P2-D2: explicit identity for passwordless experiment resume

Status: decision pending, 2026-11-13. No application login policy or existing
account data has been changed by this review. Source/staging audit work has
standing authority; this change to existing login eligibility needs a decision.

## What the source does

In [experimentMethods.ts](../../mofacts/server/methods/experimentMethods.ts),
`provisionExperimentUser` searches for an existing participation username. Its
experiment-account classification accepts any of these as sufficient:

- An explicit true experiment flag.
- The experiment-provisioning creator marker.
- A nonempty stored experiment target.
- Any `GlobalExperimentStates` record for that user.

That last condition is learning progress, not proof of an authentication mode.
With progress but no stored target, the method can assign the caller's requested
target and invoke the native token issuer even when `profile.experiment` is false.
Without progress, the equivalent ordinary account is rejected as duplicate-user.
The subsequent profile-healing branch also relies on progress history.

The related ordinary-account classifier in
[authSupport.ts](../../mofacts/server/lib/authSupport.ts) uses the explicit flag;
the ordinary-settings guard in
[profileMethods.ts](../../mofacts/server/methods/profileMethods.ts) additionally
considers the creator/target markers. These are different current eligibility
definitions, not a missing IMAP or test-machine prerequisite.

## Evidence and limits

The actual factory source at fe08499c was transpiled in memory for a bounded
synthetic characterization with injected collection/framework dependencies.
An ordinary synthetic account with no history was rejected. The same explicit
false account with an unrelated progress record reached the token-issuance
callback and acquired a target; an unmarked historical account did too. An
explicitly marked participant with its matching target still reached issuance.
The first test harness incorrectly compared String constructors across VM realms;
that harness error was corrected before retaining the four source observations.

Factory source SHA-256:
7871447731068da1ed9eb1517f9ba8e4d458543d4d162a8d2fb7a50b12f5c183.
This is source characterization, not a new supported Meteor test, successful live
token login or evidence that affected accounts exist on a deployed server.
No production record was read. The participation-name grammar excludes `@`, so
this specific route is constrained to matching non-email historical usernames.
The accepted fresh-participant/selected/reset proofs are not invalidated.

## Recommended decision

For an existing account, require the existing explicit true experiment marker
(boolean true or its already-supported string representation) and a stored,
matching experiment target before issuing a passwordless resume token. New
participant creation continues to set both explicitly. Keep the separate
Prolific exclusion and completion behavior.

Remove history-only classification and automatic identity/target healing from
this public method. Learning progress must never grant login eligibility.
Preserve every account, history, model record and assignment. An old account
missing either marker receives a clear denial and requires an explicit,
ownership-verified operator repair; do not infer its identity from history or
the current caller. No automatic migration or production inventory is approved
by accepting the source/staging repair.

If approved, prepare the narrow gate repair using the existing explicit-marker
classifier, add negative cases for false/unmarked/history-only/missing-target
accounts and positive cases for valid bound participants, run required full
checks and one available supported Meteor milestone, then qualify synthetic
staging2 behavior through the existing release workflow. Production stays at its
separately authorized final cutover gate.

The alternative is to preserve the historical inference temporarily while
designing an explicitly authorized inventory/repair procedure. That retains this
source risk until repaired; it is not a passing audit result.
