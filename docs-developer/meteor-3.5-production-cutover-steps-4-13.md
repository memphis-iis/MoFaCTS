# Meteor 3.5 Production Cutover Plan: Steps 4-13

## Purpose and current position

This document is the production-only execution plan for the remaining Meteor
3.5 cutover. It begins after the release-preparation gates and keeps each
production-changing action separately reviewable.

Steps 1-3 were completed on 2026-08-04:

1. The final read-only production preflight passed.
2. The exact deployment inputs were staged, without changing the active
   deployment, at `/var/www/mofacts-releases/2d292a1a`.
3. The staged files, permissions, Compose configuration, and immutable image
   identity were verified.

Approved release identity:

- Application commit:
  `2d292a1a714d2b89daea4ec07fe69f8810cdee58`
- Image: `ppavlikmemphis/mofacts-mini:prod-2d292a1a`
- Registry digest:
  `sha256:c834eb0af90de048929c382ba2ec9c742c150f9b54ca8677f1c07024be2d79e1`
- Initial production reactivity: `METEOR_REACTIVITY_ORDER=polling`
- Initial DDP transport: `DDP_TRANSPORT=sockjs`

The currently deployed application remains active until Step 4. This plan does
not create a second production system. The existing production host, MongoDB
data volume, logical database, and writer authority remain canonical throughout
the cutover.

## Execution rules

- Production only. The staging environment is frozen and must not be contacted
  or changed.
- Select a new maintenance window before Step 4. Record both the start and the
  promised restoration time in Central Time; the prior August 4 window has
  expired.
- Steps 4-11 are separate authorization and verification gates. After each
  gate, stop and report pass or fail before proceeding.
- Keep the maintenance page active from the beginning of Step 4 until Step 12
  accepts the upgraded application.
- Never print secrets, connection strings, private keys, raw production data,
  or learner identifiers in commands, logs, or retained evidence.
- A failed gate stops the cutover. Do not continue by weakening a check or
  substituting an unplanned configuration.
- Keep `C:\dev\mofacts_config\deploy and build.txt` current. If execution
  discovers that an operational command or invariant differs from that private
  operator checklist, correct, verify, commit, and push the checklist before
  relying on the changed procedure.
- Production starts on polling. Change Streams are not enabled during Steps
  4-12.

## Maintenance-window record

Complete these fields before Step 4:

- Maintenance date: `2026-08-05`
- Start time, Central: `10:01 AM CDT`
- Expected restoration time, Central: `12:00 PM CDT`
- Operator/change authority: explicitly authorized by the system owner on
  2026-08-05
- Maintenance-page owner: systemd-managed Apache 2.4 on the production host
- Active front-door configuration:
  `/etc/apache2/sites-enabled/000-default.conf` and
  `/etc/apache2/sites-enabled/000-default-le-ssl.conf`
- Maintenance configuration location: a separately validated Apache virtual
  host and static document root, to be installed before the selected window

## Step 4 - Publish maintenance notice and stop every writer

### Actions

1. Reconfirm that systemd-managed Apache owns production HTTP/HTTPS traffic and
   that the enabled `mofacts.optimallearning.org` virtual hosts still proxy to
   the MoFaCTS application on port 3000.
2. Prepare a static maintenance response outside the MoFaCTS application
   container so it remains available while MoFaCTS and MongoDB consumers are
   stopped.
3. The response must:

   - state that MoFaCTS is undergoing scheduled maintenance;
   - show the expected restoration time and `America/Chicago`/Central Time;
   - return HTTP `503 Service Unavailable`;
   - include a `Retry-After` value consistent with the selected window;
   - contain no internal host, database, image, or credential information; and
   - be removable without rebuilding the application image.

4. Install the maintenance virtual host and static page as inactive,
   root-owned production configuration. Preserve the existing TLS certificate
   ownership and do not modify the application image.
5. Before the window, test the exact enabled-site state with Apache's native
   configuration test without reloading it into the running server. Restore
   the normal enabled-site state immediately after the test and verify that
   Apache's active configuration was not changed.
6. At the start of the window, switch from the normal proxy virtual host to the
   already validated maintenance virtual host, run Apache's configuration test,
   and perform a graceful reload. Confirm the public production URL displays
   the page and returns 503.
7. Stop these known writers:

   - `mofacts`, including its internal scheduled jobs;
   - `mofacts-mcp-prod-mongo-mcp-1`; and
   - `mofacts-mcp-prod-playwright-mcp-1`.

