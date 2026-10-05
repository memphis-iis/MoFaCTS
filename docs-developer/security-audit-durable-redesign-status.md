# Security Audit Durable Redesign Status

Updated: 2026-10-04.

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

1. **Record reconciliation completed on October 4:** retain historical results and identify the isolated deployed candidate, latest native integration result, and checks still missing. The manifest correction and bounded local capture/build/application smoke checkpoints remain established within their recorded scope.
2. **Next: qualify the staging baseline when explicitly authorized.** Verify administrator signup/login, email verification/delivery, authenticated deployment readiness, a synthetic learner flow, HTTPS/proxy/header/cookie behavior and effective host exposure. These checks establish the environment prerequisite; they do not replace the planned report-contract, restricted-host or authorization/runtime qualification lanes.
3. Implement and verify supplemental test-input acquisition, the supported source-bound Linux test runner, sealing and final in-image source-proof binding. The opt-in capture helper emits unqualified outcomes only. Use the recorded real capture/round-trip/build results as bounded prior evidence; do not repeat the obsolete blanket claim that Docker has never run. Preserve ordinary build/startup behavior when qualification metadata is unavailable.
4. Confirm external release-record readers, protected host projection destination/owner and retained rollback history. The optional record-extension parser and bounded command/image observations are implemented, but not integrated into the production command sheet, host script or storage. The private staging deployment checkpoint is not a substitute for that authoritative release-record extension.
5. Resolve V1 historical-read approval and qualify previous-image storage/list/latest/download behavior before V2 cutover. Confirm the recoverable protected fixture owner and restore procedure using non-production values. Available private staging credentials do not settle the automated fixture-storage contract; the original staging remains frozen.
6. Complete the remaining invocation/HTTP/provider/composition compatibility cases and the separately authorized remote qualification work. Inventory enabled providers before selecting test bindings; use synthetic accounts/resources and no production learner data. Each Meteor rerun, workflow dispatch, restricted host-tool install and broader qualification action needs the authorization specified by the plan; completed build/deploy permission is not blanket security-probe permission.
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
