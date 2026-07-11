SPARC has exactly one author-facing and schema-facing rule system: productionRules.
No reactiveRules in generated SPARC, editor state, schemas, configs, validation, runtime APIs, or tests.

1. Target architectural decision

Remove reactiveRules as a SPARC document/display construct.

Current state has both:

productionRules?: readonly SparcProductionRule[];
reactiveRules?: readonly SparcReactiveRule[];

in the authored document contract.

After removal, the contract should be conceptually:

productionRules?: readonly SparcProductionRule[];

and no SparcReactiveRule type should remain in the public SPARC contract.

The production-rule evaluator already supports the general machinery needed: fact-pattern matching, tests, state writes, messages, classifications, model-practice updates, and progressive node operations. So the unification should go toward production rules only.

2. Conversion principle

Every former reactive rule:

{
  "id": "show-step-2",
  "when": {
    "type": "state",
    "query": {
      "target": { "pageKey": "page1", "nodeId": "step1" },
      "key": "correctness"
    },
    "compare": "eq",
    "value": "correct"
  },
  "writes": [
    {
      "target": { "pageKey": "page1", "nodeId": "step2" },
      "key": "visible",
      "value": true
    }
  ]
}

should become a production rule:

{
  "id": "show-step-2",
  "when": [
    {
      "factType": "interface-state",
      "slots": {
        "pageKey": { "type": "literal", "value": "page1" },
        "node": { "type": "literal", "value": "step1" },
        "key": { "type": "literal", "value": "correctness" },
        "value": { "type": "literal", "value": "correct" }
      }
    }
  ],
  "then": [
    {
      "type": "write-state",
      "write": {
        "target": { "pageKey": "page1", "nodeId": "step2" },
        "key": "visible",
        "value": { "type": "literal", "value": true }
      }
    }
  ]
}

That mapping works because replayed SPARC state is already materialized as interface-state facts with pageKey, node, key, value, transitionId, eventId, and time.

3. Required production-rule support before deleting reactive rules

The main thing to check is whether production rules can fully express every reactive condition.

Reactive conditions currently support:

state
model
all
any
not

with comparison operators like eq, neq, gt, gte, lt, lte, truthy, and falsy.

Production rules currently support:

when: fact patterns
tests: eq, neq, gt, gte, lt, lte
then: effects

So before removal, add or confirm support for these cases in production rules:

Former reactive feature	Production-rule representation
state eq value	interface-state fact pattern with literal value
state truthy/falsy	fact pattern + test or helper function
state gt/gte/lt/lte	bind value from interface-state, then compare in tests
model condition	runtime-created model-state facts passed as extraFacts before rule evaluation
all	multiple when patterns and/or multiple tests
any	multiple production rules with same effects
not	negated fact pattern, already supported as production condition type

The production-rule condition type already has positive and negated fact patterns. The production-rule evaluator already implements negated pattern matching.

The likely missing piece is model conditions. The production-rule world should handle these with model-state facts that are created outside the rule evaluator and passed into production evaluation as extraFacts.

This means buildSparcWorkingMemoryFacts may append supplied model-state facts, but it must not query adaptive model state. The runtime layer owns adaptive-model access, converts query results into explicit facts, and passes those facts into the existing extraFacts path.

4. Converter changes

The SPARC converter must stop emitting reactiveRules.

New converter rule:

Any generated behavior must be emitted as productionRules, including visibility, enabled state, page mutation, feedback, correctness, model update, and progressive reveal.

Concrete converter tasks:

Find every place the converter emits:
reactiveRules
reactive
visibleWhen
enabledWhen
when + writes reactive structures
Replace each with production-rule templates.
Add a conversion helper, something like:
function productionRuleFromStateWriteTrigger(params: {
  id: string;
  sourcePageKey: string;
  sourceNodeId: string;
  stateKey: string;
  compare: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy';
  value?: unknown;
  writes: SparcStateWrite[];
}): SparcProductionRule
For any conditions, emit multiple production rules.
For all conditions, emit one production rule with multiple fact conditions/tests.
For not, use production-rule negated fact pattern.
For model conditions:
implement the runtime model-state fact path before emitting any model-conditioned production rules.
The complete path is: identify model-state dependencies from authored/generated production rules, query the adaptive model in the SPARC runtime layer, convert those results to model-state extraFacts, pass them into production-rule evaluation, and cover the behavior with tests. Do not partially implement model-conditioned rules.

