# AutoTutor and SPARC Architecture Merge Plan

## Status

This document is a design and implementation planning note. It replaces the narrower idea that AutoTutor should only use SPARC production rules.

The revised direction is stronger:

```text
SPARC should become the broader authored tutoring architecture. Original AutoTutor remains the existing `autotutorsession` runtime, while AutoTutor-derived generated content runs as ordinary `sparcsession` content.
```

The original AutoTutor system must not be removed or silently replaced. After this work is complete, MoFaCTS should be able to run:

1. Original AutoTutor.
2. Generated SPARC session content derived from AutoTutor source material.

The generated path must not become a second AutoTutor runtime hidden inside SPARC. It should be independently selectable through the ordinary `sparcsession` unit path and may share only code that lives outside both original AutoTutor and SPARC-specific implementation as explicit common infrastructure.

## Core Design Conclusion

AutoTutor fits the full SPARC architecture, not just the SPARC production-rule evaluator.

SPARC already has the architectural elements AutoTutor needs:

- authored structured content
- runtime working-memory facts
- production rules
- state writes
- deterministic state transitions
- history and replay
- explicit runtime addresses
- renderer/state separation

AutoTutor's expectations, misconceptions, learner questions, coverage scores, focus state, target selection, move selection, and tutor utterance can all be represented inside a SPARC-style runtime.

The important architectural move is therefore:

```text
Build SPARC-backed AutoTutor as ordinary SPARC-authored tutoring content, not a one-off AutoTutor rule adapter.
```

SPARC should become a general interactive tutoring architecture with multiple realizations:

- page/document realization for current SPARC sessions
- sequential dialogue-style SPARC node rendering
- later mixed page-plus-dialogue SPARC layouts

## Non-Negotiable Invariant

Original AutoTutor remains intact.

This implementation is a SPARC-side change. The production implementation work should modify SPARC, neutral shared runtime infrastructure extracted from SPARC, SPARC-backed AutoTutor modules, tests, and config-translation tooling. It should not modify original AutoTutor runtime code.

SPARC-backed AutoTutor must not import original AutoTutor runtime internals as a hidden dependency, and original AutoTutor must not depend on SPARC-backed AutoTutor internals.

Allowed sharing:

- shared type-safe utility functions
- shared model-practice infrastructure
- shared history envelope infrastructure
- shared LLM client infrastructure
- shared authored-content normalization helpers if they are outside both systems
- shared generalized SPARC/pedagogical runtime infrastructure

Disallowed sharing:

- original AutoTutor calling into SPARC-backed AutoTutor implementation
- SPARC-backed AutoTutor calling into original AutoTutor planner/state-machine implementation as production behavior
- silent compatibility fallbacks from one system to the other
- editing original AutoTutor planner, state-machine, unit-engine, runtime-config, or client/server runtime code as part of the SPARC-backed implementation
- modifying original AutoTutor behavior to make the SPARC version easier
- deleting or replacing original AutoTutor routes, unit-engine registration, or TDF compatibility

Development comparisons may inspect original AutoTutor output for orientation, but SPARC-backed AutoTutor is not expected to be internally equivalent to the current original implementation. Production behavior must not use the original implementation as a fallback.

Original AutoTutor code should be treated as read-only for this work, except for test additions that prove it still runs unchanged. Any real bug fix to original AutoTutor should be a separate, explicitly approved change with its own verification.

## Naming And Runtime Shape

The two systems should be clearly distinguishable.

Working names:

- Original AutoTutor: existing `autotutorsession` behavior.
- SPARC-backed AutoTutor: shorthand in this plan for ordinary `sparcsession` content generated from AutoTutor source material.

The runtime path must be explicit from the authored unit: original AutoTutor uses `autotutorsession`; the generated SPARC version uses ordinary `sparcsession` content. A lesson author or test should be able to choose original AutoTutor or the generated SPARC version deliberately.

No automatic migration should occur in the first implementation.

## Architectural Model

The target architecture is:

```text
Authored AutoTutor/SPARC dialogue content
  -> SPARC-style runtime document/session
  -> learner response submitted
  -> LLM scoring/evaluation facts
  -> target selection
  -> salience-ranked move-selection productions
  -> highest-salience valid selected action
  -> LLM utterance generation constrained by the selected target and move
  -> history/replay updates
```

Current SPARC page sessions remain:

```text
Authored SPARC page content
  -> SPARC-style runtime document/session
  -> facts, state, and history
  -> production rules
  -> page mutation, messages, and classification
```

The shared architecture is the session/runtime model, not only the rule evaluator.

## Current Relevant Code

Original AutoTutor:

- `learning-components/units/autotutor/AutoTutorPlanner.ts`
- `learning-components/units/autotutor/AutoTutorStateMachine.ts`
- `learning-components/units/autotutor/AutoTutorUnitEngine.ts`
- `learning-components/units/autotutor/AutoTutorRuntimeConfig.ts`
- `learning-components/units/autotutor/AutoTutorRuntimeCapabilities.ts`

Current SPARC:

- `learning-components/units/sparcsession/sparcSessionContracts.ts`
- `learning-components/units/sparcsession/sparcProductionRuleEvaluator.ts`
- `learning-components/units/sparcsession/sparcStateReplay.ts`
- `learning-components/units/sparcsession/sparcDocumentReplay.ts`
- `learning-components/units/sparcsession/sparcTrialDisplayRuntimeBridge.ts`
- `learning-components/trial-displays/sparc/`

Client SPARC integration:

- `mofacts/client/views/experiment/svelte/services/sparcProductionRuleActionCommit.ts`
- `mofacts/client/views/experiment/svelte/services/sparcProductionRuleHistoryCache.ts`
- `mofacts/client/views/experiment/svelte/services/sparcTrialDisplayRuntimeContextCache.ts`
- `mofacts/client/views/experiment/svelte/services/sparcTrialDisplay.ts`

## Boundary Change

The old plan treated SPARC production rules as the shared piece. That is too narrow.

The new plan treats the SPARC session architecture as the shared piece:

- authored session structure
- runtime state
- facts
- rule execution
- state writes
- history/replay
- state-driven rendering

To keep the original AutoTutor runtime and generated SPARC content separate, extract only the shared SPARC architecture that is actually needed as neutral runtime capability. Current SPARC page sessions and generated AutoTutor dialogue must both continue through the ordinary `sparcsession` runtime. AutoTutor-specific logic belongs in package translation and generated authored content, not in a SPARC-backed AutoTutor runtime adapter.

Possible shared location:

- `learning-components/runtime/pedagogicalSession/`
- `learning-components/runtime/sparcSessionCore/`
- `learning-components/runtime/productionRules/` for rule primitives only

The exact names can be decided during implementation. The invariant is more important than the folder name: shared infrastructure must be outside both AutoTutor implementations.

## BRD Graph Conversion Correction

CTAT `.brd` files are not only production-rule source. In example-tracing tutors, the graph edges define branch membership, ordering, and completion reachability, while each edge's rule label supplies KC / production attribution. A converter that reads only the `<rule>` labels loses tutoring behavior.

For BRD-to-SPARC conversion, treat the graph as authored behavior:

- divergent outgoing edges from the same source state define branch selectors
- edge SAI triples define learner actions
- edge rule labels define KC / production attribution
- downstream edges reachable only through a branch must become production conditions over explicit branch facts
- done-state edges must become completion productions gated by the branch facts that precede the done edge
- branch-specific visibility, enablement, or progressive reveal must be driven by the same branch facts instead of relying on the example-tracing graph to hide invalid paths

For the SPARC Fractions `1416.brd` case, `firstDenConv=12` selects the LCD branch and `firstDenConv=24` selects the product-denominator branch. The active denominator/path fact must replace prior active-path state, not accumulate alongside stale branch facts; later numerator, answer, simplification, and Done productions must be sensitive to that active branch.

When graph conversion needs reusable transient facts, generated SPARC pages may author `display.derivedFacts`: a load-time/runtime list of production-rule-shaped derivations that assert non-persistent working-memory facts from authored facts, replayed state, and the current interface event before ordinary production rules run. Use this for deterministic branch lookup facts such as the valid converted numerator for each denominator path. Do not use it for durable current-path state; active branch/path selection that must survive reload remains a stable SPARC state write projected back into working memory.

## What Generated AutoTutor Content Owns

Generated AutoTutor content should use the ordinary SPARC document/session contract. Any needed controller, target-selection, production-phase, or replay behavior must be added as a general SPARC runtime capability and exercised by the generated content, not owned as a SPARC-backed AutoTutor subsystem.

The AutoTutor conversion work should own:

- generated SPARC content and converter fixtures
- content translation logic from AutoTutor-like script fields into ordinary SPARC nodes, facts, rules, state, and generated clusterKCs
- generated rule catalogues and authored policy inputs
- generated utterance-generation inputs
- tests proving the generated content runs as ordinary `sparcsession`

The implementation should use general SPARC/pedagogical-session infrastructure for:

- working-memory facts
- controller target selection and selected-action state
- production-rule evaluation and terminal rule stops
- state write application
- runtime address types
- history envelope writing and replay
- LLM scoring and utterance client boundaries

## What Original AutoTutor Keeps

Original AutoTutor keeps its current:

- planner
- state machine
- runtime config
- unit engine
- TDF compatibility
- history format compatibility
- client/server interaction path

Original AutoTutor should not be edited as part of the SPARC-backed implementation. It should not be reshaped, simplified, or refactored to share implementation with SPARC-backed AutoTutor.

If original AutoTutor and SPARC-backed AutoTutor appear to need common helpers, do not move original AutoTutor onto those helpers in the first SPARC-backed implementation. Add neutral shared helpers only for the new SPARC-backed path unless a separate, explicitly approved original-AutoTutor maintenance change is opened.

## First Implementation Target

The first useful implementation should prove the whole architectural claim, not just rule reuse.

Recommended first slice:

```text
Run one SPARC-backed AutoTutor dialogue turn end to end beside original AutoTutor.
```

That slice should include:

1. A generated SPARC package selected through the ordinary `sparcsession` content path.
2. Conversion of an authored AutoTutor script into SPARC-style dialogue facts/state.
3. Deterministic target selection through a general SPARC controller target-selection capability.
4. Deterministic Production Rule Move Selection.
5. LLM utterance generation constrained by the selected target and move.
6. Sequential SPARC node updates for the learner and tutor utterances.
7. Ordinary SPARC history records that can be replayed by the `sparcsession` path.
8. Tests proving original AutoTutor still runs unchanged.

This first slice may support a narrow subset of AutoTutor behavior, but it must use the new architecture honestly.

## Migration Strategy

Do not migrate existing AutoTutor lessons automatically at runtime.

Instead, use a repeatable config conversion step. The original AutoTutor runtime remains available in the application, but canonical converted config content should replace the AutoTutor package content in place. Do not save duplicate original AutoTutor packages beside the converted SPARC packages in the canonical config repository. Source provenance belongs in the conversion report and generated metadata, and the pre-conversion source remains recoverable through version control.

This keeps runtime regression safety without turning the config repository into two parallel lesson sets.

The config repository is part of the migration, not an afterthought. The app-runtime work is incomplete until the canonical AutoTutor lessons can be translated into SPARC-backed AutoTutor lessons in place and loaded through ordinary `sparcsession`.

## Config Content Translation

Existing AutoTutor lessons live in the canonical config repository at:

```text
C:\dev\mofacts_config
```

The current package pattern is:

- a TDF file with an `autotutorsession` unit
- a stimulus file whose first stim contains display text and an `autoTutor` script
- lesson identity from the existing package files

The generated SPARC version needs an explicit conversion path from this content shape into ordinary SPARC session content.

