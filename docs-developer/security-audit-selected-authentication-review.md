# Selected authentication cases: migration review

Review source: the approved single format-only baseline read on 2026-11-11,
executed with scanner source `7d6fc0d8`. The private receipt and its complete
checksum-verified execution/cleanup evidence are retained by the operator.
This document contains public subjects and known actor aliases only. It is a
migration review, not the verification catalog or live application acceptance.
The progress-privacy replacement was approved on 2026-11-11.
`mofacts/common/securityAudit/verificationCatalog.ts`
remains the sole planned executable intent owner.

## Recovered selection and current source

The inventory contains 22 selected rows: seven methods, six publications, six
client routes and three downloads. Seventeen resolve to the current public
application manifest; five publication rows do not. This does not prove that
their endpoints are missing or obsolete, including any framework-owned endpoint
outside that manifest. Resolving a subject does not establish its intended
policy, actual actor roles, resource relationships or a positive baseline.
Legacy allow/deny flags are diagnostic provenance only.

| Selected rows | Current source boundary | Remaining proof needed |
| --- | --- | --- |
| Method 0/1/5: anonymous, learnerA, teacherB call `getOwnOpenRouterSettings` | `profileMethods.ts` requires authentication (401) and an ordinary account; experiment-only accounts receive `experiment-account-restricted`. It reads using the caller's ID. | Assert the ordinary-account binding for allowed cases and match the expected successful response; unrelated errors cannot prove denial. |
| Method 2: learnerA calls `getStudentPerformanceByIdAndTDFIdFromHistory` | `analyticsMethods.ts` rejects a normalized foreign user ID with 403, before the history read. Invalid TDFs and other domain failures are distinct. | Establish the requested user's actual relation to the caller and a successful self-owned baseline on the same synthetic lesson. The sanitized string/string/null shape establishes neither. |
| Method 3/4/6: learnerB, teacherA, admin call `admin.securityAudits.list` | The V2 receiver uses the existing admin guard and `not-authorized` error. Method IDs are preserved at cutover. | Verify actor-role bindings, an executed admin baseline and exact denial categories for non-admin actors. |
| Publication 5: admin subscribes to `settings` | `publications.ts` returns settings only for admins; other callers become ready without settings. | Prove intended scoped delivery and the relevant canary baseline; ready, empty or errored subscriptions alone do not prove isolation. |
| Routes 0-5: `/profile`, `/courses`, `/admin/security-audits` | Current router entries use the shared authenticated-route/access-policy owner. | Observe authentication readiness, the exact expected route and rendered view. Client visibility supplies no server-authorization proof. |
| Downloads 0/1: anonymous and learnerA request `/data-download/own-history/...` | The handler consumes an exact token/filename capability. Invalid tokens, missing users and missing history can all return 404 for different reasons. | A valid token/content baseline and a source-defined rejected capability scenario; a generic 404 cannot establish authorization denial. |
| Download 2: teacherA requests `/admin/security-audits/download/...` | The V2 receiver validates the token, filename, issuing admin and stored report integrity. | A successful authorized token/content baseline and an exact rejected scenario; classify domain/transport failures separately. |
| Publication 0-4: anonymous, learnerA/B, teacherA/B | All five subjects are unresolved. Their names were deliberately withheld by the approved formatter because they did not match the current application manifest. | Select the intended public publication before assigning policy or authoring executable entries. |

Public source checks found no named-publication additions or removals between
the retained baseline source `7c0e126b` and the inspected current source. This
does not identify the five unresolved protected strings or prove why they were
configured. They must not be guessed, silently dropped or counted as passing.

The V1 scanner currently accepts `!result.ok` as a method denial, allows many
publication errors when no canary was observed, and accepts a generic 401/403/404
as a denied download. P1-D8 already authorizes correcting those evidence rules
and adding the required positive baselines. No application access-rule change
is proposed here.

## Approved progress-privacy replacement (2026-11-11)

Phil approved the replacement below. The five original subjects remain
unidentified historical provenance; their policy is not inferred. The approved
replacement is now implementation work alongside the V2 receiver and release
cutover. No additional backup operation is needed.

Replace the five unresolvable publication selections with explicit
current `userExperimentState` privacy scenarios for the same five actors.
Require that anonymous/other-account callers cannot receive another account's
synthetic progress, and that authenticated callers can receive their own
synthetic progress on the bound lesson. Check distinct canaries and scoped
documents with executed positive baselines. Keep the sixth admin `settings`
selection and the other resolved subjects in scope.

This intentionally changes which publication those five rows test. It does not
claim to recover their unknown original intent, change application permissions,
authorize another backup read or authorize protected binding publication.
Source preparation is authorized; any required
protected binding change must be prepared concretely and handled at its own
authorized operational boundary.

The alternative is to preserve the old selections as unresolved and obtain
separate approval for another narrowly reviewed protected inventory read that
can identify their subjects safely. The single read approved for this operation
is consumed, and all temporary AWS access has been retired.

Owner: audit maintainer. P1-08 owns resolution and implementation of this review.
After approved entries exist, replace this proposal table with links to their
canonical catalog entries and retain the decision in the existing plan ledger.
