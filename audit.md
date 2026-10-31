# MoFaCTS Breakage, Unused Code, and Redundancy Audit

## Purpose and scope

Find existing breakages, genuinely unused code, and unnecessary duplicate implementations. Preserve intended functionality. This is a focused maintenance audit, not a feature upgrade, redesign, observability project, performance program, or release certification.

Follow [AGENTS.md](AGENTS.md) as working constraints. A general assessment of compliance with that file is a separate audit. Mention a rule violation here only when it directly explains an in-scope defect or affects the safety of this work.

Use [CHATGPT_CONTEXT.md](CHATGPT_CONTEXT.md) and relevant reference implementations to establish intended behavior. Distinguish actual breakage from a preference for a different design. The default deliverable is a findings report with narrow proposals; this prompt does not authorize application edits, deletion, consolidation, commits, or deployment.

## 1. Establish the baseline

- Record the requested area, exclusions, commit/branch, and relevant staged, unstaged, and untracked changes. Preserve unrelated work.
- Identify active entry points and the owning modules. Do not infer architecture from filenames or assume scaffolds are active.
- Record relevant environment, role, package/config, and starting progress. Inspect runtime settings only when needed to diagnose the target behavior; follow the guide when required values are unknown.
- Establish expected behavior from approved requirements, earlier working code, and current contracts. Do not invent new functionality as the audit's standard.
- Note existing warnings before testing so old events are not attributed to this run.

Source review and non-mutating diagnostics are the default. The guide permits canonical localhost startup when needed. Workflow tests that write data, change settings, or inject failures need authorization. Use synthetic data and bounded disposable fixtures for authorized tests; define cleanup first. Production writes and tests are not part of this prompt.

## 2. Investigate breakages with existing diagnostics

Reproduce a suspected problem before recommending a repair. Select only workflows and checkpoints needed to investigate the requested area or a concrete finding; an exhaustive tour of every feature is not required.

During authorized workflow tests, observe the relevant layers together:

| Layer | Useful evidence |
| --- | --- |
| Interface | Ordered actions, expected/actual screens, routes, loading/progress states, inline errors, dialogs, and screenshots where useful |
| Connectivity | Failed/slow requests, asset loading, Meteor DDP/WebSocket disconnects, reconnects, and retries |
| Browser and server | Exceptions, rejected promises, warnings, method outcomes, and authorization failures |
| Persistence | Minimized before/after checks, commit outcomes, identity/revisions, duplicates, and rollback when relevant |
| Results | Resume behavior, dashboard state, or downloaded data reconciled with the tested action when those surfaces are affected |

Use existing browser diagnostics, application/container logs, the client logger, recoverable-warning log, and relevant readiness checks. Record the action sequence and correlate evidence with existing identifiers/timestamps where available. Logs and screenshots alone do not prove a durable database commit.

Do not add instrumentation, new identifiers, monitoring services, dependencies, global debug logging, or database profiling as part of this audit. If existing diagnostics are insufficient, state the evidence limitation and the smallest additional observation needed. A missing trace or monitoring feature is not automatically a defect or an implementation assignment.

Use reload/resume, repeated submission, two-tab, or interrupted-request checks only when they address a relevant risk and are authorized. Broad fault injection, load testing, platform benchmarking, security/compliance sweeps, pedagogical redesign, and general usability or experiment-protocol reviews are outside this audit unless separately requested.

Follow an observed failure through the owning UI, engine/lifecycle, method/publication, persistence, and affected readers. Check export or resume only when relevant. For regressions, compare with the earlier implementation and identify the actual behavioral difference.

Record warnings without suppressing them. Classify expected test-induced, pre-existing, incidental, and finding-related events separately. Incidental warnings should not expand the audit into unrelated work.

## 3. Verify unused-code candidates

A failed text search or code unused in one browser run does not establish dead code. Before calling a candidate unused:

1. Check imports, exports, active runtime entry points, dynamic registries, string-based lookup, build/test wiring, and supported alternative paths.
2. Check relevant authored package/config references and companion-repository consumers. Keep these checks targeted; passive config storage does not require a new validator or blanket audit.
3. Determine whether the candidate is generated output, a test fixture, an intentional scaffold, a supported extension point, or retained behavior with a known owner.
4. State the evidence for no remaining consumer and any search limitations.

Classify incomplete evidence as an **unused-code candidate**, not confirmed dead code. Follow the guide's discussion requirement for apparently unnecessary legacy paths. Recommend removal only after consumer checks; do not delete code during the audit.

## 4. Examine redundant code

Look for duplicate implementations, overlapping state, repeated event handlers, parallel configuration names, or competing paths for the same responsibility.

For each candidate:

- Name the implementations, their callers, and their architectural owners.
- Compare inputs, outputs, side effects, defaults, authorization, persistence, error handling, and lifecycle cleanup.
- Determine whether the differences are intentional contracts. Similar-looking code is not necessarily redundant.
- Identify the existing authoritative path, if established, and the smallest behavior-preserving consolidation to consider later.

Do not propose a new framework, abstraction, shared service, schema, or compatibility layer simply to remove duplication. If consolidation would change a contract or observable behavior, identify that decision explicitly; it is not routine cleanup.

## 5. Protect behavior, data, and evidence

- Preserve intended UI sequences, defaults, language contracts, data identities, histories, model state, experiment conditions, and resume behavior. Do not reinterpret stored fields.
- Do not suppress warnings, relax validation, or weaken tests merely to clear findings.
- Keep credentials, tokens, cookies, connection strings, learner data, and raw database records out of retained evidence. Prefer synthetic data, allowlisted metadata, and minimized readbacks.
- Keep local evidence ignored and redact identifiers. Account for monitoring overhead; use observations only as needed for the investigation.
- Stop active test timers/recognizers, clean up only authorized fixtures, and restore temporary settings. Preserve genuine learner data and security/audit records.
- Follow the guide's verification requirements for any separately approved repair, including fresh authorization for every `npm run test:ci` invocation.

## 6. Report findings and stop

Report findings under three primary categories: **breakage**, **confirmed unused code**, and **unnecessary redundancy**. Keep uncertain candidates and incidental observations separate. Do not fill the report with optional style changes or a general `AGENTS.md` compliance checklist.

For each finding provide:

| Field | Required content |
| --- | --- |
| Priority | Severity and concrete user or maintenance impact |
| Scenario | Relevant starting state and reproduction steps, or the consumer analysis for unused/redundant code |
| Expected versus actual | Intended behavior/ownership and the demonstrated problem |
| Evidence | Exact file/line references and relevant redacted runtime evidence; separate facts from inference |
| Confidence | Confirmed conclusion, remaining uncertainty, and search/test limits |
| Narrow proposal | A repair restoring intended behavior, or removal/consolidation preserving it |
| Verification | The focused check needed to establish the proposal is safe |

End with scope covered, checks performed, checks not run and why, unresolved candidates, cleanup outcome, and unrelated changes preserved. Do not imply untested features are certified or that deployment is part of this audit.

Stop after the report. Implement fixes, removals, or consolidations only under a separate explicit request. Proposed fixes should restore intended behavior; removals and consolidations must preserve it. Changes to intended functionality belong in a separate task and must not be presented as cleanup.
