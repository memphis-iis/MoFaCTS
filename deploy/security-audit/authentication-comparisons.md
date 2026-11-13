# Authentication comparison qualification

The Phase 2 source foundation compares login and password-reset responses without
changing application permissions or connecting unfinished protocols to reports.
`verificationCatalog.ts` owns the sample policy, protocol intent and successful
login baseline. The accepted selected authorization subset retains its 29 cases.

Acquire five login pairs and two reset pairs once for both enumeration and timing.
Each pair uses its source-owned sample ID and a fresh anonymous DDP connection;
alternate which identifier goes first. Bind an existing synthetic identifier and
an explicitly absent identifier under the environment lease. Establish a verified
successful login first. Respect the real IP/identifier/connection throttle windows;
do not clear shared buckets. Run deliberate throttle qualification last.

The four reset comparison requests leave one of the five-per-IP/hour requests for
the current-token scenario. This is not permission to skip preflight, retry a
consumed vector or invent a fresh throttle window. A rate limit is incomplete
evidence, not proof that an identifier is concealed.

`authentication/comparisonV2.mjs` separates transient wire-response capture,
evaluation and evidence projection. Native login denial must use the exact
reviewed Meteor credential-rejection code/reasons; unrelated errors cannot prove
denial. The source is Meteor 3.5.4's official
[accounts server](https://github.com/meteor/meteor/blob/release/METEOR%403.5.4/packages/accounts-base/accounts_server.js)
and [password server](https://github.com/meteor/meteor/blob/release/METEOR%403.5.4/packages/accounts-password/password_server.js).
Reset responses must be bounded primitive records with an explicit successful
generic response. Compare full bounded public values in memory, retaining only
pair IDs, outcome categories, durations and equality. Never retain message text,
credentials, email addresses, response bodies or response hashes.

Timing uses the existing paired median, minimum/relative bounds and dominant
direction rule, now shared by Node and Meteor. Append-only
`enumeration-observations-v2` and `timing-observations-v2` require exact per-family
counts, successful baseline, verified bindings, held lease, no unavailable
observations and a status consistent with the measurements. Existing v1 proof
shapes and the active control catalog/digest remain unchanged. Registering these
proof shapes does not activate them in a released report.

Node tests cover response differences, transport/domain/rate-limit failures,
incomplete or duplicate samples, private extra fields and contradictory proofs.
Meteor tests exercise the same timing and evidence validators on both runtimes.
These prove source contracts only. Mailbox acquisition, unused aged-token proof,
session lifetime bounds, lease/recovery and live staging qualification remain open.

## Reset and lifetime source qualification

Six reset qualifications in the same source catalog cover original-password
baselines, verified current reset, same-capability replay denial, and rejection
of an owned unused aged token with the original password unchanged. Current-use
and replay controls share one acquired vector. `resetProtocol.ts` reuses the
selected authorization decision table and complete-vector evaluator; only the
source-reviewed `invalid-token` code proves reset policy denial. A generic error
or a returned success without a verified new-password login is insufficient.

Ownership and unused flags describe the pre-attempt record snapshot. Expiry
requires its coherent age/lifespan/remaining duration and the application's
existing one-hour lifespan. A used token cannot be relabeled as expiry evidence.
The mutation contract requires separate current/expiry actors in remote runs,
an environment lease, private recovery journal and scoped cleanup. The registered
Meteor qualification deliberately seeds an aged synthetic record in isolated
MongoDB, then exercises the real application reset method and native password
checker. It also checks current-token consumption, replay denial and removal of
stored native session tokens. It does not claim live mailbox/wall-clock expiry,
live-session disconnection or logout qualification.

`sessionLifetime.ts` enforces `0 < lifetimeDays <= 30` without changing the app's
existing 30-day setting. The append-only `session-lifetime-v2` proof requires a
newly issued, identity-verified positive session baseline. Epochs remain transient;
only the duration and verified flags are retained. Existing v1 reports retain
their earlier interpretation. Native expiration generation is checked separately
from actual DDP login/resume and does not substitute for that baseline.

The old leakage-check titles were broader than their implementation. Original
scanner revisions `2d018ee6`/`0e121478` read normal account session storage for
session tests while inspecting page text, URL, cookies, console and request
metadata for unintended disclosure. Preserve that intent; this trace establishes
neither a defective Daybreak finding nor approval to weaken a check. Do not
introduce a blanket exclusion for credential-bearing URLs or network traffic.

The operator approved reuse of the existing inbox on 2026-11-12. Configuration
inspection confirms the retained staging learner aliases route to the operator's
connected Gmail inbox. It is a mixed personal inbox, not a dedicated mailbox.
Use the existing authorized connection for targeted operator acquisition; do not
recover/copy the production IMAP password or grant a background runner general
mailbox access merely to obtain reset evidence. Existing SMTP delivery stays
unchanged. No new mail service or application dependency is required for this
operator lane. This metadata inspection does not prove fresh mail delivery.

`authentication/mailboxV2.mjs` owns the bounded mailbox observation contract.
Each reset/expiry run binds an exact new recipient alias containing its fixture
namespace, staging2 origin and a request window of at most two minutes. A provider
adapter lists at most ten metadata records, selects exactly one fresh single-
recipient match, then reads only that message's plain-text body (at most 16 KiB).
Unrelated/stale/ambiguous messages cannot trigger a body read. The selected reset
link must have the exact staging2 HTTPS origin/path, the bound email, one valid
token and no extra query parameters, fragments or URL credentials. Capabilities
stay in transient private runner input. Only the sanitized delivery receipt can
enter retained evidence; it proves neither token validity nor expiry/replay.

The pure adapter contract and its injected-transport tests do not implement
unattended mailbox access or close live reset controls. Fresh delivery must be
observed through the real provider adapter, with owned fixtures, the environment
lease and cleanup/recovery prepared first. If a future unattended executor needs
different mailbox credentials or permissions, review that access separately.