The translation must preserve:

- lesson prompt/display text
- AutoTutor script id
- topic
- learning goal
- ideal answer
- source AutoTutor expectation content, converted to clusterKCs
- source expectation labels, retained only as provenance or widget display labels where needed
- propositions
- acceptable variants
- common partial answers
- hints
- prompts
- assertions
- misconceptions
- correction text
- repair questions
- summary
- max-turn policy
- graduation policy
- model override fields
- lesson identity, preserving the canonical package identity unless a deliberate rename is part of the migration

The translation must also add SPARC-backed runtime material:

- SPARC document id
- ordinary `sparcsession` unit selection for SPARC-backed AutoTutor
- one generated clusterKC per source expectation; runtime facts and rules identify the learning target by `clusterKC`, not by the source AutoTutor expectation id
- KC graph facts derived from the source AutoTutor relationship graph or generated with the neutral cluster-KC relationship engine
- initial working-memory facts
- target-selection policy inputs and references to the general SPARC controller target-selection capability
- authored move-selection rules or references to default move-selection rules
- utterance-generation inputs
- ordinary SPARC history/replay content, with no generated AutoTutor-specific replay identity fields
- enough conversion-report provenance to identify the original AutoTutor source package

Translated packages replace the original AutoTutor package content in the canonical config repository. The important invariant is that a human and a test can tell the package was generated from an original AutoTutor source through the conversion report, generated provenance, and ordinary git history, not by keeping a second saved original package beside it.

## Config Translation Tooling

Add a repeatable translator rather than hand-editing every package.

The translator should:

1. Inventory all original AutoTutor packages in `C:\dev\mofacts_config`.
2. Read each source TDF and stimulus file.
3. Validate that the source package has exactly the authored fields required for conversion.
4. Produce a generated SPARC session TDF and stimulus package with deterministic names and ids.
5. Preserve source provenance in generated files.
6. Fail clearly on unsupported source shapes instead of silently dropping fields.
7. Support a dry-run mode that reports intended file changes.
8. Support write/update mode only for deliberate canonical conversion, with provenance/report output and collision checks that prevent accidental writes to unrelated packages.
9. Produce a conversion report listing converted packages, skipped packages, warnings, and blocking errors.

The legacy one-shot converter has been removed from the app repository. Current AutoTutor SPARC packages in `C:\dev\mofacts_config` are maintained as authored runtime content. Future migration tooling, if needed, should be introduced as a deliberate content-maintenance workflow with explicit provenance and tests, not as a runtime dependency or an implied source of truth.

## Translation Procedure

This section specifies how an original AutoTutor package should become a generated SPARC session package.

### Current Original AutoTutor Package Shape

Current AutoTutor packages in `C:\dev\mofacts_config` use this pattern:

```json
{
  "tutor": {
    "setspec": {
      "lessonname": "AutoTutor Nonviolent Communication",
      "name": "autotutor_nonviolent_communication",
      "stimulusfile": "AutoTutor_Nonviolent_Communication_stims.json",
      "openRouterModel": "openai/gpt-5.4-nano",
      "tags": ["autotutor"]
    },
    "unit": [
      {
        "unitname": "Nonviolent Communication AutoTutor",
        "autotutorsession": {
          "cluster": 0,
          "maxTurns": 25,
          "graduation": {
            "requiredExpectationCount": 6,
            "maxActiveMisconceptions": 0
          }
        }
      }
    ]
  }
}
```

The referenced stimulus file uses this pattern:

```json
{
  "setspec": {
    "clusters": [
      {
        "stims": [
          {
            "display": {
              "text": "Opening learner prompt"
            },
            "autoTutor": {
              "id": "communication_nvc_001",
              "topic": "Nonviolent Communication",
              "learningGoal": "Learning goal text",
              "idealAnswer": "Ideal answer text",
              "expectations": [],
              "misconceptions": [],
              "summary": "Summary text"
            }
          }
        ]
      }
    ]
  }
}
```

### Generated SPARC-Backed Package Shape

The generated SPARC-backed content replaces the original package content in place only during explicit migration write mode. Dry-run mode may build a generated draft and report the source paths it would replace, but the canonical config repository should not keep a side-by-side original AutoTutor package beside the converted SPARC package.

The converted TDF should use the existing `sparcsession` unit selector. The converted version is an ordinary SPARC session whose authored display, facts, rules, and initial state implement the adapted AutoTutor behavior. Do not add another unit selector.

```json
{
  "tutor": {
    "setspec": {
      "lessonname": "SPARC Session Nonviolent Communication",
      "name": "sparc_session_nonviolent_communication",
      "stimulusfile": "SPARC_Session_Nonviolent_Communication_stims.json",
      "openRouterModel": "openai/gpt-5.4-nano"
    },
    "unit": [
      {
        "unitname": "Nonviolent Communication SPARC Session",
        "sparcsession": {
          "pageId": "sparc-session-communication-nvc-001"
        }
      }
    ]
  }
}
```

The converted TDF should select the generated SPARC page with `sparcsession.pageId` when the stimulus file has one or more named SPARC pages. SPARC-backed AutoTutor still has a real SPARC session cluster list/model scope: source AutoTutor expectation function is merged into ordinary generated clusterKCs, and the active SPARC session cluster list must include exactly those generated clusterKCs that the selected SPARC page uses. Current `sparcsession` runtime derives that active model cluster scope from cluster references in the selected SPARC page; if a generated or authored `sparcsession.clusterlist` is also present for tooling compatibility, it must be validated against the page-derived cluster list and must not become a divergent second source of truth.

The generated stimulus file should include a SPARC document using the existing SPARC display schema, `tutorscript-sparc/1.0`, in the current SPARC package location: `setspec.sparcPages[].display`. Do not put the runnable SPARC document only in `setspec.clusters[].stims[].display`; current `sparcsession` runtime resolves pages from the active TDF's `rawStimuliFile.setspec.sparcPages`.

Implementation should not invent a second SPARC display schema or a parallel AutoTutor metadata block. AutoTutor source content must be translated into ordinary SPARC nodes, facts, rules, and state.

```json
{
  "setspec": {
    "clusters": [
      {
        "stims": [
          {
            "display": {
              "type": "text",
              "text": "SPARC-backed AutoTutor source prompt and generated clusterKC placeholder"
            }
          }
        ]
      }
    ],
    "sparcPages": [
      {
        "pageId": "sparc-session-communication-nvc-001",
        "display": {
          "type": "sparc",
          "schema": "tutorscript-sparc/1.0",
          "documentId": "sparc-session-communication-nvc-001",
          "nodes": [
            {
              "id": "expectation-clusters",
              "nodeType": "group",
              "groupType": "cluster-references",
              "clusterIndices": [0]
            }
          ],
          "clusterTargets": [
            {
              "clusterIndex": 0,
              "label": "Expectation E1"
            }
          ],
          "workingMemoryFacts": [],
          "productionRules": []
        }
      }
    ]
  }
}
```

### Translation Pseudocode

```ts
function translateAutoTutorPackage(sourcePackagePath: string): TranslationResult {
  const sourceTdfPath = findSingleTdf(sourcePackagePath);
  const sourceTdf = readJson(sourceTdfPath);
  const sourceStimulusPath = resolveStimulusFile(sourcePackagePath, sourceTdf.tutor.setspec.stimulusfile);
  const sourceStimulus = readJson(sourceStimulusPath);

  const autoTutorUnit = findSingleUnitWithAutoTutorSession(sourceTdf);
  const autoTutorSession = autoTutorUnit.autotutorsession;
  const sourceCluster = requireCluster(sourceStimulus, autoTutorSession.cluster);
  const sourceStim = requireFirstStim(sourceCluster);
  const sourceScript = requireAutoTutorScript(sourceStim.autoTutor);

  validateSourceTdf(sourceTdf);
  validateSourceAutoTutorSession(autoTutorSession);
  validateSourceStim(sourceStim);
  validateAutoTutorScript(sourceScript);

  const generatedIds = deriveGeneratedIds({
    sourceLessonName: sourceTdf.tutor.setspec.lessonname,
    sourceSetName: sourceTdf.tutor.setspec.name,
    sourceScriptId: sourceScript.id
  });

  const sparcDraft = translateAutoTutorPackageToSparcDraft({
    documentId: generatedIds.documentId,
    openingPrompt: sourceStim.display.text,
    script: sourceScript,
    maxTurns: autoTutorSession.maxTurns,
    graduation: autoTutorSession.graduation,
    sourceProvenance: buildSourceProvenance(sourcePackagePath, sourceTdfPath, sourceStimulusPath)
  });

  const sparcDialogueDocument = buildSparcDialogueDocument(sparcDraft);

  const generatedTdf = buildGeneratedSparcTdf({
    sourceTdf,
    sourceUnit: autoTutorUnit,
    generatedIds,
    sourceSession: autoTutorSession,
    sourceProvenance: buildSourceProvenance(sourcePackagePath, sourceTdfPath, sourceStimulusPath)
  });

  const generatedStimulus = buildGeneratedSparcStimulus({
    sourceStimulus,
    sourceScript,
    sparcDialogueDocument,
    generatedIds
  });

  validateGeneratedTdf(generatedTdf);
  validateGeneratedStimulus(generatedStimulus);
  validateGeneratedSparcDocument(sparcDialogueDocument);

  return {
    convertedPackagePath: sourcePackagePath,
    files: [
      { path: sourceTdfPath, json: generatedTdf },
      { path: sourceStimulusPath, json: generatedStimulus }
    ],
    report: buildTranslationReport()
  };
}
```

### `buildSparcDialogueDocument` Pseudocode

```ts
function buildSparcDialogueDocument(input: BuildDocumentInput): SparcTrialDisplay {
  return {
    type: 'sparc',
    schema: 'tutorscript-sparc/1.0',
    documentId: input.documentId,
    layout: {
      layoutMode: 'document',
      scrollAxis: 'vertical',
      visualPreset: 'practice-panel',
      density: 'comfortable',
      zones: [
        { id: 'dialogue', label: 'Dialogue' },
        { id: 'learner-input', label: 'Learner input' }
      ]
    },
    nodes: [
      createDialogueContainerNode(),
      createOpeningTutorMessageNode(input.openingPrompt),
      createLearnerInputNode()
    ],
    workingMemoryFacts: [
      ...createScriptFacts(input.script),
      ...createThresholdFacts(input),
      ...createGraduationFacts(input.graduation)
    ],
    productionRules: [
      ...createInitialMoveSelectionRules(),
      createAppendLearnerMessageRule(),
      createAppendTutorMessageRule(),
      createCompletionUiRule()
    ]
  };
}
```

Generated SPARC-backed AutoTutor packages must follow the same load path as current SPARC examples in `C:\dev\mofacts_config`: ordinary stimulus clusters remain available for KC identity and package compatibility, while the runnable SPARC page lives under `setspec.sparcPages`. The generated SPARC page must reference every generated clusterKC through existing SPARC cluster-reference mechanisms so the current `sparcsession` runtime loads the corresponding KCs from the first stim in each cluster.

### Generated ClusterKCs And KC Graphs

The expectation function is merged into clusterKCs. During conversion, each source AutoTutor expectation becomes one ordinary generated stimulus cluster with a stable `clusterKC`. In the generated stimulus file and generated runtime, it is a clusterKC, not an expectation-list entry. Runtime facts and rules identify the learning target by `clusterKC`, not by the source AutoTutor expectation id. Each generated clusterKC should have:

- a stable `clusterKC` derived from the source script id and expectation id
- a first stim with a stable `stimulusKC`
- display text that identifies the source proposition for model/debug visibility without becoming the runnable SPARC dialogue page
- deterministic cluster index assignment recorded in the conversion report

