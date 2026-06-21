# SPARC Modularity And Efficiency Audit Prompt

## Goal

Audit the MoFaCTS SPARC system for the top five to ten concrete fixes or improvements that would make it more efficient, modular, observable, explainable, and scalable. The audit must be grounded in the actual local source tree, must preserve working behavior, and must respect the project invariant that avoidable computation, state retention, and reshaping should stay off the server.

The final audit output should be a ranked plan, not an implementation. Create that final review document as `SPARC MODULARITY AND EFFICIENCY PLAN.md` in the repository root. Each recommendation must describe the problem, the evidence, the likely impact, the smallest coherent fix, affected files, verification, and any compatibility checks needed in `C:\dev\mofacts_config` or `C:\dev\MoFaCTS.wiki`.

## Operating Rules

- Work in `C:\dev\MoFaCTS`.
- Do not use fallback paths, fallback repositories, or substitute runtime surfaces.
- Treat `mofacts/` and `learning-components/` as the source of truth for SPARC runtime and UI behavior.
- Treat `C:\dev\mofacts_config` as the canonical source for TDF/config compatibility checks.
- Treat `C:\dev\MoFaCTS.wiki` as the canonical wiki source when documentation updates may be needed.
- Stay on the current branch. Do not create a new branch.
- Do not make code changes during the audit unless explicitly asked after the plan is reviewed.
- Do not run Docker build, push, or deploy commands.
- Do not run `meteor run` directly. For UI observation, use the documented native hotfix dev loop and MoFaCTS Playwright sidecar.
- Do not recommend moving work to server methods unless the work requires database access, authorization enforcement, secrets, encryption, or external API calls.
- Do not recommend silent compatibility shims or recovery behavior that hides broken invariants.
- Preserve existing working paths, especially any reference SPARC authoring, runtime, or model-history flows.

## Primary Audit Surfaces

Start with these local source areas and expand only when an import, runtime call, or data contract requires it:

- `learning-components/units/sparcsession/`
- `learning-components/trial-displays/sparc/`
- `learning-components/models/`
- `learning-components/content/display/`
- `mofacts/client/views/experiment/svelte/components/SparcNode.svelte`
- `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte`
- `mofacts/client/views/experiment/svelte/services/sparc*.ts`
- `mofacts/client/views/experiment/svelte/services/historyLogging.sparc.test.ts`
- `mofacts/client/views/experiment/svelte/machine/sparcRuntimeActions.ts`
- `mofacts/client/views/experimentSetup/sparcEdit.ts`
- `mofacts/client/views/experimentSetup/sparc/SparcAuthoringEditor.svelte`
- `mofacts/client/views/home/learningDashboard.ts`
- `learning-components/units/UnitEngineServerMethods.ts`
- Any server method, publication, history, or persistence path used by SPARC.

## Questions To Answer

1. Where does SPARC work run today: pure learning component, Svelte client UI, Meteor client service, server method, publication, or database query?
2. Are any server calls doing computation, reshaping, broad reads, replay, filtering, or enrichment that could safely happen on the client from already available data?
3. Are any client paths retaining more SPARC history, rendered content, derived state, DOM state, or editor state than necessary?
4. Are any replay or rule-evaluation paths repeatedly recomputing derived structures that could be cached, indexed, memoized, or incrementally updated without hiding correctness problems?
5. Are SPARC module names, type names, event names, state names, and function names interpretable to an outside engineer or AI inspector?
6. Do the current module boundaries make the domain flow obvious: authored document, display adapter, runtime state, working memory facts, rule evaluation, response outcome, model-history exchange, progress reporting, and persistence?
7. Are there long files or mixed-responsibility modules that now carry multiple separable concerns?
8. Are validation errors and thrown invariants specific enough to explain which SPARC document, node, rule, stimulus, or history record failed?
9. Is logging useful and admin-controlled, or are important transitions invisible while routine noise would be too costly?
10. Are tests organized around the real invariants, or do important scalability and explainability contracts lack coverage?

## Required Evidence Collection

Collect evidence before ranking recommendations:

- Inventory SPARC files by size and responsibility.
- Trace the runtime path from a SPARC trial display through response handling, production-rule evaluation, history commit, model-history exchange, progress reporting, and UI update.
- Trace the authoring path from `sparcEdit.ts` into `SparcAuthoringEditor.svelte`, save validation, rich text normalization, and any TDF mutation or persistence boundary.
- Trace server method usage related to SPARC, including argument size, returned data shape, database access, and whether the server is doing pure compute.
- Inspect tests that cover SPARC contracts and note gaps around performance, state replay, validation messages, naming, and client/server boundaries.
- Inspect `C:\dev\mofacts_config` only when a proposed change could affect TDF fields, config structure, SPARC display shape, registry entries, rule schema, or expected history payloads.
- Inspect `C:\dev\MoFaCTS.wiki` only when a proposed change would require operator, authoring, developer, or maintainer documentation updates.

