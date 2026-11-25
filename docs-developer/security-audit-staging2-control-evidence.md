# Staging2 catalog v2 control evidence

Reviewed November 25, 2026 for the accepted staging2 deployment. The application source is
`e9d14a25b21eaece8cea377c787052e7896d0bfe`, and its deployed Linux/amd64 image is
`ppavlikmemphis/mofacts-staging2@sha256:6699dc3fac40d9ca84564c265aa9cd587eb2628f50268f1ed79c1e7879079887`.
The report gate uses the deployment start `2026-11-25T18:08:10.948Z`.

| Section | Passed | Findings | Needs evidence |
| --- | ---: | ---: | ---: |
| External | 8 | 0 | 4 |
| Authentication | 1 | 0 | 21 |
| Host | 10 | 0 | 1 |
| Repository and image | 20 | 4 | 1 |
| **Total** | **39** | **4** | **27** |

The existing Phase III gate still requires one matched catalog v2 Full report,
independent receiver readback and saved archive verification. These individual
observations are recorded against the existing catalog. The historical authentication
qualification and synthetic integration results retain their original scope.

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
| [ ] Needs evidence | `external.tls-ciphers` | Needs a complete accepted-cipher inventory and its weak-cipher classification for the resolved public address. |
| [x] Pass | `external.websocket-tls` | The sole address upgraded the HTTPS request with HTTP 101 and redirected the HTTP request with HTTP 301. |
| [x] Pass | `external.hsts` | The live HTTPS response met the one-year HSTS requirement. |
| [x] Pass | `external.csp` | All five CSP conditions matched the existing evaluator. |
| [x] Pass | `external.security-headers` | All four frame, MIME, referrer and permissions header checks matched. |

## Authentication controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [ ] Needs evidence | `authentication.enumeration` | Needs the paired outcomes for known and unknown test identities across login and reset, with the required successful baselines. |
| [ ] Needs evidence | `authentication.timing` | Needs the catalog’s complete paired latency samples for known and unknown test identities. The ordinary sign-in established session lifetime only. |
| [ ] Needs evidence | `authentication.reset-token.expired-rejected` | Needs a matching-release reset fixture for expiry rejection, successful current-token baseline and preservation of the prior password. |
| [ ] Needs evidence | `authentication.reset-token.current-single-use` | Needs the matching-release owned reset workflow’s first-use success and one-time-use evidence. |
| [ ] Needs evidence | `authentication.reset-token.replay-rejected` | Needs evidence of used-token rejection with a successful first use in the same qualified fixture window. |
| [ ] Needs evidence | `authentication.session-revocation` | Ordinary logout cleared the synthetic learner’s browser session. The control still needs server-side invalidation evidence for old sessions after both logout and password reset. |
| [x] Pass | `authentication.session-lifetime` | A fresh session for the confirmed synthetic learner had an observed lifetime within 30 days. The account signed out successfully. |
| [ ] Needs evidence | `authentication.material-leakage` | Needs complete bounded observations of page content, URLs, cookies, console and outgoing requests for the current authentication flows. |
| [ ] Needs evidence | `authentication.authorization` | Needs the complete live allow-and-deny case vector across methods, publications, management routes and downloads with the required actor and resource baselines. |
| [ ] Needs evidence | `authentication.passwordless.resume-token-issued` | Needs a fresh owned sealed experiment fixture and observation that normal resume issues the participant credential. |
| [ ] Needs evidence | `authentication.passwordless.token-login` | Needs a successful participant session from that newly issued credential on this release. |
| [ ] Needs evidence | `authentication.passwordless.participant-identity` | Needs observation that the new study session identifies the expected fixture participant. |
| [ ] Needs evidence | `authentication.passwordless.experiment-eligibility` | Needs the live fixture’s experiment marker or verified owned progress for its resolved participant. |
| [ ] Needs evidence | `authentication.passwordless.sealed-target-binding` | Needs confirmation that the authenticated fixture session is tied to its assigned sealed target. |
| [ ] Needs evidence | `authentication.passwordless.modified-target-rejected` | Needs the changed-target outcome from the live fixture with the valid login and alternate-target baselines required by the catalog. |
| [ ] Needs evidence | `authentication.passwordless.admin-denied` | Needs the matching passwordless denial and successful administrator baseline on the same release. |
| [ ] Needs evidence | `authentication.passwordless.ordinary-account-denied` | Needs the study-session restriction outcome alongside the positive ordinary-account baseline. |
| [ ] Needs evidence | `authentication.passwordless.assigned-experiment-allowed` | Needs normal access to the assigned experiment using the scoped fixture session. |
| [ ] Needs evidence | `authentication.passwordless.cross-user-method-denied` | Needs the approved live fixture’s cross-user method restriction with its authorized positive baseline. |
| [ ] Needs evidence | `authentication.passwordless.cross-user-publication-contained` | Needs the live fixture’s bounded publication result against a known other-user synthetic record and its positive baseline. |
| [ ] Needs evidence | `authentication.passwordless.token-not-leaked` | Needs bounded normal passwordless-flow observations for unintended token disclosure in the required browser channels. |
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
| [ ] Needs evidence | `internal.mongodb-auth.unauthenticated-access` | Needs the catalog’s direct unauthenticated data-access rejection observation. Authenticated scope and connectivity were verified separately. |
| [x] Pass | `internal.mongodb-auth.scoped-roles` | Authenticated connectivity, replica set, app grants, read-concern role and the expected sidecar account state all matched. |
| [x] Pass | `internal.redis-auth` | Redis returned `NOAUTH` for a credential-free health ping. The host-auditor and application credentials both returned `PONG`. Docker published zero Redis ports, and both containers retained their identity throughout the check. |