Generated code and generated config files must not introduce an expectation list, expectation fact type, expectation runtime state branch, or expectation-specific schema branch. The only generated code/config surface that may retain the word "expectation" is the transferred SPARC version of AutoTutor's special skill bar widget. That widget is a display compatibility surface; it must read ordinary clusterKC coverage and selection state, not a separate expectation runtime model.

The generated SPARC display must reference generated clusterKCs through existing SPARC cluster-reference mechanisms:

- `clusterTargets[]` entries for generated clusterKCs when explicit targets are needed
- `clusterIndices` on generated nodes or facts when a node/fact needs to point at a specific generated clusterKC
- source expectation ids retained as provenance or labels only where needed for conversion diagnostics, source comparison, or tests

This is required because the current SPARC runtime derives the active page's cluster scope from cluster references in the SPARC page, then loads KC identity from the ordinary stimulus cluster's first stim. If a generated clusterKC is not referenced by the generated SPARC page, its `clusterKC`/`stimulusKC` will not be part of the active SPARC session learning-target set.

SPARC-backed AutoTutor must use the same general cluster-KC graph path intended for ordinary named clusters. This is not an AutoTutor-only relationship graph. Any cluster with a stable `clusterKC` and usable descriptive text can participate in the generated KC graph. For generated AutoTutor content, each source expectation statement becomes the descriptive text for a generated clusterKC. For ordinary SPARC or model-practice content, cluster-level descriptions or first-stimulus descriptive text can serve the same role.

Runtime logic must use the generated `clusterKC` as the only learning-target id. SPARC nodes and facts attach to it through existing cluster-reference mechanisms such as `clusterIndices`. The source AutoTutor expectation id is provenance only.

The generated cluster-KC relationship graph must also be translated into SPARC working-memory facts. This graph is required for the SPARC-backed AutoTutor baseline because current AutoTutor target selection recomputes frontier, coherence, centrality, and priority from fixed source relationship data, then chooses the next uncovered clusterKC by priority. If the source `autoTutor` script already has `expectationRelationships`, preserve the graph semantics after validating that every source and target id resolves to exactly one generated `clusterKC`. If it is absent, the conversion path must generate the graph from source expectation descriptions with the same general cluster-KC relationship generator used for other named clusters, or fail clearly with an unsupported-source error. Do not silently run with an empty graph.

Move the embedding/cosine relationship code behind a neutral `clusterKcRelationshipEngine` boundary that accepts cluster KC identities and descriptions. AutoTutor conversion should call that general generator with `{ clusterKC, description }` inputs; original AutoTutor may remain unchanged or use an adapter later. The generated SPARC path must not call original AutoTutor runtime orchestration such as `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts` as a production dependency; original AutoTutor remains a reference implementation and test oracle only.

Relationship generation must happen before generated clusterKC identities are finalized. The converter must keep these identities aligned and type-stable:

- source AutoTutor expectation id as a string
- generated cluster index as a non-negative integer
- generated `clusterKC` as the canonical learning-target identity, with first-stimulus `stimulusKC` preserved for the existing SPARC cluster target path
- generated relationship graph source and target ids as `clusterKC` identities
- source expectation id to generated `clusterKC` provenance for diagnostics and migration audit only, not as runtime identity

The conversion report must include the relationship provenance, the source expectation id to generated `clusterKC` provenance, and a validation result proving every relationship source and target resolves to exactly one generated clusterKC.

Relationship generation is a package-preparation or conversion-time step, matching original AutoTutor's one-time missing/stale graph generation and persistence. Runtime target selection must not call embeddings, rebuild the relationship graph, or mutate relationship facts during a turn. It only reads the fixed authored/generated graph while mutable learner/planner facts such as coverage, frontier, priority, and selected/focused clusterKC change around it.

Centrality should be computed once from the fixed KC graph for each participating `clusterKC`, then stored on the static `kcGraph.node` fact. Coherence is not one scalar per cluster: it is the pairwise relationship strength from the current anchor `clusterKC` to each candidate `clusterKC`. Store those pairwise strengths once as static graph relationships, then look up the needed relationship during target selection. Frontier and priority stay runtime values because they depend on coverage and the current selection/focus state.

Recommended graph fact shapes:

```ts
{ factType: 'kcGraph.node', slots: { clusterKC: 'autotutor.communication_nvc_001.kc.E1', description: 'Nonverbal communication can affect...', centrality: 0.61 } }
{ factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'autotutor.communication_nvc_001.kc.E1', targetClusterKC: 'autotutor.communication_nvc_001.kc.E2', strength: 0.72 } }
```

Target selection for generated dialogue must consume these KC graph facts when computing candidate ranking. It should read precomputed centrality from `kcGraph.node` rather than recomputing centrality from the relationship matrix on every turn. It should read pairwise relationship strength from `kcGraph.relationship` for the current anchor `clusterKC` and candidate `clusterKC`. The generated graph facts are static SPARC package content loaded into working memory for planning, not an AutoTutor-only metadata sidecar and not mutable per-turn runtime state. If later work needs multiple metric algorithms or versions, add versioned slots to the graph node metadata deliberately.

The target-selection pass should write planner-derived ranking values as learning-target candidate facts, not as learner score fields:

```ts
{ factType: 'learningTarget.candidate', slots: { clusterKC: 'autotutor.communication_nvc_001.kc.E1', anchorClusterKC: 'autotutor.communication_nvc_001.kc.E0', coverage: 0.45, coherenceToAnchor: 0.72, frontierScore: 0.396, centralityScore: 0.61, priorityScore: 0.55, eligible: true } }
```

This keeps `learningTarget.score` focused on learner coverage and evidence, while target-selection ranking remains on learning-target candidate facts.

### Field Mapping

| Original AutoTutor field | Generated SPARC-backed destination |
| --- | --- |
| `tutor.setspec.lessonname` | generated lesson name that identifies the copy as a SPARC session |
| `tutor.setspec.name` | generated set name prefixed with `sparc_session_` |
| `tutor.setspec.stimulusfile` | generated SPARC session stimulus file name |
| `tutor.setspec.openRouterModel` | copied unless explicitly overridden |
| `tutor.setspec.openRouterApiKey` | copied only if the existing package already stores it that way; do not invent secrets |
| `tutor.setspec.tags` | copied only when needed for normal package organization; do not add an AutoTutor/SPARC subtype tag |
| `unit[].autotutorsession.cluster` | source AutoTutor script cluster; generated package expands this into generated clusterKCs plus SPARC page selection |
| `unit[].autotutorsession.maxTurns` | generated SPARC runtime fact |
| `unit[].autotutorsession.graduation` | generated SPARC runtime facts |
| `stim.display.text` | opening tutor message node and opening prompt fact |
| `stim.autoTutor.id` | source provenance and generated document id seed |
| `stim.autoTutor.topic` | ordinary SPARC facts and authored text where needed |
| `stim.autoTutor.learningGoal` | ordinary SPARC facts and authored text where needed |
| `stim.autoTutor.idealAnswer` | scoring fact and authored text where needed |
| `stim.autoTutor.expectations[]` | source expectation content only; generated stimulus output is a clusterKC list/generic stimulus clusters, not a generated `expectations[]` branch |
| `stim.autoTutor.expectationRelationships` | source relationship content only; generated output is `kcGraph.node` centrality and `kcGraph.relationship` facts over clusterKCs |
| `stim.autoTutor.misconceptions[]` | misconception facts and correction content |
| no extra AutoTutor dialogue-policy branch | generated policy constants come from existing AutoTutor/unit settings plus the converter's documented default policy and are authored in generated SPARC `display.workingMemoryFacts`; do not add a generated AutoTutor policy branch |
| `stim.autoTutor.summary` | completion/summary content and utterance-generation fact |

### Validation Rules

The translator must fail clearly when:

- the source package has no TDF
- the source package has multiple plausible TDF files and no explicit selector
- the TDF has no `autotutorsession`
- the TDF has multiple `autotutorsession` units and no explicit selector
- the referenced stimulus file is missing
- the configured cluster is missing
- the first stim is missing
- `display.text` is missing or blank
- `autoTutor` is missing
- required AutoTutor script fields are missing
- source expectation ids are missing or duplicated
- source required expectations cannot be resolved to generated clusterKCs
- generated clusterKCs would be missing, duplicated, or unstable
- any source expectation cannot be converted to exactly one generated clusterKC
- source expectation relationship graph entries reference unknown source expectation ids
- source expectation relationships are absent when the selected target-selection policy requires relationship weights and the converter cannot generate them through the neutral cluster-KC relationship engine
- misconception ids are duplicated
- generated ids would collide with unrelated existing package ids or history-stable canonical ids
- generated SPARC display validation fails

The translator may warn, but should still translate, when:

- optional `acceptableVariants` are missing
- optional `commonPartialAnswers` are missing
- optional misconception content is absent
- optional relationship fields are absent

Warnings must appear in the conversion report.

### Dry Run And Update Behavior

Dry run should:

- inventory packages
- validate sources
- compute generated ids and the existing source paths that explicit write mode would replace
- show which files would be updated
- show warnings and blockers
- write no files

Update mode should:

- write converted SPARC-backed package content in place only when explicitly requested
- refuse to overwrite unrelated packages or files whose provenance does not match the selected source package and translator family
- preserve source provenance in generated metadata and the conversion report
- write a conversion report

### Converted Package Report

The conversion report should include:

- source package path
- converted package path
- source TDF path
- converted TDF path
- source stimulus path
- converted stimulus path
- source AutoTutor script id
- generated SPARC document id
- translator version
- source expectation id to generated cluster index/clusterKC provenance mapping
- source relationship graph source: preserved, generated, or unsupported
- counts of source expectations converted to clusterKCs, misconceptions, and generated rules
- warnings
- blocking errors
- whether files were written

The conversion report is human diagnostic/provenance output only. Runtime identity, cluster references, graph facts, and policy facts must be read from the generated SPARC package, not from the report.

Canonical authored content versus refreshable generated detail:

- Canonical content after migration: lesson identity, prompt, source-derived clusterKC identities, generated first-stimulus `stimulusKC` values, learner-facing expectation/proposition text, misconceptions, hints/prompts/assertions, summary text, authored thresholds, graduation/max-turn policy, model/provider settings, SPARC page id/document id, node ids that history/replay depends on, and source provenance.
- Refreshable generated implementation detail: production-rule object ordering when semantically equivalent, generated rule ids that are explicitly versioned by the converter, layout scaffolding that has no history identity, derived KC graph metric values when source descriptions or relationship generation settings change, conversion report formatting, and generated comments/diagnostic metadata.
- A field becomes canonical once learner history, authored references, external research analysis, or stable package identity depends on it. The converter may refresh implementation details automatically, but it must not silently rename canonical ids, rewrite learner-facing content, change thresholds, or alter policy semantics without reporting that as a migration change.

## Production Rule Scope

Production rules are still central, but they are no longer the whole story.

SPARC-backed AutoTutor uses the four-step AutoTutor controller structure inside SPARC.

The first SPARC-backed AutoTutor move-selection policy should use the paper-derived AutoTutor fuzzy production-rule policy as its baseline for Production Rule Move Selection, not the current MoFaCTS original-AutoTutor planner branch logic. Target selection should be implemented as a general SPARC controller target-selection capability that gives coherent next-target choices from generated KC graph facts, while move selection should be authored from the AutoTutor dialog-move production-rule literature.

That baseline matters for two reasons:

- It gives the SPARC-backed version a known AutoTutor lineage instead of inventing a new controller.
- It avoids inheriting known defects in the current MoFaCTS original-AutoTutor move-selection branch logic.

