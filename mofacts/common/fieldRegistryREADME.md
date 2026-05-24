# Field Registry Governance

The field registry is the source of truth for public TDF, stimulus, delivery-setting, tooltip, validation, and generated-schema metadata.

## Ownership

- `fieldRegistry.ts`: delivery timing/settings fields and compatibility helpers for delivery settings.
- `deliveryDisplayFieldRegistry.ts`: learner-facing delivery display settings.
- `tdfFieldRegistries.ts`: TDF `setspec`, `unit`, `learningsession`, `assessmentsession`, `conditiontemplatesbygroup`, and `videosession` fields.
- `autoTutorFieldRegistry.ts`: `autotutorsession` fields.
- `stimFieldRegistries.ts`: stimulus cluster, stimulus item, display, alternate display, and response fields.
- `fieldRegistrySectionCore.ts`: shared field definition types, schema helpers, tooltip helpers, validator helpers, lifecycle helpers, and runtime coercion helpers.
- `fieldRegistrySections.ts`: composition layer that turns domain registries into public schemas, tooltip maps, validator maps, validation coverage, and section descriptors.

## Adding Or Changing A Field

1. Add the field to the domain registry that owns its authored location.
2. Include `authoringSchema`, `tooltip`, `lifecycle`, and any `validation` or `runtime` metadata needed by the editor and runtime.
3. If runtime code reads the field directly, update the matching `*_DIRECT_RUNTIME_KEYS` list so `npm run audit:fields` can keep registry and runtime references aligned.
4. If the field affects generated TDF or stimulus schemas, run `npm run generate:schemas` from `mofacts/` and inspect the generated schema diff.
5. Update focused tests in `mofacts/common/fieldRegistrySections.test.ts` or the relevant runtime/parser test when the new field changes section composition, schema output, validation behavior, runtime defaults, or compatibility handling.
6. Update authoring or runtime documentation when the field changes TDF structure, config expectations, or user-visible behavior.

## Lifecycle Statuses

- `supported`: current authored field. Supported fields appear on their enabled surfaces unless a `surfaces` flag disables that surface.
- `deprecated`: historical field with migration guidance. Deprecated fields should include `migration.replacement` or `migration.note` so tooling can explain what to do.
- `ignored`: known field that should remain documented as intentionally ignored by registry-driven tooling. Do not use `ignored` to hide an invariant break.

Do not remove or rename public TDF fields without a compatibility and content-repository plan.

## Aliases And Migrations

Use `aliases` only for documented legacy spellings that should resolve to a canonical supported key. When adding an alias, update or add tests that prove the alias resolves to the canonical key and does not create ambiguous runtime behavior.

Use `migration` metadata for deprecated fields and for fields whose authored replacement needs a note. If runtime migration code is required, keep it in the relevant migration/helper module rather than embedding compatibility behavior in unrelated runtime paths.

## Runtime Validation

Add runtime validation when a bad authored value can change learner behavior, break launch, produce malformed media/history data, or make an adaptive model choose an invalid path. Prefer fail-clear validation with specific errors over silent recovery.

For delivery display settings that are read at runtime, provide `runtime.default`, `runtime.coerce`, and `runtime.validation` when the runtime needs typed values rather than raw authored strings.

## Verification

Run the checks that match the edit from `mofacts/`:

```bash
npm run typecheck
npm run lint
npm run generate:schemas
npm run audit:fields
```

Do not run every command for documentation-only edits. For registry edits, run `npm run generate:schemas` and inspect generated schema diffs before claiming the registry and generated artifacts are aligned.
