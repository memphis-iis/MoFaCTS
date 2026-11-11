# Selected V2 authorization verification

`mofacts/common/securityAudit/verificationCatalog.ts` owns the selected test
subjects, expected policies, exact denial codes, positive baseline references,
proof shapes and mutation/recovery contract. Protected configuration supplies
values and credentials only. It cannot override subjects or expected results.

The approved selection has 29 executable cases: the 22 selected rows, with five
publication subjects replaced as approved, plus seven required positive
baselines. They cover methods, progress/settings publications, rendered route
visibility and the selected download endpoints. This is the minimum P1-D8 scope;
it does not establish all-runtime coverage or complete Phases 2/3.

## Proof and acquisition

`authentication/browserV2.mjs` explicitly creates an isolated browser when
`acquireSelectedAuthorizationV2` is called. Importing it does nothing. Its caller
must already have execution permission for the selected HTTPS target. Sessions
are separate for anonymous, learnerA/B, teacherA/B and admin. Authenticated
identities and authoritative hydrated role flags must match the source actors.
Failed login/role binding cannot accidentally run a case as anonymous.

The acquisition owner closes its browser before returning evidence; cleanup
failure is an execution failure. Only source verification IDs and five finite
outcome categories reach the shared evaluator. Credentials, IDs, canary values,
responses and download URLs stay private to acquisition.

- Method denial requires the exact source policy code. Domain errors and
  transport/runner failures remain errors. Successful calls require their
  declared positive response shape and resource binding.
- Progress isolation requires a ready, readable subscription, a real own-row
  canary for authenticated callers, no foreign row and executed allowed
  baselines for the relevant own/foreign fixture. Empty/unreadable/erroring
  subscriptions cannot supply successful isolation evidence.
- Route checks observe the expected final path and actual rendered Blaze view.
  A forbidden view that really renders is a failure. Missing readiness,
  transport failures and unrecognized redirects remain errors. Client route
  visibility makes no server-authorization claim.
- Downloads use their actual bearer-capability policy. The source does not
  pretend HTTP cookies impose a caller-role restriction on these URLs. A fresh
  capability must first deliver the bound content successfully; only replay of
  that exact consumed URL can prove one-use denial. A standalone 404, an invalid
  fixture URL or unrelated 401/403 cannot pass. Issuance retains existing method
  guards and each download retains existing resource/issuer validation.

## Protected binding interface

The authorization subset has exact schema
`MoFaCTSAuditAuthorizationBindingsV1`, with `actors` and `values`. The parser
rejects extra expectation/subject fields, missing aliases, duplicate actor IDs
or usernames and duplicate progress canaries. No values are shown here.

Actors learnerA/B, teacherA/B and admin each provide their existing synthetic
`userId`, `username` and `password`. Values bind the progress lesson, distinct
per-actor progress document IDs, exact learnerB performance, one known settings
document, the synthetic own-history export SHA-256 and the synthetic audit report
ID/digest. The source catalog names the exact aliases and the parser owns shapes.

This is an in-memory subset for the V2 fixture loader, not another credential
store or a replacement for the full production V1 configuration. Full V2 fixture
composition, protected binding preparation and live staging2 execution remain
separate work. Do not publish bindings, alter production secrets, infer missing
values or read the recovery backup merely to populate this interface.