The four steps are:

1. LLM scoring/evaluation after the learner submits a response.
2. Target selection using the general SPARC controller target-selection procedure, parameterized to produce coherent next-target choices from generated KC graph facts.
3. Production Rule Move Selection against the current state from steps 1 and 2.
4. LLM utterance generation using the selected target and the selected action.

Initial target selection should choose among:

- learner question
- active misconception
- current clusterKC focus
- next uncovered clusterKC
- completion

Initial move-selection productions should choose among:

- `pump`
- `positive_pump`
- `hint`
- `splice`
- `prompt`
- `elaborate`
- `summary`
- short feedback moves from the paper-derived 15-rule catalogue

Dialogue-controller procedures such as learner-question handling and misconception repair are general SPARC/model-practice behavior. Represent them as neutral authored policy rules or general controller procedures, separate from the paper-derived 15-rule move-selection baseline. Do not smuggle those extensions into the baseline rule catalogue as if they came from the paper.

These move rules must initially follow the paper-derived 15-rule catalogue. Production behavior must not call the original AutoTutor planner as a fallback.

Future policy changes can improve beyond the paper-derived baseline, but they should be explicit revisions to the SPARC-backed policy after the baseline rule set is transcribed, tested, and documented.

## Production Rule Move Selection

SPARC-backed AutoTutor should use salience-ordered production execution with explicit terminal productions for Production Rule Move Selection.

Current SPARC production rules already have `when`, `tests`, `then`, and optional `salience`. `when` declares the working-memory fact patterns that must match, `tests` applies additional expression checks to each match, and `then` declares the effects to fire. The existing general SPARC production-rule runner is a forward-chaining evaluator: it sorts by salience, fires one activation, adds asserted facts, then continues until quiescence. That behavior is useful for page mutation and for nonterminal controller setup rules, but dialogue/controller action commitment needs a way to stop the current salience-ranked rule run once a production has transferred control to the learner-facing turn.

For the first SPARC-backed AutoTutor implementation, add a general SPARC terminal-production mechanism. After scoring/evaluation and target selection, SPARC evaluates move-selection production rules in salience order. Nonterminal rules may assert intermediate facts and allow lower-salience rules to continue matching. A terminal move-selection rule commits the selected instructional action, writes neutral controller selected-action fact/state such as `controller.selectedAction`, records that control has transferred out of move selection, and prevents any further productions in the current move-selection run from firing. The LLM receives the selected target and selected action and may realize them in natural language, but it must not choose a different target or action.

This is a resolution, not a placeholder for a separate utility field. Do not add a new `utility` production-rule field in the first implementation. If later research requires pedagogical utility to diverge from execution salience, add a separate utility field then with an explicit schema migration.

Initial salience values are provisional authored priority scores. They are required when multiple terminal move rules intentionally match the same selected target and state. They are not claimed to be empirically calibrated. The first terminal valid move rule in salience order commits the controller selected action for the turn; nonterminal setup rules may run before that commitment when they are explicitly authored as setup rules.

The rule system should support offline counterfactual simulation:

```text
Given the same selected target, logged facts, and matched move production rules, what action would another salience set have selected?
```

Move-selection production rules should declare their salience and whether their effects stop the current salience-ranked rule run:

```ts
{
  id: 'dialogue.move.paper-rule-06-hint',
  salience: 85,
  when: [/* ordinary SPARC conditions */],
  tests: [/* ordinary SPARC tests */],
  then: [
    /* writes/assertions for controller.selectedAction */,
    { type: 'terminate-production-phase', reason: 'move-selected' }
  ]
}
```

That source shape is not the generated SPARC stimulus shape. Generated SPARC stimulus/config output must not emit an `autoTutor.expectations[]` runtime branch; it emits ordinary stimulus clusters/a clusterKC list, with source expectation ids retained only as provenance or for the transferred skill bar widget.

Required selection semantics:

1. Run move-selection production rules after the target has been selected.
2. Evaluate candidate activations in descending numeric `salience`, with exact salience ties broken deterministically by production rule id.
3. Allow explicitly nonterminal setup productions to fire and assert intermediate facts.
4. Reject matched terminal rules whose selected action would be invalid for the selected target or current authored script/state.
5. When the first valid terminal move rule fires, commit its selected action and stop the current move-selection production-rule run.
6. Persist the selected action, the terminal rule that committed it, and all matched/rejected move rules considered before termination.
7. Fail clearly if the phase quiesces without a valid terminal selected-action rule.

Required logging:

- source rule id
- selected target fields
- proposed action fields
- salience
- matched fact ids or matched fact summaries
- selected rule id
- rejected matched rule ids and rejection reasons
- final selected target
- final selected action
- terminal rule-stop flag and termination reason

Disallowed mechanisms:

- an AutoTutor-only candidate selector
- continuing to fire lower-salience move-selection rules after a terminal selected-action rule has committed control
- treating every move-selection production as terminal when a rule is explicitly authored as nonterminal setup
- using the current forward-chaining production-rule runner without a terminal phase stop as the move-selection conflict resolver
- LLM target selection
- LLM move selection
- fallback to original AutoTutor planner code to resolve ambiguity
- silent defaulting when no valid matched rule exists

Future empirically fitted salience values should be introduced by an explicit plan change, not as a silent replacement of these authored salience values.

### SPARC Production-Rule Contract Extensions

The paper's fuzzy terms must be represented as explicit numeric thresholds in the load-time SPARC rules. Do not store category words such as `LOW`, `MEDIUM`, `HIGH`, `SOMEWHAT_HIGH`, or `VERY_HIGH` as values to be matched by production rules.

Before authoring the AutoTutor move catalogue, add these general production-rule features to the SPARC evaluator, validation schema, authoring catalog, and generated schemas:

1. a numeric `range` slot pattern
2. an `any` condition for OR
3. a terminal rule-stop effect, serialized as `terminate-production-phase`

```ts
{
  factType: 'learningTarget.score',
  slots: {
    coverage: {
      type: 'range',
      min: 0.33,
      max: 0.90,
      minInclusive: true,
      maxInclusive: false
    }
  }
}
```

This should be read directly at load time by the SPARC rule evaluator. It should not be only a converter-only shorthand that expands into two separate `tests` comparisons. Ranges are ordinary SPARC fact-pattern syntax because fuzzy bands are a general production-rule need, not an AutoTutor-only special case.

The `any` condition should represent OR directly in load-time production rules:

```ts
[
  {
    factType: 'learningTarget.selected',
    slots: {
      clusterKC: { type: 'bind', variable: 'targetClusterKC' }
    }
  },
  {
    type: 'any',
    conditions: [
      {
        factType: 'learningTarget.score',
        slots: {
          clusterKC: { type: 'bound', variable: 'targetClusterKC' },
          coverage: { type: 'range', min: 0.67, max: 1.0, maxInclusive: true }
        }
      },
      {
        factType: 'session.turnState',
        slots: {
          turnCount: { type: 'range', min: 8, maxInclusive: true }
        }
      }
    ]
  }
]
```

`any` is a general SPARC production-rule condition, not an AutoTutor-only convenience. Existing top-level `when` arrays continue to mean AND. `any.conditions` means at least one branch must match. Branches may contain ordinary fact patterns, `not`, or nested `any` conditions, but validation should reject confusing variable binding: an `any` branch may bind variables only if every branch binds the same variable names with compatible meanings, or if those bindings are not used outside the `any`. Rule 8 does not bind variables inside the OR, so it is the simple case.

Initial threshold bands:

| Band | Numeric range |
| --- | --- |
| low | `0.00 <= value < 0.33` |
| medium | `0.33 <= value < 0.67` |
| somewhat high | `0.60 <= value < 0.80` |
| high | `0.67 <= value < 0.90` |
| very high | `0.90 <= value <= 1.00` |

The overlapping `somewhat high` band is intentional because the paper-derived rules use fuzzy categories, not a strict partition. Each threshold must be declared with the generated package so rule execution can be inspected and replayed exactly.

Range condition requirements:

- `min` and `max` are optional individually, but at least one bound must be present.
- Bounds are numeric and compare against numeric fact-slot values only.
- `minInclusive` defaults to `true`.
- `maxInclusive` defaults to `false`, except authored rules may set it to `true` for closed upper bounds such as `very high`.
- The evaluator must reject non-numeric fact-slot values for range matches.
- `terminate-production-phase` is a general SPARC effect. It stops the current salience-ranked production-rule run after the firing rule's effects are instantiated; it does not require or create a named phase field.
- Validation and authoring catalog tests must cover range matches, inclusive/exclusive boundaries, missing bounds, non-numeric slots, `any` matching, `any` non-matching, `any` branch variable-binding rejection, terminal phase termination, terminal phase non-interference with existing rule execution, and replay from persisted history.

## Initial Move Production Rule Catalogue

The first move-selection rule catalogue must be the 15-rule AutoTutor fuzzy production-rule list from the dialog-move paper. Do not derive this catalogue from the current MoFaCTS original-AutoTutor planner branch logic.

The initial paper-rule transcription is:

| Paper rule | Move | Condition | Pedagogical interpretation |
| --- | --- | --- | --- |
| Rule 1 | `pump` | Topic coverage is low or medium after the learner's first assertion. | Low-content elicitation: ask the learner to say more. |
| Rule 2 | `pump` | Topic coverage is low or medium after a substantive learner contribution. | The learner is saying something but has not completed enough target content; keep them talking. |
| Rule 3 | `positive_pump` | Topic coverage is high after the learner's first assertion. | Affirm good progress and invite more. |
| Rule 4 | `splice` | Learner coverage mean is low or medium, cumulative learner word count is low or medium, topic coverage is low or medium, and an active misconception is high-confidence. | The learner appears stuck and is producing misconception content, so splice in corrective tutor material. |
| Rule 5 | `prompt` | Cumulative learner word count is low and topic coverage is low or medium. | The learner has not contributed enough target coverage, so use directed elicitation. |
| Rule 6 | `hint` | Learner coverage mean is medium or high and selected target coverage is low. | A learner with some demonstrated coverage is missing the selected target idea; give a conceptual cue. |
| Rule 7 | `hint` | Learner coverage mean is low, cumulative learner word count is high, and selected target coverage is low. | A talkative low-coverage learner is producing poor target content; give another chance before supplying information. |
| Rule 9 | `elaborate` | Topic coverage is medium or somewhat high. | Tutor supplies substantive content to advance or complete the answer. |
| Rule 8 | `summary` | Topic coverage is high or number of turns is high. | Wrap up the topic once enough content or enough turns have occurred. |
| Rule 10 | `positive_feedback` | Selected target coverage is high. | Give positive short feedback. |
| Rule 11 | `negative_feedback` | An active misconception is high-confidence. | Give negative short feedback when misconception content appears. |
| Rule 12 | `positive_neutral_feedback` | Selected target coverage is medium or somewhat high. | Give mildly positive short feedback. |
| Rule 13 | `negative_neutral_feedback` | An active misconception is medium-confidence. | Give mildly negative short feedback. |
| Rule 14 | `negative_neutral_feedback` | An active misconception is high-confidence and topic coverage is low. | Give mildly negative short feedback when misconception content dominates early/low coverage. |
| Rule 15 | `neutral_feedback` | Selected target coverage is low or medium and no higher-salience feedback rule applies. | Give neutral short feedback. |

Rules 1, 2, 3, 5, 6, 7, 8, and 9 are the ladder-like subset, but even that subset is not a fixed ladder. It is a state-contingent policy:

- incomplete but promising: `pump`
- incomplete and needing directed elicitation: `prompt`
- off-track: `hint`
- partly covered and ready to advance: `elaborate`
- covered or too many turns: `summary`