The current OLI-to-SPARC converter is:

C:\dev\mofacts_config\scripts\convert_oli_flat_module_to_sparc.ts

Fix this converter as part of the removal, not as a later cleanup. It should emit only productionRules, and its all-module output should be upload-ready without requiring a manual second copy.

For multi-module conversion, the converter should produce a bulk-ready package:

one flat output folder or zip containing all generated *_TDF.json and *_stims.json files
no conversion-notes.json inside the upload package
conversion notes written to a separate audit folder or otherwise kept outside the uploader-facing package

This replaces the accidental two-copy workflow where "SPARC Intro Stats Modules" contains per-module converter output and "SPARC Intro Stats All Modules Bulk Upload" contains the flat upload-ready copy.

5. Schema and contract removal

Remove reactiveRules from all schema-like definitions.

Files implicated by current references include:

learning-components/units/sparcsession/sparcSessionContracts.ts
learning-components/units/sparcsession/sparcAuthoringCatalog.ts
learning-components/units/sparcsession/sparcDocumentValidation.ts
mofacts/client/views/experimentSetup/sparc/sparcAuthoringValidation.js
mofacts/public/stimSchema.json, if it contains SPARC display schema
any config fixtures under config that include SPARC pages or rule examples

The current authoring catalog has a separate reactive.condition rule-catalog entry. That should be removed or folded into production-rule condition support. Do not leave it as an author-facing category.

Also remove:

SparcReactiveRule
SparcCondition
SparcNodeReactivity
SparcReactiveEvent, renamed to SparcInterfaceEvent
reactiveRules
visibleWhen
enabledWhen

SparcCondition is the old mini-condition language used by reactiveRules and node reactive.visibleWhen/enabledWhen. It supports state/model/all/any/not conditions plus comparisons. In the production-rule-only system it is not a separate authored construct; its useful behavior must be represented directly as production-rule when patterns and tests.

6. Runtime removal

Remove reactive runtime path, not just hide it.

Search already shows these reactive-specific files:

learning-components/units/sparcsession/sparcReactiveRuleEvaluator.ts
learning-components/units/sparcsession/sparcReactiveRuleCommit.ts
learning-components/units/sparcsession/sparcReactiveRuleEvaluator.test.ts
learning-components/units/sparcsession/sparcReactiveRuleCommit.test.ts

Plan:

Delete sparcReactiveRuleEvaluator.ts.
Delete sparcReactiveRuleCommit.ts.
Delete sparcConditionEvaluator.ts once former reactive conditions have either been converted into production-rule templates or removed.
Remove imports/exports from the SPARC unit engine and any runtime bridge.
Ensure all runtime behavior flows through:
evaluateSparcAuthoredProductionRules
commitSparcAuthoredProductionRuleEvent
evaluateSparcTrialDisplayProductionRuleEvents
commitSparcTrialDisplayProductionRuleEvents

The current SparcSessionUnitEngine already exposes production-rule evaluation and commit functions. That is good. The target should be: this is the only rule path.

Also clean up old naming that keeps the removed abstraction visible. The production-rule path currently uses event types named SparcReactiveEvent. If the payload shape is still right, rename it to SparcInterfaceEvent rather than leaving "reactive" in runtime APIs.

7. Editor removal

Remove the separate reactive tab and editor.

Current UI has separate tabs:

Visual Editor
Advanced Rules
Reactive Rules

And the main editor routes the reactive tab to SparcReactiveRulesEditor.

Plan:

Delete SparcReactiveRulesEditor.svelte.
Remove activeEditorTab === 'reactive'.
Remove reactiveRules, activeReactiveRule, activeReactiveRuleIndex, and all reactive action handlers from SparcAuthoringEditor.svelte.
Rename the remaining production tab from Advanced Rules to Production Rules.
Remove reactive actions from sparcAuthoringControllerAdapters.js.

The editor should not retain a hidden “reactive” branch. It should have:

