# MoFaCTS Open Core Modularity + Efficiency Review Prompt

Use this prompt when evaluating or proposing architecture changes for MoFaCTS.

For a human/AI orientation map of current component boundaries, start with `docs/learning-component-boundary-map.md`.

## Goal

Improve modularity for ecosystem adoption **without breaking integrated-system behavior**.

This is **in-system modularity**, not “split into separate products” modularity.

MoFaCTS must remain one coherent runtime where components share:

- the same user/session identity model,
- the same experiment/unit progression context,
- the same history logging pipeline,
- and comparable history record formats across activity types.

## Non-Negotiable Requirements

1. **Preserve integration**
   - Do not redesign into disconnected services/apps unless explicitly asked.
   - Keep new components interoperable with existing routing, scheduling, persistence, and reporting flows.

2. **Preserve shared history semantics**
   - All activity types must write to a compatible history envelope.
   - Keep event names/fields stable or versioned with migration notes.
   - Allow component-specific payload fields, but keep a common core schema for cross-component analysis.
   - Current schema, event names, and migration policy live in `docs/history-envelope.md`.

3. **Minimize server usage**
   - Keep pure compute on client/shared code when safe.
   - Use server methods only for DB access, auth/authorization, secrets, or external APIs.
   - Avoid introducing server-heavy orchestration for component logic.
   - Treat modularity as an efficiency audit: a clearer boundary should remove duplicate interpretation, redundant payload shaping, or unnecessary server round-trips.

4. **Keep per-trial logs small**
   - Send compact per-trial records (IDs, timestamps, outcome, key signals).
   - Do **not** send large runtime snapshots after each trial.
   - Reserve larger state serialization for checkpoint/resume boundaries only.

5. **No fake modularity**
   - Reject “modular” proposals that still require hidden global state, route-only hooks, private services, or undocumented lifecycle side effects.
   - Component manifest and capability rules live in `docs/learning-component-contracts.md`.

## What to Evaluate

For each proposal/change, answer:

- Does it keep MoFaCTS as one integrated system?
- Does it preserve shared history record comparability?
- Does it remove unnecessary work, especially duplicate client parsing or avoidable server calls?
- Does it reduce or at least not increase server load?
- Does it keep per-trial payloads compact?
- Can outside developers add content/components without learning unrelated internals?

## Preferred Design Pattern

Use thin, explicit interfaces while preserving central integration:

- Component handles render/input/validation/scoring signals.
- Central runtime handles persistence/logging/scheduling integration.
- Central logger writes canonical history envelope.
- Component-specific details go into bounded extension fields.

## Output Format for AI Reviews

When producing recommendations, include:

1. **Integration impact** (what remains shared/system-level).
2. **History compatibility impact** (schema changes, versioning, migration).
3. **Server efficiency impact** (calls added/removed, compute location).
4. **Per-trial payload impact** (estimated payload shape/size changes).
5. **Risk level** (low/medium/high) and rollback strategy.

## Guardrails for Proposed Changes

- Prefer incremental seam creation over rewrites.
- Require concrete contracts (interfaces + schemas + tests), not only folder moves.
- Add contract tests for:
  - canonical history envelope compliance,
  - payload-size budget,
  - backward compatibility of key analytics fields.

## One-Line Principle

**Make MoFaCTS easier to extend from the outside while keeping one integrated system, one coherent history model, low server load, and compact per-trial telemetry.**