The fixed local ladder belongs in a discourse routine, not in the architecture. A rule may instantiate a routine such as `hint -> prompt -> elaborate/assertion` for expectation fleshing, with early exit once the learner articulates the expectation to the required threshold. The production-rule system remains the architecture; the ladder is a compiled routine for one pedagogical problem.

The exact JSON/TypeScript representation may shift during implementation, but the paper rule ids, conditions, proposed actions, and provisional salience values should remain stable unless a source-check reveals a transcription error.

### Required Input Facts

The planning pass should receive neutral SPARC working-memory fact families for learner-response evaluation, learning-target scoring, controller focus/selection, threshold values loaded from generated stimulus/TDF fields, and misconception diagnostics. AutoTutor source ids may appear as slot values or provenance, but fact types should not be AutoTutor-specific when the concept applies to SPARC/model-practice dialogue generally.

Recommended fact families:

```ts
{ factType: 'learnerResponse.contribution', slots: { type, confidence, streakCount } }
{ factType: 'dialogue.learnerQuestion', slots: { answerableFromAuthoredContent } }
{ factType: 'dialogue.learnerWordCount', slots: { cumulative } }
{ factType: 'learningTarget.coverageMean', slots: { scope, value } }
{ factType: 'learningTarget.score', slots: { clusterKC, coverage, evidence, missing } }
{ factType: 'learningTarget.candidate', slots: { clusterKC, anchorClusterKC, coverage, coherenceToAnchor, frontierScore, centralityScore, priorityScore, eligible } }
{ factType: 'diagnostic.misconceptionScore', slots: { id, confidence, repaired } }
{ factType: 'learningTarget.selected', slots: { clusterKC, focusActive, focusTurnCount, firstFocusTurn, moveCycleIndex } }
{ factType: 'diagnostic.misconceptionSelected', slots: { id, misconceptionCycleIndex } }
{ factType: 'dialogue.completionSelected' }
{ factType: 'policy.threshold', slots: { name, value } }
{ factType: 'learningTarget.required', slots: { clusterKC } }
{ factType: 'controller.completionState', slots: { requiredCovered, lastTargetType } }
```

### Move-Selection Rules

Move rules run after target selection under strict controller ordering. The selected target must be visible to move rules as ordinary working memory through domain-native selected facts. Do not add a generic `controller.targetState.targetId` for learning targets. For learning targets, the selected fact uses the same identity field as the score fact: `learningTarget.selected.clusterKC` joins directly to `learningTarget.score.clusterKC`. For misconceptions, selection uses `diagnostic.misconceptionSelected.id`. For completion, selection uses `dialogue.completionSelected`.

`learningTarget.score.coverage` is the latest coverage value for that learning target after the learner answer has been scored and merged with prior state. It is not a latest-turn flag and there is no `learningTarget.score.current` or `learningTarget.score.detectedThisTurn` field. If a rule or analysis needs "what did this turn add?", calculate that transiently by subtracting the prior coverage from the new coverage for the same `clusterKC`; do not add a separate coverage-delta fact family.

Mutable AutoTutor-equivalent learner/controller values must reload through ordinary SPARC state semantics. The durable source for current coverage, misconception scores, selected target/action, completion state, turn count, and focus state is a set of stable-key SPARC state cells whose latest replayed write wins. The rule-facing `learningTarget.score`, `diagnostic.misconceptionScore`, `learningTarget.selected`, `controller.selectedAction`, and related facts are the working-memory projection of those replayed cells plus the latest accepted response. Do not persist mutable score/selection values only as append-like working-memory facts whose state key changes when the coverage/action/slot payload changes, because replay would expose stale and current values side by side unless a general SPARC fact-upsert/latest reducer is implemented. The first implementation should use stable SPARC state cells for mutable current values and project them into facts before rules run.

The paper-derived rule catalogue uses source-language terms such as topic coverage, good-answer-bag match, and bad-answer-bag match. The SPARC implementation should not add separate good-answer-bag or bad-answer-bag facts because current AutoTutor scoring already scores expectation coverage and misconceptions separately. Scoring/evaluation writes the canonical SPARC facts once, and downstream target selection, move selection, utterance generation, history, replay, and analysis consume those same facts.

- paper `topic coverage` maps to `learningTarget.score.coverage`; if the authored policy deliberately evaluates whole-topic completion, represent that as an explicitly scoped `learningTarget.score` fact rather than a separate dialogue coverage fact family
- paper `good-answer bag match` is represented by clusterKC `coverage` and learner contribution facts
- paper `bad-answer bag match` is represented by `diagnostic.misconceptionScore`
- paper `student verbosity` maps to cumulative learner word count for the current dialogue
- paper `student ability` maps to mean coverage across required learning targets

This avoids adding a parallel scoring vocabulary. Coverage is the completeness signal for clusterKCs; misconception confidence is the diagnostic signal for bad-answer content; learner contribution and learner-question facts characterize the response form. Verbosity and ability are deterministic controller inputs derived from ordinary dialogue text and learning-target coverage, not learner-profile schema.

Before move selection, the controller computes:

```ts
{ factType: 'dialogue.learnerWordCount', slots: { cumulative: 84 } }
{ factType: 'learningTarget.coverageMean', slots: { scope: 'required', value: 0.42 } }
```

`dialogue.learnerWordCount.cumulative` is the total word count across learner messages in the current SPARC dialogue, including the latest submission. `learningTarget.coverageMean.value` is the arithmetic mean of the durable merged `learningTarget.score.coverage` values across required learning targets, including previously covered targets that were not rescored on the latest turn. Both are deterministic controller-derived facts computed before production-rule move selection and can be matched with ordinary numeric `range` conditions.

The first SPARC-backed dialogue turn pipeline therefore needs an explicit derived-fact phase between scoring/target selection and move selection:

1. replay ordinary SPARC state and displayed dialogue nodes
2. project replayed stable SPARC controller/learner state cells into current working-memory facts
3. score the latest learner response only when it is a newly submitted, unscored turn, then merge target scores into stable SPARC state writes
4. select the controller target and write/update the domain-native selected state/fact
5. derive `dialogue.learnerWordCount`, `learningTarget.coverageMean`, `session.turnState`, and any other deterministic facts needed by authored move rules
6. run terminal Production Rule Move Selection
7. assemble the utterance request from the selected target, selected action, and authored move content

This is not a new runtime path. It is the ordinary `sparcsession` replay and working-memory build extended with deterministic `extraFacts` and stable-key SPARC state writes for mutable values that later phases or replay need. Authored/static facts still come from the generated SPARC display; mutable current facts are projected from replayed SPARC state cells.

The current minimum expected fact families for move-rule matching are:

```ts
{ factType: 'learningTarget.selected', slots: { clusterKC } }
{ factType: 'learningTarget.score', slots: { clusterKC, coverage } }
{ factType: 'dialogue.learnerWordCount', slots: { cumulative } }
{ factType: 'learningTarget.coverageMean', slots: { scope, value } }
{ factType: 'session.turnState', slots: { turnCount } }
```

Move rules should match raw `session.turnState.turnCount` with numeric `range` conditions rather than introducing a derived low/medium/high turn-count fact. `session.turnState.turnCount` means learner-submission count for the current SPARC dialogue, including the latest submitted learner turn after it has been accepted for scoring.

The paper's move rules use fuzzy labels such as low coverage, medium coverage, high verbosity, and low verbosity. SPARC cannot execute those labels directly. The generated package must therefore carry authored SPARC policy constants that translate the labels into numeric ranges. Those constants are part of the generated SPARC page content, normally as top-level `display.workingMemoryFacts` on the generated `setspec.sparcPages[].display`. They are not stored under a generated `autoTutor` branch, not computed from the learner model, not inferred from history, and not model-practice values.

At runtime, the loader may project those authored constants into ordinary working memory as `policy.threshold` facts so the rule engine can inspect and replay the same numbers that came from the package:

```ts
// Authored in generated setspec.sparcPages[].display.workingMemoryFacts:
{ factType: 'policy.threshold', slots: { name: 'coverage.lowMax', value: 0.33 } }
{ factType: 'policy.threshold', slots: { name: 'coverage.mediumMax', value: 0.67 } }
{ factType: 'policy.threshold', slots: { name: 'learnerWordCount.lowMax', value: 80 } }
{ factType: 'policy.threshold', slots: { name: 'learnerWordCount.highMin', value: 160 } }

// Runtime working memory preserves those same facts:
{ factType: 'policy.threshold', slots: { name: 'coverage.lowMax', value: 0.33 } }
{ factType: 'policy.threshold', slots: { name: 'learnerWordCount.lowMax', value: 80 } }
```

Generated move rules should compile authored threshold values into explicit numeric `range` conditions at load time or fail validation if the stimulus/TDF thresholds are missing. The exact initial word-count cutoffs are authored policy choices for the baseline package and should be source-checked against the paper or recorded as provisional package policy; they are not produced by the scoring or target-selection pipeline.

The first implementation's executable rule catalogue uses target coverage, learner contribution, cumulative learner word count, mean required-target coverage, turn count, selected-target facts, misconception diagnostics, learner-question state, and completion policy. These come from current AutoTutor scoring/planning concepts translated into neutral SPARC facts or deterministic controller-derived facts defined here.

The generated SPARC page should contain the concrete load-time `display.productionRules` catalogue after the general `range` slot pattern and `any` condition are implemented. The catalogue has 15 paper rules and 15 load-time rule objects. Rule ids may preserve paper provenance, but fact types and selected-action state should use the neutral SPARC/controller vocabulary.

```json
[
  {
    "id": "dialogue.move.paper-rule-08-summary",
    "salience": 100,
    "when": [
      {
        "factType": "learningTarget.selected",
        "slots": {
          "clusterKC": { "type": "bind", "variable": "targetClusterKC" }
        }
      },
      {
        "type": "any",
        "conditions": [
          { "factType": "learningTarget.score", "slots": { "clusterKC": { "type": "bound", "variable": "targetClusterKC" }, "coverage": { "type": "range", "min": 0.67, "max": 1.0, "maxInclusive": true } } },
          { "factType": "session.turnState", "slots": { "turnCount": { "type": "range", "min": 8, "maxInclusive": true } } }
        ]
      }
    ],
    "then": [
      { "type": "assert-fact", "persist": true, "fact": { "factType": "controller.selectedAction", "slots": { "action": { "type": "literal", "value": "summary" }, "sourceRuleId": { "type": "literal", "value": "paper-rule-08" } } } },
      { "type": "terminate-production-phase", "reason": "move-selected" }
    ]
  },
  {
    "id": "dialogue.move.paper-rule-04-splice",
    "salience": 95,
    "when": [
      { "factType": "learningTarget.selected", "slots": { "clusterKC": { "type": "bind", "variable": "targetClusterKC" } } },
      { "factType": "learningTarget.score", "slots": { "clusterKC": { "type": "bound", "variable": "targetClusterKC" }, "coverage": { "type": "range", "min": 0.0, "max": 0.67 } } },
      { "factType": "learningTarget.coverageMean", "slots": { "scope": "required", "value": { "type": "range", "min": 0.0, "max": 0.67 } } },
      { "factType": "dialogue.learnerWordCount", "slots": { "cumulative": { "type": "range", "min": 0, "max": 80 } } },
      { "factType": "diagnostic.misconceptionScore", "slots": { "confidence": { "type": "range", "min": 0.67, "max": 0.90 }, "repaired": false } }
    ],
    "then": [
      { "type": "assert-fact", "persist": true, "fact": { "factType": "controller.selectedAction", "slots": { "action": { "type": "literal", "value": "splice" }, "sourceRuleId": { "type": "literal", "value": "paper-rule-04" } } } },
      { "type": "terminate-production-phase", "reason": "move-selected" }
    ]
  },
  {
    "id": "dialogue.move.paper-rule-06-hint",
    "salience": 90,
    "when": [
      { "factType": "learningTarget.coverageMean", "slots": { "scope": "required", "value": { "type": "range", "min": 0.33, "max": 1.0, "maxInclusive": true } } },
      { "factType": "learningTarget.selected", "slots": { "clusterKC": { "type": "bind", "variable": "targetClusterKC" } } },
      { "factType": "learningTarget.score", "slots": { "clusterKC": { "type": "bound", "variable": "targetClusterKC" }, "coverage": { "type": "range", "min": 0.0, "max": 0.33 } } }
    ],
    "then": [
      { "type": "assert-fact", "persist": true, "fact": { "factType": "controller.selectedAction", "slots": { "action": { "type": "literal", "value": "hint" }, "sourceRuleId": { "type": "literal", "value": "paper-rule-06" } } } },
      { "type": "terminate-production-phase", "reason": "move-selected" }
    ]
  }
]
```