8. Recheck Docker Compose projects, relevant processes, systemd units, cron,
   and current MongoDB clients. MongoDB remains running for the final backup,
   but no application or tool capable of writing may remain connected.

### Pass evidence

- The public URL returns the expected maintenance page, HTTP 503, and the
  correct restoration time.
- All three known writers are stopped.
- No additional writer is detected.
- The existing MongoDB standalone remains healthy and writable only for the
  backup operation.

### Stop conditions

- The maintenance page depends on the stopped application.
- The page is not reachable at the normal public URL.
- Any writer cannot be identified or stopped.
- MongoDB is unhealthy before the final backup begins.

## Step 5 - Create and protect the final stopped-writer backup

### Actions

1. Create the final production backup with all writers stopped, using the
   repository-owned backup workflow and the active production volume.
2. Retain the protected server copy.
3. Copy the exact archive to the protected OneDrive Desktop backup directory.
4. Compare server and off-server SHA-256 checksums.
5. Verify the archive manifest and every internal checksum.
6. Record the archive identity, timestamp, size, checksum-verification result,
   and storage locations without recording secrets.

### Pass evidence

- The backup completed after the writer-stop time.
- Server and protected off-server copies match.
- The manifest and internal checksums pass.

### Stop conditions

- Any writer reconnects during backup creation.
- The archive, manifest, checksum comparison, protected copy, or available
  capacity check fails.

## Step 6 - Rehearse the final backup restore in isolation

### Actions

1. Restore the exact Step 5 archive into disposable, isolated local
   infrastructure. Do not use staging.
2. Verify the restored database, users and roles, application settings,
   required assets, indexes/options, and representative collection counts.
3. Start only the isolated verification application required by the supported
   restore workflow and confirm its health.
4. Reconcile expected verification-created records separately from restored
   records.
5. Remove the disposable containers, volumes, network, temporary account, and
   working copy after evidence is captured.

Production remains stopped and the maintenance page remains active throughout
this gate.

### Pass evidence

- The exact final archive restores successfully.
- Continuity checks have no unexplained material difference.
- The isolated application becomes healthy.
- Disposable restore infrastructure is removed after verification.

### Execution record - 2026-08-05

`PASS`

- Restored the exact Step 5 archive with SHA-256
  `75e962491266a9cea64c30e9167caff6f0a555dba79df9650f5f9858b2e1b7d0`
  into a dedicated local Compose project, without using staging.
- Restored 18,883 documents with zero restore failures. The 28-document
  reduction in `cronHistory` was matched against the still-stopped production
  source and confirmed as normal TTL expiry rather than restore loss.
- Before application startup, the source and restored database matched across
  34 collections, 126 indexes, one database user, database roles, collection
  options, and representative counts.
- Converted only the disposable database to `mofacts-rs`, verified an
  authenticated writable primary, and started image
  `ppavlikmemphis/mofacts-mini:prod-2d292a1a` through the supported Compose
  workflow. The application became healthy, DDP and reactivity checks passed,
  and a representative restored dynamic asset was served successfully.
- Reconciled the sole application-startup addition as the expected
  `migration.dynamicAssetLocalPaths.v1` completion marker. No restored record
  was lost or unexpectedly changed.
- Removed the disposable containers, volumes, network, temporary scripts, and
  extracted working copy. The authoritative Step 5 archive was preserved.
- Reconfirmed production remained in maintenance with only MongoDB and Redis
  running, application port 3000 closed, and the server backup checksum
  unchanged.

### Stop conditions

- Restore, authentication, health, collection reconciliation, or asset
  verification fails.
- A difference cannot be explained and accepted before conversion.

## Step 7 - Convert the existing production MongoDB volume

### Actions

1. Confirm the Step 5 server backup and protected off-server copy are still
   available.
2. Preserve the last-good active deployment configuration needed by the
   pre-write recovery procedure.
3. Activate the already verified release files from
   `/var/www/mofacts-releases/2d292a1a` at the canonical production paths and
   install the verified MongoDB replica-set keyfile with root ownership and
   mode `600`.
4. Re-run Compose validation against the now-active paths before starting a
   changed service.
5. Restart the existing data-bearing MongoDB service with the configured
   `mofacts-rs` identity and member-authentication keyfile.
6. Run the repository's idempotent replica-set initializer.
7. Wait for the existing member to become an authenticated writable primary.
8. Keep the MoFaCTS application and both MCP sidecars stopped.