Visual Editor
Production Rules

not:

Visual Editor
Production Rules
Reactive Rules
8. Validation and addressing

Validation currently needs to remove reactiveRules, not tolerate them.

There is no legacy compatibility reader and no fallback migration path. Remove reactiveRules from the contract and schema. Once schemas/contracts are closed over productionRules-only SPARC, reactiveRules are simply not part of valid SPARC.

Update reference/address validation so that it only traverses production rules. Search results show sparcDocumentAddressing.ts references reactiveRules. That traversal should be removed or converted to production-rule traversal only.

9. Config and fixture migration

You explicitly noted SPARC tests in a config directory. Those should be treated as first-class migration targets, not as test hacks.

Plan:

Search config fixtures for:
reactiveRules
visibleWhen
enabledWhen
reactive
"type": "state"
"writes"
For every fixture, rewrite reactive behavior into production rules.
Add one explicit regression fixture that used to require reactive rules and now proves production rules handle it.

Example fixture migration:

Before:

{
  "reactiveRules": [
    {
      "id": "show-feedback",
      "when": {
        "type": "state",
        "query": {
          "target": { "pageKey": "page1", "nodeId": "answer1" },
          "key": "correctness"
        },
        "compare": "eq",
        "value": "incorrect"
      },
      "writes": [
        {
          "target": { "pageKey": "page1", "nodeId": "feedback" },
          "key": "visible",
          "value": true
        }
      ]
    }
  ]
}

After:

{
  "productionRules": [
    {
      "id": "show-feedback",
      "when": [
        {
          "factType": "interface-state",
          "slots": {
            "pageKey": { "type": "literal", "value": "page1" },
            "node": { "type": "literal", "value": "answer1" },
            "key": { "type": "literal", "value": "correctness" },
            "value": { "type": "literal", "value": "incorrect" }
          }
        }
      ],
      "then": [
        {
          "type": "write-state",
          "write": {
            "target": { "pageKey": "page1", "nodeId": "feedback" },
            "key": "visible",
            "value": { "type": "literal", "value": true }
          }
        }
      ]
    }
  ]
}
10. Test plan

Delete reactive-specific tests and replace them with production-rule equivalence tests.

Remove or rewrite:

sparcReactiveRuleEvaluator.test.ts
sparcReactiveRuleCommit.test.ts
sparcConditionEvaluator.test.ts, after its remaining useful cases are rewritten as production-rule tests
reactive sections in SparcSessionUnitEngine.test.ts
reactive sections in response outcome pipeline tests
authoring editor tests that expect a reactive tab

Search results show several reactive test files already.

Add tests for:

State-triggered write via production rule
Given prior replay state has answer1.correctness = correct
Production rule writes step2.visible = true
Former reactive not behavior
Given no matching interface-state fact
Production rule fires using negated fact pattern
Former reactive gt/gte/lt/lte behavior
Bind interface-state.value
Compare in production tests
Former reactive any behavior
Multiple generated production rules produce the same write
Former reactive all behavior
Multiple interface-state patterns required before firing
Model-state fact behavior
Production-rule evaluation with model conditions is complete end-to-end: runtime identifies required model-state facts, queries model state, passes extraFacts, and fires the expected production rules
The production-rule evaluator does not query adaptive model state directly
Converter regression
Converter emits no reactiveRules
Converter output validates
Converter output behavior matches previous fixture behavior
Schema/validation regression
Any SPARC object containing reactiveRules fails validation
Editor regression
No Reactive Rules tab
Rules editor can author state-write production rules
11. Migration order

Do this in this order to avoid a half-broken branch:

Phase 1: Add production-rule expressiveness

Add any missing helper support for formerly reactive conditions:

state truthy/falsy
state inequality comparisons
runtime-created model-state extraFacts, including dependency discovery from rules and tests that prove model-conditioned rules execute
temporary converter-local helpers for translating old condition-shaped source behavior to production-rule patterns and tests, if the converter needs them

This phase should not remove anything yet.

Phase 2: Update converter

Make the converter emit productionRules only.

This is the most important behavioral step. New SPARC generated from source content must never contain reactiveRules.