All 15 transcribed rules should follow this neutral pattern: no selected-action guard used as a fake stop condition, neutral fact families for matching, `controller.selectedAction` for the committed action, and `terminate-production-phase` to stop the current salience-ranked move-rule run.

The fake branch-policy table that previously lived here has been removed. Adding or revising move rules beyond the transcribed paper-derived 15-rule catalogue requires an explicit source check.

## SPARC Session UI Implementation

SPARC-backed AutoTutor should render through the SPARC trial-display surface, not through the original AutoTutor UI.

Current original AutoTutor UI is owned by:

- `mofacts/client/views/experiment/svelte/components/AutoTutorSession.svelte`
- `mofacts/client/views/experiment/svelte/services/autoTutorClient.ts`

Those files belong to original AutoTutor's learner-facing UI path and should not be used as the SPARC-backed AutoTutor UI implementation. In particular, SPARC-backed AutoTutor must not render through `AutoTutorSession.svelte`, must not maintain a separate AutoTutor chat transcript DOM, and must not couple SPARC dialogue rendering to original AutoTutor UI state.

This UI restriction does not forbid reusing or extracting non-UI AutoTutor client orchestration boundaries such as LLM scoring, LLM utterance request construction, cost accounting, or shared runtime-capability adapters when they are moved or wrapped as neutral infrastructure. Shared non-UI code must still preserve the core invariant: original AutoTutor remains independently runnable, SPARC-backed AutoTutor remains an ordinary `sparcsession`, and neither production path silently falls back to the other.

Current SPARC UI is owned by:

- `mofacts/client/views/experiment/svelte/components/SparcTrialSurface.svelte`
- `mofacts/client/views/experiment/svelte/components/SparcNode.svelte`
- `learning-components/trial-displays/sparc/SparcTrialDisplayAdapter.ts`
- `learning-components/trial-displays/sparc/sparcProgressiveNodes.ts`

SPARC-backed AutoTutor should use that SPARC path.

### Dialogue As Progressive SPARC Nodes

The SPARC-backed AutoTutor conversation should be represented as a SPARC document with a dialogue container and sequential progressive message nodes.

Each learner or tutor utterance should be appended as a SPARC node using existing progressive operations:

- `append-node`
- `append-node-if-missing`
- `append-text` only when extending an existing message node is intentional

The default flow should be:

1. Render an authored SPARC dialogue surface with an empty dialogue region and a learner input/control region.
2. When the learner submits input, append a learner-message node to the dialogue region.
3. Run SPARC-backed scoring, target selection, Production Rule Move Selection, and utterance generation.
4. Append a tutor-message node to the dialogue region.
5. Keep the learner input/control node available until the session completes.
6. On completion, append the summary/final tutor node and disable or replace the input/control node through SPARC state.

The UI should not maintain a separate chat transcript outside SPARC state. Replay should reconstruct the visible conversation from SPARC-backed history/state and progressive node operations.

### Message Node Shape

The exact node schema may be refined during implementation, but generated dialogue should use ordinary SPARC message nodes plus neutral layout alignment where current SPARC layout policy is sufficient. A tutor message can be represented as:

```ts
{
  id: 'turn-0003-tutor',
  nodeType: 'atomic',
  atomType: 'message-box',
  role: 'tutor-message',
  placement: { region: 'dialogue', order: 3 },
  layout: { align: 'left' },
  value: 'Tutor utterance text'
}
```

Learner messages should use the same ordinary message-node shape with learner role and right alignment:

```ts
{
  id: 'turn-0004-learner',
  nodeType: 'atomic',
  atomType: 'message-box',
  role: 'learner-message',
  placement: { region: 'dialogue', order: 4 },
  layout: { align: 'right' },
  value: 'Learner response text'
}
```

Add a general row-alignment layout primitive only if current SPARC layout policy cannot express full-row left/right justification for ordinary message nodes. Do not require both `layout.align` and a `message-row` wrapper for the same alignment behavior.

If it is needed, `message-row` is a general layout/group subtype for aligning an existing `message-box` atom; it is not a new AutoTutor session kind, not a second chat UI, and not a replacement for `message-box`. It must be added to the SPARC authoring catalog, validation/schema surface, renderer, and tests as a general SPARC primitive.

Optional primitive when existing layout policy is insufficient:

```ts
{
  nodeType: 'group',
  groupType: 'message-row',
  layout: {
    role: 'dialogue-message-row',
    justify: 'left' | 'right',
    width: 'two-thirds'
  },
  children: [
    {
      nodeType: 'atomic',
      atomType: 'message-box',
      role: 'tutor-message' | 'learner-message',
      value: 'Message text'
    }
  ]
}
```

Rendering requirements:

- ordinary message nodes use neutral SPARC layout alignment where possible
- if `message-row` is needed, the group spans the full available row width
- if `message-row` is needed, the child message box uses about two-thirds of the row width on normal desktop widths
- if `message-row` is needed, `layout.justify = 'left'` aligns the message box to the left
- if `message-row` is needed, `layout.justify = 'right'` aligns the message box to the right
- narrow/mobile layouts may let the message box use nearly the full row width
- any new primitive is implemented in general SPARC node rendering/layout support, not as AutoTutor-only DOM
- any new primitive can be applied to generated progressive nodes

Ownership requirements:

- first verify whether existing SPARC layout policy can express the message alignment without a wrapper group
- if `message-row` is added, add it to the SPARC group/node catalog and authoring validation/schema surface
- if `message-row` is added, add rendering support in `SparcNode.svelte` or the existing SPARC layout layer
- if `message-row` is added, add schema/catalog tests proving generated and authored `message-row` nodes are accepted
- add responsive rendering tests or Playwright smoke coverage for left/right message alignment, whether implemented through existing layout policy or a new primitive

### Dialogue Layout

The generated SPARC display should include:

- a `dialogue` layout region for sequential message nodes
- a learner input/control region below or after the dialogue region
- tutor messages left aligned
- learner messages right aligned
- stable chronological ordering by turn index
- responsive behavior through SPARC layout policy, not AutoTutor-specific CSS copied from original AutoTutor

The conversation should feel like AutoTutor, but it should be built as SPARC content. Original AutoTutor visual patterns can inform styling, but implementation should remain in SPARC node rendering and SPARC layout policy.

### Input And Submission

The learner input should be a SPARC-authored input/control node. Submission should create an ordinary SPARC interaction event that runs the configured scoring, target-selection, move-selection, utterance-generation, state-write, and history phases.

The submitted learner text should be:

- validated as nonblank
- appended as a learner-message progressive node
- included in scoring facts
- written into SPARC-backed history
- unavailable for mutation by the utterance LLM

### UI Verification

UI verification should prove:

- SPARC-backed AutoTutor renders through `SparcTrialSurface.svelte`, not `AutoTutorSession.svelte`.
- Learner messages append sequentially and right aligned.
- Tutor messages append sequentially and left aligned.
- The input/control node remains usable between turns and is disabled or replaced on completion.
- Replay reconstructs the same visible dialogue without original AutoTutor state.
- Existing SPARC page sessions still render normally.
- Existing original AutoTutor sessions still render through `AutoTutorSession.svelte`.

## Utterance Generation

Step 4 is the utterance-generation call. It consumes the selected target, the controller selected action, the selected action rule id, selected rule salience, and authored content/facts needed to produce the tutor utterance.

Step 4 must fail clearly if the selected target and action are incompatible. The selected action must be exactly the highest-salience valid move production that fired during Production Rule Move Selection. Step 4 must not re-rank actions.

The utterance LLM may verbalize the selected target and action, but it must not choose a different target or action.

The compatibility check needs an explicit data source. Generated dialogue packages must provide ordinary authored `workingMemoryFacts` for move-realization content, for example neutral facts such as:

```ts
{ factType: 'dialogue.moveContent', slots: { targetType: 'learningTarget', clusterKC: 'autotutor.lesson.kc.e1', action: 'hint', text: '...' } }
{ factType: 'dialogue.moveContent', slots: { targetType: 'misconception', id: 'm1', action: 'splice', text: '...' } }
{ factType: 'dialogue.moveContent', slots: { targetType: 'completion', action: 'summary', text: '...' } }
```

This is not an AutoTutor utterance schema. It is the authored content lookup used by any generated SPARC dialogue move. The utterance adapter validates `(selected target, selected action)` against these authored facts before calling the LLM. Missing authored content for a selected action is a blocking package error, not a prompt-engineering decision delegated to the LLM.

Completion also needs a normal controller fact producer. Before target selection, the controller derives `controller.completionState` from durable required-target coverage, the generated coverage threshold, turn count/max-turn policy, and active misconception state. Target selection may then write `dialogue.completionSelected`, and generated SPARC dialogue policy may choose a summary from ordinary rules/facts. Do not store a separate AutoTutor completion object for SPARC-backed sessions.

## History And Replay

SPARC-backed AutoTutor should use ordinary SPARC history/replay. It should not introduce a distinct history event family.

History records should remain ordinary SPARC records, for example `eventType: 'sparc'`. Do not add AutoTutor-specific history identity fields, a distinct history event family, subtype tags, or metadata markers.

The normal SPARC history path already records the displayed SPARC content. The history row's `displayedStimulus` and the SPARC extension's `practiceObservation.displayedStimulus` should carry the displayed nodes/widgets and content needed for replay and analysis. If that existing display capture is insufficient for a specific analysis, pause for design discussion before adding any new field.

History should record only what ordinary SPARC replay and analysis need:

- the learner submission event and submitted text
- the SPARC state transition writes needed to rebuild controller state and progressive message nodes
- stable-key SPARC state cells for mutable current values: merged learning-target coverage, misconception scores, selected target, selected action, completion state, turn/focus counters, and any other controller value that must survive reload
- the generated tutor utterance as the appended tutor-message node, not as a separate transcript payload

Production-rule firings are research-relevant SPARC trace events. Record rule firings through ordinary SPARC trace/history records for both learner-triggered and controller/system-triggered production runs. Learner-triggered records may point back to the submitted learner event. Controller/system rule executions, such as target selection, derived-rule execution that produces facts, move selection, visibility/reveal rules, and generated tutor utterance commits, should still write trace records, but they must not fabricate a student action or response payload. Their source should identify the controller/run context and include the fired rule id, salience when applicable, matched/selected action fields when applicable, clusterKC or other target identity when applicable, and whether the rule stopped the current salience-ranked run.