This is an in-place topology conversion of the existing volume. It does not
copy production data, introduce another database authority, or enable Change
Streams in the application.

### Pass evidence

- MongoDB reports `setName: mofacts-rs` and writable-primary status.
- Authenticated administrative and application connections succeed through
  the configured replica-set identity.
- The same production volume remains mounted.
- No application writer has started.

### Execution record - 2026-08-05

`PASS`

- Reconfirmed the final server and protected off-server backup copies both had
  SHA-256
  `75e962491266a9cea64c30e9167caff6f0a555dba79df9650f5f9858b2e1b7d0`.
- Preserved the last-good canonical deployment configuration at
  `/backups/mofacts-pre-step7-config-20260805-1554.tar.gz` with root ownership,
  mode `600`, and SHA-256
  `f571090958ac99c78709a91128775bf3bb1b6c9d0d0c28dee68df22463fa1cba`.
- Activated `/var/www/mofacts-releases/2d292a1a` at the canonical production
  paths. Every active release file and the installed MongoDB keyfile matched
  the verified staged copy by SHA-256.
- Validated the active Compose configuration before restarting a changed
  service. It resolved the application image to
  `ppavlikmemphis/mofacts-mini:prod-2d292a1a`.
- Recreated only MongoDB with replica-set identity and keyfile authentication,
  retaining the existing `mofacts_data` volume at `/data/db`.
- The repository initializer exited `0` and reported that `mofacts-rs` had the
  configured member `mongodb:27017` and a writable primary.
- Authenticated verification reported `setName: mofacts-rs`, one member, one
  writable primary, successful application-user access, and all 34
  collections visible.
- MongoDB and Redis remained healthy. The application and both sidecars
  remained stopped, port 3000 remained closed, and the public maintenance page
  continued returning HTTP 503.

### Stop conditions

- Compose renders a different image, volume, path, replica-set name, or member
  identity than the staged definition.
- MongoDB cannot authenticate, initialize idempotently, or become writable
  primary.
- The expected existing volume is not mounted.

## Step 8 - Verify database continuity before application startup

### Actions

Compare the converted database with the pre-conversion and restored-backup
evidence:

- database identity and expected volume;
- users and roles;
- collections and representative counts;
- indexes and collection options;
- representative minimized records;
- required external/dynamic assets;
- application authentication through the replica-set URI; and
- backup workflow readiness in the converted topology.

### Pass evidence

- No unexplained material difference exists.
- All supported database consumers are configured for `mofacts-rs`.
- The database is healthy and writable while application writers remain
  stopped.

### Execution record - 2026-08-05

`PASS`

- Reconfirmed the converted database used the canonical `mofacts_data` volume,
  database `MoFACT-meteor3`, replica set `mofacts-rs`, one member, and one
  writable primary.
- Matched the pre-conversion continuity evidence: 34 collections, 126 indexes,
  zero custom roles, and 16,010 non-TTL documents. `cronHistory` continued to
  decrease only through its expected TTL behavior.
- Verified representative minimized record shapes without retaining record
  values or identifiers.
- Added the intentionally separate `mofacts_mcp_readonly` database identity
  with exactly the `read` role on `MoFACT-meteor3`. Both the application user
  and MCP user authenticated successfully.
- Created the authoritative private MCP environment at
  `C:\Users\ppavl\OneDrive\Desktop\mofacts-mcp-production.env`, installed the
  server copy at `/var/www/mofacts-mcp-sidecar/.env`, and restricted each copy
  to its appropriate owner and system administrators. No credential was
  printed or committed.
- Confirmed both the application `MONGO_URL` and MCP `MONGO_URI` target
  `mofacts-rs`; both Compose definitions validated without starting either
  consumer.
- Reconfirmed all 6,844 dynamic-asset files, 2,405,778,391 bytes, and zero
  unreadable files.
- Verified the repository backup script, required protected inputs, and a live
  read-only `mongodump` through the converted topology. The protected Step 5
  archive checksum remained
  `75e962491266a9cea64c30e9167caff6f0a555dba79df9650f5f9858b2e1b7d0`.
- MongoDB and Redis remained healthy. The application and both MCP sidecars
  remained stopped, and application port 3000 remained closed.

### Recovery boundary

Before the converted application accepts its first write, the rehearsed
last-good application/configuration procedure may still be used. After any new
application write, retain the replica-set topology and recover forward. Never
run standalone and replica-set forms of the same data concurrently.

## Step 9 - Deploy and start the exact image in polling mode

### Actions

