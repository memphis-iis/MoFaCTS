# Experiment participant privacy

A Prolific launch exchanges its full identity triple for an Accounts credential bound to the resolved experiment root. A reminder exchanges its private fragment for access to the same saved participation. Manual IDs use the server-resolved passwordless experiment. Credentialed studies verify a study-only account's bound password with Accounts. Ordinary accounts authenticate through their usual login before entering a credentialed study. A separate tab-scoped credential restores the study session on page reload and transport reconnect. Accounts owns expiry and revocation.

The browser removes Prolific query values after exchange. The participant entry response uses `no-referrer`. Study responses, saved condition, timing and progress remain available to the authored experience. Participant diagnostic reports, sign-in status, debug messages and profile edits are suppressed. Study download keys depend on the existing encryption secret. Rotating that secret changes derived keys for other experiments. Prolific participation record IDs survive rotation.

## Existing records

The count-only inventory and cleanup decision logic live in `mofacts/server/lib/participantPrivacyCleanup.ts`. They have no startup or network entry point. The operator must obtain separate approval before applying a cleanup to existing data. Supply the intended database to `participantPrivacyCleanupStores(db)` and pass that adapter to `inspectParticipantPrivacy(stores)` for counts. Only the explicit second argument `cleanup` enables writes.

Read one collection at a time using its declared projection, ascending unique `_id`, at most 200 rows, and `_id > lastSeen` after the first page. Resolve only that page's account IDs from server-owned participant profiles and private Prolific account links. Return aggregate eligible/review counts per collection. Shared login-IP buckets, unattributed failures, and reports without verified participant linkage require retention review. A report's browser snapshot alone does not authorize deletion.

For an approved cleanup, match each write by its source ID and original attribution and values. Clear only the eligible fields or remove the specifically classified diagnostic document. Restart from the first page after interruption and repeat inventory until eligible counts reach zero. Preserve unrelated status fields, credentials, roles, histories, assignments, lockouts, saved sessions and payment linkage. Re-evaluate queued reports before composing either acknowledgment or summary email.

Older TSVs, delivered messages, access logs and backup archives require their own retention processes. The Mongo backup service copies every collection into its database archive. An application cleanup cannot change a previously created archive. Use the inventory again after a restore.

## Hosting review

The production and staging2 Apache TLS configurations recorded in the canonical config repository use `CustomLog ... access.log combined` and proxy both `/websocket` and SockJS WebSocket upgrades. Combined access logs can retain the client address, request line with the first launch query, referrer and user agent. The self-hosted Caddy example forwards the remote host in `X-Real-IP` and `X-Forwarded-For`. A reminder fragment stays in the browser URL, but the exchange sends its credential in a DDP message. WebSocket frame capture, APM request capture, session replay and exception breadcrumbs must be reviewed separately from access logs.

Confirm enabled virtual hosts and included log formats, ingress or CDN request logging, WebSocket tracing, monitoring redaction, log shipping destinations and archive retention with the hosting operator. An external media CDN listed in the CSP does not establish a CDN in front of the application. The stored configuration does not establish which directives or monitoring integrations are running on a host. Hosting changes require separate authorization.

## Local regression checks

From `mofacts/`, run `node --test scripts/prolific.test.cjs scripts/participantPrivacyCleanup.test.cjs`. With the canonical localhost watcher ready, `node scripts/participantPrivacyLocal.cjs` exercises synthetic entries and the private return URL in Chromium using only run-owned local fixtures. The researcher worker's message dispatch and uncertain-send rules use a simulated provider in the Prolific contract suite.