Reload/resume is a first-class invariant, not a debugging convenience. After ordinary SPARC history replay, a resumed SPARC-backed AutoTutor session must have the same visible dialogue, learner submissions, generated tutor utterances, merged target scores, misconception state, selected/focused target, selected action, completion state, turn counters, and derived word-count basis as the pre-reload session. Completed turns must not call the scoring LLM or utterance LLM again. The next learner turn may call those services for the new submission, using only the replayed SPARC state and displayed progressive nodes as its prior context.

Use existing SPARC mechanics for this. Learner and tutor messages are progressive node operations. Durable mutable values are ordinary SPARC state-transition writes with stable addresses/keys so replay keeps the latest value for each controller cell. The working-memory facts consumed by target selection and production rules are then projected from those replayed cells, generated static `display.workingMemoryFacts`, and deterministic derived facts. Do not add an AutoTutor-specific reload record, session subtype, transcript store, or planner-state blob for SPARC-backed sessions.

If a completed turn is missing the required replay state for its generated tutor utterance, merged scores, selected target/action, or completion state, reload must fail clearly. It must not silently recompute completed LLM scoring or utterance generation, and it must not fall back to original AutoTutor planner state.

Do not add utterance-generation prompt payloads, duplicate transcript fields, or AutoTutor-specific planning-history blobs to the replay payload. If later research/debugging needs LLM prompts or richer rejected-candidate traces, add them through the same general SPARC trace/debug channel rather than expanding canonical replay state.

Replay must reconstruct the SPARC-backed AutoTutor state without consulting original AutoTutor planner state.

## Verification Strategy

Required verification:

- Original AutoTutor tests still pass.
- SPARC page/session tests still pass.
- SPARC-backed AutoTutor tests prove its independent runtime path.
- Side-by-side tests prove the two AutoTutor implementations can be selected separately.
- Walkthrough tests drive the SPARC-backed AutoTutor through representative learner turns and verify it gives intelligent tutor responses, makes progress, and does not get stuck in target selection, move selection, scoring, utterance generation, history, or replay.
- Failure tests prove no silent fallback from one AutoTutor implementation to the other.
- Salience-ranked move-selection production rule tests prove highest-salience valid selection, deterministic tie-breaking, invalid match rejection, missing match failure, and persisted selection logging.
- Production-rule history tests prove learner-triggered and controller/system-triggered rule firings write ordinary SPARC trace history, and that controller/system records do not include fabricated student action payloads.
- Counterfactual simulation tests prove a logged planning state can be replayed against another salience set without calling original AutoTutor or the utterance LLM.
- Reload/resume tests prove a completed turn reloads without calling the scoring LLM or utterance LLM, reconstructs learner/tutor progressive message nodes, projects the same current working-memory facts, and lets the next turn continue from replayed SPARC state.
- Stable-state tests prove mutable coverage, selected-target, selected-action, completion, turn-count, and focus values have latest-value replay semantics and do not leave stale prior coverage/action facts available for rule matching.
- Missing-replay-state failure tests prove reload fails clearly when required generated tutor utterance, merged score, selected target/action, or completion state is absent.
- UI tests or Playwright smoke tests prove SPARC-backed AutoTutor renders through the SPARC surface with sequential left/right conversation nodes.
- Converter dry-run tests inventory every current `autotutorsession` package in `C:\dev\mofacts_config`, including the current set of 10 packages, and report generated paths without writing files.
- Converter update-mode tests prove converted outputs use `setspec.sparcPages[].display` plus ordinary `sparcsession`, replace canonical AutoTutor config package content only during deliberate write mode, preserve source provenance in reports/generated metadata, and refuse unrelated overwrite/collision cases.
- Converted-package load tests prove at least one converted package can be loaded by the current `sparcsession` page resolution path from `rawStimuliFile.setspec.sparcPages`.
- Converted-package clusterKC tests prove every source AutoTutor expectation is converted to exactly one generated cluster with `clusterKC`/`stimulusKC`, every generated clusterKC is referenced by the converted SPARC page, and the current SPARC cluster-target resolution loads those KCs.
- Relationship-generation translation tests prove packages without authored `expectationRelationships` are converted by the neutral cluster-KC relationship engine, preserve relationship provenance, and keep every graph source/target id aligned with exactly one generated clusterKC.
- Target-selection tests prove SPARC-backed target selection reads precomputed KC graph centrality, looks up pairwise coherence, computes frontier/priority/focused clusterKC from generated KC graph facts, and produces coherent non-stuck target choices for representative dialogue states.
- Schema and authoring-catalog tests cover any new SPARC public contract fields or node/layout primitives, including `message-row` if implemented as a cataloged group type. The first move-selection implementation should use existing production-rule `salience`; it should not require a new rule `utility` field.
- Backward-compatibility tests prove existing SPARC tutors do not need migration for the new `range` slot pattern or `any` condition syntax. Existing fact-pattern conditions, `not` conditions, and `tests` with `left`/`right` comparisons must keep loading and evaluating unchanged.
- Existing-package smoke tests load at least one current SPARC package from `C:\dev\mofacts_config` after the `range`/`any` evaluator and validation changes. The smoke test must verify the package still reaches the current `sparcsession` display path and does not require generated-file edits.
- Production-rule regression tests run the existing evaluator fixtures unchanged, then add focused coverage for `range` matches, inclusive/exclusive range boundaries, non-numeric range rejection, `any` matching, `any` non-matching, nested `any`/`not` validation, and rejected ambiguous variable binding across `any` branches.
- Derived-rule tests prove `setspec.sparcPages[].display.derivedFacts` survives display-to-document conversion, validates with the same production-rule condition/test rules including unsafe `any` branch-binding rejection, and produces transient working-memory facts visible to subsequent production rules without persisting them as stale replay state.

For TypeScript-bearing changes in `mofacts/`, run:

```bash
npm run typecheck
```

For lintable TypeScript, JavaScript, or Svelte changes in `mofacts/`, run:

```bash
npm run lint
```

For UI/runtime behavior changes, use the native hotfix dev server and MoFaCTS Playwright sidecar against the hotfix app.

If implementation changes TDF schema, field registries, authored SPARC schema, SPARC authoring catalog entries, or generated config package shape, also run:

```bash
npm run generate:schemas
```

Then inspect generated schema diffs deliberately. Current `sparcsession` schema is derived from the learning-session registry, which is acceptable for the existing runtime shape but is a maintainability risk if SPARC-specific fields keep growing. Any new SPARC-specific public field should either be added deliberately to the registry with SPARC ownership documented, or kept as generated display/runtime content under `setspec.sparcPages[].display` rather than hidden in copied learning-session fields.

## Implementation Plan

### Step 1: Preserve the Current Systems

- Add or confirm tests around original AutoTutor runtime selection.
- Add or confirm tests around current SPARC page-session runtime selection.
- Document the invariant that original AutoTutor and SPARC-backed AutoTutor are separately runnable systems.
- Treat original AutoTutor runtime source as read-only during SPARC-backed implementation.

### Step 2: Extract Only The Needed Neutral SPARC Pieces

Do not turn the first SPARC-backed AutoTutor slice into a broad SPARC refactor. Extract or wrap only the reusable SPARC pieces needed to make the first end-to-end generated dialogue turn coherent in ordinary `sparcsession`, and keep existing SPARC page behavior unchanged.

Here "neutral" means reusable SPARC/session/controller code that is neither original AutoTutor runtime code nor generated-AutoTutor-specific glue. Examples include the production-rule evaluator, state replay, target-selection helpers, working-memory fact projection, trace/history helpers, and cluster-KC relationship generation. It does not mean an extra runtime beside `sparcsession`.

The goal of this step is not to move original AutoTutor onto shared infrastructure. Original AutoTutor remains independently runnable and may serve as a reference implementation or test oracle while SPARC-backed AutoTutor is being built. Production SPARC-backed AutoTutor code must not call original AutoTutor runtime modules such as the original planner, state machine, unit engine, runtime config, or learner-facing client orchestration.

Candidate shared SPARC pieces, extracted only when needed by the first slice:

- working-memory fact types
- rule expression and rule evaluator types
- production-rule evaluator helpers
- general SPARC salience-ranked rule-stop/logging primitives
- general SPARC message alignment support, adding `message-row` only if existing layout policy is insufficient
- state write primitives
- runtime address primitives
- execution result types
- replay helpers that are not page-specific

If a piece can remain in the current SPARC page/session module without forcing SPARC-backed AutoTutor to depend on page-only behavior, leave it in place for the first slice.

Page-specific pieces remain SPARC page adapters:

- authored page node tree
- progressive node operations
- page layout
- page mutation effects
- SPARC trial display bridge

### Step 3: Define The Generated SPARC Dialogue Pattern

Define a generated SPARC document pattern for sequential dialogue using existing `tutorscript-sparc/1.0`, nodes, facts, rules, state, cluster references, and progressive operations.

It should represent:

- prompt
- ideal answer
- source expectation content converted to clusterKCs
- one generated clusterKC per source expectation; runtime facts and rules use `clusterKC`, not the source expectation id
- clusterKC relationship graph
- misconceptions
- authored hints/prompts/assertions
- summary
- thresholds
- dialogue policy
- runtime facts and state

This content may be generated from current AutoTutor script content, but it should be ordinary SPARC session content using general SPARC runtime mechanisms. Do not introduce a separate dialogue-session contract.

### Step 4: Define The Content Translation Contract

Define how an original AutoTutor package becomes a generated SPARC session package.

This includes:

- source package discovery rules in `C:\dev\mofacts_config`
- source TDF and stimulus validation rules
- in-place converted package identity rules
- generated TDF fields
- generated stimulus fields
- expectation-cluster generation rules
- expectation relationship graph preservation/generation rules
- generated SPARC document pattern for sequential dialogue
- provenance fields
- unsupported-source failure messages

This step should produce at least one hand-checked fixture conversion before runtime integration goes broad.

### Step 5: Add Explicit Runtime Selection

Add an explicit way to select original AutoTutor or SPARC-backed AutoTutor without adding a new session kind.

Original AutoTutor selection remains the existing `autotutorsession` unit. The generated SPARC version uses the existing `sparcsession` unit with generated SPARC session content adapted from AutoTutor. It must not infer SPARC behavior from the presence of ordinary original AutoTutor fields.

Selection failures must fail clearly.

### Step 6: Add General SPARC Facts And State For Generated Dialogue

Represent generated-dialogue planning state as neutral SPARC-style facts/state. AutoTutor source ids may appear in slots or provenance, but the fact vocabulary should be general when the concept applies to SPARC/model-practice dialogue.

Step 1 scoring/evaluation writes or updates learner-response, learning-target coverage, and diagnostic facts:

```ts
{ factType: 'learningTarget.score', slots: { clusterKC: 'autotutor.lesson.kc.e1', coverage: 0.45 } }
{ factType: 'diagnostic.misconceptionScore', slots: { id: 'm1', confidence: 0.8, repaired: false } }
{ factType: 'learnerResponse.contribution', slots: { type: 'question', confidence: 0.9, streakCount: 1 } }
{ factType: 'dialogue.learnerQuestion', slots: { answerableFromAuthoredContent: false } }
```

`dialogue.learnerQuestion` is present when `learnerResponse.contribution.type` is `question`; question presence is not stored again on the question fact. If a downstream rule or analysis needs per-turn contribution, compute it transiently from prior replayed SPARC state and the new score; do not store a separate "current coverage" or coverage-delta concept. Target selection, move-selection productions, utterance-generation input assembly, persisted history, replay, and analysis must all read the canonical `learningTarget.score`, `learnerResponse.contribution`, and `diagnostic.misconceptionScore` facts. Do not create downstream-only aliases for paper terms such as topic coverage, good-answer-bag match, or bad-answer-bag match.

