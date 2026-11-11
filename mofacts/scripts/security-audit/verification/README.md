# Verification intent preparation

The approved Phase 1 amendment P1-D8 brings the minimum typed outcome capture,
exact source-owned expected results and positive allowed baselines forward from
Phase 2. `common/securityAudit/verificationCatalog.ts` remains the planned single
intent owner; it is not replaced by a fixture-derived policy or this diagnostic.

`legacyProbeInventory.mjs` is a provider-independent, import-safe formatter for
the existing selected V1 fixture. It uses the shared bounded duplicate-key JSON
parser and current public surface inventory. It returns only known actor aliases,
public subject IDs, argument primitive kinds, source path candidates and legacy
flags. It omits credential/canary/resource/query values. Unresolved subjects stay
as numbered rows without identifier values, and missing intent is unspecified.
Nothing in its output is an approved policy, actual runtime-surface proof,
allowed baseline or passing authentication result.

The selected fixture list was recovered through the approved single format-only
read on 2026-11-11. Its 22-row sanitized inventory resolves 17 subjects and leaves
five publication selections unresolved. See the
[source-grounded migration review](../../../../docs-developer/security-audit-selected-authentication-review.md).
The complete fixture stays protected; the read retained no credential, argument,
canary or resource values. Temporary AWS access was removed after use. The
[optional read-only inventory preparation](../../../../deploy/security-audit/recovery-transfer/probe-inventory-review.md)
can use this formatter, with explicit operational approval. AWS is not imported
here or by the application. Other operators may supply their approved fixture
bytes and public manifest directly; the formatter reads no file/environment,
starts no process and makes no network call.

This is a Phase 1 migration/review diagnostic owned by the audit maintainer. The
active V1 scanner never imports it. Author and review actual catalog entries
against current guards after recovering the selected inventory; never copy its
legacy booleans into expected policy automatically. Operational access and the
temporary workflow are retired after the one approved read. This creates no
permanent V1 runtime compatibility or old-report archive path.

Synthetic tests:

```text
node --test scripts/security-audit/tests/legacyProbeInventory.test.mjs
```

No protected fixture, application, provider or Meteor invocation is used by
these tests. Current catalog authoring and typed authentication acquisition
remain open until their actual selected cases are known and reviewed.

## Shared outcome decision table

The inert `common/securityAudit/authorizationOutcomes.ts` implements the written
plan's exact five internal outcomes and ten expected/observed decisions. It
returns only the existing public PASS/FAIL/ERROR statuses. Its method classifier
requires an exact source-supplied denial-code set and an explicit positive
scoped-success match; fulfilled calls, arbitrary exceptions, legacy booleans,
wildcard codes, transport errors and missing evidence cannot establish denial.
It returns no response/code text or protected values.

This is the pure classification layer. It does not execute a method, declare
which real cases exist, authenticate fixture bindings, prove the allowed baseline
or create report evidence. The single planned verification catalog and scoped
transport adapters must establish those prerequisites before aggregation. The
ten-row JSON fixture is test ground truth for the decision table, not a second
verification catalog. No actual actor/surface/scenario entry is invented here.

Six Node cases cover the complete table, false-denial witnesses, positive-match
requirements, exact criteria and report-counter semantics. Both Meteor parity
cases passed on 070a1c9a in the retained native Linux run (1,011 server/1,245
client passes, zero failures/hooks). Reuse that unchanged shared-contract proof;
actual selected-case adapters still need their own integration milestone.

```text
node --test scripts/security-audit/tests/authorizationOutcomes.test.mjs
```

The active V1 scanner and application startup do not import this module. Actual
verification intent and live evidence remain incomplete pending the selected
inventory and independently approved execution.
