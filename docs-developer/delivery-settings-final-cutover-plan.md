# Delivery Settings Final Cutover Plan

## Goal

`deliverySettings` is the only supported TDF and runtime delivery-configuration surface.

Legacy `uiSettings` and `deliveryparams` are migration inputs only. They should not appear in generated TDF schemas, learner runtime types, runtime stores, card-machine context, learner-config overrides, tester runtime configuration, dashboard overrides, or normal app code.

## Target TDF Shape

Supported authored/runtime paths:

- `tutor.deliverySettings`
- `tutor.unit[].deliverySettings`
- `tutor.setspec.unitTemplate[].deliverySettings`

Unsupported legacy paths to remove from schema and runtime:

- `tutor.setspec.uiSettings`
- `tutor.unit[].uiSettings`
- `tutor.setspec.unitTemplate[].uiSettings`
- `tutor.deliveryparams`
- `tutor.unit[].deliveryparams`
- `tutor.setspec.unitTemplate[].deliveryparams`

The runtime does not need an explicit legacy-shape rejection layer. Legacy uploads may fail naturally because the old paths are no longer read or schema-supported.

## Migration Boundary

Conversion code is the only place that may read legacy paths.

Allowed in conversion scripts and migration tests:

- read legacy `uiSettings`
- read legacy `deliveryparams`
- map known legacy fields to `deliverySettings`
- drop removed fields with a report
- report conflicts and unknown fields

Conversion output must contain only `deliverySettings` for delivery configuration.

Required conversion tools:

- production/server database dry run and write mode
- config-directory repository dry run and write mode
- clear reports for changed files/documents, moved fields, dropped fields, conflicts, and skipped records

## Runtime Cutover

Runtime code should receive one normalized object named `deliverySettings`.

Remove or rename runtime concepts such as:

- `UiSettings`, `uiSettings`
- `UiSettingsStore`
- `sanitizeUiSettings`
- `pickUiSettings`
- `deliveryParams`, `deliveryparams`
- `DeliveryParam*` when the concept is current runtime delivery settings rather than legacy conversion

Current field names remain valid under `deliverySettings`, for example:

- `displayCorrectFeedback`
- `displayIncorrectFeedback`
- `displayUserAnswerInFeedback`
- `feedbackLayout`
- `displayTimeoutBar`
- `choiceButtonCols`
- `drill`
- `purestudy`
- `reviewstudy`
- `correctprompt`

## Schema Cutover

Generated TDF schemas should expose only `deliverySettings` delivery configuration paths. Legacy schemas must be removed rather than marked deprecated, because keeping them authorable lets fallback behavior hide incomplete runtime migration work.

Schema descriptions should stop describing `deliverySettings` as a migration replacement and instead describe it as the canonical delivery configuration surface.

## Verification

Required checks:

- generated TDF schema has no legacy `uiSettings` or `deliveryparams` paths
- runtime code has no legacy reads outside conversion code, migration tests, or explicit legacy fixtures
- converted TDFs run using only `deliverySettings`
- legacy fallback tests are removed or rewritten as conversion tests
- full app TypeScript check passes with `npm run typecheck` from `mofacts/`

## Work Order

1. Remove legacy paths from generated schemas.
2. Regenerate committed schemas.
3. Rename runtime stores/types/helpers from UI-settings terminology to delivery-settings terminology.
4. Collapse runtime delivery-parameter naming into `deliverySettings`.
5. Update learner-config overrides and dashboard controls to write only `deliverySettings`.
6. Keep and verify database and config-directory conversion scripts.
7. Add or update static audits so legacy runtime references cannot creep back in.
8. Run full verification.