The generated package provides authored/static model and policy facts before target selection runs. Each source expectation is converted to exactly one generated clusterKC. Generated SPARC pages and runtime facts reference the learning target by that `clusterKC` through existing cluster-reference mechanisms such as `clusterTargets[]` and `clusterIndices`; source expectation ids remain provenance only.

```ts
{ factType: 'kcGraph.node', slots: { clusterKC: 'autotutor.lesson.kc.e1', centrality: 0.61 } }
{ factType: 'kcGraph.relationship', slots: { sourceClusterKC: 'autotutor.lesson.kc.e1', targetClusterKC: 'autotutor.lesson.kc.e2', strength: 0.72 } }
{ factType: 'learningTarget.required', slots: { clusterKC: 'autotutor.lesson.kc.e1' } }
// Runtime facts authored in generated SPARC display workingMemoryFacts:
{ factType: 'policy.threshold', slots: { name: 'coverage', value: 0.8 } }
{ factType: 'policy.threshold', slots: { name: 'learnerWordCount.lowMax', value: 80 } }
{ factType: 'dialogue.moveContent', slots: { targetType: 'learningTarget', clusterKC: 'autotutor.lesson.kc.e1', action: 'hint', text: '...' } }
```

Target selection writes or updates the domain-native selected fact for the selected target type. Do not add a generic selected-target id when the domain already has a canonical identity field.

```ts
{ factType: 'learningTarget.selected', slots: { clusterKC: 'autotutor.lesson.kc.e1', focusActive: true, focusTurnCount: 0 } }
{ factType: 'diagnostic.misconceptionSelected', slots: { id: 'm1', misconceptionCycleIndex: 0 } }
{ factType: 'dialogue.completionSelected' }
```

### Step 7: Add SPARC-Backed Target Selection

Implement target selection as a general SPARC controller target-selection capability used by the generated dialogue content.

The first version must preserve current original AutoTutor target-selection behavior for comparable cases. Target selection consumes:

- scoring/evaluation facts from Step 1
- prior selected-target and focus state from replayed SPARC state
- required learning-target and threshold facts from generated dialogue settings
- ordinary SPARC cluster references so the selected learning target remains tied to its generated `clusterKC`
- generated KC graph facts so centrality, pairwise coherence, frontier, and priority produce coherent target choices for representative dialogue states
- derived `controller.completionState` so completion can be selected through `dialogue.completionSelected`

Target selection reads precomputed centrality from generated KC graph facts, looks up pairwise coherence from the current anchor `clusterKC` to each candidate `clusterKC`, then computes frontier and priority before choosing the next uncovered clusterKC. Missing KC graph facts are a blocking invariant failure for the baseline policy, not an optional degraded mode. Target selection writes the relevant selected fact, such as `learningTarget.selected`, for move selection and later controller phases.

### Step 7A: Add Deterministic Controller-Derived Facts

Add a general SPARC controller fact-derivation pass that runs after scoring and target selection and before move selection. It should use ordinary replayed SPARC state, latest learner text, durable merged scores, threshold facts loaded from generated `setspec.sparcPages[].display.workingMemoryFacts`, and selected/focus facts to produce deterministic facts such as:

```ts
{ factType: 'dialogue.learnerWordCount', slots: { cumulative: 84 } }
{ factType: 'learningTarget.coverageMean', slots: { scope: 'required', value: 0.42 } }
{ factType: 'session.turnState', slots: { turnCount: 3 } }
```

This pass extends the existing SPARC working-memory build with deterministic `extraFacts`. Persist mutable current values as stable-key SPARC state cells when later phases or replay need them; do not create a second controller-state store.

For authored deterministic facts that are part of a SPARC page rather than a controller phase, use top-level `setspec.sparcPages[].display.derivedFacts`. These rules share the normal production-rule condition/test/fact-template syntax, are validated by SPARC display readiness, and produce transient non-persistent working-memory facts. They are suitable for BRD graph-derived helper facts and path-specific lookup facts, not for mutable controller state that must have latest-value replay semantics.

### Step 7B: Add SPARC Production-Rule Contract Extensions

Add the general SPARC production-rule syntax needed by the generated move catalogue before authoring or loading the generated rules:

- numeric `range` slot patterns
- `any` conditions for OR
- `terminate-production-phase` as a general terminal rule-stop effect

This is a SPARC public contract change, not an AutoTutor-only converter shorthand. It must update the TypeScript contract, evaluator, validation/schema surface, authoring catalog, generated schemas, and focused regression tests before generated SPARC-backed AutoTutor move rules depend on it. Existing SPARC packages must continue to load and execute without migration.

### Step 8: Add Move-Selection Productions

Implement Production Rule Move Selection as SPARC-style salience-ranked production rules in the SPARC-backed AutoTutor system using general terminal rule-stop semantics, not the existing forward-chaining page-mutation runner without a stop condition.

The first version must be based on the source-checked 15-rule AutoTutor fuzzy production-rule catalogue from the dialog-move paper. It must not use the current MoFaCTS original-AutoTutor planner branch logic as the move-selection baseline.

### Step 9: Add Utterance Generation Adapter

Add an adapter that turns the selected target and move into an utterance-generation request.

The LLM must only verbalize the selected target and move. It must not change the selected target or move.

The adapter must look up authored `dialogue.moveContent` facts for the selected target/action pair before calling the LLM. This lookup is also the selected-action compatibility check used by move selection logging. Missing content or target/action mismatch fails package validation or turn execution clearly.

### Step 10: Add SPARC Dialogue UI Rendering

Render SPARC-backed AutoTutor through the SPARC trial-display surface.

This step should:

- define the generated SPARC dialogue display shape
- add or reuse SPARC node rendering support for tutor-message and learner-message nodes
- add general SPARC message alignment support, adding `message-row` only if existing layout policy is insufficient
- append learner and tutor utterances as progressive nodes
- keep learner input as a SPARC-authored input/control node
- use SPARC layout policy for left/right message alignment
- avoid `AutoTutorSession.svelte` and original AutoTutor UI/transcript rendering

### Step 11: Add History And Replay

Persist SPARC session state, fired rules, selected target, selected action, and utterance output through ordinary SPARC history:

- append learner and tutor messages as progressive node operations
- write mutable current learner/controller values as stable-key SPARC state cells
- project replayed state cells back into working-memory facts before target selection and move selection
- keep authored/static policy constants in generated `setspec.sparcPages[].display.workingMemoryFacts`

Replay must rebuild state from ordinary SPARC history without calling original AutoTutor and without rerunning completed-turn scoring or utterance LLM calls. A resumed session must continue from the replayed SPARC state on the next learner submission. Missing required replay state for a completed turn is a clear failure, not a reason to recompute or fall back.

Add focused reload/resume tests for one-turn and multi-turn conversations. They must assert no completed-turn LLM calls occur during reload, the progressive dialogue nodes reappear, mutable score/selection/action/completion cells have latest-value semantics, and the next turn uses the replayed SPARC state.

### Step 12: Add Repeatable Config Translator

Add or wire the translator that converts original AutoTutor packages in `C:\dev\mofacts_config` into SPARC session package content in place.

The first full migration pass should:

- inventory all original AutoTutor packages
- generate SPARC-backed package content for each package
- replace canonical AutoTutor config content only in explicit write mode
- write a conversion report
- validate generated JSON
- verify that each converted package uses `sparcsession` and SPARC session content rather than `autotutorsession`
- verify that each converted runnable SPARC display lives under `setspec.sparcPages[].display`
- verify that converted `sparcsession.pageId`, when present, resolves to exactly one `setspec.sparcPages[].pageId`
- verify that each converted clusterKC has first-stimulus `stimulusKC`
- verify that the converted SPARC page references every converted clusterKC so current SPARC cluster-target resolution loads all learning-target KCs
- verify that converted KC graph facts cover every clusterKC required by baseline target selection
- run the converter in dry-run mode across every current original AutoTutor package and fail on unreported skips

### Step 13: Run Runtime And Migration Verification

Verify:

- original AutoTutor can still run
- SPARC-backed AutoTutor can run
- both runtime paths can be selected intentionally in tests/fixtures
- neither silently falls back to the other
- SPARC-backed walkthrough behavior gives intelligent answers and does not get stuck
- the SPARC-backed UI looks fairly similar to original AutoTutor, with the same major components and generally the same layout
- converted SPARC session config packages load from `C:\dev\mofacts_config`
- every converted SPARC session package has source provenance in the conversion report pointing to the original package source
- SPARC-backed AutoTutor uses sequential SPARC message nodes for the visible conversation

## Functional Requirements

1. Original AutoTutor remains independently runnable.
2. SPARC-backed AutoTutor is independently runnable.
3. The two implementations do not call each other in production behavior.
4. Shared code lives outside both implementations as neutral infrastructure.
5. SPARC-backed AutoTutor uses the broader SPARC session architecture, not only production rules.
6. SPARC page/session behavior remains compatible.
7. Target selection and move selection are explicit deterministic controller steps.
8. The utterance LLM must not select targets or moves.
9. Runtime selection between original AutoTutor and SPARC-backed AutoTutor is explicit.
10. Missing or mismatched runtime configuration fails clearly.
11. Existing AutoTutor packages in `C:\dev\mofacts_config` have a repeatable translation path into converted SPARC session package content.
12. Converted SPARC session packages preserve source provenance in the conversion report and replace canonical AutoTutor config content only during explicit migration write mode.
13. The first SPARC-backed AutoTutor move-selection policy uses the source-checked paper-derived 15-rule AutoTutor fuzzy production-rule catalogue as its baseline.
14. Original AutoTutor runtime code is not modified as part of the SPARC-backed implementation.
15. Rule conflict handling uses general SPARC salience-ranked production rules with provisional, versioned numeric salience values.
16. Highest-salience valid move-rule selection is part of SPARC's general runtime model, not an AutoTutor-specific selector.
17. Planning logs support offline counterfactual simulation against alternate salience sets.
18. SPARC-backed AutoTutor UI renders through the SPARC trial-display surface using progressive message nodes, not original AutoTutor UI code.

## Non-Goals For The First Implementation

- Do not delete original AutoTutor.
- Do not edit original AutoTutor runtime code as part of this work.
- Do not migrate existing lessons automatically.
- Do not hand-convert the full AutoTutor lesson set without repeatable tooling.
- Do not replace all original AutoTutor behavior in one pass.
- Do not add a second non-SPARC-page runtime path for SPARC-backed AutoTutor dialogue; ordinary `sparcsession` still requires the runnable SPARC document under `setspec.sparcPages[].display`.
- Do not redesign SPARC page mutation.
- Do not build silent fallbacks between the two AutoTutor systems.
- Do not fully reconstruct original AutoTutor fuzzy production-rule conflict resolution.
- Do not redesign the initial SPARC-backed AutoTutor move-selection policy before the source-checked paper-derived baseline is transcribed and tested.
- Do not add a separate AutoTutor-specific production-rule conflict resolver.
- Do not let the LLM choose among salience-ranked rule matches.
- Do not implement SPARC-backed AutoTutor as a second chat UI outside SPARC node rendering.

## Open Design Questions

No open design questions are currently known. Continue implementation until a new ambiguity or unforeseen problem appears.

## Working Summary

The old plan was:

```text
Break selectAutoTutorMove into SPARC-style production rules.
```

The revised plan is:

```text
Build generated SPARC session content from AutoTutor source material, using the full SPARC session architecture as the tutoring runtime.
```

The key invariant is:

```text
Original AutoTutor remains the existing `autotutorsession` runtime. AutoTutor-derived generated content runs as ordinary `sparcsession` content, with no production dependency on original AutoTutor internals and no second AutoTutor runtime hidden inside SPARC.
```





