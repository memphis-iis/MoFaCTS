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

A dedicated SMTP/IMAP test mailbox would allow protocol qualification without
personal provider access. Any such tool must have its dependency approved,
an immutable image pin, private networking, resource limits, synthetic recipients,
bounded retention and verified cleanup. It must not replace staging2's normal
mail configuration. Isolated qualification and actual deployed-target acceptance
remain distinct; production mail and recovery access require separate approval.
