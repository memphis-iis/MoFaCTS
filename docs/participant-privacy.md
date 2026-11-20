# Experiment participant privacy

A Prolific launch exchanges its full identity triple for an Accounts credential bound to the resolved experiment root. A reminder exchanges its private fragment for access to the same saved participation. Manual IDs use the server-resolved passwordless experiment. Credentialed studies verify a study-only account's bound password with Accounts. Ordinary accounts authenticate through their usual login before entering a credentialed study. A separate tab-scoped credential restores the study session on page reload and transport reconnect. Accounts owns expiry and revocation.

The browser removes Prolific query values after exchange. The participant entry response uses `no-referrer`. Study responses, saved condition, timing and progress remain available to the authored experience. Participant diagnostic reports, sign-in status, debug messages and profile edits are suppressed. Study download keys depend on the existing encryption secret. Rotating that secret changes derived keys for other experiments. Prolific participation record IDs survive rotation.

Saved progress can still qualify a returning manual participant for passwordless access. After sign-in, the study session limits progress and activity reads to the bound study and its condition lessons. A condition TDF belongs to one study. If inconsistent data references it from multiple study roots, the study session keeps root-keyed progress available and withholds standalone condition rows with ambiguous ownership. Account-wide dashboards, course progress summaries and all-lessons exports require an ordinary account session. Lesson exports still require ownership, including when requested from a study session.

## Existing records

The count-only inventory and cleanup decision logic live in `mofacts/server/lib/participantPrivacyCleanup.ts`. They have no startup or network entry point. The operator must obtain separate approval before applying a cleanup to existing data. Supply the intended database to `participantPrivacyCleanupStores(db)` and pass that adapter to `inspectParticipantPrivacy(stores)` for counts. Only the explicit second argument `cleanup` enables writes.

Read one collection at a time using its declared projection, ascending unique `_id`, at most 200 rows, and `_id > lastSeen` after the first page. Resolve only that page's account IDs from server-owned participant profiles and private Prolific account links. Return aggregate eligible/review counts per collection. Shared login-IP buckets, unattributed failures, and reports without verified participant linkage require retention review. A report's browser snapshot alone does not authorize deletion.

For an approved cleanup, match each write by its source ID and original attribution and values. Clear only the eligible fields or remove the specifically classified diagnostic document. Restart from the first page after interruption and repeat inventory until eligible counts reach zero. Preserve unrelated status fields, credentials, roles, histories, assignments, lockouts, saved sessions and payment linkage. Re-evaluate queued reports before composing either acknowledgment or summary email.

Older TSVs, delivered messages, access logs and backup archives require their own retention processes. The Mongo backup service copies every collection into its database archive. An application cleanup cannot change a previously created archive. Use the inventory again after a restore.

## Hosting review

Production and staging2 Apache use the same privacy settings for new entries as of November 20, 2026. Both the site access log and the other-vhosts access log record time, response status, response bytes and duration. The dedicated error writer records time, module, severity, process ID, source location and the Apache diagnostic code when available. It discards free-form messages and records unstructured input as an unclassified event. Existing logs follow their existing rotation and retention policy.

The canonical config repository stores the site files under `production/apache/` and `staging2/apache/`. On a new or restored host, install `apache/mofacts-apache-error-log` as root-owned mode 0755 at `/usr/local/libexec/mofacts-apache-error-log` and `apache/other-vhosts-access-log.conf` as the enabled Debian Apache configuration of that name. Ensure the standard error log exists with its normal protected permissions. Install the matching site configuration, run `apache2ctl configtest` and gracefully reload. Retain the packaged log rotation that recreates the log and reloads Apache.

The rollout used an isolated synthetic Prolific participant on each host. Check new log bytes after the reload during a launch, authenticated reconnect, HTTP redirect and denied request. Verify the field formats and search for parameter names, synthetic values, addresses and request headers. Check both access destinations and the error log. Cloud network-flow logs, historical archives and infrastructure outside Apache have separate retention settings.

## Local regression checks

From `mofacts/`, run `node --test scripts/prolific.test.cjs scripts/participantPrivacyCleanup.test.cjs`. With the canonical localhost watcher ready, `node scripts/participantPrivacyLocal.cjs` exercises synthetic entries and the private return URL in Chromium using only run-owned local fixtures. The researcher worker's message dispatch and uncertain-send rules use a simulated provider in the Prolific contract suite.
