# Security Audit Durable Redesign Status

Last baseline with passing CI, Security and image checks: `d87eabc7647bb8e955429348d8a469b1862746d0`.

## Hostname batch passed; staging2 enrollment pending operator handoff (2026-11-03)

The approved hostname correction and audit notes were committed/pushed as
`b5dc39c0b13347024accdd276e71cf7ac65542eb`. The exact commit's
[CI 41649356781](https://github.com/memphis-iis/MoFaCTS/actions/runs/41649356781)
and all four jobs in
[Security 41649357129](https://github.com/memphis-iis/MoFaCTS/actions/runs/41649357129)
passed on attempt 1. This consumed the single fresh Meteor authorization; no
retry or second invocation occurred. Hosted results: **975 server passed / 15
pending**, **1,237 browser passed / 7 pending**, harness **26/26**, Phase 0
**145/145**, capture **98/98**, source-security **44/44**, zero native skips or
failures, and **323** classified surfaces. Canonical Compose amd64 image
construction, embedded/tested source matching, runtime/ABI checks, standalone
Mongo rejection, Change Streams health, source protection and cleanup passed.
These checks do not qualify or deploy a workstation/staging2 release image.

After the shared policy save, actual private TCP 22 connectivity from the
expected PC source to the existing production node succeeded over both IPv4 and
IPv6. No production shell command, configuration or account change was made.
The native policy assertions cover the retained CI path; no additional
production audit workflow was dispatched. The node named **Elric** is this
operator PC and remains necessary for the approved private management paths;
it is not a retired server to remove.

The official Tailscale Ubuntu Noble stable repository supplied staging2 package
**1.104.5**. Repository/key files were absent before installation, protected
recovery checksums passed, and the daemon is active. Its current backend is
`NeedsLogin`: enrollment requested private name `mofacts-staging2`, only
`tag:staging2`, ordinary OpenSSH, no accepted routes/DNS replacement or exit-node
advertising. The one-time enrollment URL/output is retained only in protected
server state and the designated OneDrive credential directory, never in this
record. The browser enrollment flow requires operator authentication; its tab is
handed back after Phil reported automation interfered with manual sign-in. No
successful enrollment, actual node tag or private staging2 login is claimed.
Public SSH, Caddy, UFW and the application were unchanged; HTTPS health is 200.

Phil also explicitly approved Certbot and its Apache integration for certificate
issuance/automatic renewal. That approval persists; installation has not yet
occurred. A private Apache candidate preserves staging2's actual CSP/HSTS rather
than dropping its existing instructional-resource origins through a different
host's template. It has not been installed or syntax/runtime qualified.

A further bounded source-compatibility observation is recorded before any app
upgrade: existing staging2 has one scoped `readWrite` app role and no custom
read-concern role. Current canonical provisioning adds the exact read-only
`admin.mofactsReadDefaultConcern` role, while the old host audit requires exactly
one app role. A modern release therefore needs a maintained role-contract
correction before claiming full host acceptance; do not remove that required
runtime permission to satisfy the old predicate. No database user/role was
changed by the read-only prerequisite probe. Protected receipt installation and
release/source/host proof remain incomplete; Phase 0 remains open.

## Tailnet partition and hostname publication authorized (2026-11-03)

Phil approved saving the reviewed staging2 isolation policy, then continuing the
already authorized server setup. He also explicitly approved committing/pushing
the hostname correction and audit notes and one fresh Meteor integration CI
execution. This supersedes the pending-permission checkpoint below. The one CI
authorization is reserved for the push-triggered combined workflow; no dispatch,
retry or second Meteor invocation is included.

The initial native Tailscale save rejected the draft's positive assertions that
paired explicit IPv4 sources with IPv6 destinations and vice versa. Read-back
confirmed the old policy remained active. The assertion correction tests each
explicit address family separately and retains all 12 TCP/UDP cases, both
address families, and tag-based cases. The two grants, SSH stanza and tag owners
are unchanged from the approved proposal. The rejected original and corrected
candidate are retained separately in the designated OneDrive directory. No
rejected candidate was treated as applied or passing.

The corrected policy was accepted and retained by Tailscale. A fresh server
read-back, parsed after Tailscale's formatting, matched the entire corrected
candidate including both grants, unchanged SSH rules/tag ownership and all
12 assertions. The separate Tests view lists the retained corrected cases.
Exact accepted policy text and a screenshot of that view were saved beside the
original/candidates in the designated OneDrive directory. This is native policy
acceptance, not staging2 enrollment or proof of its actual tag/SSH/firewall state.

## Production-like staging2 setup approved; recovery state preserved (2026-11-03)

Phil approved the expanded setup recommended after the failed conditional
preflight below, and selected the existing Tailscale network already connected
on this PC. The scope includes Apache/private management, dedicated restricted
audit access and protected configuration, necessary scoped database audit access,
and a verified staging2 release with retained evidence. Production, the older
staging installation, new spending and unrelated access remain excluded; fresh
single-use Meteor and explicit commit/push boundaries remain in force.

Read-only reinspection confirmed Ubuntu 24.04/amd64, about 3.7 GiB RAM and
65 GiB free disk. The app still runs the previously observed `a3155584` image,
healthy, with HTTPS `/health` **200**. Compose project `staging2` uses
`/opt/mofacts/deploy/docker-compose.yml`; the app publishes exactly
`127.0.0.1:3000`, and MongoDB/Redis publish no host ports. UFW is inactive, and no
dedicated MoFaCTS audit account was found. Apache, Tailscale and Certbot are not
installed on the server. The PC's existing Tailscale connection is online with
MagicDNS enabled; that does not establish server enrollment, plan entitlement or
appropriate access rules.

Before changing services, the deployment owner preserved the prior app image
and host configuration in a root-owned mode-0700 recovery directory. Its image,
configuration and identity archives are mode 0600; checksum read-back passed.
Configuration includes the existing Caddy TLS state, private app inputs, Compose,
SSH and UFW files. These bytes remain protected on staging2; no private values or
database records were copied into local diagnostics. A bounded recovery index
was saved in the designated personal OneDrive Desktop credential directory.
This is preservation of the existing usable state, not a restore rehearsal or a
qualification of the old release. The application/proxy/firewall remained
unchanged and health stayed **200**.

The maintained auditor hardcodes the production public hostname in its Apache
check. A narrow local correction now requires `MOFACTS_PUBLIC_HOSTNAME` in the
protected configuration and clears any inherited value before sourcing that
file. One Apache policy follows the existing AWK policy-file pattern: it validates
bounded lowercase DNS syntax and compares the hostname and enabled-site path
literally. Environment carriage avoids AWK backslash decoding. Missing/invalid
identity fails through the existing configuration `ERROR` path; there is no
default. Control IDs and report field names are unchanged. Template, installation
guidance, source-capture input selection and regression tests were updated.
Existing hosts must set the explicit hostname and install the new policy before
upgrading the auditor. No production file was changed.

Independent source review found no blocking issue. This correction preserves the
existing single-vhost Apache output contract; it does not add detection of every
extra active HTTPS vhost elsewhere. The local checks do not establish actual
Apache routing or full restricted-reader acceptance on staging2.

Local verification under pinned Node 24.22.1/npm 11.19.1 passed: full application
typecheck and lint (**323** classified surfaces), source-security **44/44** with
zero skips, supplemental source-input tests **14 passed / 1 existing Linux-only
skip**, Phase 0 **138 passed / 7 platform-specific skips / 0 failed**, host-script
Bash syntax and diff whitespace checks. The pending supported CI run must cover
the Linux-only cases; no fresh Meteor run is authorized by the setup approval.
The correction and audit notes remain uncommitted. Publication requires explicit
commit/push permission and fresh single-use Meteor authorization because a code
push triggers the combined CI workflow. Only reviewed committed tooling may be
installed; this local correction has not been transferred to staging2.

Phil completed the Tailscale browser sign-in. The console shows the existing PC
and production server, with their IPv4/IPv6 identities independently matched to
the local client. Its current Personal plan displays 1/6 seats and 0/50 included
tagged resources; no purchase or plan change was made. This is the observed
account capacity, not an executed enrollment.

The live policy contains a blanket `*` source / `*` destination / all-protocol
grant. It would include a newly tagged staging2 host. A narrower grant alone
would not restrict the blanket grant: Tailscale grants are additive. Enrolling
staging2 in that state would undermine the selected isolation boundary. No
enrollment, key creation or live policy save was performed.

A concrete replacement is prepared as an **unsaved** console draft. It preserves
all current connectivity among the verified PC and production IPv4/IPv6
identities and the existing `tag:ci` runners, then permits only the PC's addresses
to initiate TCP 22 to `tag:staging2`. There is no grant from staging2 to those
existing identities or from production/CI to staging2. The existing SSH stanza
and `tag:ci` ownership are preserved; the new tag has the same existing owner.
This avoids silently narrowing production/CI behavior during staging2 setup.
New identities outside those sets would require explicit grants.

The complete previous policy text, candidate JSON and preview screenshot are
saved in the designated OneDrive Desktop credential directory, outside the
repository. The candidate contains 12 TCP/UDP assertion cases covering preserved
IPv4/IPv6 paths, PC-to-staging2 SSH and denied private cross-target/service paths.
Its editor read-back matched the saved draft exactly and the console displayed
the changes preview. These assertions have **not** been reported as executed or
passed by Tailscale; server acceptance and live reachability remain pending.

Independent static review found no blocking issue in the complete candidate.
Enrollment acceptance must verify staging2 has only `tag:staging2`: assigning it
`tag:ci` would put it into the preserved production/CI group and violate the
selected boundary. No additional node tag is approved by this proposal.

This is the next decision point: approve the specific shared-tailnet partition
before Save. It affects a policy also used by production, even though existing
production paths are intended to remain unchanged. Retain the prior policy for
recovery and prove existing production/CI connectivity plus new private operator
access after any authorized cutover. Ordinary OpenSSH and its forced audit-key
boundary remain the selected staging2 SSH path. Do not enable a separate
Tailscale SSH authentication path as part of this setup.

The console draft is left open for review. The earlier commit/push and fresh
Meteor-run request is still pending; the sign-in reply did not authorize those
actions. No server package, account, permission, audit configuration, receipt
tooling or release candidate has yet been installed. Phase 0 remains open.

## Authorized staging2 preflight stopped before installation (2026-11-02)

Phil authorized staging2 preflight and receipt-tool installation/testing only if
the documented prerequisites pass, with continuation to the next decision point.
Read-only SSH used the existing deployment identity from the designated personal
OneDrive Desktop folder and strict verification against its saved host key. No
new credential, key, account, permission, host file or service was created.

The actual application is healthy: HTTPS `/health` returned **200**; Docker
reports the `mofacts` service in Compose project `staging2` running and healthy.
Its image is `mofacts-local/mofacts-mini:staging2-a3155584`, Docker image ID
`sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`,
with revision `a3155584ca26bbd03b83a123f9852aeddaa29a50`, platform linux/amd64
and Node **24.15.0**. This was discovery of the actual container, not a substitute
for the missing protected selector and not an OCI/config-mapping qualification.

The protected receipt prerequisites did **not** pass:

- `/etc/mofacts` is root:root mode 0700, but
  `/etc/mofacts/security-audit.conf` is absent. There is no existing protected
  `MOFACTS_APP_CONTAINER` selection for this tooling.
- `/etc/mofacts/release-receipt.json` and its lock are absent. Both receipt helper
  files, their `/usr/local/libexec/mofacts-security-audit` directory and
  `/usr/local/sbin/mofacts-host-exposure-audit` are absent.
- Docker, jq, stat and SHA-256 tools are available. Caddy is active; Apache and
  Tailscale are not installed. The reviewed full host-audit template expects an
  Apache HTTPS site and private-management configuration, in addition to scoped
  database/Redis settings. That compatibility cannot be silently assumed.
- The desktop `mofacts-staging-deployment.json` identifies the **older staging**
  hostname and is awaiting acceptance; it was excluded. The staging2-specific
  `deployment-status.json` still identifies `e3029421`, not the running `a3155584`
  image. Its a315 notes match the actual Docker image ID but do not supply the
  current acquisition-record references. No accepted matching release carrier
  with the independent source/evidence prerequisites was identified in these
  designated records.
- Exact-commit historical [CI 37917879685](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879685)
  and [Security 37917879795](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879795)
  passed on 2026-10-09. The CI artifact list now has **zero retained artifacts**;
  that historical success does not supply the new source/image acquisition
  bundles or an independent current workstation observation.

Installation, receipt projection/publication, mismatch testing and recovery
mutation were not attempted: their pre-write gates are unmet. No protected
configuration contents, container environments, SSH keys or learner records were
copied or logged. Read-only output was limited to allowlisted identity,
ownership/mode/link/size/digest and tool/service/health summaries. No Meteor
integration run, build, image publication or deployment occurred. Unrelated
working changes remain preserved.

The next decision is expanded staging2 audit setup, not permission to bypass a
receipt check. The approved rehearsal assumed an existing protected audit
boundary; creating one entails new persistent security configuration/access,
and the actual Caddy/public-management environment needs an explicit compatibility
decision before reusing production-specific host checks. Matching accepted
release/source evidence also needs to be established for the actual test image.
Do not install a minimal substitute configuration, fabricate old metadata, use a
production record, or treat CI's smoke image as staging2 proof. Phase 0 remains
open; the conditional installation authorization did not activate.

Proposed next scope (not approved): make staging2 a production-like security
test target, with the production proxy/private-management arrangement, dedicated
restricted audit identity/key and sudo binding, root-only audit configuration,
necessary scoped database audit access, and a current verifiable staging2 release
while preserving the usable prior image/configuration. This keeps one maintained
host-audit path. Account/access/cost prerequisites must be verified before their
operations; no new spending is authorized by this recommendation.

Keeping Caddy is an alternative design requiring explicitly scoped maintained
Caddy-compatible host auditing. Apache/Tailscale are not requirements of the
standalone receipt parser/installer; they are assumptions of the full host auditor
used by the approved restricted-reader flow. That auditor returns before emitting
`releaseReceipt` when its required configuration is incomplete. A new receipt-only
SSH route or minimal selector-only config would be a different access contract,
not successful execution of the approved rehearsal. No such route was created.

## Candidate preparation published and verified; staging2 rehearsal ready for approval (2026-11-02)

Phil confirmed commit/push and CI for the candidate-preparation batch. It is
committed/pushed as `d87eabc7647bb8e955429348d8a469b1862746d0`; manifest,
lint-staged and staged-secret hooks passed. The exact candidate's
[CI 41553749307](https://github.com/memphis-iis/MoFaCTS/actions/runs/41553749307)
and all four jobs in [Security 41553749287](https://github.com/memphis-iis/MoFaCTS/actions/runs/41553749287)
passed. This consumed the single fresh Meteor authorization, with no retry or
second invocation and one canonical Compose application compilation.

Hosted results: **975 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **145/145**, capture **98/98**, zero hosted
skips. The new Meteor parity case explicitly retained the image-acquisition
locator while preserving the earlier observation-only form. Full app/vendor
typechecks, lint, protected-source checks, image observation, ABI/runtime checks,
standalone-Mongo rejection, replica-set health and cleanup passed.

Published artifact metadata observed for that exact commit/run/attempt:

- Source `13192614690`, `source-observation-41553749307-1`, ZIP digest
  `6c813962c3fd641ec7c55502cd19128daea44636989afcc76a761159f8b817d3`.
- Image `13194555561`, `image-observation-41553749307-1`, ZIP digest
  `0c66d2b600a7cb27990bce96795d34c168c1338f5fa6c872269b1b8218dec798`.

This turn did not repeat the prior live acquisition/preparation probe or capture
an independent workstation release candidate. The passing hosted fixture suite
and prior exact-byte live probe remain distinct evidence; neither qualifies a
release or supplies staging2's actual image identity.

Continuation prepared and independently reviewed the concrete
[staging2 rehearsal plan](../deploy/security-audit/release-records.md#staging2-rehearsal-prerequisites-and-procedure).
It reuses prepare/store/history/project/install/read owners and retains existing
interruption/history fixtures instead of repeating their covered faults on the
live host. Its actual-host acceptance focuses on real identity, protected file
ownership, restricted-channel output, rejection without replacement and recovery.
Preflight must identify suitable actual staging2 metadata and independent source
evidence before writes; CI smoke images, production records and synthetic probe
records cannot substitute. Unexpected customization or unsafe ownership stops
execution. No new credential, permission, service or container selector is
proposed. Only allowlisted identity/permission/hash summaries may be retained;
prior receipt/tool bytes stay in owner-protected recovery storage.

The proposed host tooling is pinned to reviewed source at `d87eabc7`:

- `deploy/security-audit/release-receipt.sh`, 4,959 bytes, digest
  `74643c30068d7d126bad6f510e2296d2f7c6ed871d0bb6559510d313a6fa840c`.
- `mofacts/scripts/security-audit/qualification/releaseReceipt.mjs`, 2,700 bytes,
  digest `bf1265cbe40573f7023ba06e2c50b8f4a259ddd6f83bc2fbf03c478eb6563199`.
- `deploy/security-audit/host-exposure-audit.sh`, 28,057 bytes, digest
  `d83daf7f8df05872209b2e45c6a3168cfa874a277d9ac54b8b2c8eb25c7c92e5`.

No staging2 preflight, protected installation, command-sheet/authoritative-record
write, registry publication or deployment ran. No new architectural choice was
identified: the next boundary is explicit operational approval for staging2's
protected preflight/install/read rehearsal, subject to its stop conditions. The
standing staging2 lifecycle permission does not itself authorize protected-host
installation. AWS recovery setup and Phase 1/catalog activation remain separate.
Phase 0 remains open.

These outcomes and the reviewed plan are a documentation-only follow-up to the
tested code candidate; its commit skips CI to avoid an unauthorized additional
Meteor invocation. Unrelated staging/Mongo/SPARC and wiki work stays preserved.

## Candidate-preparation publication and one Meteor run authorized (2026-11-02)

Phil explicitly confirmed committing/pushing the reviewed candidate-preparation
batch and running CI. The single fresh Meteor authorization is available for the
new candidate and is not an authorization to retry. Only this batch's intentional
changes are included; unrelated working changes stay preserved. Exact committed
identity and CI/Security outcomes will be recorded after execution. No release
record write, protected installation, image publication or deployment is implied.

## Image helper passed; release-evidence candidate preparation continued locally (2026-11-02)

The authorized image helper is committed/pushed as
`39faaebef1cdc37613981b22ae4f16d2caf5c948`. Manifest, lint-staged and staged-secret
hooks passed. [CI 41541002426](https://github.com/memphis-iis/MoFaCTS/actions/runs/41541002426)
and all four jobs in [Security 41541002444](https://github.com/memphis-iis/MoFaCTS/actions/runs/41541002444)
passed. One Meteor invocation and one canonical Compose application compilation
ran, without retry or another invocation.

Hosted results: **974 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **138/138**, capture **98/98**, zero hosted
skips. Full app/vendor typechecks, lint, source protection, image observation,
ABI/runtime checks, standalone-Mongo rejection, replica-set health and cleanup
passed. These results apply to the committed helper, not the continuation below.

Continuation completes a local opt-in candidate-preparation draft, without
changing the production writer or writing release authority:

- A V2 image observation reference hashes exact statement bytes, while the
  preserved image bundle is named by its acquisition-record hash. The raw
  observation reference alone could not locate the bundle. A bounded optional
  `ciImageAcquisitionDigestSha256` now supplies that locator; it requires the raw
  observation reference. Both have explicit distinct roles, with no new index,
  rekeying, storage owner or retention policy. Older V2 forms, six/eight-field
  records and V1 parsing/goldens remain unchanged. Review treated this as routine
  completion under controlling decision 9, not a new user policy choice.
- `deploy/prepare-release-evidence.ps1` and its Node owner accept a fresh candidate
  without existing qualification, acquire through the existing fresh collector,
  bind full identity and exact source/image bytes, and emit only bounded candidate
  JSON. Inputs remain unchanged. Existing proof is rejected, not migrated or
  stripped. Actual deployment/image fields are preserved; no workstation tuple
  is invented and no storage/project/install action is called.
- Local tests: Phase 0 **144 passed / 1 hosted-only skip** (145 total), capture
  **94 passed / 4 hosted-only skips**, source-security **41/41**, full app
  typecheck and lint passed, with the unchanged 323-surface contract. Independent
  review found no remaining correctness/security blocker. One new shared Meteor
  parity case is prepared but has not run; no second invocation was authorized.

The actual new artifacts were acquired and linked using the real PowerShell
wrapper and existing stored sign-in. The input was an isolated synthetic
eight-field candidate, with the hosted run's saved source observation and local
module inventory. Independent assertions verified all eight fields unchanged,
both bundle locators resolvable, no actual workstation tuple, proof classification
`incomplete-unqualified` and identity evaluation `ERROR/proof-unavailable`.
This does not independently capture/attest current dirty workstation source or
establish release qualification. Evidence remains ignored under
`tmp/ci-helper-evidence-41541002426`.

- Source artifact `13185643183`, ZIP digest
  `c9ffbb952dcec73bb0b5c514d9cd4d2ecd9ac34fcab20f23d8553a0e7413c1e7`.
- Image artifact `13185867970`, ZIP digest
  `dced56e91b4a232a1a931a2b66f2cb34ce0c2485bf928bcfe145b27a83b54a2f`.
- Source-acquisition digest
  `20353a18b2f774a00859cedcc3f3f004ea4c4de5ca47e4a775e8f5c89d659288`;
  image-acquisition digest
  `abca16d4f5d8df1159e4af4de3ed393e40c662aa5b893448a4e876639a28a514`;
  exact image-observation digest
  `2817b3f2874cd7b46a886e60a7866dd1ff97517c62d3f44230d87a715d0e7f0a`.
- CI image config ID
  `sha256:dd72f063aa3627895d1848b97c1ea32b36dfe0cb801ce39242ad01d948d67544`,
  source snapshot `e43b9c56b42e28691ac6aaac171a03dc7fa9ce5dfe49e9f568f404a36d3db959`;
  joined source-evidence digest
  `953d70ef5cf4032f86dc2e4e59ac3dc41ab0e10f05e34068027af8c212ec5a07`.

Two initial fixture-admission checks failed before acquisition: an untagged
synthetic image and, after fixing that fixture through PowerShell conversion,
a timestamp whose fractional representation was coerced away. Only the synthetic
input was corrected; parser checks were not relaxed. Public preparation guidance
now preserves emitted JSON rather than date-coercing/reencoding an inspected
object. The corrected end-to-end wrapper check passed.

The preparation/reference continuation remains uncommitted. Unrelated
staging/Mongo/SPARC and wiki edits are preserved. No authoritative release record,
command sheet, protected host, registry image or deployment changed. No new
design choice remains in this slice; the next gate is fresh publication/Meteor
authorization for this exact candidate before integrating the opt-in action into
a release procedure. Actual workstation/registry/running-image proof, complete
catalog/authentication, external reader confirmation, protected installation,
secret-recovery acceptance and the remaining Phase 0 gates remain open.

## Image evidence helper publication authorized (2026-11-02)

Phil authorized committing/pushing the reviewed image evidence helper and one
fresh Meteor integration execution, then continuation within the approved design
until the next decision. This authorizes one invocation without an automatic
retry. The committed candidate and exact CI/Security outcomes will be recorded
after execution; no deployment or authoritative release-record write is implied.

## Release-record V2 passed; CI image acquisition continued locally (2026-11-02)

The accepted checksum correction and release-record draft are committed/pushed as
`29394ded1d0a0d65876a6e78529063eb368bd0a9`. Manifest, lint-staged and staged-secret
hooks passed. [CI 41537962904](https://github.com/memphis-iis/MoFaCTS/actions/runs/41537962904)
and all four jobs in [Security 41537962905](https://github.com/memphis-iis/MoFaCTS/actions/runs/41537962905)
passed. This used the single fresh Meteor authorization and one canonical Compose
application compilation, with no retry or second invocation.

Hosted results: **974 server passed / 15 pending**, **1,237 browser passed /
7 pending**, including the three new V2 parity cases; harness **26/26**,
Phase 0 **129/129**, capture **98/98**, zero hosted skips. Full application/vendor
typechecks, lint, protected-source checks, image observation, ABI/runtime checks,
standalone-Mongo rejection, replica-set readiness and cleanup passed. The old
checksum false-positive run remains failed historical evidence; the exact
correction now has its own passing hosted scan.

Continuation adds the opt-in `deploy/collect-ci-image-evidence.ps1` wrapper and
Node owner. They reuse the source acquisition policy and native ZIP reader,
retain a separate immutable image bundle, match full source/run/attempt identity
and the exact source-evidence bytes, and reobserve remote workflow/job/artifact
metadata before publication. No release authority or workstation image is
inferred. The closed native image profile accepts only the workflow's canonical
`mofacts-ci-image-observation.json`, at most 16 KiB in a 64 KiB archive; the default
source profile is unchanged.

The first live check exposed a draft consumer filename mismatch: it guessed
`image-observation.json`. It failed before image publication and preserved the
valid source bundle. The consumer/profile now require the actual published name,
with a workflow-path regression test and rejection of the guessed alias. The
corrected real wrapper then successfully acquired both artifacts through the
existing stored sign-in. Local-only evidence is under ignored
`tmp/ci-image-evidence-41537962904`; no raw API payload or credential is retained.

- Source artifact `13185470896`, ZIP digest
  `5aafe5fa41add1df0ce323cfdbd56a5c2a919988ebd3abcec05055401de76a36`.
- Image artifact `13186670126`, ZIP digest
  `478a301b3c8c0dfff13d08f7c3ac8e9163381385c1e01548b5c65861bd1ce48d`.
- Preserved source-acquisition record digest
  `74803d78ae169e337041bde3052dc9bf3157526596dceeb80130b0f49a3453b7`;
  image-acquisition record digest
  `429ac5fb3c7a044a56f65452b1a80d59a81547d71472b76f73e9b8c6a3605777`.
- Exact image-observation digest
  `a902e86ebb6c0a474213bfef3b6bc7ff0560772796f40f817bbe1f25799e4c9d`;
  joined source-evidence digest
  `b59cd1313dc859ca473aa1606fdbd3dd6a1c6ebde25c748d871841f09dafbb29`.
- CI image config ID
  `sha256:ddca907e649ab39a513fcc91bcd79362bc6fe076ae3f9c6062e5cf9c8eb0de4c`,
  source snapshot `942554ecaf8937af72b3717451a91514e197709bf1afc7934286721c30e030eb`.

This live helper check used the hosted run's saved source observation and local
module inventory. It did not independently capture/attest the current dirty
workstation source or qualify a release. Success remains `acquired-unqualified`.
Local checks: Phase 0 **137 passed / 1 hosted-only skip** (138 total), capture
**94 passed / 4 hosted-only skips**, source-security **41/41**, native ZIP
**31/31**. Independent review found no remaining binding/ownership blocker. The
new workflow-path test initially failed full lint's regex-spacing rule; its
equivalent counted-space expression and focused suite now pass. Final full lint
passed, including the unchanged 323-surface contract. No TypeScript app source
changed in this continuation; the pushed V2 app typechecks passed in CI above.

The acquisition continuation remains uncommitted. Unrelated staging/Mongo/SPARC
and wiki edits are preserved. No command-sheet edit, authoritative-record write,
protected-host installation, registry publication or deployment ran. Bounded
reader searches in the canonical config/wiki repos found the two existing
command-sheet writers only; this does not prove absence of external readers.
Next is publication/verification of this helper, then explicit release-reference
binding and protected installation. No new architectural choice was established;
fresh publication/CI authorization is required before another push triggers
Meteor. Full catalog/authentication, workstation/registry/running-image proof,
live receipt/recovery and remaining Phase 0 gates stay open.

## Release-record draft publication authorized (2026-11-02)

Phil accepted the identified public-checksum false positive and authorized
committing/pushing its exact correction with the release-record V2 draft below,
followed by one fresh Meteor integration execution. The previous failed Security
run remains historical evidence; a passing result for this new candidate is still
required. This authorization permits one invocation, without an automatic retry,
and continuation within the approved design until the next decision boundary.
The exact candidate and hosted outcomes will be recorded after execution.

## Image observer CI passed; Security checksum finding repaired locally (2026-11-02)

The authorized image-proof batch is committed/pushed as
`c58205128cd489b83d8bc821657a62236cf84a19`.
[CI 41524323711](https://github.com/memphis-iis/MoFaCTS/actions/runs/41524323711)
passed completely, including the first real collector/isolated image read and
separate image-artifact publication. It used the one authorized Meteor invocation
and one canonical Compose compilation; no retry or second invocation ran.
Pre-commit manifest, lint-staged and secret checks passed.

Hosted outcomes: **971 server passed / 15 pending**, **1,237 browser passed /
7 pending**, harness **26/26**, Phase 0 **120/120**, capture **98/98**, zero hosted
skips. Source/protection, application/vendor typechecks, lint, image ABI,
standalone-Mongo rejection, replica-set health and cleanup passed.

Both published artifacts were downloaded, checked against their reported digests
and read with native ZIP integrity validation:

- Source artifact `13178688049`, `source-observation-41524323711-1`, ZIP digest
  `62a34a9a14ffd7deaa0bf9bbd7e5144477baebb620393a0ce2c3149dbdbcf917`.
- Image artifact `13178359523`, `image-observation-41524323711-1`, ZIP digest
  `561d1f3d1e243d241bb2ba0dbd71c9656cd309b835e149edde5a99933a9aba09`.

The parsed image record remains `observed-unqualified`, lane `ci-test-image`.
Its exact-file digest is
`97cd7e46c3b32841a6df2346d1a2efee2acdbb6d5c8ae45415cbf2b2cfd43349`.
Independent validation matched source identity, commit/run/attempt and the digest
of the exact joined source-evidence bytes:
`49bc1f2808be9f37b868140f6bc71d9cadbc4dc84f8c2ea11f8a58eb799b4948`.
The source snapshot is
`e0bc88c613d5b70392e96ac321375b7faee3ee69ac24685dd6fdfc3dc9c7d442`;
the observed linux/amd64 config ID is
`sha256:59da16c04448bfaa58b44533a9b580c4f9b6f4a0ac6cbdeacf6ec240bfc985c1`.
No registry or workstation release-image identity is inferred from this record.

[Security 41524324580](https://github.com/memphis-iis/MoFaCTS/actions/runs/41524324580)
has three passing jobs and one failed gitleaks job. A read-only, fully redacted
scan reproduced its sole finding at historical commit `56006374`, status-file
line 28: the known public ZIP checksum of artifact `13177217912`, previously
independently verified against GitHub. It is not a credential. The local repair
adds only that exact historical fingerprint to `.gitleaksignore` and rewords the
current checksum note; no detector or broad path is exempted. The paired source
test now requires the exact reviewed membership. The pinned scanner's full local
history scan passed: **785 commits, approximately 34.75 MB, zero findings**.
The hosted failure remains recorded; it is not relabeled green or waived.

Continuation implemented the next local contract/storage draft without changing
the production writer or authoritative record:

- `ReleaseQualificationV2` discriminates the same optional extension. It retains
  one build identity and bounded source/image digest references, with the actual
  workstation identity tuple absent until acquired. Historical six/eight-field
  records and V1 parsing/evaluation/golden fixture remain unchanged.
- Valid incomplete V2 observations may be preserved as `incomplete-unqualified`;
  identity evaluation stays `ERROR/proof-unavailable`. Any supplied actual tuple
  must pass the existing consistency checks. CI image references never supply
  workstation built/published/running identity.
- The existing exact-byte history, atomic replacement and credential-free receipt
  projection remain in use. Synthetic tests verified prior-byte retention,
  inconsistent-input rejection before allocation, and unchanged receipt identity.

Local checks: Phase 0 **128 passed / 1 hosted-only skip** (129 total), capture
**94 passed / 4 hosted-only skips**, source-security **41/41**, full application
typecheck and lint passed. A first source-test run caught the old seven-entry
fingerprint count; the reviewed eight-entry expectation was updated and the full
suite rerun successfully. Three new V2 Meteor parity cases are prepared but have
not executed. Independent review found no remaining V2 correctness blocker.

This correction and V2 continuation remain uncommitted. No additional CI run,
release-record write, production command-sheet edit, host installation, image
publication or deployment occurred. The previous all-green baseline above stays
unchanged. No new design choice was established; a fresh publication/execution
approval is required to verify the corrected candidate before live integration.
Do not bypass the failed hosted Security result or reuse the consumed Meteor
authorization. Referenced-byte acquisition/binding, external reader confirmation,
full catalog/authentication and protected release/recovery gates still remain.

## Image observation publication — one fresh execution authorized (2026-11-02)

Phil explicitly authorized committing/pushing the reviewed image-proof draft and
one fresh Meteor integration run, then continuing until the next design decision.
The existing local checks below remain distinct from hosted execution. The exact
pushed candidate, new artifact and CI/Security outcomes will be recorded after
execution. This is one invocation without an automatic retry or live deployment.

## Helper published and verified; image observation continued locally (2026-11-02)

The authorized helper batch is committed/pushed as
`0f8f1c30c9d98e0f8865025751510d9a5cf4d0de`.
[CI 41520033283](https://github.com/memphis-iis/MoFaCTS/actions/runs/41520033283)
and all four jobs in exact-commit
[Security 41520033398](https://github.com/memphis-iis/MoFaCTS/actions/runs/41520033398)
passed. This consumed the one fresh Meteor authorization; no retry or second
invocation was launched. Pre-commit manifest, lint-staged and secret checks passed.
Unrelated staging/Mongo/SPARC and wiki edits remain preserved.

Hosted outcomes: Meteor **966 server passed / 15 pending**, **1,237 browser
passed / 7 pending**; harness **26/26**; Phase 0 **109/109**; capture **98/98**,
with zero hosted skips. Dependency setup, full lint/application/vendor typechecks,
pre/post source checks and protection assertions passed. One canonical Compose
application compilation and the source/image/ABI/standalone-Mongo/replica-set
runtime checks passed, followed by cleanup. Linux amd64 built/tested image
**config** ID:
`sha256:4eba2ae1e2df9c0b5c6464ea6520e73eb8ac3adf13f26b02ff26e88e082d9c60`.
This is a runner-local smoke image, not a registry manifest/index identity or a
workstation-built/published/deployed image claim.

The authenticated source artifact is `13177217912`,
`source-observation-41520033283-1`. The downloaded ZIP checksum matches GitHub's reported digest:
`1a6c0798d40f01677c653f3a17340a9fa930de8aa8fa6c71e54f3a0cf7ba53e8`.
Native ZIP validation passed. The helper then successfully acquired and
revalidated the exact CI/Security tuple and payloads, retaining acquisition
record SHA-256
`ca62215317e78269b7f0f73fe30a5c8c8ef38e24ec581d8c3f1209f6ce4ea6ee`.
Source snapshot is
`b3a92b7245de790abb0845b71301c44c361aae62c1fd720ea8081a5f64f588ba`.
The records remain `completed-with-pending` / `acquired-unqualified`. The live
read used the retained expected observation and a module-name inventory; it is
not independent proof that later working-tree edits equal this tested source.

After Meteor passed, continuation implemented a separate local draft:

- A strict shared `PostBuildImageObservationV1`, explicitly `ci-test-image` and
  `observed-unqualified`, reusing the existing image shape/parser and referencing
  the exact pre-build source-evidence digest and CI coordinates.
- A collector which observes the actual immutable Docker config/platform and
  fixed bounded embedded-source file, without network or writable filesystem.
  Unique probe ownership is verified before failed/cancelled probe removal by
  immutable ID; foreign ownership or cleanup uncertainty cannot produce proof.
- A CI hook replacing the previous inline image-source assertion, executed from
  the verified captured test application for its installed parser dependencies.
  A distinct image artifact publishes after the existing smoke/protection checks.
- Pure/injected regression tests and five additional common Meteor parity cases.
  CI numeric IDs reject trailing line terminators rather than partial matches.

The local Phase 0 suite is **119 passed / 1 hosted-only skip** (120 total),
including ten new image-observer groups and the CI-reference regression. Capture
checks remain **94 passed / 4 hosted-only skips**. Full application typecheck,
lint, source-security **41/41**, diff checks and YAML/dependency/publication-order
validation passed locally, separately from the passing helper CI. The
new workflow hook and five Meteor parity cases have not executed in CI. No real
image probe/build, image artifact publication, registry push or live deployment
was performed for this continuation. No workstation release record changed.

No new architecture choice was needed: the plan already separates CI smoke
observations from actual workstation build/registry/running-image proof. The next
required gate is fresh CI authorization for the changed workflow/shared contract
before publishing this later draft. Do not reuse the helper's consumed permission
or relabel its passing CI as verification of later edits. Catalog closure,
production image linkage, protected receipts/recovery and Phase 0 remain open.
This outcome-only status update is published with CI skipped; the image-proof
code and workflow draft remain local and uncommitted. Recording results must not
consume an unauthorized second Meteor execution.

## Helper publication — one fresh execution authorized (2026-11-02)

Phil explicitly authorized committing/pushing the reviewed acquisition helper
and one fresh Meteor integration invocation, followed by continued Phase 0 work
until the next design decision. The prior local/live-read results below remain
a separate checkpoint. The exact pushed commit and hosted result will be
recorded after execution; this authorization includes no automatic Meteor retry
and no live deployment.

## Approved GitHub CLI acquisition — implemented locally (2026-11-02)

Phil approved GitHub CLI and his existing stored sign-in as a prerequisite for
the optional helper. This closes the dependency decision below. The local
`deploy/collect-ci-evidence.ps1` now owns explicit read-only acquisition of the
selected CI and Security runs. Node composes bounded, sanitized source-evidence
references; PowerShell/.NET owns streaming ZIP validation. No new token, access
permission, runtime installation, active application surface or release authority
was introduced. Public helper/development guidance, AGENTS.md and the controlling
plan record the narrow dependency exception.

The helper validates exact commit/repository/workflow/attempt and successful job
membership, ZIP size/digest/entry types and CRC, strict JSON including duplicate
keys, caller-supplied expected producer observation and independent module-name
inventory, then re-observes remote metadata before exclusive publication. It
retains the validated ZIP/three payloads with a read-only, content-addressed small
record. Existing identical evidence may be referenced after byte verification;
collisions and changes are never overwritten. No automatic pruning occurs.
Raw API/CLI output and sign-in credentials are never retained.

Live GET-only acceptance against the previously completed CI `41511591350` and
Security `41511591390` passed using stored CLI sign-in, pinned Node **24.22.1**
from the existing Meteor tool bundle (the Meteor CLI was not run), and installed
PowerShell **7.6.5/.NET 10.0.11**. It produced acquisition record SHA-256
`c616f27348aaa138e2687cd4599bd34c928f1916b256c6721a096aeede8d85cd`,
state `acquired-unqualified`, preserving the exact `5557ae4b` identity and recorded
server/browser results. The demo used the previously retained expected observation;
it does not prove the current working tree matches that earlier candidate or an
independently captured release candidate. Local demo files remain ignored in tmp.

Verification: **21 new Node checks** pass on pinned Linux; Windows process/file
flows were also exercised with the pinned Node binary. Full Phase 0
suite **108 passed / 1 hosted-only skip**; capture **94 passed / 4 hosted-only
skips**; source-security **41/41**; full application typecheck and lint pass.
Native PowerShell ZIP tests **16/16**, including a forged central-directory length
which the standard reader initially accepted without explicit CRC verification.
All three PowerShell scripts parse. Initial test-fixture wiring and an unused
argument warning were corrected; final checks pass. The CRC concern did not
require a new runtime decision: Microsoft's .NET Core 3.1 source already exposes
the public checksum property, so the existing PowerShell 7 capability gate is
sufficient. No custom ZIP parser or archive dependency was added.
Final review also aligned the Linux output-directory owner/nonshared-write check
with the existing release-record store; its adversarial mode-0777 regression passes.
Cancellation now waits for child close before temporary cleanup, preventing a
Windows file-handle race. A delayed-termination child fixture proves the ordering.

No commit, push, Meteor invocation, new workflow execution, image build or
deployment occurred for this working batch. Existing staging/Mongo/SPARC and
wiki changes remain preserved. The authoritative release record and production
command sheet are unchanged; Windows ACL/cloud durability, required-test catalog
closure and independent image/release proof remain unproven.

Next: publish/verify this helper, then retain structured external post-build image
proof and link bounded source/image references into the existing optional release
extension. Those owners are already selected; no further architecture choice was
established here. The previous Meteor allowance is exhausted, so a push that
starts CI needs a fresh explicit execution authorization before publication.
This is the next operational gate; do not reopen the accepted GitHub CLI choice
or weaken qualification to avoid it.

## Evidence publication and next acquisition boundary (2026-11-02)

The structured-evidence batch is committed/pushed as
`5557ae4b6dd23bc4e874478c987325621e9bd987`; its wiki update is `d02ed42`.
[CI 41511591350](https://github.com/memphis-iis/MoFaCTS/actions/runs/41511591350)
is the third and final attempt in the renewed three-attempt allowance.
The entire CI job passed, including Meteor, evidence validation/publication,
canonical Compose construction, source/image/runtime smoke and cleanup. All four jobs in exact-commit
[Security 41511591390](https://github.com/memphis-iis/MoFaCTS/actions/runs/41511591390)
passed. No further Meteor retry is authorized by that exhausted allowance.
The pre-commit manifest, lint-staged and staged-secret checks passed. Only the
intentional batch was published; unrelated app/configuration/wiki edits remain.

Final hosted results: harness **26/26**, Phase 0 **88/88**, capture **98/98**,
with zero hosted skips; lint, full application/vendor typechecks and the other
required workflow checks passed. Exactly one Meteor invocation and one canonical
Compose application compilation ran in this attempt. The built/tested Linux
amd64 image **config** ID is
`sha256:c114758fe210923e4eb71cd1c07cc07baa8bef7065c381b2db072f80cda65a14`.
The embedded source identity, pinned Node/Undici and runtime-tool removal,
standalone-Mongo rejection and replica-set readiness checks passed against that
config ID. Retained-source protection held through image checks; cleanup passed.
This is not a registry manifest/index digest, registry publication, deployment,
staging2 acceptance or a completed Phase 0 qualification. No live host changed.

The authenticated artifact inspection is complete: artifact `13173322371`
(`source-observation-41511591350-1`) contains exactly the source observation,
bounded raw Meteor run and joined evidence record. Its downloaded ZIP SHA-256
matches GitHub's artifact metadata:
`31416e7cacedd8d919a2549aef3404a7022d5c9424830ec275a6815fdf5e615e`.
Independent local revalidation reproduced the joined record from its raw bytes
and source observation. Source SHA-256 is
`fbd7265f2a050032c23f35b7e762cf0188c780b294bbc1b1c176d78d0f9fd4f0`.
Run `41511591350`, attempt `1`, clean source and the exact commit agree.
Server: **151 modules, 966 passed / 15 pending**. Browser: **213 modules,
1,237 passed / 7 pending**. Zero test or hook failures. The state correctly stays
`completed-with-pending`, qualification `unqualified`. This is verified outcome
provenance, not required-catalog closure or an authenticated release qualification.
The existing 22 pending cases belong to the separately gated Change Streams
qualification lane; this run does not establish those protocol/recovery cases.

The next durable workstation acquisition helper must authenticate its GitHub
artifact download. Using the existing GitHub CLI login for today's operational
inspection is permitted; making `gh` a permanent prerequisite for the optional
qualification helper is a new system dependency. AGENTS.md requires approval,
and the approved helper design currently says not to add a dependency. Native
REST would instead need an explicitly selected credential source; no new token
or storage mechanism has been selected. Recommendation: narrowly approve the
existing GitHub CLI sign-in as the optional helper's prerequisite, with no new
GitHub permissions, tokens or application integration. No helper implementation
or dependency change has been made at this boundary. Existing workstation
release-record authority, protected host channel and unsigned/unqualified
evidence scope remain selected; they are not reopened by this question.

Work stops at that dependency/credential-source decision after completing the
authorized CI review. This outcome-only documentation is committed with CI
skipped so recording it does not launch an unauthorized fourth attempt. The
tested code candidate remains the exact commit above; a later documentation
commit is not relabeled as independently integration-tested.

## Structured Meteor test evidence — local implementation (2026-11-02)

The approved next slice is implemented locally. A test-entry-only Mocha reporter
records each environment's discovered modules, hashed registered test IDs,
passed/failed/pending outcomes and hook failures. The CI wrapper independently
inventories the reviewed server/common/standalone/client discovery scopes,
requires both environment reports, and rejects duplicate/malformed reports,
filters, missing outcomes, failed hooks disguised as success and incomplete
execution. Existing pending tests remain pending. It waits for child stdout to
close before validating/writing a fresh bounded outcome file outside source.

After existing source verification, CI binds those outcomes to the clean source
identity, test-input contract and supplemental digests, and GitHub repository,
commit/run/attempt. The existing 14-day source-observation artifact gains the raw
bounded run and joined record. No titles, assertion payloads, fixture values or
new application endpoint are introduced in those records. Browser worker startup
and premature-exit failures now complete as failure rather than waiting for the
wrapper timeout. Public development/capture and package-maintenance guidance and
the canonical wiki developer guide describe the contract.

Local verification on the canonical Linux watcher container:

- Harness **26/26**, including negative reporter/discovery/result/source-binding
  cases, real synthetic browser-worker processes and a synthetic executable
  exercising the actual wrapper's stdout, evidence and manifest-cleanup path.
- Full application typecheck and lint passed; source-security **41/41**.
- Phase 0 **87 passed / 1 hosted-only skip**; capture **94 passed / 4 hosted-only
  skips**. These local checks do not replace native hosted CI fixtures.
- Small synthetic tests exercised the reporter constructor/completion/event
  interfaces of the exact cached Mocha 10.2.0 server and browser implementations.
  They did not start Meteor or a browser and are not Meteor integration evidence.
- CI YAML parses and the diff has no whitespace errors. Unrelated staging/SPARC,
  Mongo initialization, and companion-wiki edits are preserved.
- Final review restricted evidence setup/enforcement to the explicitly selected
  reporter. Interactive tests retain their ordinary focus/delay/dry-run policy;
  the added regression passes. The stopped canonical localhost watcher was
  restored through `hotfix-local.ps1`; its readiness checks passed before the
  final harness/typecheck/lint verification.

This working batch has not been committed, pushed, run through Meteor CI, built,
published or deployed. The prior renewed authorization still has one unused
attempt; this turn did not consume it. The last passing CI baseline above is
unchanged. The new records explicitly remain **unqualified**: authentication,
an independently reviewed required-test catalog (including allowed pending
cases), independent Security-workflow evidence joining, and protected final
release/image proof are subsequent gates. Runtime-registered test IDs alone do
not prove that the required security cases are complete. Phase 0 remains open.

Publication is now explicitly authorized for this batch, followed by the one
remaining CI attempt and continued audit work until a design decision. The
local-only results above remain a separate checkpoint; the exact pushed commit,
hosted outcomes and artifact review must be recorded after execution. No live
deployment is authorized by this publication step.

## Renewed authorization — successful second attempt (2026-11-02)

The preparation blocker is repaired and verified on the supported GitHub runner.
Commit `936a64aa3939fda466e4dc5091f8d29719b729cc` passed
[CI 41465187050](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187050)
and all four jobs in [Security 41465187121](https://github.com/memphis-iis/MoFaCTS/actions/runs/41465187121).
This uses **2 of the 3** renewed authorizations. One Meteor integration invocation
and one canonical Compose application compilation ran in this successful attempt.
The third authorization was not used; work stopped on success. Earlier failed
checkpoints below remain historical evidence, not the current outcome.

Exact executed outcomes:

- Meteor server **966 passing / 15 pending**, browser **1,237 passing / 7 pending**,
  harness **17/17**; zero failures. The pending counts match the recorded baseline.
- Phase 0 contracts **88/88**, capture/private/shared-parent protection **98/98**,
  with zero skips on Linux. The native protected-receipt shell/permission fixtures
  and real shared-parent regression executed successfully.
- Dependency installation/synchronization, lint, full application and vendor
  typechecks, source verification before/after tests, and retained-protection
  assertions passed.
- The same protected candidate was built once through canonical Compose with
  its capture override. Embedded source identity, runtime ABI/Node/Undici,
  removal of npm/npx, standalone-Mongo rejection, replica-set startup/health and
  exact-image smoke passed. The protected source stayed intact through image
  checks. Profile/container/network/unseal/workspace cleanup and action cleanup
  passed.

Recorded identities (integrity coordinates, not authentication attestations):

- Source snapshot SHA-256: `e82ff98816b8acae09a764bfb6c741b74b23b70a960111b5a87eccd7c8483e50`.
- Built/tested Linux amd64 image **config** digest: `sha256:22557a736a7350405c36967c6b73017df7885a733e5ad5313b4f3fc2c4bd3c50`.
- Base commit is the exact clean checkout above; dirty provenance is false.
  This is not a registry manifest/index digest or a published/running-server claim.

The confirmed mechanism was inherited shared propagation creating a hidden peer
when binding the test child. Making each newly owned parent private before child
creation contained it without altering host-parent propagation or weakening any
gate. The old failure was reproduced locally before the fix, and the fixed path
passed modern/classic native APIs and the actual CI regression.

All implementation changes are committed/pushed; unrelated staging/SPARC edits
remain preserved. This outcome-only documentation is committed with CI skipped,
so no third attempt is launched merely to record results. No image was published
to a registry or deployed; no protected host receipt was installed. Complete
authenticated test/catalog evidence, published/running release-proof joining,
live host acceptance and remaining Phase 0 redesign gates are still open. This
success closes the CI preparation blocker, not Phase 0 or full release qualification.

## Renewed authorization — attempt 1 and reproduced cause (2026-11-02)

Commit `cffb3c2a3d5a32c475eca1377f56be5ea81b812f` published the per-operation
observations. [CI 41463643345](https://github.com/memphis-iis/MoFaCTS/actions/runs/41463643345)
stopped before Meteor; the trace shows binding the test child creates two
distinct records with the same backing root. The visible record is a child of
the captured parent; the hidden peer is outside it. This consumes the first of
the renewed three attempts; two remain.

The exact trace/failure was reproduced locally by making the disposable
container's synthetic temporary parent a shared mount. It failed under both
modern and classic APIs before the repair. Making only the helper-owned checkout
and capture bind mounts private before creating descendants makes both native
reproductions pass with strict three-mount validation, actual source write/chmod
denial, writable test output and cleanup. Host parent propagation is not changed.
This establishes shared propagation as the cause of the reproduced extra peer;
the repaired hosted CI execution is still pending.

The repair also validates private propagation, updates the command model to
require isolation before child creation, and adds a real shared-parent Linux CI
fixture. That fixture isolates its own synthetic parent bind before making that
parent shared; it never changes propagation on the host's original temporary
mount. No new package or executable dependency is introduced.
Local capture now passes **94/98 with 4 CI-only skips**; full lint passes
(323 surfaces). One new parser fixture initially omitted its options column;
the fixture was corrected and the suite passed without weakening the parser.
Both actual shared-parent native reproductions pass after the repair.
[Security 41463643187](https://github.com/memphis-iis/MoFaCTS/actions/runs/41463643187)
passed all four jobs for the first renewed attempt.

## Renewed three-attempt authorization (2026-11-02)

The user explicitly authorized another three CI attempts after the previous
three-attempt group below was exhausted. These include scoped diagnostic/fix
commits, Meteor and Compose construction if reached, with no deployment. Count
this renewed group independently; stop on success, a design decision or attempt 3.

The first renewed candidate records bounded mount snapshots after each setup
operation: fixed roles, ordinal parent/backing relationships, read/write flags
and the visible mount selected by an opened directory's `mnt_id`. It omits raw
paths, roots, devices, kernel IDs and file contents. Snapshot data is retained
only internally and emitted on failure; native protection validation is unchanged.
Mock tests explicitly inject visibility observation; Linux production observes
the real kernel. Local capture **94 passed / 3 CI-only skipped** (97 total),
including parent/hidden/visible mapping and diagnostic-redaction coverage.

## Final outcome of the three authorized attempts (2026-11-02)

All three authorized attempts have been executed. None reached Meteor or image
construction. All three passed their separate Security workflow; none passed
the combined CI preparation gate. No additional retry is authorized or scheduled.

| Attempt | Published source | CI | Security |
| --- | --- | --- | --- |
| 1 | `ef8875764bb473ee7925fb48b1a9235e642339aa` | [41456899578](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899578): failed source protection | [41456899480](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899480): passed |
| 2 | `c0ca87e0b47f85927a460600ecb6751a2cbf9453` | [41458037001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037001): failed source protection | [41458037098](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037098): passed |
| 3 | `0cdfd81fa38c8984538f6c1606cdaa506bb7c65c` | [41459078479](https://github.com/memphis-iis/MoFaCTS/actions/runs/41459078479): failed source protection | [41459078330](https://github.com/memphis-iis/MoFaCTS/actions/runs/41459078330): passed |

The confirmed runner observation is `duplicate-test-derivative`; attempts 2/3
also distinguish `different-kernel-id`. Source capture and cleanup succeeded.
Explicit remount operands and writable-child-before-parent protection did not
resolve that runner observation. The published changes are not a confirmed
repair. The strict mount and write-protection gates remain enforced.

Local checks of the final candidate pass: full lint (323 surfaces), capture
**93 passed / 3 CI-only skipped** (96 total), and actual kernel protection,
writable test output and cleanup under both modern and forced classic mount(2)
APIs in a disposable network-isolated container. These checks do not reproduce
the hosted runner layout or establish CI acceptance. No application image was
built/pushed/deployed, and no Meteor integration invocation ran in these attempts.
Unrelated working changes were preserved.

Next investigation should collect bounded role/permission/mount-parent relations
after each privileged operation on the supported CI runner and establish exactly
which operation creates or reveals the second derivative record. Do not ignore
the record, relax validation, or try another command variation without that
evidence. A further CI execution needs new user authorization. This final outcome
is published as documentation only with CI skipped to avoid starting attempt 4;
the failed code candidate remains explicitly identified above. Phase 0 and batch
3 release qualification are still incomplete.

## Three-attempt authorization — attempt 2 and final candidate (2026-11-02)

Commit `c0ca87e0b47f85927a460600ecb6751a2cbf9453` was pushed. [CI 41458037001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037001)
again rejected `duplicate-test-derivative`, with `different-kernel-id` confirming
two distinct mount records. Explicit remount operands alone did not resolve it.
[Security 41458037098](https://github.com/memphis-iis/MoFaCTS/actions/runs/41458037098)
passed. This consumes attempt 2 of 3. No Meteor invocation/build/deployment ran.

The final candidate creates the writable test child while the capture parent is
still writable, then makes the parent read-only. It removes the child rw-remount
operation entirely. The same strict three-mount topology and write/chmod denial
checks remain; no duplicate is ignored or accepted. Setup completes before any
dependency/test code runs. The command model now rejects binding the child from
an already-read-only parent, and failed-parent-protection cleanup is covered.

Both old and new setup passed in the disposable local Linux fixture using the
modern and explicitly forced classic mount(2) APIs. Thus those local tests
establish final protection/writable-child/cleanup behavior, not reproduction of
the hosted runner's extra layer. Only the authorized final CI attempt can verify
this candidate on that runner. One authorized attempt remains before publishing
this candidate; no fourth attempt is permitted without further instruction.

## Three-attempt authorization — attempt 1 (2026-11-02)

Commit `ef8875764bb473ee7925fb48b1a9235e642339aa` published the refined layout
diagnostics. [CI 41456899578](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899578)
failed before Meteor with `duplicate-test-derivative`; [Security 41456899480](https://github.com/memphis-iis/MoFaCTS/actions/runs/41456899480)
passed all jobs. This consumes the first of the user's three explicitly
authorized attempts. Two remain; no Meteor invocation or image build ran.

The next candidate supplies both source and destination to each bind remount,
following the classic util-linux interface without ambient target-only lookup.
The privileged-command regression now enforces those exact operands. Local
capture checks and actual kernel protection/writable-derivative/unseal in the
disposable isolated Linux fixture pass. CI compatibility of this change is
unverified until attempt 2. Duplicate diagnostics additionally distinguish same
versus different kernel mount IDs using fixed labels, never emitting IDs/paths.

## Diagnostic execution checkpoint — `f66aac03` (2026-11-02)

The user authorized the diagnostic publication and fresh combined attempt.
Commit `f66aac03bb919a59d9fca67aeb671483762c5dea` was pushed. Both pre-commit
checks and [Security run 41452105014](https://github.com/memphis-iis/MoFaCTS/actions/runs/41452105014)
passed. [CI run 41452104938](https://github.com/memphis-iis/MoFaCTS/actions/runs/41452104938)
again stopped before Meteor/build, now with `stage=mount-topology`. All mount
setup commands returned successfully; kernel mount-layout validation rejected
the resulting state. No exact missing/duplicate/flag cause is established yet.
Cleanup succeeded. No Meteor invocation, app compilation or deployment ran.

An isolated local Linux reproduction used the existing pinned development image
in a disposable container with network disabled, read-only source-module mounts,
no Docker socket/credentials, and a temporary native filesystem. SYS_ADMIN was
limited to that container's mount namespace for the synthetic fixture. The same
bind/remount sequence, kernel checks, native write/chmod denial and unseal passed
using direct root mount commands. It did not reproduce the hosted runner state
or establish the runner's sudo/mount behavior. The container was removed.
The disposable image reports Ubuntu 26.04/util-linux 2.41.3; the CI runner
reports Ubuntu 22.04. This difference is not itself a confirmed cause.

A further local diagnostic refinement distinguishes only fixed missing,
duplicate, unexpected or incorrect-mode roles without exposing paths/mount
inventories. Capture tests pass **93/96, 3 CI-only skips**. The protection policy
is unchanged. This refinement and checkpoint have not been committed or rerun;
Full lint and diff checks pass. The user subsequently explicitly authorized
three further CI attempts, including narrow diagnostic/fix commits, Meteor and
the Compose build if reached, with no deployment. Count these separately and
stop on success, a new design decision or exhaustion of those three attempts.

## Published execution checkpoint — `ca49f3a7` (2026-11-02)

The user explicitly authorized committing/pushing this audit batch and one
combined CI execution, including a fresh Meteor invocation and Compose image
build. Commit `ca49f3a7e8b5320bfd0c028389395f8b058fdac4` was pushed to `main`.
Pre-commit manifest, staged lint and secret checks passed. The reviewed audit
decision documents were included; unrelated staging and SPARC working changes
were preserved outside the commit.

[Security run 41447040939](https://github.com/memphis-iis/MoFaCTS/actions/runs/41447040939)
passed all four jobs: secret scan, application dependency gate, Mongo sidecar
dependency gate and source/scanner contracts. This does not mean no dependency
alerts exist or that deferred development advisories were repaired.

[CI run 41447041117](https://github.com/memphis-iis/MoFaCTS/actions/runs/41447041117)
failed in **Protect retained source and capture receipts**, immediately after
successful build/test-input capture. Meteor installation, integration tests,
native protection/host receipt fixtures, Compose construction and image smoke
were skipped. Release-protection cleanup reported seal absent; owned workspace
cleanup succeeded. No image was built or deployed. This is a failed acceptance
gate, not a successful integration run or permission to bypass protection.

The helper emitted only a generic sanitized failure, so the exact failing
operation/native cause is not established by retained logs. A local diagnostic
correction now reports only registered stage names, allowlisted errno/native
exit categories and fixed native-error classifications. It never emits raw
stderr, arguments, paths or supplied exception text. Local capture tests pass
**92/95 with 3 CI-only skips**; its added redaction/CLI regressions pass.
The user subsequently authorized publishing this diagnostic correction and one
fresh combined CI attempt. The protection remains enforced; no failure is waived.
The outcome of that next execution must be recorded separately.
All further Meteor invocations retain the fresh single-use authorization rule,
even though this failed attempt did not reach Meteor itself.

## Current execution entry point (2026-11-02)

Every AI worker must first read and follow [AGENTS.md](../AGENTS.md) and any applicable deeper AGENTS.md instructions, then the plan's [controlling decision register](security-audit-durable-redesign-plan.md#0-controlling-decisions-and-worker-entry-point-2026-11-02), this current status and the [Phase 0 contracts](security-audit-phase0-contracts.md). The dated checkpoints below remain evidence of what ran at those times; their older pending-design/permission statements do not override Phil's later explicit decisions.

Settled: workstation release authority and protected credential-free server projection; retain all small accepted release metadata without automatic pruning and the previous usable rollback image/evidence; no old-format report UI/download/archive work; simplest storage with proven safe application rollback; staging2 offline/reset/rebuild permission for this security work; conditional immutable scanner selection; consolidated ambiguous/proposed policy review by Phil; routine engineering discretion within approved boundaries. Existing records are not authorized for deletion. These are design decisions and bounded standing permission, not implementation or qualification claims.

**Secret recovery design selected; setup/recovery verification pending (2026-11-02).** Phil approved AWS Secrets Manager and is the accountable recovery owner. Use one encrypted secret for complete current fixture/provider configuration and a dedicated-labeled retained last accepted rollback version; `AWSPREVIOUS` alone is insufficient. GitHub secrets remain deployment copies. Follow the plan's [controlling recovery decision and gates](security-audit-durable-redesign-plan.md#aws-secrets-manager-recovery-design-approved-2026-11-02): verify account suitability, independent account/MFA recovery, document-size fit and staging2 restoration of both versions. Provisioning, permissions, upload, spending approval and required setup remain pending; no secret/access change or successful recovery is claimed. Do not reopen the selected design; continue independent work while concrete operational gates are prepared.

Batch 2's protected-source/Compose path passed exact-commit CI at `936a64aa` as recorded above. Batch 3's receipt/history tooling and hosted Linux synthetic fixtures passed; live installation, complete acquisition/proof joining and qualification remain pending. Preserve the active thread's concurrent edits and read the latest batch evidence before continuing. Only the previously authorized three-batch implementation scope is recorded here; later-phase implementation/activation requires its own scope and gates.

Each `npm run test:ci` invocation, including retries, still requires fresh, explicit, single-use authorization. Apply the standing staging2 offline/reset/rebuild permission only within its security-work scope; original staging/production, irreversible deletion, new persistent access/security-sensitive permissions and spending are excluded. Commit/push, workflow actions, protected-host installation and other operational restrictions remain as specified by AGENTS.md and plan Section 0. Failed acceptance is reported, never waived. This decision-record update ran no code/tests/build/deploy/host operation and grants no new execution permission.

## Earlier reconciliation and canonical Compose implementation checkpoints

The committed baseline has successful [CI run 41244691248](https://github.com/memphis-iis/MoFaCTS/actions/runs/41244691248)
and [Security run 41244691001](https://github.com/memphis-iis/MoFaCTS/actions/runs/41244691001).
CI's server tests passed **966**, with 15 pending; browser tests passed **1,237**,
with 7 pending; harness tests passed **17**. Post-test source verification,
embedded image-source identity, Docker smoke and cleanup passed. The toolchain
is now Meteor **3.5.4**, Node **24.22.1**, npm **11.19.1**. The dated checkpoints
below are historical; statements that source acquisition or image-side comparison
have never run are superseded by these linked executions. A green production
audit workflow proves scanner execution, not absence of report findings.

### Batch 1 initial implementation checkpoint — superseded by the successful run above

Batch 1 first changed the existing `docker-amd64-smoke` job to build its one app image with the
canonical base `deploy/docker-compose.yml`, `build --no-cache mofacts`, and the
post-test source identity. No image/service definition or private production
command is changed. The prior direct `docker build` invocation is removed.
The existing source/runtime/topology/health checks now consume the built image's
immutable config digest, not a tag that could be replaced between checks.

`ciComposeProfile.mjs` owns a temporary build-only interpolation profile outside
the checkout. It uses existing CI settings and fresh synthetic database/Redis
credentials plus a generated replica-set keyfile; no protected environment or
settings are read. Its role is to satisfy the canonical Compose model during
config/build, not start the Compose stack. Profile state is distinct from the
source capture and is never uploaded. Always-run cleanup validates its marker
and exact temporary parent and unlinks only the fixed owned files. No new
application, Meteor, Docker or system dependency is introduced.

Verification in the already-running Linux development container, using the
pinned toolchain: full typecheck and lint pass (323 syntactic surfaces);
Phase 0 **72/72**, source-security **41/41**, capture/profile **84 passed,
0 failed, 1 Linux-CI-only skip** (85 total). An initial Windows Phase 0 check
failed its unchanged version assertion under host Node 24.15.0; the same suite
passes under the existing pinned Linux Node 24.22.1 without relaxing the test.
Actual Compose `config --format json` resolution with the generated synthetic
profile also preserved canonical context, recipe, image and identity arguments;
its temporary files were removed. Workflow/YAML/shell and diff checks pass.
These local checks include the preserved unrelated working changes and are not
CI evidence for a new committed candidate.

No new Meteor integration, Docker build, push, deployment or protected-host
operation ran for this batch. End-to-end execution of the revised CI job remains
pending fresh authorization. Ordinary production builds remain available without
qualification metadata. Existing `source-matched-unqualified` observations are
not relabeled release PASS. Stronger pre-test sealing, complete/authenticated
evidence, protected release/host ownership and rollback/history compatibility
remain open Phase 0 requirements.

## Active three-batch plan

The user authorized continuing through these three implementation batches. Apply the plan Section 0 decisions and routine engineering discretion; stop for a new unavoidable design conflict or at completion, not for an already settled choice. This does not expand implementation to later phases. No commit/push, fresh Meteor integration invocation, production action or other excluded operation is implied. The separate bounded staging2 permission remains as recorded above.

1. **Canonical Compose CI construction — implemented and CI verified at `936a64aa`.** Replace
   the direct build with canonical Compose and check its exact image config ID.
2. **Retained, protected source — implemented and verified in CI at `936a64aa`.** The user approved combining tests
   and construction in one job. Retain the original captured candidate and
   receipts read-only, keep test outputs in a writable derivative, build through
   the existing capture override, and release mounts before owned cleanup.
   Write rejection, shared-parent isolation, lifecycle failures, workflow wiring
   and exact-image checks passed in the successful execution recorded above.
3. **Release evidence binding — compatibility and approved storage implemented; execution/proof joining pending.**
   Traced the current writer and corrected the draft reader for its eight fields
   while retaining historical six-field support. Join tested/built/published/running
   identities only where evidence is actually acquired. The user approved the
   protected host projection and accepted-record history described below. Source
   matching alone remains unqualified; normal startup behavior is unchanged.

## Batch 2 decision — approved: combine testing and construction

Continued source tracing reached a design decision before changing sealing code.
The current test job cleans its owned capture before finishing; the dependent
image job runs on another hosted worker and performs a fresh checkout. The
embedded digest comparison verifies matching content but does not implement
the approved requirement to retain one sealed candidate for construction.
Changing file permissions alone would also not supply the promised stronger
seal against ordinary same-user writes or a change-and-change-back race.

Recommended direction: combine source verification and image construction in
one CI job, retain a protected read-only candidate separate from writable test
outputs, and supply its context through the existing capture Compose override.
This needs no source-snapshot upload, additional storage service or credentials.
The tradeoff is that an image-build failure normally requires rerunning the
combined job, including the separately authorized Meteor invocation.

Alternative: retain the two-job split and transfer a protected sealed snapshot.
That preserves build-only retries but requires a storage/access/retention
decision; do not upload raw captures as public artifacts or infer authority
from a checksum alone. No storage backend or privilege grant was selected.
The user approved the recommended combined-job approach after discussion of
the retry tradeoff. Implementation has resumed; batch 3 follows after its local
checks unless another design decision is encountered. All observations remain
explicitly unqualified until the separate evidence requirements are met.

### Batch 2 implementation and local verification

One `lint-test-and-image` job now owns capture, protection, the existing test
sequence, canonical Compose construction and exact-image smoke. The checkout
and retained capture/receipts have read-only Linux bind mounts; only the separate
test derivative is writable. Kernel mount observations and real write/chmod
probes are required. Source bytes/modes are preserved. Unknown/nested mounts,
stale receipts and replaced ownership fail explicitly. Partial setup rolls back
its own mounts; an interrupted teardown leaves its receipt for always-run unseal.
Workspace cleanup refuses an outstanding seal before deleting test outputs.
Fresh verification exports use owned temporary siblings outside the protected
capture. The build uses the existing capture override and source-bound Compose
comparison, not a new checkout/context. No extra compilation or Meteor invocation
is added. There is no protection claim against privileged runner compromise.

Final local checks in the existing pinned Linux container: full typecheck and
lint pass (323 surfaces); Phase 0 **74/74**; source-security **41/41**;
capture/profile/seal **91 passed, 0 failed, 3 Linux-CI-only skips** (94 total).
Those three require the hosted CI lane: actual Docker filtering, actual kernel
write/chmod/unlink/replacement denial, and verification while the capture is
read-only. They were added/wired but have not executed here. The mocked lifecycle
tests exercise failed remount, failed probes, interrupted teardown, foreign
mount refusal, missing protection and cleanup ordering. Workflow YAML/shell,
single-suite/build ordering and diff checks pass. Read-only GitHub queries found
no branch protection or branch rules requiring the removed job name.

No fresh Meteor integration, Docker build, push, deployment, privileged local
mount operation or protected-host change ran. Revised CI acceptance remains
pending fresh single-use Meteor authorization and separately requested execution.
All unrelated working-tree changes are preserved. This contributor workflow and
draft reader change affects no UI, learner data, TDF/config schema, localization
or account permissions; public deployment/capture guidance is updated, and no
user-facing wiki change is needed.

### Batch 3 findings and approved storage arrangement

The current canonical config procedure is `deploy production.txt`. It writes
the original six fields plus `imageId` and the fixed operator acceptance note.
The draft reader's exact six-field contract rejected that current record.
It now accepts either historical six fields or the current paired additions,
preserves their values and the PowerShell timestamp, rejects partial/unknown
fields, and checks `imageId` against qualification's running config when proof
is supplied. An operator note alone remains `proof-unavailable`. Regression
fixtures cover both shapes and image disagreement. No stored record, command
sheet or production process was rewritten. Source searches found the existing
command-sheet writer and draft parser/tests; external readers remain unverified.

Tracing also confirmed that the existing host forced-command reader emits host
observations but does not install/read release receipts. The production procedure
replaces its latest workstation record and has no immutable accepted-history
owner. Those were unresolved at source tracing; the controlling 2026-11-02 answers now settle workstation authority, restricted projection and metadata/rollback retention. Implementation still must validate protected destination/reader ownership and access controls. Fabricating published/running proof from CI's
local smoke image would be incorrect; complete/authenticated test evidence also
remains open.

**Approved by the user:** retain the existing workstation record as
the sole authority; preserve each previous accepted record in an immutable
sibling history directory under that same operator-owned location before atomic
latest-record replacement (retain all small metadata records initially; no
automatic pruning). Give the server only a bounded, credential-free projection,
root-owned mode 0600 at `/etc/mofacts/release-receipt.json`, read through the
existing forced-command audit channel. This creates no new service or credentials
and copies no learner data. Installation/replacement must have explicit owning
tooling and collision/interruption/read-back tests. Apply the bounded staging2 lifecycle permission while retaining fresh integration, protected-host installation and production-action approvals as applicable. Do not reopen settled authority/channel/retention choices, and leave production unchanged until its own authorization. No new config key is needed. This decision
is implemented in the opt-in tooling below; it is not a live installation.

### Batch 3 storage implementation

`releaseRecordStore.mjs` reuses the existing parser/identity consistency checks.
It keeps exact previous record bytes in `<record>.history/<sha256>.json`, archives
the new record before publication, and atomically replaces latest with file
sync/read-back (and directory sync on Linux). History is exclusive and read-only;
no update/prune path exists. It uses a visible exclusive lock, rejects links,
multi-link input, unsafe Linux owner boundaries, oversized/invalid records and
inconsistent supplied qualification. An ordinary unqualified record remains
supported. Windows native filesystem checks pass; cloud synchronization and
directory-fsync equivalence are not claimed. The record owner can still change
permissions; this is append-only tooling, not owner-compromise protection.

`releaseReceipt.mjs` owns one standalone, bounded wire parser, reused by the
workstation projection and host-side Node execution. The projection contains
only known image/revision/deployment identifiers and the exact record-byte hash.
It never infers a missing `imageId` or forwards the acceptance note, qualification
tuple, command output, learner data or credentials. `MATCH`/`MISMATCH` means only
config/revision consistency; missing/malformed evidence remains unavailable.

`deploy/security-audit/release-receipt.sh` provides owner-only install and
observation-only read. It validates root ownership, modes, ancestor directories,
single-link files, input bounds and the existing protected container selection.
It pins the inspected running container ID, checks image/revision independently,
executes the protected parser using the app's existing Node, and rejects name
replacement during observation. Installation syncs a root-only same-directory
temporary file, atomically replaces `/etc/mofacts/release-receipt.json` and reads
it back. It uses existing Linux/coreutils, Docker and jq; no package is installed.
The existing forced-command script now exposes the bounded `releaseReceipt`
observation when this trusted tooling is installed. It keeps its no-argument
boundary, original V1 controls and application access behavior.

Recovery is explicit and documented: a killed writer's lock is never taken over
automatically; its owner verifies the process stopped, checks latest/history,
and removes only that writer's identified temporary state. Both archives exist
before latest replacement; post-replace read-back failure can leave a complete
new latest and is not called rollback. This does not create a cross-host
transaction or automatic application rollback. See the public
[release-record procedure](../deploy/security-audit/release-records.md).

No production command-sheet hook, actual release-record write, host transfer,
installation, deployment, Docker build, Meteor integration, commit or push ran.
The current V1 assembler does not consume/retain the new optional host receipt
field yet. Authenticated complete test evidence, inspected OCI publication/config
mapping, final candidate proof joining and historical scanner/runtime compatibility
remain open gates; this storage work does not close batch 3's full qualification
integration or Phase 0. CI/runtime acceptance must precede production hook adoption.

Final local verification of this storage slice: full typecheck and lint pass
(323 surfaces); Linux Phase 0 **87 passed, 0 failed, 1 hosted-Linux-only skip**
(88 total); source-security **41/41**; capture **91 passed, 0 failed, 3 CI-only
skips** (94 total). Native Windows store/parser suite **10 passed, 0 failed,
3 Linux-only skips** (13 total). Its initial file-symlink fixture failed with
Windows EPERM because that operation requires privileges unavailable here; it
was separated into an explicit Linux test so hard-link, junction, size and UTF-8
checks continue to run on Windows without granting privileges or weakening the
storage rejection policy. Actual Linux process-death/lock recovery passed.
Host shell syntax, one-suite CI wiring and diff checks pass.

The skipped host fixture requires the existing hosted runner's jq and sudo; jq
is absent from the local development container, and nothing was installed to
substitute for it. The fixture exercises the actual shell/parser and root-owned
temporary files against synthetic Docker observations, including refused
mismatch/unsafe links/modes/over-limit input, failed rename and serialized
installation. It remains unexecuted, as do real app-container/staging2 host
receipt acceptance and revised combined CI. Fresh single-use authorization is
still required for the Meteor integration invocation in that CI execution.
Unrelated working-tree changes and both companion repositories were preserved.
Public deployment/recovery guidance is updated; this infrastructure-only change
does not require a learner/admin UI wiki change or a data migration.

## Image-side source comparison implementation — 2026-10-13

The preceding authorized fresh CI execution on `e9bdfb9e` completed successfully
([run 38427845958, attempt 2](https://github.com/memphis-iis/MoFaCTS/actions/runs/38427845958/attempts/2)):
server 811 passed/15 pending, browser 1,104 passed/7 pending, harness 16 passed,
zero failures; Phase 0 72/72 and capture 75/75 on Linux. Toolchain, locked package
install, lint/typechecks, post-test source verification, metadata retention,
Docker smoke and cleanup passed. This evidence applies to that previous source.

The next slice adds optional image-side comparison before compilation. Shared
Docker inputs now own the recipe/ignore metadata; a pinned Node observation
stage hashes that exact tree, and compiler copies consume the observed inputs.
Runtime receives a bounded JSON observation outside the input hash. Requested
comparison requires the existing digest, base revision and explicit dirty
provenance; mismatch aborts construction. Ordinary builds record comparison
unavailable without requiring a proof or changing startup/permissions.

The capture Compose override changes only context and two provenance arguments;
all other resolved build/image/runtime values remain checked. CI's successful
source job exposes its existing identity through job outputs, the single smoke
build receives those values, and a runtime metadata assertion compares them.
No extra Meteor invocation, image compilation, dependency or production record
is introduced. No acquisition or image result is relabeled security PASS.

Local checks pass: full app typecheck and lint (28 existing vendor warnings,
zero errors, 318 syntactic surfaces), Phase 0 72/72, source-security 41/41, and
capture **78 passed, 0 failed, 2 Linux-only skips** (80 total). Tests cover normal
unavailable observations, exact bytes/empty directories, malformed provenance,
output self-reference/replacement rejection, Compose mutation boundaries and
existing synthetic capture/build wiring. Workflow/YAML/shell validation and
diff hygiene pass. An initial old COPY-path assertion failed after the deliberate
stage change, was updated to assert observed-source consumption, and passed on
rerun. This revised Docker/CI path has not executed yet; no build or deployment
ran in this slice.

Image-side comparison remains `source-matched-unqualified`. Required next work:
fresh authorized CI/Docker execution, final canonical Compose candidate proof,
stronger pre-test sealing and complete test-evidence validation, then protected
release/host and historical compatibility gates. Staging2 and production remain
unchanged. No user-facing UI/content/schema or database migration changed.

## Consolidated repair release sequence — 2026-10-09

The approved six-step sequence is: commit the current changes; verify exact-commit
CI and Security; build one canonical Compose image and deploy it to staging2 with
rollback retained; run consolidated staging browser/security acceptance; record
outcomes and close only the accepted repair batch; then resume remaining Phase 0
work, stopping at unresolved decisions. Production and original staging remain
outside this sequence.

Step 1 review: the upload/browser repairs are already committed in `309f89c2`.
The remaining checkout changes implement Prolific test-study setup and include
public authoring guidance; the wiki already describes this workflow. Reviewed
methods require admin/teacher roles, rate limits and owner-bound operations.
Focused synthetic Prolific tests passed **48/48**. Real provider test-study launch
is not established by those tests and is outside the upload/browser acceptance
session; no provider credentials or external creation calls are needed here.

The first October 9 native Meteor invocation ended abnormally before final suite
totals. The separately authorized retry completed with **exit 0**: harness
**16 passed, 0 failed**; server **775 passed, 15 pending, 0 failed**; browser
**1,092 passed, 7 pending, 0 failed**. This result covers the working checkout,
including the Prolific setup changes; exact-commit CI remains the next gate.
Full app typecheck and lint passed (28 upstream vendor warnings, no errors),
with **310** syntactic security surfaces. Source-security passed **41/41**,
Phase 0 contracts **72/72**, source-capture contracts **50/50**. The production
dependency audit reported **seven moderate**, no high/critical findings.

Both invocations' orphan test Mongo processes were ownership-verified before
stopping; database files were retained. Test ports are clear, the manifest guard
passes, and the canonical watcher is ready with health, browser bundle, HMR,
supervisor and four active Change Streams. No further native Meteor invocation
is planned unless new changes or failures justify one and authorization is fresh.
Phase 0 remains open. Later step outcomes will be recorded here as they occur.

### Staging2 candidate and acceptance checkpoint

Steps 1–3 are complete. Commit `a3155584ca26bbd03b83a123f9852aeddaa29a50`
was pushed to main. Its [CI run](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879685)
and [Security run](https://github.com/memphis-iis/MoFaCTS/actions/runs/37917879795)
both passed. One clean Git archive was built with the supported Compose workflow,
without cache. The resulting staging2 image has source revision `a3155584` and
Docker image identity `sha256:5eadcf85e2ec98e9a2e7bf594f440896c45451315da223f5bd8dbb6b5d865c20`;
the remote identity matches. The runtime bundle dependency audit reported zero
vulnerabilities; this is distinct from the application/build dependency audit.
The previous image and protected deployment configuration were retained.
Only the staging2 application was replaced; existing database volumes remain.

Before deployment, world-writable root-owned deployment inputs were corrected
after inventory: directories 755, non-secret regular files 644, shell scripts
755. The private environment file remains 600. Compose validation passed and the
ordinary operator can no longer write the Compose definition. An initial command
omitted the existing Compose project name and hit a container-name conflict;
only its newly created, unattached empty resources were removed. Deployment then
used the recorded `staging2` project and completed with a healthy application.

Step 4 completed for the representative repair acceptance scope:

- Synthetic DDP probes passed **28/28**, including anonymous/cross-user/admin
  denials, forged owner rejection, duplicate identifier rejection, completed
  asset abort denial, public byte integrity, private download denial, retired
  HTTP endpoint 410 and persisted owner continuation after reconnect and an
  application-only restart. Completed synthetic assets were removed through the
  separately guarded management operation.
- Chrome voice preview played unmuted with advancing playback time and no player
  error. Blocking the sample request produced the localized inline failure;
  temporary diagnostics and the original audio preference were restored.
- Visible theme confirmation passed initial Cancel focus, Cancel/Escape
  preservation and return focus, and Confirm deletion of only the named disposable
  theme. Confirm returned focus to Export Active Theme. The original Default
  theme was restored and all three system themes remain. Deletion acceptance used
  the UI, not a backend cleanup call.
- The first file-chooser attempt timed out when targeting the package input.
  The user confirmed extension file access was already enabled. Retrying through
  the visible drop-zone control succeeded: package upload as a separate synthetic
  copy, media upload and Anki analysis all passed. The wizard identified one note,
  one card, one media file and its fields. The disposable package copy was removed
  through the visible guarded confirmation. No extension change was required.
- The existing synthetic learner resumed its lesson after reload, submitted a
  correct response and returned to a dashboard with the saved progress. YouTube
  playback advanced to the ten-second question checkpoint. Player/Plyr resources
  returned 200. This is representative coverage, not every lesson or provider.
- A temporary theme loaded the Google stylesheet and font files with 200 responses
  and applied Roboto. The browser's intentional personal Default override initially
  kept the server theme from appearing; selecting the temporary theme exercised the
  font. Both server/browser Default were restored and the disposable theme deleted.
- The served CSP and nosniff header remain intact; ordinary JavaScript evaluation
  and inline script execution were denied. The retired cookie was absent after
  login, reload and an explicit supported Meteor disconnect/reconnect; reconnection
  restored an authenticated connection. Temporary diagnostic state was removed.

The healthy candidate remains on staging2 with the verified image identity and
rollback retained. Step 5 closes the identified upload/voice/theme repair batch;
it does not qualify every security surface or close Phase 0. Production and
original staging were not changed. No new Meteor invocation was needed.

GitHub separately reports high development-dependency alert 155, `node-forge`
(`GHSA-86w9-cpqp-85rv`), in `mofacts/package-lock.json`, with no patched version
listed at this checkpoint. This is not the runtime bundle audit's zero-findings
claim. Reachability/remediation remains a separate dependency-triage task; the
alert has not been dismissed or treated as fixed.

Step 6 resumes at the existing approved source-test design: acquire supplemental
test inputs, run the complete supported Linux source-test lane against a writable
derivative, seal the candidate and bind final in-image source proof. This remains
unfinished implementation, not release evidence supplied by this staging session.
Release-record readers, protected host receipt ownership/retention and V1 history
approval remain separate unresolved decisions. New concurrent SPARC source and
wiki documentation changes were preserved; they are not in candidate `a3155584`.

## Phase 0 continuation — supplemental test inputs, 2026-10-09

The user chose to defer development alert 155. Prior dependency/source/runtime
triage located `node-forge` under Rspack's development HTTPS-certificate helper;
the deployed application bundle did not contain that package. The alert remains
open, with no dependency override, dismissal or claim of repair in this batch.

The first source-test implementation slice adds the opt-in `collect-tests`
capture action. It verifies the existing capture, copies it into a separate
owned derivative and adds the reviewed root/test/deployment fixtures needed by
the existing checks. Supplemental files cannot replace captured build files
with different bytes or native modes. Missing inputs, links, private/cache paths
and resource-bound violations fail explicitly. Failed acquisition removes its
incomplete derivative; an existing derivative is never silently replaced.
The receipt binds the build identity, reviewed selection contract and resulting
local tree digest. Every success remains `test-inputs-captured-unqualified`.

Verification: full application typecheck and vendor typecheck pass; lint passes
with the existing 28 upstream vendor warnings and 310 syntactic surfaces;
Phase 0 tests pass **72/72** and source-security tests **41/41**. The expanded
capture suite passes **66**, fails **0**, and skips **1** Linux-native file-mode
test on Windows (67 total). Synthetic integration covers fresh capture
verification, receipt identity, reuse rejection and failed-derivative cleanup.
No real Docker capture, Meteor integration, build or deployment ran for this
slice. No dependency, application behavior, data contract or security surface
changed; the maintainer capture guide documents the new action.

Remaining implementation: exercise collection on the supported Linux lane,
complete test discovery/evidence checks and runner cleanup, enforce stronger
sealing, and bind final source proof inside the canonical image build. This
checkpoint does not establish full test-input closure or close Phase 0.
External release/host evidence ownership and V1 historical-reader decisions
remain open. The normal build and production command sheet are unchanged.

## Phase 0 efficiency revision — reuse existing Linux CI, 2026-10-09

The user approved reusing an existing automated lane and limiting staging2 to
deployment-specific acceptance. Source review confirms ordinary CI already runs
the full Meteor server/browser suite on Ubuntu with the pinned toolchain,
Chromium and a disposable MongoDB replica set. The independent Security workflow
already runs the source-security suite, surface classification and secret and
dependency scans. The manual Change Streams qualification injects database
faults/restarts and therefore retains a distinct, explicitly authorized purpose.

The CI definition now adds the Phase 0 and capture contract suites to its existing
test job, without adding a second Meteor invocation or duplicating Security's
source-security suite. The [lane contract](security-audit-phase0-contracts.md#23-supported-source-test-lane-and-evidence-binding)
and public deployment/capture guides now select existing Linux CI as the primary
full suite for committed releases. This supersedes the preceding proposal to
implement another routine full runner locally or on staging2. Dirty-source
qualification remains a separate opt-in future capability, not a requirement
for ordinary committed releases or a reason to borrow clean-commit evidence.

Remaining source qualification still requires capture/protection of actual
build/test inputs, complete test outcome/discovery evidence, and matching source
digests inside the final canonical Compose image. A passing commit SHA or CI's
separately built smoke image does not establish those missing bindings. Staging2
continues to own deployed image/configuration identity, readiness and affected
HTTPS/browser/security acceptance. Unchanged candidate/configuration acceptance
can be reused; full regression repetition is not a routine staging gate.

Local verification passes: workflow YAML and exactly one ordinary Meteor
invocation validated; Phase 0 **72/72**, capture **66 passed, 1 Linux-mode skip**,
and source-security **41/41**. Diff hygiene passes. No app source or dependency
changed, so full app typecheck/lint were not repeated for this workflow/document
revision. No new Meteor run, Docker command, workflow dispatch, server connection
or deployment ran. GitHub execution of the revised workflow remains pending
fresh authorization; the development alert remains deferred and open.

## Phase 0 source observation implementation — 2026-10-09

The separately authorized push of `a6135d0b` completed successfully.
[CI run 37974478896](https://github.com/memphis-iis/MoFaCTS/actions/runs/37974478896)
and [Security run 37974478765](https://github.com/memphis-iis/MoFaCTS/actions/runs/37974478765)
both passed for that exact revision. Linux Phase 0 tests passed 72/72 and capture
tests 67/67 with no skips; harness 16 passed, server 775 passed/15 pending,
browser 1,092 passed/7 pending, zero failures. Docker smoke and cleanup passed.
Those results establish the previous CI revision, not execution of the following
new capture integration or qualification of the staging2 image.

The next implementation slice integrates the existing capture helper with that
same CI job. `prepare-tests` atomically owns capture/collection cleanup; every
ordinary source/test command uses its writable test derivative. `verify-tests`
checks supplemental source/recipe/ignore bytes and uses Docker's real filter to
re-export tested build inputs. Their native digest must match the original build
identity after dependency synchronization and again after testing. Cache/output
exclusions remain Docker-owned; no second ignore interpreter or arbitrary
manifest normalization is introduced. CI retains only bounded digest metadata,
associated with the run/attempt, for 14 days. No raw source or private files are
uploaded; this does not choose protected release/host retention ownership.

Owned test cleanup removes installed dependency/cache links without following
their targets, while captured build-source cleanup retains its strict link
rejection. Synthetic regression coverage verifies mismatched supplemental
inputs, altered Docker-observed build bytes, changed ignore rules, failed
combined acquisition and preservation of external cleanup-link targets.

Local verification passes: full app typecheck; full lint with the existing
28 vendor warnings, zero errors and 310 syntactic surfaces; Phase 0 72/72;
source-security 41/41; capture **72 passed, zero failures, 1 Linux-mode skip**
(73 total). Workflow YAML, captured command working directories, single Meteor
invocation and shell syntax validate. PowerShell syntax and diff hygiene pass.
No new Meteor integration, actual Docker acquisition/build, push or deployment
has run for this implementation. No app behavior, dependencies or data changed.

The retained state is `test-inputs-verified-unqualified`, not a passing source
qualification or production proof bundle. Remaining gates include an authorized
Linux trial, stronger candidate sealing, complete discovery/outcome evidence,
matching final canonical Compose image source, and protected release/host and
historical compatibility work. Staging2 and production remain unchanged.

## Third authorized Meteor invocation — 2026-10-07

The third freshly authorized `npm run test:ci` finished with **exit 1**.
Harness: **16 passed, 0 failed**. Server: **721 passed, 15 pending, 4 failed**.
Browser: **1,086 passed, 7 pending, 5 failed**. All three rendered theme
confirmation tests now pass, including Cancel/Escape, selected-row deletion,
duplicate submission protection and focus retention. The upload ownership,
transport/cookie, download boundary and voice-preview tests also pass.

The remaining failures concern concurrent work outside this repair batch:
three analytics-method history selectors, one dashboard assessment-history count,
and five learner-history construction tests whose fixtures now lack required
feedback text. Full application typecheck also failed on a removed
`createAssessmentModelEvidenceRecord` export used by the resume integration test
and a duplicate `levelUnitType` property in `server/publications.ts`; lint failed
on that duplicate property. These are results from the checkout at check time,
which includes concurrently edited source. No unrelated code was changed to
obtain passing checks. Source-security tests passed **34/34**, and standalone
voice-preview tests passed **2/2**.

The runner removed test-driver resolutions, and the manifest artifact guard
passed. The orphan MongoDB process was matched to this invocation's temporary
database directory, test port and exited parent before stopping it; no database
files were removed. Neither test port remains listening. The canonical local
watcher was already running when restoration was requested; status verified app
health, executable browser bundle, HMR, active supervisor and 37 Change Streams.

Required verification failures still block commit, push and staging2 release.
No commit, push, image build or deployment occurred. This invocation consumed
its single-use authorization. Staging Chrome playback, visible theme deletion
and the remaining remote security/browser acceptance checks remain outstanding.
This result does not close Phase 0 or establish committed-image release confidence.

## Authorized Meteor rerun — 2026-10-07

The second freshly authorized invocation finished with **exit 1**: harness
**16 passed, 0 failed**; server **722 passed, 15 pending, 0 failed**; browser
**1,073 passed, 7 pending, 3 failed**. The corrected admin fixture reached the
real rendered confirmation. Two cancellation assertions incorrectly expected the
shared component's section to be removed: its intentional contract retains a
hidden section. Those tests now inspect only `aria-hidden="false"` confirmations.

The Confirm test exposed an actual focus issue: restoring focus to Delete was
followed by disabling the row during the command, leaving focus on the document
body. The existing Export Active Theme button now carries the controller's
already-defined return-focus marker. Confirm places focus there before starting
delete; Cancel/Escape retain their row-trigger focus behavior. No control was
added, no authorization changed, and the inline controller is preserved. The
regression now also removes only the selected synthetic row on command completion
and checks that focus remains on that stable control while the other row remains.

These source/test corrections have not had another Meteor run. Commit/push and
staging2 release remain blocked by the required failed integration check; the
single-use authorization was consumed by this invocation. Full application typecheck and lint passed after these corrections (55 upstream
lint warnings, no errors). The canonical watcher was restored and verified: app
health, executable browser bundle, HMR on 8082 and supervisor are ready, with four
active Change Streams. No listener remains on the test ports.

The test runner removed driver resolutions; the artifact guard passed and the
version manifest has no semantic diff. The owned orphan test MongoDB was matched
to this rerun's temporary directory, test port and exited parent before stopping
it. No database files were removed. Upstream package npm cache remains ignored.
Production, original staging, provider credentials and unrelated changes remain
untouched. Phase 0 and this candidate's browser/security acceptance remain open.

## Authorized Meteor integration result — 2026-10-07

One freshly authorized `npm run test:ci` invocation finished with **exit 1**.
Harness: **16 passed, 0 failed**. Server: **722 passed, 15 pending, 0 failed**.
Browser reporter: **3 failures**, all in the new theme-confirmation tests. The
browser passing/pending totals were not retained in the bounded output; no
combined passing count is claimed. The package-method, upload ownership and
server download-boundary tests completed without server failures. The full run
used the working checkout, including unrelated concurrent changes, and does not
qualify a future committed-source image.

All three failures occurred before opening a confirmation: the selected theme's
Delete button was absent. Source inspection identified a test-fixture error:
Blaze checks `__helpers.has(name)` before `__helpers.get(name)`, but the synthetic
admin fixture stubbed only `get`. The fixture now declares helper presence as well
as its value. Application authorization and the confirmation repair are unchanged.
This correction still requires another authorized Meteor run; the failed run does
not establish confirmation rendering, focus or deletion acceptance.

The watcher was already stopped before this invocation, with an earlier MongoDB
connection-pool failure recorded. It was explicitly kept stopped during testing.
The runner removed transient test-driver resolutions; the manifest artifact guard
passed. The remaining test MongoDB process was verified against this invocation's
temporary database directory, test port and exited parent, then stopped without
removing database files or affecting another process. The canonical watcher was restored: app health, executable browser client bundle,
Rspack HMR on port 8082 and supervisor are ready, with two active Change Streams.
Full application typecheck and lint passed after the fixture correction; lint
retains 55 upstream warnings and no errors. The corrected fixture is not yet
Meteor-verified.

No commit, push, image build or staging2 deployment occurred. Required integration
failure blocks release. The new package retains upstream `.gitignore` so generated
Meteor npm cache/shrinkwrap output stays untracked. Production, older staging,
provider credentials, learner histories and unrelated source edits are preserved.
Phase 0 and all candidate browser/remote acceptance checks remain open.

## Upload/browser repair implementation checkpoint — 2026-10-06

The approved repair batch is implemented in the working checkout, not yet
committed or deployed. Production and the older staging installation are unchanged.
Phase 0 remains open. See [the upload guide](../docs/uploads.md) and the maintained
package's [provenance and upgrade instructions](../mofacts/packages/ostrio-files/MAINTENANCE.md).

- Maintained upstream `ostrio:files` 3.0.1 source is pinned to
  `442a08912595c552c49fabebf8684bf896ee0fb5`, preserving its license and dependencies.
  DDP start establishes the caller as pending owner; write/finish/abort authorize
  from persisted ownership before stream/file access. No administrator bypass is
  present. Duplicate identifiers and client filename substitution are rejected;
  abort cannot remove completed assets. Missing owners require a new upload.
- HTTP upload code and file-cookie authentication are removed. Explicit HTTP
  transport fails, the app-owned retired endpoint returns 410 before lookup,
  and the client expires the former host-only `x_mtok` cookie without renewing it.
  Existing download visibility and URLs are preserved.
- Voice preview uses only the ten offered direct documentation URLs, owns one
  audio instance and reports failure in localized inline TTS status. Theme
  confirmation now reads its reactive view before checking nonreactive scope.
- Real Meteor tests were added for generated package handlers with Mongo and file
  streams, missing-owner rejection and persisted continuation, DDP-only/cookie
  behavior, download boundaries and Blaze confirmation rendering. They are
  automatically discovered by the existing test entries; they have not yet run.
- Full application typecheck: **passed**. Voice-preview lifecycle tests: **2 passed**.
  Source-security tests: **34 passed**. Full lint: **passed**, with 55 retained
  upstream-style warnings and no errors; the security contract covers **305**
  syntactic surfaces including the package's four generated methods and raw asset
  route. The disabled generated Remove method is classified explicitly. This is
  a narrow package binding, not completion of the runtime-registry redesign.

Fresh single-use authorization is still required for the Meteor suite. Commit,
push, committed-source Compose build, rollback retention and staging2 deployment
remain pending the required checks. Chrome playback and visible theme deletion,
wire-level owner/other-user probes, actual process-restart continuation and the
existing CSP/learner/Anki/fonts/YouTube regressions remain **NOT RUN** for this
candidate. Prior baseline checks below do not establish acceptance for this code.
No security item is marked closed by the local source checks. Unrelated concurrent
content, video and launch work is preserved and excluded from this batch.

## Current checkpoint — 2026-10-04

**Phase 0 remains open.** An authorized isolated non-production target, referred to here as `staging2`, is now provisioned and running. This resolves the missing test-host prerequisite; it does not complete the security qualification lanes. Production and the older frozen staging installation were not changed.

The signup form repair was committed and pushed as `e30294210c36a02350486efe68955b9666d50827`; its wiki FAQ update was committed and pushed separately as `7448876`. The application image was built on the workstation through the canonical base Compose workflow from a Git archive of the application commit, transferred directly to the test host, and loaded without a registry publication. The archive SHA-256, transferred image identity, running image identity, and source-revision label were checked. Docker-inspected image ID: `sha256:1c37cc58e98b645d254dc10c4a6f3c971e6dd4132f7511a423245ff472c4e614`, Linux/amd64. This is an observed deployment identity, not the planned authenticated source-test/image/release proof.

The separately authorized native Windows Meteor integration invocation completed with exit 0: harness **16 passing, 0 failing**; server **695 passing, 15 pending**; client **1,019 passing, 7 pending**; final server and client failure counts **0**. Full app typecheck and lint passed; lint covered **300 syntactic security-surface entries**. The runner removed transient test-driver resolutions, the artifact guard passed, the owned orphan test MongoDB process was stopped, and the canonical local watcher was restored with health, browser bundle, HMR, supervisor and Change Streams ready. The suite ran against the working checkout, including unrelated local changes; those changes were excluded from the committed deployment. This run therefore does not establish the unfinished exact-snapshot Linux qualification contract. No additional test invocation is authorized by recording this result.

| Recorded check on 2026-10-04 | Result | Limit |
| --- | --- | --- |
| Canonical application image build | PASS; Meteor compiled on attempt 1 | Ordinary cached build; not a new source-capture/default-path equivalence qualification |
| Configured runtime npm audit | PASS; zero reported vulnerabilities | Separate build-time dependency audit reported 31 vulnerabilities, including 16 high; GitHub dependency alerts also remain. No whole-image security claim |
| Image transfer and running identity | PASS; archive checksum and image/revision observations matched | Direct transfer only; published registry/platform mapping and final proof binding remain open |
| App, authenticated MongoDB replica set, Redis | Healthy; replica initialization exited 0; 10 active Change Streams observed | Runtime health does not establish authorization, report integrity or full application readiness |
| Public HTTPS | Valid certificate; landing, health, signup and SockJS info endpoints returned 200 | Browser interaction, WebSocket session behavior, headers/CSP, cookies and effective host exposure qualification remain pending |
| Host compatibility | Maintained Ubuntu AWS LTS kernel `6.8.0-1066-aws` installed and booted successfully | The initially provisioned `7.0.0` kernel was rejected by MongoDB; the supported kernel track was changed with explicit authorization |
| Pre-upgrade backup | Created; required database, asset and configuration archives present; previous image retained | Restore and rollback were not exercised; this operational safeguard is not an added scanner control |
| Administrator/learner browser flow and email delivery | NOT VERIFIED on this target | Chrome blocked the automated visit; an available administrator credential does not prove signup, verification, assigned role or successful login |
| Authenticated deployment readiness and security probes | NOT RUN on this target | Earlier local application smoke results do not substitute for these remote checks |

Evidence comes from the authorized execution results and the private deployment checkpoint, which is kept outside Git. No credentials, private runtime settings, learner records, host addresses or credential-file contents are included here. The initial records reconciliation performed no new host inspection, test, build, deployment, commit or push. The separately authorized baseline checks below supersede the corresponding pending observations above. The Phase 0, capture and source-security suite counts in the September checkpoints are historical results, not October 4 reruns.

The dated checkpoints below retain their original execution scope. Older `NOT RUN`, frozen-target and authorization statements describe those earlier checkpoints; they must not override this current checkpoint. Provisioning/deployment permission for `staging2` does not authorize every future security probe, host-audit installation or workflow dispatch. Every new `npm run test:ci` invocation still requires fresh, single-use authorization.

### Authorized staging baseline — 2026-10-04

**Partial; Step 2 remains open.** The following bounded checks used only the isolated target. No application repair, service restart, deployment, Meteor integration invocation, full security scanner, restricted audit-helper installation or production action occurred.

| Baseline check | Current result and evidence |
| --- | --- |
| Administrator access | PASS: the existing signed-in browser session reached admin pages and successfully invoked admin-only deployment readiness. This does not establish a fresh login or a learner denial test. |
| Email verification | The configured owner's email is verified: a minimized read-only database query returned existence/verification booleans only. Mailbox receipt, link handling and a fresh delivery test were not independently observed. |
| Deployment readiness | PASS: all 11 checks passed at `2026-10-04T14:46:09.666Z`, including authenticated MongoDB 8.0.32, strict Change Streams (12 observers, four collections, zero rejected starts), owner role, storage and Redis PING. Content validation covered zero TDFs; it is not learner-flow evidence. |
| Runtime health | App, MongoDB and Redis were healthy. The supported AWS LTS kernel remains `6.8.0-1066-aws`. |
| HTTPS and WebSocket proxy | HTTPS returned 200 with normal certificate validation; HTTP redirected with 308. The secure `/websocket` request returned 101; the insecure request returned 308. The secure curl probe timed out after receiving the upgrade because it intentionally left the connection open for only three seconds; no application message/session persistence test was performed. |
| Security headers | One-year HSTS, frame denial, MIME protection, referrer and permissions headers match the existing baseline policy. **FAIL: the main document supplies neither a CSP response header nor a CSP meta tag.** The existing `external.csp` control requires frame/object/base/form restrictions and would fail on this response. A coherent proxy policy repair and functional verification remain separate work. |
| Cookies | Cookie values were withheld. Observed `x_mtok`: Secure, SameSite=Lax, not HttpOnly. Three experiment-context cookies: Secure, SameSite=Strict, not HttpOnly, consistent with the client cookie helper. Authentication-token ownership and whether a changed cookie contract is appropriate remain unqualified; observation alone is not a complete session-security verdict. |
| Host listeners and exposure | App and Caddy management bind to loopback; MongoDB/Redis have no published host ports. From the permitted workstation, TCP 22/80/443 were reachable and 3000/27017/6379/2019 were not. UFW is inactive, so the cloud firewall remains the SSH exposure boundary. The AWS console session expired and the configured CLI identity was denied `lightsail:GetInstancePortStates`; saved cloud rules, access from another source and IPv6 restriction were not freshly established. |
| Synthetic learner flow | NOT RUN: the normal UI showed one administrator account and no lessons. A two-card package was prepared privately from the prior bounded synthetic fixture structure. The browser file-chooser event timed out before selecting/uploading it; no upload receipt or new learner account exists from this execution. Complete the normal upload/account setup before testing lesson entry, answer persistence and reload/resume. |

The upload page is retained for user handoff. Browser policy requires the user to enter and submit any new learner credential. The prepared package, screenshot and operational checkpoint stay outside Git. Only this status record was edited; unrelated application work was preserved. These results do not close Phase 0 or qualify the pending source-bound, report-contract, provider, restricted-host or runtime-authorization lanes.

### Staging baseline continuation — 2026-10-04

After the user restored AWS access and uploaded the prepared package, the saved Lightsail rules were inspected in the authenticated console: TCP 80 and 443 accept IPv4/IPv6; TCP 22 permits only the operator workstation's IPv4 `/32`; no IPv6 SSH rule or database/Redis opening was present. This supersedes the earlier unavailable cloud-policy observation. It verifies configured rules, not an independent connection from a second source or every IPv6 probe.

The normal Content page listed the uploaded **Staging2 Baseline Synthetic** package. Using the existing administrator session, the bounded lesson smoke passed: dashboard lesson discovery, Start, instruction rendering, instruction reload, Continue into practice, one correct typed response, next-item progression, save/return, and dashboard reload with **one practiced item and 100% accuracy** retained. Reopening the captured instruction URL resumed the practice unit with retained accuracy. Adaptive item selection changed on resume; exact next-card equivalence was not asserted. The synthetic trial remains attached to the administrator account; it is not evidence from a distinct learner role or a real learner history.

A fresh unauthenticated DDP connection invoked `deploymentReadiness` and `getDeploymentBrandProfileDraft`. Both denied access, with `not-authorized` and `unauthorized` respectively. Only those two anonymous method boundaries were checked; cross-user, learner, publication and download coverage remain pending.

Readiness passed **11/11** again at `2026-10-04T19:20:47.452Z`: MongoDB 8.0.32 authenticated; 17 strict Change Streams observers across seven collections; zero rejected starts; one probability expression in one TDF validated; remaining settings, owner, storage, backup configuration and Redis checks passed. No restart, integration-suite invocation, scanner dispatch or deployment occurred.

**Step 2 remains partial.** The existing authentication scanner consumes protected pre-created identities and does not provision accounts. Normal public signup and admin CSV import both require a new password and send verification mail when required. No database role/verification modification, invented account bypass or replacement account-provisioning path was introduced. A distinct verified learner identity is still required for learner-versus-admin tests and independent email-delivery evidence. The absent CSP remains a confirmed failure of the existing external policy; cookie-contract qualification remains open. Private screenshots and the deployment checkpoint retain operational evidence outside Git. Unrelated working-tree changes were preserved, including concurrent deployment-documentation and content-mapping work.

### Synthetic learner baseline completion — 2026-10-04

**The bounded Step 2 checks have now been executed; the security baseline is not clean.** The earlier learner-setup blocker was resolved through the application's existing `signUpUser` API over HTTPS/WSS, using a generated synthetic credential and an operator-controlled mailbox alias. This used normal password validation, account creation and verification mail; no database identity/role/verification edits, disabled authentication or new application provisioning code were used. Credential creation through the server API was separate from browser password entry; subsequent sign-in used the existing generated credential. The private durable credential uses Windows DPAPI encryption. Temporary plaintext login transport files were removed after use.

The targeted verification message arrived in the operator mailbox. Following its normal staging verification link produced a session explicitly labeled **Learner**. A separate password-login DDP probe succeeded and then tested `deploymentReadiness` and `getDeploymentBrandProfileDraft`; both denied the learner with `not-authorized` and `unauthorized`. The probe session logged out. A browser visit to `/admin/tests` redirected the learner to `/home`, where admin controls were absent. These are representative method/route checks, not full surface, cross-user, publication or download authorization coverage.

The distinct learner passed lesson discovery/start, instruction reload and Continue, a correct typed response and next-item progression, save/return, dashboard reload with **one practiced item and 100% accuracy**, and cold instruction-URL resume into the practice unit with retained accuracy. The synthetic lesson and its two synthetic account histories remain available for later qualification. No raw history export or production data was used. The learner browser session was logged out and the original administrator was restored through normal browser password login; the final dashboard showed the administrator role.

Remaining findings are the absent CSP and the unqualified cookie/token contract. Full TLS cipher/protocol enumeration, probes from another source, complete IPv6 reachability, session expiration/revocation, provider, cross-user and full report-contract lanes remain separate qualification work. All 11 readiness checks passed after upload; no additional readiness claim is made for every possible application feature. No integration-suite rerun, service restart, deployment, application repair, commit or push occurred. Documentation whitespace checks passed; unrelated work was preserved.

### Staging CSP repair and file-cookie investigation — 2026-10-04

**The approved CSP repair is deployed on the isolated target; Phase 0 remains open.** The canonical self-hosted Caddy example now supplies a deferred default `Content-Security-Policy`. Application endpoints that return their own stricter policy retain that policy. Script execution is limited to the application and reviewed YouTube player paths; WebAssembly compilation is permitted for Anki analysis. Inline script/style blocks and ordinary JavaScript evaluation remain prohibited. Dynamic style attributes have a separate, bounded exception. Frame, object, base and form restrictions are enforced, with reviewed external font, media and browser API destinations documented in the reverse-proxy guide. No dependency or application authentication contract changed.

The candidate was validated with the installed Caddy, and a loopback-only response probe confirmed exactly one default CSP on ordinary responses and preservation of a stricter downstream CSP. The existing host configuration was retained privately, then Caddy was reloaded successfully. The public document returns 200 with one enforcing policy and the existing security headers; HTTP redirects with 308 and health returns 200. The temporary probe listener was removed. The application image remains `sha256:1c37cc58e98b645d254dc10c4a6f3c971e6dd4132f7511a423245ff472c4e614`; no application rebuild, restart, production deployment or old-staging change occurred.

| Verification after CSP deployment | Result and limit |
| --- | --- |
| Source security regression suite | PASS: `npm run security:test:source`, 32 passing tests, exit 0; includes the proxy policy contract. This is source evidence, not complete browser coverage. |
| Configured lint | PASS: `npm run lint`, exit 0; server boundary, transient test-artifact guard and 300 security-surface entries checked. |
| Administrator login / readiness / WSS | PASS: fresh browser password login restored the administrator role; authenticated WSS probes completed; all 11 deployment-readiness checks passed after the proxy reload. |
| Independent learner flow | PASS: a second synthetic account used normal signup, verification mail/link and password login. Lesson start, instruction reload, typed correct response, next-item progression, save/return, dashboard reload and cold instruction-URL resume retained 100% accuracy and one practiced item. No exact adaptive next-card equivalence claim. |
| Themes and hosted fonts | PASS: theme activation/restoration and a temporary font theme loaded Google's stylesheet and font files with HTTP 200. Server/browser defaults were restored and the temporary custom theme removed. |
| Anki / WebAssembly | PASS: normal file selection and Analyze Deck parsed a one-note synthetic APKG with one image into the setup page. No CSP rejection observed. Full generated-package publication and modern compressed APKG formats were not tested. |
| Local media | PASS: normal Manage Media upload reported success, the synthetic PNG rendered through its served asset URL, and normal file deletion returned the lesson to zero attached media. |
| YouTube / Plyr | PASS: a synthetic lesson referencing an existing authored video loaded the iframe API, player script, privacy iframe, metadata and Plyr icons; playback advanced and reached the synthetic checkpoint. This is representative playback, not every video/resume/provider combination. |
| Public voice sample | NOT QUALIFIED: Test voice issued the expected public sample request, but Chrome reported `net::ERR_BLOCKED_BY_ORB`. No CSP rejection was observed; an independent HTTPS request returned audio with status 200. Audible playback and its browser failure cause remain unresolved. |
| Credentialed providers | NOT RUN: staging provider keys/model bindings are absent. Policy destinations were reviewed; no production credential or paid provider call was added. |

The `x_mtok` cookie is owned by `ostrio:files@3.0.0`, whose deployed client writes the current DDP session ID and whose server resolves it to a live session's user ID for HTTP file requests. It is a file-session bearer capability, separate from the persistent Accounts login token. Its client writer requires JavaScript access; adding HttpOnly blindly would not preserve this contract. The three experiment cookies remain client-owned routing/context fields, not independently demonstrated authentication tokens. No cookie flags, account storage, package implementation or file visibility rule was changed.

Two verified synthetic learners and disposable files established the following bounded outcomes:

- Anonymous DDP writes and owner DDP writes after logout were denied with 403.
- **Confirmed ownership gap:** learner B could write a chunk to learner A's in-progress upload through `_FilesCollectionWrite_Assets` when supplied A's upload identifier. The test used the same synthetic bytes, did not establish identifier discovery, and touched no other upload. The deployed package checks authentication while continuing an upload but does not enforce the initiating owner's identity in this path. A focused owner-bound upload repair and regression coverage are required; authentication redesign was outside this approved investigation.
- Private-marked downloads returned 404 for anonymous, other-learner and owner requests; the app-owned raw asset route deliberately serves only `meta.public === true`. A public-marked synthetic download returned 200 with exactly matching bytes. This does not qualify all export/download surfaces.
- HTTP upload requests with missing, invalid, live, logged-out and disconnected file cookies all returned 404. The app-owned raw `/cdn/storage/Assets` route intercepts the package upload URL, including its authenticated positive control. These responses **cannot establish cookie expiry or revocation**. The supported browser uploads exercised here use DDP; any retained HTTP upload contract needs explicit route ownership review before qualification. No alternate route or bypass was added.

Disposable upload probes, temporary media and the font theme were cleaned up; synthetic identities and lesson fixtures remain for later qualification. Durable credentials are DPAPI-encrypted in the approved private Desktop folder. Temporary plaintext credential transport files were removed. Private receipts and screenshots contain no cookie/login token values or raw learner history. The theme's Delete action did not expose a visible confirmation during cleanup; the owned temporary theme was removed through the existing admin-guarded `deleteTheme` method, with deletion and restored defaults verified. Its UI behavior was not redesigned or attributed to CSP without evidence.

The reverse-proxy guide and source regression test were updated. No app TypeScript changed, so this slice did not require another full typecheck. No Meteor integration invocation was run: each still requires fresh single-use authorization. No commit or push was performed. All unrelated working-tree edits, including concurrent content/import/routing and deployment-documentation work, were preserved. Cookie expiry, the HTTP route contract, upload ownership remediation, voice playback, credentialed providers and the broader Phase 0 qualification gates remain open.

## Phase 0 closeout checkpoint — 2026-09-09

The previously open local execution gates have now been run and passed. The authorized Meteor integration suite completed with exit 0 (harness 16 passing/0 failing; server 675 passing/15 pending; client 972 passing/7 pending). The canonical Docker qualification cycle also passed: fresh application build, all 11 readiness checks before and after restart, authenticated admin/learner flow, package upload, instruction reload/resume, response persistence, dashboard count, cold content resume and cleanup. The local candidate was not pushed to a registry or deployed remotely.

The Phase 0 contract and capture suites pass locally: `security:test:phase0` 72/72, `security:test:capture` 50/50, `security:test:source` 30/30, and `security:surfaces` reports 297 covered syntactic entries. Full typecheck and lint also pass. These results close the local characterization and bounded Docker/Meteor gates, but they do not close Phase 0 itself.

Remaining Phase 0 exit items are decisions and protected-lane work: supplemental test-input acquisition and source-bound Linux qualification, final in-image proof binding, external release-record/host-receipt ownership and retention, V1 historical-reader approval with previous-image storage qualification, and authorized non-production HTTPS/host/provider/composition qualification. No production restriction or new security denial was introduced by this closeout work.

## Meteor integration checkpoint — 2026-09-09

The user-authorized `CI=1 TEST_SETTINGS_FILE=<absolute settings.ci.json> npm run test:ci` run completed with exit 0. Harness preflight: **16 passing, 0 failing**. Meteor server suite: **675 passing, 15 pending**. Browser/client suite: **972 passing, 7 pending**. Final runner summary reported **SERVER FAILURES: 0** and **CLIENT FAILURES: 0**. The harness removed/verified no transient `meteortesting:*` entries in `.meteor/versions`; the artifact guard passes.

This was the supported native Meteor integration environment, not Docker or production evidence. No source fixes were required during the run. A post-run supported watcher restart briefly encountered a locked log during rotation; the lock was traced to two diagnostic shell readers, which were terminated, and the canonical watcher was restarted. Final status: port 3200 app health, Rspack HMR, browser bundle, supervisor and Mongo Change Streams all ready. No commit or push was made.

## Full application smoke checkpoint — 2026-09-09

### Authorized repair cycle — 2026-09-09

Shared launch preparation now owns first-instruction initialization through `initializeLessonLaunchEntry`; dashboard and route callers consume the resulting entry decision rather than writing duplicate instruction Session state. Cold instruction URLs with saved progress use the existing content-resume lifecycle and retain the lesson/course descriptor. Caller-specific audio warmup, learner overrides and loading feedback remain in place. Canonical history validation and existing completion restrictions are unchanged.

The item-count failure was `Number(null) === 0` in the client formatter, not evidence of lost stimulus data: the snapshot deliberately supplies an unknown total. `practiceMetrics.ts` now displays the practiced count alone for an unknown total; supplied totals and non-applicable states retain their meanings. No broad stimulus fetch, schema change, data migration, new permission or deployment workflow was introduced.

Regression checks: 18 checked-in decision/formatting tests passed through an isolated TypeScript harness with explicit Meteor/engine boundary doubles; three additional local checks of the actual router bootstrap function passed with mocked I/O, including redirect ordering and course descriptor preservation. These 21 checks are not Meteor integration. Full lint passed. An initial test-only optional-undefined type error was corrected; full typecheck passed afterward. The wiki developer guide documents initialization ownership and unknown-total semantics. Unrelated concurrent course-assignment and existing security/deployment edits were preserved.

### Fresh Docker smoke result — PASS, bounded application smoke

The authorized canonical base Compose build completed with exit 0, using the existing endpoint-bound local Docker builder and ordinary runtime target. Caching was allowed; this was not a new no-cache equivalence run. Meteor compilation succeeded on attempt 1; manifest/toolchain checks and the hardened runtime bundle's configured npm audit passed (zero reported vulnerabilities in that audited bundle). Build-time dependency/deprecation, CSS-order and asset-size warnings remain; this is not a claim that every dependency scope or image layer is vulnerability-free.

Local candidate: `mofacts-qualification-local/mofacts-smoke:qualification-20260909-launch-display`. Docker-inspected immutable image ID and running container image reference: `sha256:a3e88cdf43a104a047da11abb04057c6167ce764014ffe74238e856602774be7`, Linux/amd64. BuildKit separately emitted config digest `sha256:cccdb8cb945093db79223009637a131ba93cba7cb34d6d75d670e022b1a7b01e`. The first startup command incorrectly used that config digest as the addressable image ID and failed before app creation; inspection established the image-store ID above, and the corrected command started that exact candidate. This setup correction did not rebuild or substitute another candidate. Source was the dirty checkout based on `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`, including unrelated in-progress edits; this is not a clean-commit release artifact.

Disposable project `mofacts-smoke-fix-20260909` used fresh synthetic accounts/settings and data, loopback port 3321, authenticated MongoDB replica set and Redis. Dynamic assets used the mounted `/root/dynamic-assets` path in this cycle. The independent native port-3200 watcher was left running.

| Live check | Result |
| --- | --- |
| Compose app/MongoDB/Redis health and exact image reference | PASS |
| All 11 application readiness checks before and after app restart | PASS |
| Admin and learner UI signup/login; connected Meteor client | PASS |
| Admin-only method allows admin, rejects learner with `unauthorized`, also after restart | PASS |
| Synthetic two-card ZIP upload through the normal admin UI | PASS |
| First instruction page reload restores unit 0; Continue reaches practice | PASS — previous failure resolved in this image |
| Correct typed response saves and shows 100% accuracy | PASS |
| Dashboard shows `1`, not `1 / 0`; retained through browser reload | PASS — previous failure resolved in this image |
| Cold instruction URL after practice resumes saved unit 1 through content | PASS |
| App restart followed by fresh logins, retained lesson/progress, corrected count and readiness | PASS |
| Uncaught browser errors in instrumented smoke runs | None observed |

Both browser runs exited 0. No Meteor `test:ci` rerun, registry push or remote/production deployment occurred. This validates the bounded two-card learning flow, not every unit type, real course-assignment scenario, OAuth provider, backup/restore, media durability, all security surfaces, or the unfinished source-bound release-proof design. Phase 0 and overall release qualification therefore remain open.

Cleanup completed with exit 0: four ownership-checked containers, five disposable volumes and the project network were removed; post-cleanup project-filtered inventories are empty. Synthetic database contents were discarded, while the image and ignored local fixture scripts remain. The independent watcher remained running with HTTP health and HMR ready; source/wiki diff whitespace checks passed. No commit or push was made.

### Historical failed image — retained evidence

**Overall: FAIL; not release-qualified.** The authorized isolated application smoke used exact image config ID `sha256:3877cc8a3ba671795d271e8045a477d94e1956532dd0c68971d33c1969cbef60` from the successful dependency-fetch repair build. No new build, push, production connection, or production deployment occurred.

The canonical base Compose services ran in disposable project `mofacts-smoke-20260909`, with a test-only override, fresh authenticated MongoDB replica set, Redis, synthetic accounts/settings and a two-card synthetic ZIP package. Only the app port was published, at loopback `127.0.0.1:3321`. The existing native watcher on port 3200 was not replaced or stopped. Browser observations used installed Playwright/Chromium; these exploratory scripts are not a maintained qualification suite.

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Exact image and startup | PASS | Image ID matched; Compose readiness completed and app/MongoDB/Redis were healthy. |
| Application readiness | PASS | All 11 `deploymentReadiness` checks passed before and after restart, including authenticated MongoDB 8.0.29, strict Change Streams with 12 active observers and zero rejected starts, and Redis PING. Storage checks establish readability/writability, not backup/restore or media-volume durability. |
| Browser and accounts | PASS | Landing and account pages loaded; synthetic admin and learner signed up and signed in through UI. Meteor connections were live. No uncaught page errors were observed on instrumented checks. Signup intentionally redirects to login; the initial auto-login wait was a harness error, not an app defect. |
| Representative server authorization | PASS | `getDeploymentBrandProfileDraft` succeeded for admin; learner received the expected `unauthorized` error, including after restart. This is not complete security-surface coverage. |
| Content upload and normal lesson entry | PASS | Admin saved a synthetic creator display name and uploaded a two-card package through the real ZIP input. Learner saw the lesson; dashboard entry, instructions Continue, and practice rendered. |
| Response and dashboard persistence | PASS, bounded | A correct typed answer advanced to the next card and showed 100% accuracy. Save/return, dashboard reload, and post-restart login retained the in-progress lesson and its displayed statistics. Raw history equivalence, full lesson completion, and all unit types were not tested. |
| Cold instruction-page reopening | FAIL | Reopening `/instructions/:tdfId` in a fresh page rendered instructions, but Continue displayed the lesson-load error. Admin-enabled client verbosity exposed `History record has undefined canonical core fields: levelUnit`. Normal dashboard entry had current unit 0 and continued successfully. |
| Dashboard item total | FAIL / diagnosis pending | After the answer, the dashboard displayed `1 / 0 items practiced`; this persisted through reload and restart despite the two-card fixture. Cause is not established. The displayed total-trial count also includes more than the single answered card; its semantics were not audited. |
| Restart | PASS, bounded | Exact app container restarted; subsequent Compose readiness also recreated the disposable Redis container and reran replica initialization. Readiness, fresh login, permissions, lesson visibility and displayed progress passed. This is not whole-stack disaster recovery or media restoration. |

### Failure boundary and next repair cycle

The instruction failure is consistent with incomplete cold-route initialization: `router.ts` calls `selectTdf` with `isRefresh=true`, while `lessonLaunchRunner.ts` initializes the first instruction unit inside its `!isRefresh` branch. `instructions.ts` takes `levelUnit` directly from `Session.get('currentUnitNumber')`; canonical history validation rejects the undefined value before submission. This source trace supports the diagnosis but is not a tested repair.

Next: define and test the shared instruction/content cold-route resume contract, including fresh entry, instruction reload, persisted unit identity, and course/assignment launch context; repair the owning initialization boundary without inventing a default unit number or relaxing history validation. Investigate the zero item-total independently. Rebuild a new candidate and repeat the failed and previously passing smoke cases. Do not relabel this existing immutable image as passing based on later source edits.

No production application source or permission rule changed during this run. No new dependency, migration, `test:ci`, commit or push was performed. The synthetic admin's client verbosity was set to 1 solely inside the disposable database to expose the failure. Synthetic settings used the CI local dynamic-assets path; media persistence/recreation was not qualified. Existing unrelated working-tree changes were preserved. Typecheck/lint were not rerun because this cycle changed only ignored test scaffolding and this status report.

Cleanup completed: the four project-owned containers, five volumes and one network were removed; filtered resource inventories are empty. Disposable database contents are not retained or recoverable; synthetic fixture scripts/settings remain in ignored local `tmp/`, and the candidate image is retained. The independent watcher reported PID 303704, supervisor 330140 active, HTTP health/client bundle/HMR ready and nine active Change Streams. `git diff --check` passed.

This is the evidence/status companion to the [durable redesign plan](security-audit-durable-redesign-plan.md). The plan owns target contracts; this file records what has actually been inspected, implemented and verified. Do not infer deployment from source completion or documentation review.

## Current position

### Dependency transport repair — 2026-09-08

The separately authorized dependency-fetch repair is implemented in the canonical Dockerfile's `meteor_builder` stage. Git deterministically maps the SSH and SCP-style URLs for the existing public `unetworking/uWebSockets.js` repository to its HTTPS URL. It preserves the repository/ref and does not add SSH, credentials, a different dependency/version, an alternate repository or a new retry loop. The setting is confined to the intermediate builder's Git configuration: workstation Git, base Compose, production command sheet and runtime configuration are unchanged.

Diagnosis: the exact npm implementation bundled in the pinned Meteor base image tries HTTPS and then SSH for hosted Git resolution errors. No existing URL rewrite was present in that image. The historical first HTTPS error was not retained, so its underlying cause remains unknown. A direct HTTPS lookup and an SSH-form lookup under the new transport rule both resolved v20.66.0 to `a63031f40f76dc2422e8da736c04217053e9db2b` in the pinned Linux base image. This fixes the unsupported SSH transport, not all possible GitHub/network failures. [Git's documented URL mapping](https://git-scm.com/docs/git-config#Documentation/git-config.txt-urlltbasegtinsteadOf) preserves the suffix/ref; HTTPS failures still fail the build.

Verification: **31 source-security tests and 50 capture/builder tests passed**, full lint passed, and `git diff --check` passed. The new regression reads the actual Dockerfile settings, checks HTTPS/SSH/SCP forms and unchanged refs, confirms an unrelated repository is unaffected, and denies HTTPS before network access to prove failure is not converted into SSH success. Real source capture and Windows/Linux round trip passed with digest `8db404370c25d5fe66118a775e5c29309fa2ddeac2d6021fc9baf555b191038b` (2,166 entries). The source target still performs source copies only, without executing the new Git configuration or application compilation.

**Affected ordinary build: PASS.** The unchanged base-only Compose `build --no-cache mofacts` procedure, explicitly bound to the same local engine and using synthetic build-only settings and a unique local tag, exited 0 in **259.33 seconds**. Pinned Meteor/Node/npm checks, manifest checksums, dependency installation, Meteor compilation, server hardening and the existing high-severity npm audit all passed. No capture override or proof gate was added to this ordinary build. No dependency-install retry was added or manual build retry needed after the repair.

Image `mofacts-qualification-local/mofacts-capture:qualification-20260908-fetch-fix` has config ID `sha256:3877cc8a3ba671795d271e8045a477d94e1956532dd0c68971d33c1969cbef60`. Exact-ID structural smoke passed in a disposable read-only, network-disabled, capability-dropped container: Linux/amd64, expected revision/entrypoint/command, Node 24.15.0, bundle entry, seven executable CRLF-free shell scripts passing `bash -n`, npm removed, and no builder Git configuration in runtime. This did not start the app or connect to databases.

The dependency-fetch blocker is resolved, and ordinary compilation/runtime-profile compatibility now has a passing result. This does **not** establish bit-for-bit equivalence with yesterday's different-source image, full app readiness/auth/browser behavior, or release qualification. No push, deployment, commit, fresh Meteor integration run, dependency-version change or private command-sheet change occurred. Existing unrelated edits were preserved. Supplemental test-input closure, final in-image proof binding, full isolated application smoke and protected image/host proof remain open; the prior same-source comparison failure remains historical evidence rather than being relabeled PASS.

### Builder integration repair and captured-image checkpoint — 2026-09-07

The authorized repair is implemented in `qualification/localDockerBuilder.mjs` and wired into all capture CLI actions. It validates a running, single-node, local Linux context-backed `docker` builder; observes matching engine identity through its named context and explicit endpoint; and binds capture and Compose to that endpoint. The engine's built-in builder uses the explicit `default` alias on that bound endpoint. No builder/context is created or switched, no failure-triggered alternate route is attempted, and unsupported builder families fail explicitly. This resolves the context/host conflict documented in the capture guide without changing Docker installations, the Dockerfile, base Compose or the private production command sheet.

Verification: **50 capture/builder tests pass**, including six new endpoint/driver/identity/failure tests; full app lint exits 0 with server-boundary and test-artifact guards passing. The actual wrapper's endpoint-bound source round trip passed. A fresh capture containing the repair has 2,166 entries and 174,517,347 file bytes; source digest `0780154a1b8be35ea323741d9e67f8e4ce2b5c53c0cb852aee1741a63c93c20e`. A subsequent live-source capture reproduced this digest before default-path comparison.

The captured-context **no-cache Compose app build passed**, exit 0 in 387.09 seconds including pre-build source verification and post-build integrity checking. Meteor compilation, pinned toolchain/manifest checks, server dependency hardening and the existing high-severity npm audit passed. The ordinary runtime target was selected; the separate `source_capture` target was not in the app construction dependency chain.

Local-only image `mofacts-qualification-local/mofacts-capture:qualification-20260907-wz8jff` has config ID `sha256:776f9b0f328f4d2d8a3fd68b8a8370a42405b6f8513c9d10e3a46df0540b0253`. Observed profile: Linux/amd64, expected base-revision label, `/docker/entrypoint.sh`, `node main.js`. An exact-config-ID, read-only, network-disabled, capability-dropped disposable container passed **structural smoke**: Node 24.15.0, bundle entry present, all seven shell scripts executable/CRLF-free and valid under `bash -n`, runtime npm removed. It did not start Meteor, connect to databases, mount settings or publish ports; this is not full application-readiness/auth/browser smoke.

The helper correctly returned `built-unqualified`: supplemental source-test closure, embedded proof/final in-image source binding, full isolated application smoke and protected published/running identity remain open. No Meteor integration rerun, registry push, production deployment or application permission/startup change occurred. This checkpoint supersedes the builder-blocked state below; it does not close Phase 0 or activate production integration.

**Default-path comparison: FAILED, separate dependency-fetch blocker.** The explicitly authorized ordinary base-only Compose `build --no-cache mofacts` used the live checkout, the same explicitly bound local engine, and a distinct synthetic local-only tag ending `-default`. No capture override, proof check or builder-selection helper was on this build path. It failed with exit 1 after 119.63 seconds during `meteor update --npm`, before app compilation. Meteor's `ddp-server` requested pinned `uWebSockets.js` v20.66.0 via a Git HTTPS dependency; npm's failing Git invocation used an SSH URL and reported `ssh: not found` (npm error 128). The captured build had completed this same step successfully. The cause of that transport selection has not been established; do not infer a source mismatch, missing private credentials or a transient network problem from this error alone.

No default comparison image was produced. A fresh post-failure source capture reproduced the same digest as before the build. Default-build equivalence remains unproven and blocks overall Docker qualification, despite the successful captured build and structural smoke. No SSH package, credential, alternate source/version, retry policy or Dockerfile change was introduced. Repairing this separate dependency-fetch behavior requires a scoped follow-up decision. Three superseded/comparison temporary captures were removed through the helper's checked cleanup; original source and the repaired candidate remain intact. Local candidate image/workspace are retained for continuation, not published. Final watcher health, browser bundle, HMR and supervisor checks passed; the selected global context remained `desktop-linux` and unrelated working-tree edits were preserved. `git diff --check` passed. No TypeScript source changed in this repair, and no fresh Meteor integration invocation was authorized or performed.

### Authorized Docker qualification checkpoint — 2026-09-07

**Partial execution; not qualified.** The workstation's selected `desktop-linux` builder resolves to the local Docker Desktop Linux-engine named pipe. Installed versions: Docker client/engine 29.7.2, Docker Desktop 4.87.0, Buildx 0.36.1-desktop.1, BuildKit 0.32.2 and Compose 5.4.0; host Node 24.15.0. No builder was created or switched.

- Real PowerShell `prepare` passed in 14.61 seconds: 2,164 entries, 174,510,326 file bytes, dirty base `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`. Source digest: `cdfb842535ccdb9e2630c234a77b4fe8ba3bed653fc73ed6470edd417eae787c`.
- Real `verify` passed in 27.50 seconds: Windows extraction and fresh Linux BuildKit re-export produced the identical source digest, including paths, modes, directories and exact bytes. Subsequent verification exports also passed. This establishes the current snapshot's round trip, not all synthetic/edge-case acceptance fixtures.
- Source export used only the source target; BuildKit recorded nine completed steps, without app compilation. The measured snapshot is within current entry/byte limits. Windows uses inherited temporary-directory ACLs; this does not establish strong immutable sealing.
- A synthetic build-only environment selected the previously absent local tag `mofacts-qualification-local/mofacts-capture:qualification-20260907-9xztxa`. Real resolved Compose comparison found only the intended build-context difference. Compose dry run accepted the arguments; it is not build evidence.
- The actual helper build action failed before app compilation. Direct diagnosis of the same Compose build returned exit 1 from Buildx builder validation: `use docker --context=desktop-linux buildx to switch to context desktop-linux`. Explicit process `DOCKER_CONTEXT` and an explicit Docker `--context` invocation did not resolve it. No ordinary-build retry, alternate builder, dependency update or recipe change was used to bypass this failure.

The owned temporary candidate is retained locally for continuation; no raw inventory or private configuration is retained in this document. The localhost watcher remained running with health, browser bundle, HMR and supervisor ready. No app image was built, container started, push/deploy performed or Meteor integration rerun. Existing working-tree changes and the private production command sheet are unchanged. Actual app-build/default-path equivalence and exact-image smoke remain **NOT RUN**, pending resolution of the Compose/Buildx builder-selection blocker. This checkpoint supersedes older blanket Docker NOT RUN statements below, but does not close Phase 0 or authorize production integration.

### Authorized Meteor integration checkpoint — 2026-09-07

One explicitly authorized `npm.cmd run test:ci` invocation completed with **exit 0** from the app directory, with `CI=1` and the absolute checked-in `settings.ci.json` path. Toolchain: Meteor 3.5, Node 24.15.0, npm 11.12.1; installed Playwright Chromium. Harness: **16 passing**. Final Meteor report: **SERVER FAILURES: 0; CLIENT FAILURES: 0**. Client reporter: **961 passing, 7 pending**. The separate server passing count was not retained in the bounded output; do not treat 961 as a combined server/client total.

The canonical watcher was stopped before the run and restored afterward. Verified readiness: app health, executable browser bundle, HMR and supervisor ready; four active Change Streams. The harness removed test-driver resolutions, and the manifest checker confirms none remain; the pre-existing `.meteor/versions` diff is unchanged. An orphaned native test MongoDB process was matched to this run's temporary test directory, test port and exited parent, then stopped; no database files or unrelated processes were removed. No isolated Docker test container was created. Watcher restoration used its existing local Compose dependency lifecycle only.

This is a one-off authorized native Meteor integration result, not Linux CI, Docker capture/default-image equivalence or production qualification. No rerun, image build, push, remote deployment or code fix was performed. All pre-existing working-tree edits were preserved. This checkpoint supersedes the earlier NOT RUN Meteor entries below; Docker/image/host and source-capture integration gates remain open.

Phase 0 is in progress: the workflow/compatibility revision, pure draft release-identity contracts, local characterization foundation and approved opt-in source-capture prototype are implemented. The root Dockerfile shares the same source-copy owner with the capture target; ordinary build arguments/context and runtime instructions remain unchanged. The pre-existing manifest omissions are corrected. V1 report production/receipt and the production command sheet remain unchanged. Docker builds, native Meteor tests and isolated remote deployment have now been executed as recorded in the dated checkpoints. Phase 0 is **not complete**: supplemental source-test acquisition, source-bound Linux qualification, final in-image proof binding, release/host evidence ownership and retention, report-history compatibility and the protected remote security lanes remain open. See [the contract notes](security-audit-phase0-contracts.md) and [capture helper guide](../deploy/security-audit/source-capture.md) for exact scope and limitations.

| Phase | Source/documentation | Local execution | CI | Non-production / staging | Production | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 0: decisions and characterization | Draft contracts, characterization, manifest correction and opt-in capture prototype implemented; source-bound Linux runner/final proof unfinished | September checkpoint: 72 Phase 0, 50 capture, 30 source tests; October 4: full typecheck/lint and native Meteor run passed | Source-bound Linux qualification not run; native test result is separate | Isolated `staging2` deployed with matching image and healthy HTTPS/runtime; authenticated readiness and security lanes pending; older staging remains frozen | No production inspection or changes in this continuation | October 4 checkpoint, September checkpoints and contract notes |
| 1: P0 item 3, catalog/V2 | Not started; existing implementation remains V1 | Not run | Not run | Not run | Not deployed | `mofacts/common/securityAuditReport.ts`; V1 ingestion owner |
| 2: P0 item 2, authorization evidence | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 7 and 12 |
| 3: P0 item 1, runtime registry | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 8 and 12 |
| 4: closure | Not started | Not run | Not run | Not run | Not deployed | Plan Sections 16–21 |

## Verified workflow and compatibility decisions

- App source baseline: `main` at `74f0e68dc1bb353747d4bf49f0bb27eb72a43f4d`. Original audit baseline was `fa8dc09156500bb0458de3028a9e0ee11e4ae5c7`; the original plan was committed as `7070b8a7`.
- The operator identified config repo `deploy and build.txt`. Its production app section was read statically with private values omitted from retained evidence; no commands in it were executed. Last commit affecting that file: `ef2c3c6` (2026-08-23); no working-tree change to that file was present at review.
- It is a PowerShell command sheet, not `autobuild.sh` or the generic remote validator. It builds/pushes on the workstation and deploys via SSH/Compose. Local watcher, staging and sidecar sections are separate tasks.
- Existing behavior intentionally includes clean and uncommitted local builds, distinct tags, a base-commit OCI label, no-cache base-Compose build, production runtime overlay, post-push environment tag update, remote `--no-build --wait`, running tag/revision checks, Apache/CSP validation and a deployment-record write. The plan preserves them.
- The existing release record owns `deployedAtUtc`, `baseCommit`, `includedUncommittedLocalChanges`, `image`, `tag` and `digest`. Qualification will extend that owner; any host receipt is a bounded projection, not a competing release record.
- Current captured registry digest and running tag/revision checks do not establish the full published-platform/config-to-running-image mapping. A dirty build's base commit does not identify all its source. These are qualification gaps, not evidence that current deployments failed.
- The file does not itself establish explicit native-command exit propagation for every Docker/SSH/SCP call. Actual shell-session behavior was not inspected or assumed. No app-image rollback routine was found in its production section; existing Apache configuration rollback is distinct.
- CI builds a separate unpublished smoke image. Its source/test results cannot certify the exact workstation image.
- Existing staging remains frozen in the command sheet. The later explicit authorization provisioned and deployed a separate `staging2` target; it did not unfreeze the original target or authorize production changes.
- Missing audit identity/bundle/registry/test proof must produce truthful audit `ERROR`, not new startup, health, deploy, sign-in or learner restrictions. Existing security checks remain intact.
- Method/publication context and errors, synchronous collection rules, HTTP stacks/order/prefix/fallthrough and framework-owned authentication must remain equivalent. Final registry sealing follows all declared registration completion, not the end of `serverComposition.ts`.
- Active default-branch scanner code must remain compatible with the deployed receiver during development. The plan prefers keeping current active paths unchanged until atomic cutover; explicit scanner-release selection needs separate approval if that isolation is insufficient.

## Historical foundation evidence

This table preserves the earlier foundation checkpoint. Later dated checkpoints supersede its execution status; in particular, its combined Docker/staging/production `NOT RUN` row is not the current status of `staging2`.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run security:test:phase0` | PASS, 72 tests, exit 0 under Node 24.15.0 | Draft proof shape/consistency, current V1 membership and defect witnesses, selected synthetic policy/callback behavior and reviewed manifest entries |
| `npm run security:test:capture` | PASS, 44 tests, exit 0 | Synthetic bounded archive/digest checks and injected prepare/verify/build failure sequences; no actual Docker invocation |
| PowerShell wrapper syntax | PASS, parser only | Wrapper parses; not execution or Docker compatibility |
| `npm run security:test:source` | PASS, 30 tests, exit 0 before and after foundation changes | Existing source-security suite remains unchanged and passing |
| `npm run typecheck` | PASS, exit 0 | Full app TypeScript verification, including new shared contracts and pending Meteor parity cases |
| `npm run lint` | PASS, exit 0; server boundary and test-artifact checks pass | Full configured lint workflow; unrelated pre-existing harness changes preserved |
| `npm run security:surfaces` | PASS, exit 0 after reviewed manifest correction | Exact discovered-name agreement for the current syntactic checker; not runtime coverage or proof of every classification |
| `git diff --check` and document path/link checks | PASS | Source/document hygiene only |
| Meteor integration | PASS, authorized native run on 2026-09-07; exit 0, zero server/client failures | Existing full test-module discovery, including common tests; not Docker/Linux release evidence |
| Docker, staging, production | NOT RUN | No image, deployed behavior, host or release-confidence claim |

At that foundation checkpoint, the syntactic checker discovered 225 method entries, 27 publication entries, 6 HTTP entries, 18 export entries and 21 management-route entries (297 category entries). October 4 lint reports 300 entries. Neither count establishes unique, runtime-proven security surfaces: categories overlap and the checker still misses registration families.

The formerly stale manifest now includes the eight reviewed category entries:

- Methods: `exportDeploymentBrandProfile`, `getDeploymentBrandProfileDraft`, `getProgressiveAssignmentLaunch`, `importDeploymentBrandProfileDraft`, `publishDeploymentBrandProfile`, `saveDeploymentBrandProfileDraft`.
- Publication: `deploymentBrandProfile`.
- Export facet: `method:exportDeploymentBrandProfile` (also counted as a method above).

The five Brand Profile methods and export facet are `admin-only`: each calls the shared admin guard before accessing drafts. Progressive launch is `authenticated-self`: it derives availability from the caller's assigned/public course snapshot and checks release/member constraints; this label does not imply ownership of the assignment. The Brand Profile publication is `public` and selects the published settings key, not the draft. The reviewed DDP limiter registers method rules, not publication rules, so the checker now accepts a plain `public` label without claiming throttling. Labels are audit metadata, not enforcement. No application permission or rate-limit rule changed.

Existing `public-rate-limited` entries elsewhere have not been recertified by this correction; the coarse V1 labels still need owning-phase policy/evidence review. The manifest check failure is resolved, but this does not repair the checker's known discovery defects or establish a clean production security report. No staging, commit or push was attempted.

V1 full membership is frozen as 52 test-fixture IDs; exposure retains 20 scheduled controls plus two existing NOT_APPLICABLE placeholders. Eight WITNESS tests establish current false-green/coverage defects, not their remediation. Eleven selected compatibility tests characterize existing behavior, and one test checks the reviewed manifest entries; they are not complete Meteor/HTTP/provider integration coverage. The remaining 52 tests cover fixture/proof contracts, digest/import checks and negative mutations.

## Next Phase 0 work

1. **Current reconciliation completed:** baseline `18677291` has passing CI/Security, Linux capture and embedded image-source checks. Preserve all dated results as historical evidence; they do not establish the deployed revision or qualify later working edits. The current toolchain is recorded at the top of this document.
2. **Preserve the verified canonical Compose CI path.** Exact-commit CI and Security passed on `936a64aa`, including one Meteor invocation, one application compilation and native protection/receipt fixtures. No routine rerun or production procedure change is required merely to resume planning.
3. Validate complete/authenticated test evidence and join the protected candidate's source/config identity to final release proof. Pre-test sealing and the combined Compose lane now have passing CI evidence; qualification is still unqualified until remaining proof gates close. Retain recorded staging2 acceptance for its exact candidate/configuration; repeat only affected/unresolved acceptance with authorization. Ordinary build/startup behavior remains available without qualification metadata; dirty-source qualification stays separately opt-in.
4. Confirm external release-record readers and finish integration of the approved existing-record authority, bounded protected projection and immutable small-metadata history. Preserve the opt-in tooling implementation recorded above; validate concrete reader/destination access controls and rollback-image/evidence availability before live operation. Live command-sheet/host integration and acquired proof remain pending; private staging checkpoints are not authoritative release extensions.
5. Apply the settled no-historical-access/archive decision and qualify simplest safe new-report storage against the previous production image; do not delete/rewrite records. Secret recovery design/owner are selected as AWS Secrets Manager/Phil. Complete the [account/MFA recovery, size-fit, dedicated rollback retention and two-version staging2 restore gates](security-audit-durable-redesign-plan.md#aws-secrets-manager-recovery-design-approved-2026-11-02) under concrete setup/operation permissions before claiming recovery. GitHub copies and local DPAPI credentials do not establish those gates. Original staging remains frozen.
6. Complete remaining invocation/HTTP/provider/composition compatibility and remote qualification. Use staging2 with synthetic accounts/resources under the bounded offline/reset/rebuild permission; inventory enabled providers before binding tests. Preserve fresh per-invocation Meteor authorization, workflow/protected-host/production approvals, and exclusions for irreversible deletion, new persistent access/security-sensitive permissions and spending. Phil reviews one consolidated ambiguous/proposed policy-change list; clear preservation work proceeds with documented evidence.
7. Review the evidence against every Phase 0 exit requirement and close the gate before beginning Phase 1 / P0 item 3. Phase 1 remains independently deployable after its own qualification and coordinated cutover, without waiting for items 2 and 1. No passing health endpoint, native suite or local fixture suite alone closes Phase 0.

## Source references

The initial capture-design continuation was documentation-only. Its subsequent approved implementation added the opt-in helper, shared Docker source stage and an initial 44 synthetic capture tests, then reran the existing source checks. Later dated checkpoints record the expanded 50-test suite and actual Docker capture/round-trip/build execution. An initial lint error in the new path-validation expression was corrected without relaxing validation; full lint was rerun. The October 4 deployment used the ordinary canonical build rather than claiming completion of the unfinished qualification helper.

These are source pointers, not executable deployment instructions. Private hosts, image repository values, settings, credentials and raw records are deliberately omitted.

| Source | Relevant reviewed area |
| --- | --- |
| Config repo `deploy and build.txt` | Lines 75–77: staging freeze; 188–195: clean/dirty identity; 240–258: build/push/digest/tag update; 260–300: runtime transfer/deploy/verification; 302–322: existing release record |
| `deploy/docker-compose.yml`, root `Dockerfile` | Base build/image/source-label contract and current startup/dependency checks |
| `.github/workflows/ci.yml` | Source verification and separate runner-local Docker smoke job |
| `.github/workflows/production-security-audit.yml` | Scheduled default-branch checkout and independent scanner execution |
| `deploy/security-audit/host-exposure-audit.sh` | Current Docker config image-ID observation |
| `mofacts/server/main.ts`, `serverComposition.ts`, `startup/serverStartup.ts` | Static and startup registration ownership/order |
| `mofacts/server/publications.ts`, `methods/backupMethods.ts`, `lib/authSupport.ts` | Publication readiness, invocation context and authorization/validation order |
| `mofacts/common/Collections.ts` | Synchronous collection access rules |
| `mofacts/server/runtime/dynamicAssetsRoute.ts`, `http/health.ts`, `http/pwa.ts`, `http/socialPreview.ts`, `lib/memphisSaml.ts` | HTTP stack, mounted-prefix, dispatch, fallthrough and protocol behavior |
| `mofacts/packages/mofacts-microsoft-oauth/server/microsoft.js` | Package-owned OAuth service registration |

## Verification and scope limits

The Phase 0 foundation added pure shared modules, local tests, the phase0 test script and developer guidance. The manifest correction added eight entries and `public` classification support. The approved capture slice adds the shared Docker input stage, two source-acquisition modules, an opt-in PowerShell entry point, a capture-test script and maintainer documentation. V1 parser/assembler, registration paths, existing deployment scripts and workflows are untouched. No production application path loads the draft proof data. No dependency was added, no migration ran and no user-visible behavior or locale string changed.

An initial TypeScript syntax error in the new contract was caught by both Node and full typecheck, corrected, and both were rerun successfully. Final results are recorded above. No Meteor CI, Docker command, workflow action, host connection, build, push or deployment was run. The baseline surface-check failure was resolved through source-policy review and an explicit manifest/checker correction.

Unrelated pre-existing app-repository CI/test-harness edits were preserved, including the existing package lint/test-artifact edits; the new phase0 and capture test script entries are scoped additions to that file. The config command sheet, production overlay, private settings and environment files were not edited. The public capture guide documents the new opt-in commands and their limitations. Existing production/wiki procedures remain unchanged until actual qualification and command-sheet integration.
