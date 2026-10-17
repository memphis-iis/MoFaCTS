# Standalone AutoTutor removal

The original `unit.autotutorsession` / `autotutor` learner runtime is removed. Current AutoTutor instruction uses `unit.sparcsession`, the `sparc` engine, and the `sparc-autotutor-v1` adapter. AutoTutor terminology in SPARC is intentional.

## Ownership and supported behavior

| Boundary | Result |
| --- | --- |
| Standalone engine, manifest, deterministic planner and state machine | Removed from `learning-components/units/autotutor/` and the default component catalog. No original engine can be constructed. |
| Standalone client orchestration and chat | Removed `autoTutorClient.ts`, `AutoTutorSession.svelte`, their surface/activation branches, state and styles. |
| Original authoring and conversion | Removed session/script registries and generated schemas. Upload, unit detection, launch and conversion reject original selectors/scripts instead of translating them to SPARC. |
| Original server APIs | Removed runtime resume method `getAutoTutorHistoryForUnit` and derived-script mutation `persistAutoTutorExpectationRelationships`, their app adapters, and security declarations. |
| Original unit-engine AI capability | Removed the unused capability and adapter. SPARC's direct provider/key-resolution services are unchanged. |
| Shared SPARC validation | `mofacts/common/lib/autoTutorContract.ts` retains SPARC validation with the same semantics. It also rejects unsupported original input. |
| Shared embedding model | `mofacts/common/lib/sparcEmbeddingModel.ts` owns the unchanged model value for figure retrieval and upload-time KC graph generation. |
| SPARC runtime | `learning-components/units/sparcsession/`, SPARC trial displays, app services and rendering retain their current implementation. No original algorithm was copied into SPARC. |

## Policy routing

The supported contract contains exactly three policies. Delivery retains the authored policy without substituting another policy for an account:

| Authored policy | Admin effective policy | Non-admin behavior |
| --- | --- | --- |
| `progressive-scaffolding-v1` | Same as authored | Same as authored |
| `dynamic-instruction-agent-v2` | Same as authored | Rejected; admin required |
| `dynamic-instruction-student-v2` | Same as authored | Rejected; admin required |

The intermediate `student-selected-v2`, `agent-selected-v1`, `oet-boltzmann-v2`, and categorized v1 identifiers are retired and rejected at upload and runtime. Historical authorization classification does not register them as runnable policies. Contract tests cover acceptance of the three supported identifiers, rejection of retired and unknown identifiers, and category/source-topic validation for both categorized policies. This contract does not migrate or reinterpret saved attempts.

## Historical data and remaining references

No learner histories, model state, assignments, resume records, saved lesson decisions, or database documents are deleted or migrated. Original-runtime content is unsupported; saved records are not reinterpreted as SPARC records.

Remaining original references have explicit purposes:

- `autotutor-turn` in the canonical history envelope and `autotutor` history types in analytics/dashboard readers preserve interpretation of past events. Historical lesson classification in `fieldApplicability.ts`, dashboard labels, and cached type contracts remain readable. This metadata classification does not make the unit interactive or creatable.
- Original `autoTutor` graph stripping in package export and graph-input rejection in package preflight remain historical/portable-data handling. They do not execute tutoring or create original runtime responses.
- `autotutorsession` checks in content validation, engine selection, launch readiness and session-surface selection reject unsupported persisted or uploaded content, including mixed selectors.
- Regression fixtures cover removal and historical analytics. Past design plans and verification logs are explicitly historical. The wiki's AutoTutor Sessions page preserves the old guide under an unsupported historical heading and points authors to TutorScript/SPARC.
- Active `autoTutorTargets`, `autotutor.*` SPARC actions, adapter IDs, authorization messages, demo labels, and progress/localization strings belong to current SPARC instruction. Only unused standalone-chat translations were removed.

## Verification and limits

At task start the application checkout and both companion repositories were clean. Both configured companion paths matched the canonical repositories. A bounded content inspection found 16 SPARC selectors and no original selectors in 16 AutoTutor/demo folders (32 JSON files and one archive); no config files were changed or content validators run there.

Before removal, the isolated SPARC runner passed 385 tests in 42 suites; full-app typecheck and lint passed (28 existing vendor warnings). After removal, all retained baseline cases pass: 24 original-only validation/scoring cases were retired, two rejection cases were added, and 22 dashboard tests were included, yielding 385 passing tests in 43 suites. The original SPARC validation body is identical, and generated-schema comparison confirms only original-runtime properties/applicability were removed.

The final typecheck and lint pass with the same 28 existing warnings. Security declarations cover 323 surfaces after removal of the two original-only methods. Additional isolated checks pass: 82 removal/shared-contract tests, 83 history tests, and 30 localization tests. These runners overlap in some contracts; their totals are not a count of distinct behaviors. A comparison against the initially clean checkout confirms 172 SPARC/runtime source and test files are identical; the two generic runtime capability files changed only to remove the original-only AI capability.

Run the supported local checks from `mofacts/`:

```powershell
npm run typecheck
npm run lint
npm run generate:schemas
node scripts/standaloneAutoTutorRemoval.test.cjs
node scripts/sparcAutoTutorRules.test.cjs --include-general-rules --include-client-contracts --include-history-contracts
node scripts/assessmentHistory.test.cjs
node scripts/interfaceI18n.test.cjs
```

The isolated runners use synthetic/injected providers and history stores. They cover assessment, instructional rules, agent/student and competitive selection, dynamic/category-aware responses, progress, replay, persistence contracts, upload/export/library boundaries, policy routing and historical aggregation. They do not establish live Meteor invocation, real Mongo transaction behavior, or provider responses.

The canonical localhost watcher reports healthy at `http://localhost:3200`, with its browser bundle ready. Live learner verification is pending a specified test account/role, lesson, authored/effective policy and saved settings; the existing browser is at sign-in. No account or policy was substituted. Full Meteor integration tests were not run: each `npm run test:ci` invocation requires separate explicit authorization. No release build, deploy, commit, push, branch change, or data migration was performed.
