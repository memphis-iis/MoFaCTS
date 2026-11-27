# Staging2 catalog v2 control evidence

Reviewed November 25–26, 2026 for the accepted staging2 deployment. The application source is
`e9d14a25b21eaece8cea377c787052e7896d0bfe`, and its deployed Linux/amd64 image is
`ppavlikmemphis/mofacts-staging2@sha256:6699dc3fac40d9ca84564c265aa9cd587eb2628f50268f1ed79c1e7879079887`.
The next Full report uses the current application start `2026-11-26T21:53:15.59940657Z`, after the accepted image was restored following Google owner enrollment.

| Section | Passed | Findings | Needs evidence |
| --- | ---: | ---: | ---: |
| External | 9 | 0 | 3 |
| Authentication | 10 | 0 | 12 |
| Host | 10 | 0 | 1 |
| Repository and image | 21 | 4 | 0 |
| **Total** | **50** | **4** | **16** |

Use this register as the current checklist for staging2 control observations.
Start with unchecked rows marked **Needs evidence**. For each control, reuse
the accepted observation while the target, image, catalog and relevant inputs
match the evidence requirements. Record the changed input before rerunning an
affected check. After verifying a new outcome, update its existing row and
retain the receipt, source and actual observation window with the evidence.

A checked row has a verified observation. Track each finding's repair in the
[remediation checklist](#findings-retained-for-remediation) until its acceptance
condition is verified.
The Phase III gate requires one matched catalog v2 Full report, independent
receiver readback and saved archive verification. Historical authentication and
synthetic integration results retain their original scope.

## External controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [x] Pass | `external.dns-addresses` | Public DNS returned one IPv4 address and zero IPv6 addresses. |
| [ ] Needs evidence | `external.public-tcp-ports.standard` | Needs a complete public TCP reachability result for the resolved address, including the required web ports and other ports in this tier. |
| [ ] Needs evidence | `external.public-tcp-ports.sensitive` | Needs public reachability evidence for the catalog’s sensitive TCP tier. Host listener and firewall checks passed. |
| [ ] Needs evidence | `external.public-udp-ports` | Host UDP listeners, Docker publications and firewall matched policy. Conclusive results for the selected public UDP endpoints are still required. |
| [x] Pass | `external.http-redirect` | All three catalog requests redirected to the same HTTPS host, preserving path and query. |
| [x] Pass | `external.tls-protocols` | The public endpoint returned explicit protocol-version alerts for TLS 1.0 and 1.1. Trusted TLS 1.2 and 1.3 handshakes succeeded. All four outcomes were observed on the sole public address. |
| [x] Pass | `external.certificate` | Hostname and trust-chain validation passed on both supported modern connections. The certificate had 67 days remaining. |
| [x] Pass | `external.tls-ciphers` | Named HTTPS handshakes on the sole public address found six accepted cipher suites and zero weak suites across TLS 1.2 and 1.3. The installed image graph verifier matched the accepted app configuration after the observation. |
| [x] Pass | `external.websocket-tls` | The sole address upgraded the HTTPS request with HTTP 101 and redirected the HTTP request with HTTP 301. |
| [x] Pass | `external.hsts` | The live HTTPS response met the one-year HSTS requirement. |
| [x] Pass | `external.csp` | All five CSP conditions matched the existing evaluator. |
| [x] Pass | `external.security-headers` | All four frame, MIME, referrer and permissions header checks matched. |

## Authentication controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [ ] Needs evidence | `authentication.enumeration` | Needs the paired outcomes for known and unknown test identities across login and reset, with the required successful baselines. |
| [ ] Needs evidence | `authentication.timing` | Needs the catalog’s complete paired latency samples for known and unknown test identities. The ordinary sign-in established session lifetime only. |
| [x] Pass | `authentication.reset-token.expired-rejected` | A fresh link changed the first disposable account's password. The second account's unused link was rejected after its one-hour lifetime and its original password still worked. All five catalog cases and independent cleanup passed. |
| [ ] Needs evidence | `authentication.reset-token.current-single-use` | Needs the matching-release owned reset workflow’s first-use success and one-time-use evidence. |
| [ ] Needs evidence | `authentication.reset-token.replay-rejected` | Needs evidence of used-token rejection with a successful first use in the same qualified fixture window. |
| [ ] Needs evidence | `authentication.session-revocation` | Ordinary logout cleared the synthetic learner’s browser session. The control still needs server-side invalidation evidence for old sessions after both logout and password reset. |
| [x] Pass | `authentication.session-lifetime` | A fresh session for the confirmed synthetic learner had an observed lifetime within 30 days. The account signed out successfully. |
| [x] Pass | `authentication.material-leakage` | Page content, URLs, cookies, console and outgoing requests passed the bounded disclosure checks for the ordinary learner sign-in and passwordless return. The observer checked the synthetic password and issued session credentials in their applicable flows. |
| [ ] Needs evidence | `authentication.authorization` | Needs the complete live allow-and-deny case vector across methods, publications, management routes and downloads with the required actor and resource baselines. |
| [x] Pass | `authentication.passwordless.resume-token-issued` | The sealed study link issued a resume credential for the existing synthetic participant with saved progress. |
| [x] Pass | `authentication.passwordless.token-login` | The newly issued credential established the participant session in a fresh Chrome context. |
| [x] Pass | `authentication.passwordless.participant-identity` | The authenticated account and session matched the synthetic participant. |
| [x] Pass | `authentication.passwordless.experiment-eligibility` | The participant started with saved progress and no experiment flag or password. The session recovered the same owned progress before and after reload. |
| [x] Pass | `authentication.passwordless.sealed-target-binding` | The authenticated participant was bound to the assigned sealed study target. |
| [ ] Needs evidence | `authentication.passwordless.modified-target-rejected` | Needs the changed-target outcome from the live fixture with the valid login and alternate-target baselines required by the catalog. |
| [ ] Needs evidence | `authentication.passwordless.admin-denied` | Needs the matching passwordless denial and successful administrator baseline on the same release. |
| [ ] Needs evidence | `authentication.passwordless.ordinary-account-denied` | Needs the study-session restriction outcome alongside the positive ordinary-account baseline. |
| [x] Pass | `authentication.passwordless.assigned-experiment-allowed` | The study session received the full assigned lesson, including its unit list. |
| [ ] Needs evidence | `authentication.passwordless.cross-user-method-denied` | Needs the approved live fixture’s cross-user method restriction with its authorized positive baseline. |
| [ ] Needs evidence | `authentication.passwordless.cross-user-publication-contained` | Needs the live fixture’s bounded publication result against a known other-user synthetic record and its positive baseline. |
| [x] Pass | `authentication.passwordless.token-not-leaked` | All five bounded browser channels completed with zero matches outside the expected own-session handoff. |
| [ ] Needs evidence | `authentication.throttling` | Needs the three distinct connection, identifier and IP throttle outcomes with successful login baselines and scope attribution. |

## Host controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [x] Pass | `internal.audit-config` | All 17 required values were present. Ownership and mode matched the root-only configuration requirements. |
| [x] Pass | `internal.listening-sockets.standard` | Classified all 19 listeners. The standard tier had zero unexpected listeners, including UDP. |
| [x] Pass | `internal.listening-sockets.sensitive` | Classified all 19 listeners. The sensitive tier had zero unexpected listeners, including UDP. |
| [x] Pass | `internal.app-loopback` | The required application listener was present on loopback port 3000. |
| [x] Pass | `internal.sidecar-loopback` | All nine running and stopped containers were checked against the reviewed policy. Zero sidecar helpers, listeners, endpoint declarations or publications were observed under the required absence setting. |
| [x] Pass | `internal.docker-ports` | All three core containers matched publication and network policy. The expected application loopback publication was present. |
| [x] Pass | `internal.firewall` | The active policy defaulted to inbound deny, allowed public web access and scoped management SSH. The classifier found no unexpected allow rules. |
| [x] Pass | `internal.reverse-proxy-routes` | Apache was active and passed its syntax test. The configured host and all four upstream entries matched the loopback route policy. |
| [ ] Needs evidence | `internal.mongodb-auth.unauthenticated-access` | The running private MongoDB service had `--auth` and a keyfile configured. The catalog still requires direct evidence that the service rejected a credential-free data-access command. |
| [x] Pass | `internal.mongodb-auth.scoped-roles` | Authenticated connectivity, replica set, app grants, read-concern role and the expected sidecar account state all matched. |
| [x] Pass | `internal.redis-auth` | Redis returned `NOAUTH` for a credential-free health ping. The host-auditor and application credentials both returned `PONG`. Docker published zero Redis ports, and both containers retained their identity throughout the check. |

## Repository and image controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [x] Pass | `repository.git-history-secrets` | Gitleaks found zero findings in 1,139 commits reachable from the exact clean source revision. The redacted scanner used the repository-pinned release. |
| [x] Finding | `repository.dependencies-application-runtime.low` | The application runtime audit found 2 affected low-severity package records. |
| [x] Finding | `repository.dependencies-application-runtime.medium` | The application runtime audit found 2 affected moderate-severity package records. |
| [x] Pass | `repository.dependencies-application-runtime.high` | The application runtime audit found zero affected high-severity package records. |
| [x] Pass | `repository.dependencies-application-runtime.critical` | The application runtime audit found zero affected critical-severity package records. |
| [x] Pass | `repository.dependencies-application-development.info` | Application lockfile comparison showed zero confirmed info-severity build exposures. The development group has 24 maintenance advisory packages. |
| [x] Pass | `repository.dependencies-application-development.low` | Application lockfile comparison showed zero confirmed low-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.medium` | Application lockfile comparison showed zero confirmed moderate-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.high` | Application lockfile comparison showed zero confirmed high-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.critical` | Application lockfile comparison showed zero confirmed critical-severity build exposures. |
| [x] Pass | `repository.dependencies-sidecar-mongo-runtime.low` | The mongo sidecar runtime audit found zero affected low-severity package records. |
| [x] Finding | `repository.dependencies-sidecar-mongo-runtime.medium` | The mongo sidecar runtime audit found 2 affected moderate-severity package records. |
| [x] Pass | `repository.dependencies-sidecar-mongo-runtime.high` | The mongo sidecar runtime audit found zero affected high-severity package records. |
| [x] Pass | `repository.dependencies-sidecar-mongo-runtime.critical` | The mongo sidecar runtime audit found zero affected critical-severity package records. |
| [x] Pass | `repository.dependencies-sidecar-mongo-development.info` | Mongo sidecar lockfile comparison showed zero confirmed info-severity build exposures. The development group has 0 maintenance advisory packages. |
| [x] Pass | `repository.dependencies-sidecar-mongo-development.low` | Mongo sidecar lockfile comparison showed zero confirmed low-severity build exposures. |
| [x] Pass | `repository.dependencies-sidecar-mongo-development.medium` | Mongo sidecar lockfile comparison showed zero confirmed moderate-severity build exposures. |
| [x] Pass | `repository.dependencies-sidecar-mongo-development.high` | Mongo sidecar lockfile comparison showed zero confirmed high-severity build exposures. |
| [x] Pass | `repository.dependencies-sidecar-mongo-development.critical` | Mongo sidecar lockfile comparison showed zero confirmed critical-severity build exposures. |
| [x] Pass | `repository.security-surface-contract` | Reused the accepted image and runtime registry binding. The clean exact checkout passed the ownership checker, and all 248 required installed cases matched. |
| [x] Pass | `repository.sensitive-logging` | The registered source classifier found zero flagged files across 223 server source files. |
| [x] Pass | `repository.source-security-tests` | The approved paired verifier matched all 478 required cases on the same commit and pinned runtime. The unfiltered Linux transcript recorded 474 passes. The Windows transcript passed exactly the four matched Windows-only cases. |
| [x] Finding | `repository.runtime-image-vulnerabilities.high` | The pinned Trivy scan of the verified Linux/amd64 release manifest reported four high-severity findings. |
| [x] Pass | `repository.runtime-image-vulnerabilities.critical` | The same pinned Trivy scan reported zero critical findings on the verified Linux/amd64 release manifest. |
| [x] Pass | `repository.client-bundle-canaries` | The exact staging2 platform image had 498 files across `web.browser` and `web.browser.legacy`. None contained the approved synthetic server-only encryption value from `mofacts/settings.ci.json`. |

## Retained evidence

The private `staging2-phase3-e9d14a25/attempt2/controls-20261125` directory holds
the bounded public HTTP, DNS, certificate and WebSocket results, the synthetic
learner session-lifetime result, read-only host measurements, the sidecar inventory,
the repository audit results and the two source-suite summaries. The accepted
workstation authority and host receipt matched before and after the host checks.

The `tls-versions.json` and `redis-auth.json` receipts bind the four public
TLS handshakes and the private Redis health checks to the accepted staging2
source and platform manifest. The checks retained protocol outcomes, booleans
and the published-port count. The Redis check used only `PING` and ordinary
authentication within the private service network.

The retained `passwordless-positive-3e731f3f7af5.json` receipt records seven
passing controls on the same `e9d14a25` application. Fixture preparation used
the committed three-record helper at `b8c9c82a`. Browser acquisition and the
control evaluator used the exact deployed source. The fixture contained only
the synthetic participant, its assigned lesson and its saved progress. Verified
the same owned progress after reload, signed out the browser sessions and
independently confirmed namespace and lock removal. The deployed image remained
healthy and matched its original identity. Earlier setup attempts stopped before
creating any fixture account or data. Their recovery receipts show empty
namespaces and released locks.

The separate `ordinary-login-disclosure.json` receipt adds the verified learner
sign-in to the same five browser channels. All five passed against the synthetic
password and fresh session credential. The second observation used the app's
session-storage contract after the first observer looked in local storage.
Verified logout and the same deployed image before and after the accepted run.
Password reset retains its separate controls and evidence requirements.

The `browser-bundle-canaries.json` receipt records 498 inspected files and zero
matches for the approved CI test value. The scan verified the selected image's
configuration digest against the accepted release, ran as a non-root user in a
read-only container without networking, and confirmed its container and
temporary files were removed. The staging2 release remained healthy and retained
its identity. The first setup failed while launching the image's Alpine Node
executable on the host. The existing pinned Linux Node runtime resolved that
setup issue. The next attempt exposed the private umask's effect on the scanner file.
The committed operator fix `1b64b274` sets the file mode explicitly inside the
private workspace and was the only tooling change layered over the deployed
source for the passing observation. The hosted workflow still needs canary input
preparation before its repository step can repeat the scan.

The `mongodb-startup-configuration.json` receipt confirms that the running,
private MongoDB service used `--auth` and a replica-set keyfile on this release.
Operator change `4d3bf555` bounds the collector's read check to a filter that
matches no records. All 16 focused Linux tests and full lint passed. Automatic
approval review blocked the live check because it issues a database read
without credentials. The configuration receipt leaves the direct denial
observation open.

The `full-report-and-provider-readiness.json` receipt records four recent
report rows and one historical Full report. It found zero Full reports for the
active catalog and exact deployment. The public application configuration
reported Memphis SAML disabled. `provider-preparation.json` verifies Google
prepared its expected staging2 callback. The browser intercepted provider
requests before they left staging2. Microsoft showed a configuration error
after the browser's configuration subscription was ready. The separately
retained `microsoft-startup-flags.json` confirms the application's missing
Microsoft settings marker. The staging credential labels, deployment notes and
audit records reviewed identify no designated provider test identities. Live
Google sign-in evidence requires an approved test identity. Microsoft also
requires a provider registration that permits the staging2 callback and a
protected runtime configuration for that registration.

On November 26, the signed-in Entra portal matched the application ID in
staging's settings to the existing MoFaCTS registration. Its two Web callbacks
serve staging and production. Adding
`https://staging2.optimallearning.org/_oauth/microsoft` there would extend the
registration that serves production. The review was read-only.

The operator approved a separate **MoFaCTS Staging2** registration and the
Microsoft platform policies. The saved registration has exactly one Web
callback at the staging2 address above and supports organizational and
personal accounts, matching the installed sign-in flow. The ungranted default
Microsoft Graph `User.Read` configuration remains because automatic approval
review required specific approval to remove it. The app requests OpenID
scopes. The new 90-day credential was saved and verified in the protected
Desktop store, then delivered over pinned SSH. The prior settings were backed
up before installing the Microsoft block. The app restarted on the accepted
image with its root-owned, mode 0600 settings mounted read-only. HTTPS returned
200 and the enforced CSP and other Compose services matched their prior state.

The protected `microsoft-runtime-20261126.json` receipt records the configuration
and browser observation. The staging2 login button opened the Microsoft sign-in
page with the new app registration and exact staging2 callback. A successful
account sign-in with an approved Microsoft test identity remains open.

The protected `google-runtime-20261126.json` receipt records the expected
staging2 callback and the presence of a client parameter. On the operator’s
approved test sign-in, Google returned `401 invalid_client`. A fresh Chrome
session reproduced a request with the expected callback and
`client_id=undefined`. A pinned read-only check confirmed the running staging2
app’s private settings have neither Google credential field. The Google OAuth
client must authorize the exact staging2 callback before a complete round trip
is possible. The operator approved both provider test accounts. See the
[operator handoff](../deploy/security-audit/staging2-v2-operations.md#provider-sign-in-evidence).

The operator approved a separate **MoFaCTS Staging2** Google Web client. The
encrypted Desktop credential and root-private settings backup passed actual
readback. Only the staging2 app was recreated. It restarted at
`2026-11-26T18:51:45.827427509Z` with the same previously accepted image and
matching HTTPS health and CSP. A clean Chrome session matched the outgoing
client ID and callback. Google returned HTTP 302 to its signed-out identifier
page. The protected `google-installed-20261126.json` receipt records that
scope.

On November 26, the operator confirmed a signed-in return to staging2 with
Microsoft. The Google attempt returned to MoFaCTS and displayed `Username
already exists [403]`. The application derives the username from the canonical
email and the installed Meteor package rejects duplicates on insert. The
application's pre-insert guidance skipped the unresolved account lookup promises.
A read-only check matched one password account with no linked Google identity.
It is the configured staging2 owner and administrator, with lessons, uploads,
learner history and saved progress. User Admin protects that account from
deletion. A temporary staging2 enrollment image required Google's verification
of the exact approved Gmail address. It bound that identity to the existing
owner on a successful live sign-in. The operator confirmed the signed-in
return. The controller matched the owner's successful Google audit event,
administrator role and ownership checks. It restored the accepted image,
verified the same binding after restoration and removed the temporary settings.
Both provider sign-ins now have live acceptance evidence. Their results sit
alongside the 70 catalog controls.

On pinned Node 24.22.1, the catalog v2 validators accepted 52 measured outcomes
from 14 retained receipts, including all four findings. The 25 repository and
image controls form a complete canonical producer file. The private packet
`attempt2/catalog-v2-full-inputs-20261126` retains those bytes and the per-control
receipt references and hashes. It also names the 18 missing observations. The
retained runtime measurements keep their original observation windows. A
November 26 recheck matched all 14 retained receipt hashes and validated the
existing outcomes against all five catalog v2 producer contracts in memory.
The first unsigned review preserved all 18 missing measurements as execution
errors. At 22:12 UTC on November 26, the TLS cipher observation supplied one
additional measurement. The protected receipt `tls-cipher-observation.json` has
SHA-256 `1eff22f8425a1b396692bf4eb240528e927b2d006a012e1e1ff597fce01cdb13`.
The installed staging2 image graph verifier then matched the accepted
configuration digest and the restored application start.

Pinned tool `b38039d8d9ca3ccc733b821c0315f25672ff880e` assembled and read back the
revised unsigned review in `/var/tmp/mofacts-full-review.1aZZUDhK/review-with-verified-tls`.
The report SHA-256 is `50c266bbbd411c88cde1874bd147c9bce65b5a5faedafad9792f922a4468a9d3`. Its 70 rows
hold 49 passes, four findings and 17 execution errors for outstanding observations.
The scoped worker at `63e902cb` completed all five expiry cases on `e9d14a25`.
It verified ordinary first use of a fresh link, rejection of a separately owned
unused link after one hour and successful sign-in with the second account's
original password. Both test accounts and reset records were removed, the
administrator signed out, and independent readback confirmed no remaining
worker, lease or temporary application files. The protected receipt has SHA-256
`e7c97e5045e1319611ed94043b057209728a50e9947ebe4594e096b7e8cd6157`.

The unsigned review in `/var/tmp/mofacts-full-review.1aZZUDhK/review-with-verified-expiry` now holds 50 passes, four findings and 16
execution errors. Its SHA-256 is
`20c83ccff0c73579ad1b38bfd9da703451b0a58918b18c20bab3549e9bc78a3d`. The receiver had zero catalog v2 Full reports for the
restored release at the last metadata check. Live qualification still requires
the 16 observations above, signed ingestion, independent receiver readback and
verified saved archive.

The exact catalog v2 policy set was unavailable at the installed host path.
The review used temporary root-private copies of the exact source policies and
verified their removal. The formatted Docker inventory was incomplete, so the
sidecar check used a complete on-host JSON projection of the same six allowlisted
fields and evaluated the same reviewed policy. The Docker and host observations
contained counts and policy measurements.

The first source-suite invocation inherited restrictive fixture permissions.
Running with the documented fixture permissions resolved the seven execution
failures. The approved verifier used the retained Linux transcript and the
separate same-commit Windows transcript. Both recorded zero failures. The
verifier matched the exact Windows case names to the Linux skips and accounted
for all 478 cases. Slot 108 and the prior accepted release binding supplied the
installed registry evidence.

The redacted history receipt and exact-image inventory are retained alongside
that paired result. Both scanner executables were obtained in temporary storage
and verified against their pinned archives. The temporary tools and cache were
removed after inspection. [Gitleaks release assets](https://github.com/gitleaks/gitleaks/releases/expanded_assets/v8.30.1) ·
[Trivy release assets](https://github.com/aquasecurity/trivy/releases/expanded_assets/v0.69.3)

[Canonical audit status](security-audit-durable-redesign-status.md#phase-3-remaining-work-reconciled-2026-11-21)

## Findings retained for remediation

Repository ownership follows the [project code owner](../.github/CODEOWNERS).
These priorities use the catalog severity. Remediation and verification
belong to the affected component's next release.

| Repair | Finding | Priority | Owner | Acceptance condition |
| --- | --- | --- | --- | --- |
| [ ] Open | `repository.runtime-image-vulnerabilities.high` | High | Release maintainer | The pinned image scanner finds zero high-severity vulnerabilities on the replacement Linux/amd64 manifest and the release receipt matches that manifest. |
| [ ] Open | `repository.dependencies-application-runtime.medium` | Moderate | Application dependency maintainer | The reviewed runtime dependency audit for the exact replacement app lockfile reports zero moderate-severity affected package records. |
| [ ] Open | `repository.dependencies-sidecar-mongo-runtime.medium` | Moderate | Mongo sidecar maintainer | The reviewed runtime dependency audit for the exact replacement sidecar lockfile reports zero moderate-severity affected package records. |
| [ ] Open | `repository.dependencies-application-runtime.low` | Low | Application dependency maintainer | The reviewed runtime dependency audit for the exact replacement app lockfile reports zero low-severity affected package records. |
