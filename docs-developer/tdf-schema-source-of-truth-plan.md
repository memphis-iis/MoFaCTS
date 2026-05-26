# TDF And Stimulus Schema Source Of Truth Plan

## Goal

Make the TypeScript field registries the single source of truth for TDF schema, stimulus schema, runtime field validity, editor metadata, learner configuration, tooltips, validators, defaults, and generated public schema artifacts.

The repository should not preserve hidden legacy schema paths by default. If current application code cannot execute a field in a meaningful way, remove that field from the canonical contract and from every generated or projected surface.

## Current State

The intended canonical schema source is already the registry layer:

- `mofacts/common/fieldRegistry.ts` owns delivery parameter definitions.
- `mofacts/common/fieldRegistrySections.ts` owns TDF section fields, `uiSettings`, and stimulus fields.
- `mofacts/scripts/schemaGeneration.ts` generates `mofacts/public/tdfSchema.json` and `mofacts/public/stimSchema.json`.
- `mofacts/scripts/auditFields.ts` verifies that generated public schemas are fresh and closed against supported registry keys.

The system is not yet a complete single source of truth because field meaning is still split across multiple concepts and files:

- Registry `supported` currently means "included in schema", but it is also used as "learner configurable".
- Runtime support is inferred from actual code usage rather than declared in the registry.
- Manual tooltip and validator maps still contain field-level metadata beside generated registry projections.
- Import defaults and shared types can drift from registry defaults.
- Some fields are schema-visible even though current runtime code does not appear to execute them.

## Target Contract

Every field should have one canonical registry definition that answers these questions:

- Is this field part of the authored schema?
- Which schema scopes can contain it?
- Is it executed by current runtime code?
- Is it exposed in the content editor?
- Is it exposed in learner dashboard configuration?
- What is its default value?
- How is it normalized or coerced?
- How is it validated?
- What label and descriptions are shown to users?

Recommended field metadata shape:

```ts
type FieldRuntimeSupport = 'active' | 'none';

type FieldSurface = {
  schema: boolean;
  editor: boolean;
  learnerConfig: boolean;
  runtime: boolean;
};

type FieldDefinition = {
  lifecycle: {
    status: 'supported' | 'deprecated' | 'ignored';
  };
  runtimeSupport: FieldRuntimeSupport;
  surfaces: FieldSurface;
  scopes: readonly string[];
  authoringSchema: Record<string, unknown>;
  runtime?: {
    default?: unknown;
    normalize?: string;
    coerce?: string;
    validation?: Record<string, unknown>;
  };
  description: {
    label: string;
    brief: string;
    verbose: string;
  };
  validation?: Record<string, unknown> | null;
};
```

For this project, `runtimeSupport: 'none'` should normally mean the field is removed, not hidden. Keep a deprecated or ignored field only when there is an explicit current product reason and an audit test that proves it is intentionally excluded from generated learner/editor surfaces.

## Implementation Plan

1. Add explicit surface metadata to delivery params, UI settings, TDF section fields, and stimulus fields.

   Replace implicit meanings such as `SUPPORTED_KEYS` with purpose-specific projections:

   - schema keys
   - editor keys
   - learner-configurable keys
   - runtime-active keys
   - deprecated keys

2. Change learner dashboard configuration to use learner-specific projections.

   `mofacts/common/lib/learnerTdfConfig.ts` should derive exposed fields only from registry entries with `surfaces.learnerConfig: true`.

   It should not use generic schema support as permission to expose a field.

3. Remove fields that current runtime cannot execute.

   For each delivery parameter and UI setting:

   - Search current client/server runtime code for behavior.
   - If the field only appears in schema, tooltip, validator, import defaults, tests, or comments, remove it from the canonical registry.
   - Regenerate public schemas.
   - Remove matching manual tooltip, validator, type, test, and import-default references.

   Do not add a hidden compatibility layer unless there is an explicit current product requirement.

4. Make generated schemas pure projections.

   `mofacts/public/tdfSchema.json` and `mofacts/public/stimSchema.json` must remain generated outputs. Do not edit them directly.

   Schema inclusion should be derived from `surfaces.schema`.

5. Make tooltips and validators pure projections.

   Keep `mofacts/client/lib/tooltipContent.ts` and `mofacts/client/lib/validatorRegistry.ts` as adapter modules, but remove hand-authored field definitions for registry-owned fields.

   Any field-level tooltip or validator should live in the registry. If a tooltip applies to a non-schema UI affordance, keep it separately and make that distinction clear in code.

6. Bring defaults under registry control.

   Runtime defaults should be derived from registry metadata.

   Import defaults should either be generated from registry defaults or reduced to import-only settings that are not schema fields. If import defaults include schema-owned fields, audit them against the registry.

7. Unify scope handling.

   Delivery params and UI settings should declare valid scopes in the registry, then generate schema, tooltip paths, validator paths, runtime normalizers, and learner configuration paths from those scopes.

   This should cover:

   - `tutor.deliveryparams`
   - `tutor.setspec.uiSettings`
   - `tutor.unit[].deliveryparams`
   - `tutor.unit[].uiSettings`
   - `tutor.setspec.unitTemplate[].deliveryparams`
   - `tutor.setspec.unitTemplate[].uiSettings`

8. Strengthen `audit:fields`.

   Extend `mofacts/scripts/auditFields.ts` so CI fails when:

   - generated public schemas are stale
   - a learner-exposed field is not marked `surfaces.learnerConfig`
   - an editor-exposed field is not marked `surfaces.editor`
   - a schema field has no registry label, tooltip, or validator decision
   - a manual tooltip or validator duplicates a registry-owned field
   - a runtime-active field is missing from the registry
   - a registry field marked runtime-active has no evidence entry or runtime inventory entry
   - import defaults drift from registry defaults for schema-owned fields

9. Rebuild and verify.

   After registry and projection changes:

   - Run `npm run generate:schemas` from `mofacts/`.
   - Run `npm run audit:fields` from `mofacts/`.
   - Run `npm run typecheck` from `mofacts/`.

## Initial Deletion Candidates

These fields should be removed if follow-up runtime verification confirms they are not executed by current code:

- `showhistory`
- `initialview`
- `numButtonListImageColumns`
- `correctscore`
- `incorrectscore`
- `autostopTimeoutThreshold`
- `timeuntilaudiofeedback`
- `enhancedFeedback`
- `allowstimulusdropping`
- `readyPromptString`

Fields that currently appear tied to old/non-Svelte runtime paths should be reviewed with the same rule. If the current supported runtime cannot execute them, remove them rather than hiding them:

- `practiceseconds`
- `studyFirst`
- `checkOtherAnswers`
- `allowPhoneticMatching`
- `branchingEnabled`
- `optimalThreshold`
- `practicetimer`
- `forceSpacing`
- `allowRevistUnit`
- `feedbackType`
- `useSpellingCorrection`
- `editDistance`

## Non-Goals

- Do not preserve legacy content behavior unless explicitly requested.
- Do not add silent fallbacks for removed fields.
- Do not keep unsupported fields in learner configuration as hidden or disabled options.
- Do not edit generated public schema JSON directly.

## Expected End State

There is one registry-backed contract for every TDF and stimulus field. All schemas, editor controls, learner dashboard controls, defaults, tooltips, validators, and runtime normalizers are generated from or checked against that contract. A field that current code cannot execute is removed from the contract instead of being kept as hidden compatibility metadata.