1. Reconfirm the cached image's registry digest.
2. Start the single `mofacts` application service from the active production
   Compose definition. Do not build on the server.
3. Confirm the running container uses the approved image and digest.
4. Confirm `METEOR_REACTIVITY_ORDER=polling` and `DDP_TRANSPORT=sockjs` from
   effective runtime evidence without printing the environment file.
5. Confirm the application connects to the healthy `mofacts-rs` primary.
6. Confirm container health and HTTP readiness while the public maintenance
   page remains active.

### Pass evidence

- The exact approved image is running and healthy.
- Polling and SockJS are active.
- MongoDB connection and replica-set identity are correct.
- The public maintenance page still prevents normal user traffic.

### Execution record - 2026-08-05

`PASS`

- Reconfirmed cached image
  `ppavlikmemphis/mofacts-mini:prod-2d292a1a` resolved to the approved immutable
  digest
  `sha256:c834eb0af90de048929c382ba2ec9c742c150f9b54ca8677f1c07024be2d79e1`.
- Revalidated the active Compose definition and started only the `mofacts`
  service with `--no-build --no-deps --wait`. No server-side build occurred and
  neither MCP sidecar started.
- The running container image ID and registry digest both matched the approved
  digest, and Docker reported the container healthy.
- Effective runtime evidence reported `METEOR_REACTIVITY_ORDER=polling`,
  `DDP_TRANSPORT=sockjs`, `MOFACTS_CHANGE_STREAMS_ENABLED=false`, and
  `MOFACTS_CHANGE_STREAMS_QUALIFICATION=false`.
- Startup logs confirmed SockJS, polling, and an authenticated replica-set
  connection to `MoFACT-meteor3`. No severe startup log lines were found.
- Direct internal `/health` and `/` requests both returned HTTP 200.
- The public Apache maintenance endpoint continued returning HTTP 503 while
  the application, MongoDB, and Redis containers were healthy.
- Application startup crossed the pre-write recovery boundary. From this point
  forward, retain the replica-set topology and recover forward; do not restart
  the production data as standalone MongoDB.

## Step 10 - Run production application smoke tests

### Actions

Run focused, non-destructive checks first:

- root and health responses behind the operator's maintenance bypass or direct
  internal route;
- static and dynamic resource loading;
- password authentication and authorization boundaries;
- SAML configuration readiness;
- learner content launch and Continue-button behavior;
- history read paths;
- content-management and administration pages; and
- browser and server error logs.

Before the first intentional production write, explicitly acknowledge that the
recovery boundary changes to replica-set-preserving forward recovery. Then run
the minimum representative write needed to verify learner response/history
continuity, using an authorized test identity and avoiding real learner data.

### Pass evidence

- Required pages and resources load without unexpected client/server errors.
- Authentication and authorization work.
- A representative learner interaction writes and reads history correctly.
- No destructive or broad production-data mutation occurs.

### Execution record - 2026-08-05

`PASS`

- Confirmed the normal public production URL and `/health` returned HTTP 200.
- Signed in through the real production Google authentication flow with an
  authorized administrator account.
- Launched Wiki World Maps from its Continue button and confirmed its authored
  Wikimedia image and attribution rendered on the lesson screen.
- Launched the SPARC American History working lesson from its Continue button,
  submitted one representative answer, received authoritative `Correct.`
  feedback, and returned through the supported save path.
- Opened the authenticated Learning History page after the write and opened the
  Admin Control Panel, which reported the production server status and controls.
- The browser reported no warnings or errors during the completed smoke path,
  and the application container reported no severe log lines in the final
  review. No synthetic production account or credential was retained.

## Step 11 - Restart and verify the production MCP sidecars

### Actions

1. Start the Mongo MCP and Playwright MCP sidecars only after Step 10 passes.
2. Confirm the Mongo sidecar uses the approved replica-set connection contract.
3. Confirm both sidecars are healthy and do not introduce startup errors or
   unexpected writes.
4. Recheck the complete writer/container inventory.

### Pass evidence

- Both expected sidecars are healthy.
- Mongo MCP connects to `mofacts-rs`.
- Application, MongoDB, Redis, and sidecar container states are expected.

### Execution record - 2026-08-05

`PASS`

- Started only `mongo-mcp` and `playwright-mcp` from the already-built sidecar
  images with `--no-build`; no production image was rebuilt.
- Mongo MCP completed its startup-time authenticated connection, ping, and
  replica-set validation and remained running on the localhost-only MCP port.