Useful starting commands:

```powershell
rg -n "SPARC|Sparc|sparc" -S learning-components mofacts
Get-ChildItem -Recurse -File learning-components\units\sparcsession,learning-components\trial-displays\sparc | Sort-Object Length -Descending | Select-Object FullName,Length
Get-ChildItem -Recurse -File mofacts\client\views\experiment,mofacts\client\views\experimentSetup | Where-Object { $_.Name -match 'Sparc|sparc' } | Sort-Object Length -Descending | Select-Object FullName,Length
rg -n "getSparcHistoryForUnit|sparc.*history|SparcPracticeHistory|commitSparc|evaluateSparc|productionRule|workingMemory|modelHistory|Meteor\.call|methods" -S learning-components mofacts
rg -n "console\.|clientConsole|clientLogger|throw new Error|TODO|FIXME|any\\)|: any|Record<string, unknown>" -S learning-components\units\sparcsession learning-components\trial-displays\sparc mofacts\client\views\experiment mofacts\client\views\experimentSetup
```

## Ranking Criteria

Rank each candidate fix by:

- Scalability impact: less server CPU, less server memory, fewer broad reads, smaller payloads, less replay, fewer repeated allocations.
- Modularity impact: clearer ownership, smaller public contracts, less mixed UI/runtime/persistence logic.
- Observability impact: better traces, specific errors, better inspection points, less hidden state.
- Explainability impact: clearer names, clearer event and state vocabulary, easier outside audit.
- Regression risk: compatibility with existing SPARC content, runtime behavior, authoring behavior, and tests.
- Implementation size: smallest coherent change that fixes the boundary or invariant rather than masking symptoms.

Prefer high-impact, low-risk fixes that can be implemented incrementally. Do not recommend broad rewrites unless the evidence shows an existing boundary is fundamentally incoherent.

## Recommendation Format

For each of the top five to ten recommendations, use this structure:

```markdown
### N. Short Action-Oriented Title

Priority: High | Medium | Low
Primary theme: Server scalability | Client memory | Module boundary | Observability | Naming | Tests | Documentation

Problem:
Evidence:
Why it matters:
Smallest coherent fix:
Affected files:
Compatibility checks:
Verification:
Risks and guardrails:
```

`Evidence` must cite concrete files and, where helpful, specific functions, types, server methods, or Svelte sections. Do not write generic advice without a local source reference.

## Things To Look For Specifically

- Server methods that return broad SPARC history when a bounded projection, exact unit key, or incremental history request would be enough.
- Pure SPARC rule evaluation, replay, display readiness, response classification, model target extraction, or progress calculation performed server-side.
- SPARC history caches that can grow without explicit bounds, invalidation rules, or document/unit scoping.
- Repeated conversion between trial-display records and authored-document records during a single trial.
- Repeated full replay of document history when incremental replay state could be carried safely at the client boundary.
- Large Svelte files mixing domain modeling, DOM interaction, validation, persistence, rich text editing, and layout concerns.
- Names that hide domain meaning, such as generic `result`, `state`, `entry`, `target`, `condition`, or `event` in exported contracts or complex flows.
- Error messages that omit SPARC document id, node id, rule id, stimulus id, unit key, or history record id.
- Logging that either misses important SPARC state transitions or would create noisy routine client logs.
- Tests that prove behavior but not boundary invariants, such as "server does only persistence/auth", "history fetch is bounded", or "replay state is document-scoped".

## Expected Final Document Shape

The completed audit should create `SPARC MODULARITY AND EFFICIENCY PLAN.md` in the repository root with:

1. Executive summary, limited to the most important findings.
2. Current SPARC architecture map, with client, learning-component, server, persistence, and config boundaries.
3. Ranked top five to ten recommendations using the required format.
4. Non-goals and rejected ideas, especially anything that would move unnecessary work to the server.
5. Suggested implementation order.
6. Verification plan.
7. Documentation/config compatibility notes.

## Success Definition

The audit is complete when an outside engineer or AI agent can read the resulting plan and understand:

- which SPARC fixes matter most,
- exactly where the evidence lives,
- why each fix improves efficiency, modularity, observability, or explainability,
- how each fix preserves MoFaCTS scalability goals,
- which changes can be made independently,
- and how to verify each change without relying on fallback paths or unsupported local workflows.
