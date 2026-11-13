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
