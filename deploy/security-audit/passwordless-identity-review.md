# P2-D2 resolved: preserve progress-backed experiment access

Status: resolved by Phil's clarification, 2026-11-13. The proposed stricter gate
is withdrawn. No application login policy, account data or migration was changed.

## Laboratory requirement

For laboratory experiments, learning progress is intentionally permission to
return through the existing passwordless participation workflow. Remote
participants must not be required to remember a password or disclose their
personal identity for temporary experiments. Missing an explicit experiment flag
or target marker alone does not establish an authorization defect.

The audit must preserve this behavior and qualify the established participant
identity, saved-progress resume and experiment access boundaries. Do not add a
password, identifying field, mandatory marker, operator-repair prerequisite or
automatic migration to satisfy an audit assertion. Validate cross-user, ordinary
account, administrative and experiment boundaries against the intended laboratory
workflow; progress-backed return itself is an allowed baseline.

## Correction to the earlier review

The earlier recommendation incorrectly treated progress-backed eligibility as an
unintended grant and assumed an explicit-marker rule was the desired policy.
That interpretation and proposed repair are withdrawn, rather than retained as
a deferred finding.

The inspected [provisionExperimentUser implementation](../../mofacts/server/methods/experimentMethods.ts)
accepts experiment flags, creator/target markers or existing progress in its
classification. A source-only synthetic factory characterization demonstrated
that branch; it did not establish a violation of the intended workflow, a live
exploit or deployed account prevalence. Its source SHA-256 was
7871447731068da1ed9eb1517f9ba8e4d458543d4d162a8d2fb7a50b12f5c183.
That evidence remains characterization, not a security finding merely because
an account lacks a flag. Accepted reset, session and selected-case proofs remain
valid. Production was not inspected or changed.

## Prolific-specific follow-up

Phil identified Prolific API validation as a possible improvement for genuine
Prolific entry. The repository already has dedicated
[start/resume methods](../../mofacts/server/methods/prolificMethods.ts), a
[participation service](../../mofacts/server/lib/prolificParticipation.ts) and a
[server-side API client](../../mofacts/server/lib/prolificApi.ts).

Review and reuse those owners before proposing another mechanism. Treat genuine
Prolific participation and general laboratory passwordless participation as
distinct workflows. A proposed Prolific change must explain what is actually
validated and preserve existing progress/resume identity. This suggestion is not
approval for provider calls, new credentials, account linking or a login redesign,
and it is not a prerequisite for continuing the audit.