Also fix the converter's all-module packaging behavior. When multiple modules are converted, it should create a bulk-ready flat output folder or zip that the MoFaCTS package uploader can process directly. The upload package must contain only TDF/stimulus JSON pairs and any required media; conversion notes must stay outside the uploader-facing package.

Phase 3: Migrate fixtures/configs

Update all config directory examples/tests and generated SPARC fixtures.

After the application code and converter no longer support reactiveRules, run the fixed converter against the original OLI source material and regenerate:

SPARC Intro Stats modules, including a new all-modules bulk-ready zip

Use C:\Users\ppavl\OneDrive\Active projects\mofacts-private-config\extracted_intro_to_stats_full_l71p6 for the Intro Stats original OLI export. It contains 43 hierarchy modules.

American History, Fractions, and Stoichiometry were not created from this converter. Update their actual config files in C:\dev\mofacts_config directly as part of the reactiveRules removal. Do not look for or create private source folders for those.

Remove or update remaining reactiveRules fixtures/configs. No legacy migration reader should be added; old SPARC content is updated in the config repo and the active app runs the updated production-rule content.

Phase 4: Remove editor reactive UI

Delete the reactive tab and component. Fold any useful state-write authoring controls into the production/rules editor.

Phase 5: Remove runtime reactive evaluator/commit

Delete reactive evaluator, condition evaluator, and commit files after tests no longer depend on them. Rename any remaining production-rule event APIs that still use reactive naming.

Phase 6: Remove contracts/schema/catalog entries

Remove SparcReactiveRule, SparcCondition, SparcNodeReactivity, reactiveRules, visibleWhen, enabledWhen, and reactive.condition from contracts and catalogs. The current catalog explicitly includes a reactive.condition entry, so that must go.

Phase 7: Documentation cleanup

Update README and developer docs to say:

SPARC uses production rules as its only rule system. UI reactivity, feedback, correctness marking, model updates, and page mutation are all represented as production-rule effects.

12. Acceptance criteria

This removal is complete only when all of these are true:

Repo search for reactiveRules returns no production code hits.
Repo search for SparcReactiveRule returns no hits.
Repo search for SparcReactiveRulesEditor returns no hits.
Repo search for SparcReactiveEvent returns no runtime API hits.
Repo search for SparcCondition returns no public SPARC contract hits.
SPARC converter output contains no reactiveRules.
SPARC converter all-module output is directly bulk-upload-ready.
The regenerated Intro Stats all-modules zip contains only uploadable TDF/stimulus JSON pairs and required media, not conversion notes.
SPARC schemas and contracts omit reactiveRules entirely.
Config fixtures contain no reactiveRules.
Tests pass with reactive evaluator and commit files deleted.
The visual editor has no reactive tab.
Production rules can express former visibility/enabled/page-mutation behavior.
Runtime-created model-state extraFacts can drive production-rule conditions without evaluator-side model queries.
Documentation no longer describes two rule systems.
13. Model-condition mapping decision

Resolved decision: use Option B for model-condition mapping.

State conditions are easy because replay state already becomes interface-state facts.

Model conditions should also become facts, but the production-rule evaluator must not query the adaptive model itself.

Rejected Option A: Add model-state fact generation to buildSparcWorkingMemoryFacts or the evaluator.

That would make the fact builder or evaluator depend on live runtime model access, which mixes model querying with rule matching.

Chosen Option B: Keep model querying outside the rule engine and pass model-derived extraFacts into production-rule evaluation.

Example runtime-created fact:

{
  "factType": "model-state",
  "slots": {
    "pageKey": "page1",
    "node": "fraction-answer",
    "metric": "probability",
    "value": 0.72
  }
}

The runtime layer owns adaptive-model access through the existing model-state query capability. It converts the model query result into explicit model-state facts and passes those facts through extraFacts. buildSparcWorkingMemoryFacts may append supplied model-state facts, but it must not query model state.

This keeps production rules pure over facts and keeps adaptive-model access in the runtime layer. The production evaluator should not know how to query the adaptive model.

Everything else is removal work. Do not preserve reactive rules as legacy support. Old SPARC content is updated in the config repo; active schemas, generated content, configs, editor behavior, and runtime APIs use productionRules only.