- Playwright MCP started without errors on its localhost-only MCP port.
- Final inventory showed the application, MongoDB, Redis, Mongo MCP, and
  Playwright MCP containers all running. The application, MongoDB, and Redis
  health checks remained healthy.

## Step 12 - Close maintenance and begin the polling soak

### Actions

1. Record final application image, container, MongoDB topology, settings, and
   deployment identities.
2. Confirm the final backup locations, disk capacity, health checks, and error
   state.
3. Remove the maintenance response through the same front-door mechanism that
   activated it.
4. Confirm the normal public URL returns the upgraded application with HTTP
   200 and no stale maintenance response.
5. Announce restoration and monitor polling-mode production through at least
   one representative peak-use period.

### Pass evidence

- Normal traffic reaches the healthy upgraded application.
- The expected restoration announcement is accurate.
- Polling-mode operation remains correct and stable through the agreed soak.

### Execution record - 2026-08-05

`PASS`

- Removed the maintenance response through the normal Apache site activation
  path and restored the canonical production virtual hosts.
- Reconfirmed the public root and `/health` endpoints returned HTTP 200 after
  the authenticated smoke test and sidecar startup.
- Final server capacity was 33 GB used and 16 GB available on the 48 GB root
  filesystem (69% used).
- Production initially ran the approved application image in polling/SockJS
  mode. The system owner subsequently waived the traffic-based polling soak
  because production has no meaningful peak-use period and authorized Step 13.

The replica-set conversion remains authoritative even if an application defect
requires deploying a last-good image that is compatible with the replica-set
URI.

## Step 13 - Evaluate and separately authorize Change Streams

Step 13 requires separate production authorization. On 2026-08-05 the system
owner explicitly authorized immediate execution and waived a traffic-based
waiting period because this low-traffic production system has no meaningful
peak-use period.

### Actions

1. Review the polling soak, MongoDB capacity, recovery evidence, application
   correctness, and reconnect behavior.
2. Decide whether Phase 5B is ready. If it is not, leave production on polling
   and record the reason.
3. If authorized, change the reviewed production configuration to
   `METEOR_REACTIVITY_ORDER=changeStreams,polling` in its owning configuration
   repository. Update `deploy and build.txt`, verify, commit, and push the
   configuration before deployment; do not hand-edit the remote Compose file.
4. Deploy only that approved configuration change.
5. Confirm active Change Streams directly and continue normal operational
   observation. Do not make user traffic or a peak-use period a completion
   requirement for this low-traffic system.
6. If reactive behavior regresses, restore the reviewed polling configuration.
   Keep the replica-set database authoritative; do not reverse the database
   conversion.

### Pass evidence

- The configuration change is reviewed, versioned, and published.
- Runtime evidence shows active Change Streams and the expected polling
  secondary order.
- Initial operational checks show no material correctness, stability,
  reconnect, or database-capacity regression; continue ordinary monitoring.

### Execution record - 2026-08-05

`PASS; CHANGE STREAMS ENABLED`

- Added the private production-only Compose overlay and updated the authoritative
  Desktop environment to set `MOFACTS_CHANGE_STREAMS_ENABLED=true` and
  `METEOR_REACTIVITY_ORDER=changeStreams,polling`. The test-only qualification
  flag remains false.
- Validated the rendered Compose configuration, then committed and pushed the
  private configuration as
  `9902156a9485c89ab783879818876ff7df220115`.
- Deployed only the reviewed environment and overlay and recreated only the
  `mofacts` application container. MongoDB, Redis, and both MCP sidecars
  remained running.
- The application became healthy on the unchanged approved image and logged
  `changeStreams,polling (Change Streams enabled)` plus an authenticated
  replica-set connection.
- Sanitized MongoDB current-operation evidence reported 8 active
  `$changeStream` operations. The public root and `/health` endpoints returned
  HTTP 200, all expected containers remained running, and no new severe runtime
  error appeared.
- The system owner then tested Wiki World Maps on the live production
  application and confirmed that it worked correctly after the Change Streams
  restart.
- Production remains on Change Streams with polling second. Continue ordinary
  monitoring; a lack of user traffic does not disable or postpone the feature.

## Gate report format

After each of Steps 4-11, report:

1. Gate and outcome: `PASS` or `STOP`.
2. Production changes made.
3. Evidence collected.
4. Current application, database, maintenance-page, and writer states.
5. Recovery boundary: pre-write or recover-forward.
6. Any discrepancy or remaining risk.
7. The exact next gate, which requires separate authorization.
