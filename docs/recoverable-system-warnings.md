# Recoverable system warnings

Admin Tests (`/admin/tests`) includes an administrator-only **Recoverable system warnings** log. It loads the newest 50 events, with Refresh and Older warnings controls. The server checks the administrator role on every read; there is no reactive publication or learner-facing warning display.

The first event is `autotutor.citationMismatch`: a nonempty AI quotation does not exactly match the learner-authored source it references. AutoTutor uses the otherwise valid score unchanged and continues the normal tutor-response flow. The original provider quotation is not corrected or treated as verified. Prompt instructions still request exact evidence. Invalid sources (including tutor-authored sources), invalid scores, and malformed responses retain their existing validation.

## Ownership and data

- The scoring provider aggregates mismatches into one event per otherwise valid scoring response, after the existing score reducer succeeds. It performs no additional AI request and makes no changes to scoring rules or stored learner-history formats.
- `common/recoverableWarnings.ts` defines the allowlisted warning contract. Add future recoverable conditions deliberately at their owning boundary, with their own validation, diagnostic fields, translated display, and continuation tests; do not catch arbitrary application errors as recoverable.
- `reportRecoverableWarning` accepts authenticated reports, validates exact bounded fields, and writes the existing `AuditLog` with action `system.recoverableWarning`. User identity and timestamp are server-owned; the event is explicitly marked client-reported.
- Diagnostic details contain only the warning code, lesson reference (when available), and mismatch count. No learner answers, quotations, conversation transcripts, provider payloads, or credentials are accepted. Reporter identity stays in the audit record but is excluded from the Admin Tests response.
- `getRecoverableWarnings` uses a bounded timestamp/ID cursor and an `action, createdAt, _id` index created by the normal server startup. Existing audit records are unchanged; no data rewrite or new configuration is required. Warning records follow the existing audit-log retention and backup behavior.
- Both methods are limited to 30 requests per authenticated user per minute. Warning delivery is best effort: transport, persistence, or rate-limit failures are handled through the existing admin-controlled client logger and cannot fail the learner turn. Such failed deliveries do not appear in the persisted warning log.

## Citation failure diagnostics

Citation validation errors also include a bounded, text-free `citation` summary in the existing submission error detail and admin-controlled client logger (verbosity level 1). It records the requested source/index, referenced speaker, history/student counts, quote length, exact-match counts and up to eight matching indices per speaker, and whether the latest learner answer matches. These are observations for diagnosis, not an automatic source correction or evidence of semantic correctness. If the same wording occurs in both speakers' entries, both matches are reported.

The client logger also retains the actual AI quotation, latest student answer, and conversation wording. It includes the most recent 32 entries plus any older referenced entry and up to eight exact matches per speaker, with original indices and an omitted-entry count. This preserves both sides of a reference error without silently renumbering the conversation. Credential patterns are redacted; ordinary student wording, punctuation, and whitespace are preserved. Treat captured browser diagnostics as learner data.

Recoverable quotation mismatches emit this diagnostic context through the same client logger for at most three citations per scoring response. The persisted Admin Tests warning still contains only its existing count and lesson reference; the extra text is in browser diagnostics, not persisted audit fields. No additional AI calls occur. Enable client verbosity level 1 and preserve browser console output when reproducing a failure; logging remains silent at level 0. The existing learner error detail contains only the compact summary and remains bounded to 800 characters.

## Verification

Regression coverage compares exact and mismatched quotation responses for identical scores, checks warning aggregation and delivery-failure isolation, retains source/score validation coverage, and tests authenticated writes, bounded fields, administrator reads and cursor pagination. Run through the supported Meteor CI environment. Run full application typecheck and lint for edits to these paths.

After deployment, submit a controlled synthetic mismatched citation, confirm the next tutor response, then inspect Admin Tests with an administrator account. Confirm that a learner cannot call the log-reading method. No production verification is implied by local checks.
