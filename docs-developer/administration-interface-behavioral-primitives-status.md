# Administration Interface Behavioral Primitives Status

## Purpose

This file records implementation evidence for
`administration-interface-behavioral-primitives-plan.md`. A primitive is listed
as implemented only after it has tests and a real management-page consumer.

## Current Slice

Phases 0 through 4 are implemented. The current slice is Phase 5A editor
readiness: replacing subscription/schema booleans with explicit terminal state
and lifetime-guarded editor initialization.

## Migration Status

| Surface or contract | Status | Replaced local paths | Verification |
| --- | --- | --- | --- |
| Loadable state | Pure contract and transition tests added; no page consumer yet | None | Typecheck and lint pass; Meteor tests not run locally |
| Async command state | Pure contract, duplicate-run controller, rollback hook, and tests added; no page consumer yet | None | Typecheck and lint pass; Meteor tests not run locally |
| Template lifetime | Generation, supersession, destruction, and tests added; no page consumer yet | None | Typecheck and lint pass; Meteor tests not run locally |
| Management routes | Existing access, path, shell, title, lazy-loader, and shell-heading behavior captured in characterization tests | None | Typecheck and lint pass; Meteor tests not run locally |
| Route presentation | Canonical management policy, generation-guarded loading/ready/error state, stable page frame, target title, explicit retry, and one Flow Router render contract | `routeAccessPolicies.ts`; management entries in `lazyTemplateLoaders`, `APP_SHELL_TEMPLATES`, and `APP_SHELL_TITLE_KEYS`; alternate render attempts | Typecheck, lint, native hotfix compilation, and sidecar pilot smoke pass |
| Shared status and empty state | Declarative constrained-variant partials consumed by Admin Tests | Admin Tests page-local alert/string injection | Typecheck, lint, native compilation, and sidecar state smoke pass |
| Shared table shell | Labeled keyboard-focusable scroll region consumed by Admin Tests | Admin Tests generated table string | Typecheck, lint, native compilation, and semantic-header browser smoke pass |
| Admin Tests | Migrated to template-local command state, duplicate prevention, stable output, validated result shaping, declarative status, and semantic result table | jQuery `html()`, `escapeHtml()`, generated HTML strings, callback-owned result DOM | Typecheck, lint, native compilation, and sidecar pending/success/error smoke pass |
| Backups load state | Combined config/history tagged state with explicit initial loading, empty, ready, refreshing, refresh-error, and initial-error presentation; template lifetime rejects late completion | Global `adminBackupsConfig` and `adminBackupsJobs` Session state; false empty inference from missing jobs | Typecheck, lint, native compilation, state-matrix tests, and authenticated sidecar ready-state smoke pass |
| Shared inline confirmation | Typed controller owns context, pending lock, Escape cancellation, initial focus, return focus, and removed-trigger fallback; shared partial owns IDs and severity presentation | Page-specific confirmation IDs/classes and Backups restore/delete Session selections | Typecheck and lint pass; controller focus/pending tests added; supported Meteor tests not run locally |
| Backups restore/delete | Restore and delete use one shared controller path with phrase validation, duplicate prevention, retained retry state on failure, and fallback focus after row removal | Old restore/delete Session selections and page-specific confirm/cancel handlers | Typecheck and lint pass; browser verification remains required |
| Profile | OpenRouter key deletion uses shared confirmation; avatar type and icon selections expose `aria-pressed` | Immediate destructive key deletion and visually-only avatar selection | Typecheck and lint pass; browser keyboard/focus verification remains required |
| Account menu disclosure | Native button and sibling controlled panel; template-local main/locale/theme disclosure state; ArrowDown/Enter/Space/Escape/outside-click behavior; explicit theme-library loading/error/empty state | `div[role=button]`, direct class/attribute mutation, global nested-menu Session state, duplicate Home/account handlers, false theme empty state | Typecheck and lint pass; disclosure controller tests added; browser keyboard verification remains required |
| Class Selection | Template-local tagged load state, async command duplicate gate, lifetime protection, inline validation/error, explicit empty/error/retry, and reactive selection attributes | Global page-local Session keys, native alerts, direct post-render select mutation, uncaught `onRendered` load | Typecheck and lint pass; pure normalization/empty/filter/current-selection tests added; browser failure/keyboard verification remains required |

The server method and route contracts remain unchanged.

## Verification Log

- 2026-07-10: `npm run typecheck` from `mofacts/` passed.
- 2026-07-10: `npm run lint` from `mofacts/` passed.
- 2026-07-10: native hotfix app remained ready on `http://localhost:3200` and
  recompiled the client changes without a build error.
- 2026-07-10: authenticated Playwright sidecar direct-route smoke passed for
  `/admin/tests`, `/profile`, and `/classEdit`. Each route rendered one visible
  shell `h1` with the target title, no visible route loader or route error, and
  the authenticated shell remained present.
- 2026-07-10: client navigation from Admin Tests to Backups removed the old
  action immediately and changed the shell title to Backups. Browser Back and
  Forward restored Admin Tests and Backups with matching titles.
- 2026-07-10: `/admin/backups` at 390 by 844 rendered a 390 px shell without
  document-level horizontal overflow. The sidecar reported no console errors
  during the route pilot smoke.
- 2026-07-10: Admin Tests sidecar command smoke invoked two activations in the
  same browser task and observed exactly one `deploymentReadiness` call. While
  pending, the command was disabled with `aria-busy="true"`; a controlled
  success produced one semantic result row with three `scope="col"` headers;
  a controlled failure produced `role="alert"`, removed the old table, and
  re-enabled the command.
- 2026-07-10: the native Spacebars compiler rejected unsupported block-partial
  syntax during implementation. Shared template slots were changed to the
  supported explicit `Template.dynamic` contract, after which native client
  compilation succeeded.
- 2026-07-10: Backups state-matrix tests cover initial loading, true empty,
  ready, refreshing with retained rows, refresh error with retained rows, and
  initial error. Snapshot normalization rejects invalid config/history method
  results before they reach templates.
- 2026-07-10: authenticated `/admin/backups` sidecar smoke rendered two visible
  history rows from the current local data, one shell `h1`, `aria-busy="false"`,
  no visible loading/empty/error state, no document-level horizontal overflow,
  and no console errors. Opening the first manifest rendered the selected
  manifest through the existing read-only method path.
- The new colocated and source-level tests were not executed locally because
  the supported Meteor test command is CI-gated. They are included in the
  client/server test entrypoint discovery paths.
- 2026-07-10: Phase 4 completion restored a clean full `npm run typecheck` and
  `npm run lint`. Source searches show no Class Selection native alerts or
  page-local selection Session keys and no account-menu `div[role=button]` or
  nested disclosure Session state.

## Known Blockers

- Local execution of the Meteor test suite requires the repository's explicit
  CI authorization. This does not block typecheck/lint or the next
  implementation slice.
