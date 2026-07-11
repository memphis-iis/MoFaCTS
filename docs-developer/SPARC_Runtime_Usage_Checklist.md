# SPARC Runtime Usage Checklist (Phase 1)

This is the locked acceptance contract for the first-pass SPARC runtime implementation in MoFaCTS.

## Scope and invariants (do not alter in Phase 1)

- Acceptance examples are only:
  - `SPARC Fractions Addition\SPARC_Fractions_Addition_stims.json`
  - `SPARC Stoichiometry\SPARC_Stoichiometry_stims.json`
- Runtime rule engine is fixed to **json-rules-engine**.
- Display schema is fixed to `tutorscript-sparc/2.0` (`display.schema`).
- No example-tracing workflow is in this phase.
- History logging must run for every student/interface action.
- `readOnly: true` semantics must be preserved.

Failure policy: **No silent fallbacks for required contract violations.**
Any violation of a required section must fail with explicit diagnostics.

## 1) Package loading
- [ ] Read `*_TDF.json` using existing loader paths (`tutor.setspec` and `stimulusfile`).
- [ ] Resolve each linked `*_stims.json` successfully.
- [ ] Resolve one cluster (`clusterid: 0`) and one stimulus (`stimulusid: 0`) in each package.
- [ ] Preserve lesson-level metadata behavior from existing grader flow (no behavior renames).

## 2) TutorScript display contract (hard gates)
- [ ] `display.type === "sparc"` (required).
- [ ] `display.schema === "tutorscript-sparc/2.0"` (required).
- [ ] `display.unitType` parsed and retained (e.g., `sparc-fractions-addition`, `sparc-stoichiometry-table`).
- [ ] Validate `display.layout.zones` structure:
  - `id/region/anchor/flow` present for each zone.
  - `ordered/accepts/allowedGroupTypes` accepted as optional metadata unless absent.
  - Any zone reference from required node placement must map to a known zone; unmapped required placements fail.

## 3) Node and response contract
- [ ] Enforce two-level node hierarchy:
  - `nodeType === "group"` for groups.
  - `nodeType === "atomic"` for atomic leaves.
- [ ] Every node ID must be unique.
- [ ] Require group `id`, `groupType`, and `placement` for zones used by this contract.
- [ ] Preserve atomic `value` / `selected` / `checked` baseline state.
- [ ] Enforce `readOnly: true` as non-editable control behavior.
- [ ] Parse `response.gradingMode`.
- [ ] Parse `response.evaluation` and apply values:
  - `mathNormalize`, `trimWhitespace`, `ignoreCase`, `allowScientificNotation`.
- [ ] Grade only nodes listed in `response.scoredNodes`.
- [ ] Parse all entries in `response.intentByNode` and validate each `node` is listed in `scoredNodes`.
- [ ] Reject blank/intentionless nodes that have intent entries outside scored scope (explicitly fail fast).

## 4) Layout contract behavior

### Fractions
- [ ] Map `layout.zones` into workspace and side rails as specified by example zones.
- [ ] Place groups by required zone order:
  - `node-group-equation-*` and `node-group-skill-bars` in `workspace`/`skillRail`.
  - `node-group-hint-controls` in `bottomRail`.
  - `node-group-navigation` in `navigation`.
- [ ] Render `workspace` as a vertical stack for equation rows.
- [ ] Render right rail in expected top-right positioning and width behavior from `layout.regions`.

### Stoichiometry
- [ ] Render title/hint shell from `topbar` metadata if present.
- [ ] Map:
  - `node-group-problem-statement` -> `leftPanel`
  - `node-group-hint-window` -> `rightPanel`
  - `node-group-table` -> `workPanel`
  - `node-group-reason-bar` -> `footer`
- [ ] Apply widths from `layout.regions` for left/right panels and preserve expected ordering.

## 5) Grading/response verification (example-specific acceptance)
- [ ] Fractions:
  - require converted top to `2`
  - require first sum numerator to `2`
  - require result numerator `5` and denominator `12`
- [ ] Stoichiometry:
  - require fixed givens and all scored open-response nodes with expected values present in `scoredNodes`/`intentByNode`
  - preserve blank/unscored open fields as non-gated open response.

## 6) Rules and state integration (runtime behavior)
- [ ] `json-rules-engine` inputs are normalized runtime facts only (no raw DOM/event payloads).
- [ ] Rule actions must be emitted as action contracts and applied through the state-update boundary.
- [ ] Rules may request interface actions; interface state updates must be explicit and reversible only through action handlers.
- [ ] Each rule match must include origin metadata for traceability (`ruleId` / match index).

## 7) Compatibility and diagnostics
- [ ] Unknown required fields fail with explicit errors.
- [ ] Unknown optional fields do not crash but are recorded and reported as warnings.
- [ ] Unknown `groupType`/`atomType` in required zone placement is a hard fail for phase 1.
- [ ] Output a compact diagnostics report:
  - contract violation count
  - first hard-failure detail
  - unresolved IDs / missing references

## 8) Implementation status marker (this phase)
- [x] `readOnly` preservation is required and validated.
- [x] `display.schema` phase-1 gate is active.
- [x] Example packages are the canonical acceptance source.
- [ ] KT integration path reuses flash-card evidence via `stimulusid` (implementation verification).
- [ ] Rule-action dispatch path exists for phase-1 adaptive feedback/hints and grading updates.