## Repository and image controls

| Status | Catalog ID | Observation or evidence still required |
| --- | --- | --- |
| [x] Pass | `repository.git-history-secrets` | Gitleaks found zero findings in 1,139 commits reachable from the exact clean source revision. The redacted scanner used the repository-pinned release. |
| [ ] Finding | `repository.dependencies-application-runtime.low` | The application runtime audit found 2 affected low-severity package records. |
| [ ] Finding | `repository.dependencies-application-runtime.medium` | The application runtime audit found 2 affected moderate-severity package records. |
| [x] Pass | `repository.dependencies-application-runtime.high` | The application runtime audit found zero affected high-severity package records. |
| [x] Pass | `repository.dependencies-application-runtime.critical` | The application runtime audit found zero affected critical-severity package records. |
| [x] Pass | `repository.dependencies-application-development.info` | Application lockfile comparison showed zero confirmed info-severity build exposures. The development group has 24 maintenance advisory packages. |
| [x] Pass | `repository.dependencies-application-development.low` | Application lockfile comparison showed zero confirmed low-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.medium` | Application lockfile comparison showed zero confirmed moderate-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.high` | Application lockfile comparison showed zero confirmed high-severity build exposures. |
| [x] Pass | `repository.dependencies-application-development.critical` | Application lockfile comparison showed zero confirmed critical-severity build exposures. |
| [x] Pass | `repository.dependencies-sidecar-mongo-runtime.low` | The mongo sidecar runtime audit found zero affected low-severity package records. |
| [ ] Finding | `repository.dependencies-sidecar-mongo-runtime.medium` | The mongo sidecar runtime audit found 2 affected moderate-severity package records. |
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
| [ ] Finding | `repository.runtime-image-vulnerabilities.high` | The pinned Trivy scan of the verified Linux/amd64 release manifest reported four high-severity findings. |
| [x] Pass | `repository.runtime-image-vulnerabilities.critical` | The same pinned Trivy scan reported zero critical findings on the verified Linux/amd64 release manifest. |
| [ ] Needs evidence | `repository.client-bundle-canaries` | Needs the approved synthetic canary inputs and their completed scan of the actual deployed image’s compiled browser bundle. |

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
