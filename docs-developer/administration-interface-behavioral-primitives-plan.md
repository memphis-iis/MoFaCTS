# Administration Interface Behavioral Primitives Plan

## Status

Proposed implementation baseline.

This plan turns the findings in
`docs-developer/mofacts_administration_interface_polish_audit.md` into a staged,
implementation-ready architecture and migration sequence. It targets the shared
behavioral causes behind the audit findings rather than applying isolated page
patches.

The goal is not a visual redesign, new workflow, framework rewrite, or generic
component library. The goal is a small set of app-owned behavioral contracts
that make the existing user, teacher, and administrator management interfaces
deterministic, consistent, accessible, and easier to maintain.

## Scope

In scope:

- The authenticated application shell, lazy management-route presentation,
  sidebar, page title, and account menu.
- User management surfaces: Profile, Audio Settings, Courses, class selection,
  content management and authoring, content/TDF editors, and data download.
- Teacher management surfaces: course/section management, assignments, and
  instructor reporting.
- Administrator surfaces: controls, users, Mechanical Turk, themes, tests, and
  backups.
- Shared loading, ready, empty, error, refreshing, command, confirmation,
  disclosure, form, and table behavior used by those surfaces.
- Incremental removal of page-local behavior after each caller is migrated.

Out of scope:

- Flashcards, instructions, practice cards, video/H5P delivery, SPARC, and all
  other learner-runtime presentation.
- New administrative features or workflow redesign.
- Replacing Blaze, Flow Router, Bootstrap, or the current theme system.
- Moving application UI into `learning-components/`.
- New npm, Meteor, Docker, or system dependencies.
- Compatibility layers that preserve two behavioral paths after a migration.
- Docker build, deployment, or production changes.

## Why This Strategy

The audit has 19 prioritized implementation items. Fifteen are substantially
addressed by shared behavioral primitives, two are partially addressed, and
only the inline-CSS cleanup and residual token/magic-value cleanup are primarily
independent. The leverage comes from fixing repeated causes once:

- page readiness has no shared terminal-state contract;
- mutations have no shared pending/rollback/duplicate-prevention contract;
- confirmation and disclosure markup has no shared focus contract;
- tables share appearance but not interaction or responsive behavior;
- page-local state frequently leaks into global `Session`;
- route/module/auth readiness is not one presentation decision.

The desired end state is pattern-oriented implementation without a broad design
system project.

## Architectural Invariants

These invariants are implementation gates, not suggestions.

1. **One presentation owner per route.** A route has one target title, chrome
   mode, template, and `loading | ready | error` presentation record.
2. **Old content is never active under a new route.** Navigation synchronously
   removes the previous page from the actionable presentation before waiting
   for a lazy import or data.
3. **Loading, empty, and error are distinct.** Empty may be shown only after a
   successful load proves there are zero results.
4. **Every async load terminates.** A started load ends in ready, empty, error,
   or explicit cancellation. A spinner cannot be the error state.
5. **Page state is page-local.** Use template-owned reactive state unless the
   value intentionally survives routes. Do not use global `Session` as a
   convenience store for page-local loading, errors, selections, or commands.
6. **Late async completion is harmless.** Work started by a destroyed template
   cannot update page state, DOM, or unrelated global state.
7. **One command, one pending operation.** Repeated activation while a command
   is pending does not issue a second method call.
8. **Optimistic state must roll back.** If a UI value changes before
   persistence, failure restores the last confirmed value. Prefer confirmed
   updates when immediate optimism is not necessary.
9. **Destructive intent is focus-managed.** Confirmation receives focus,
   supports cancellation, and restores focus to its trigger.
10. **A shared appearance implies shared semantics.** Status, confirmation,
    icon-button, disclosure, sortable-header, and form-field patterns expose
    the same roles, accessible names, busy behavior, and focus behavior.
11. **Tables keep domain ownership.** Share the table shell and behavior
    contracts, not a universal table renderer that obscures row meaning.
12. **Mobile behavior is explicit.** Each table declares scroll, priority, or
    card/stacked behavior. The global 700 px minimum is not a responsive policy.
13. **The shell owns the page `h1`.** Page templates own ordered section
    headings and do not render a hidden duplicate page title.
14. **No parallel final APIs.** Once a page uses a primitive, its replaced local
    helper/state/markup is removed in the same slice.
15. **No silent recovery paths.** Missing templates, rejected imports, failed
    publications, and failed method calls produce explicit states.

## Ownership and Proposed File Layout

All primitives are application-interface concerns and belong under `mofacts/`.
They must not be placed in `learning-components/`.

### Typed behavioral state

Create `mofacts/client/lib/adminUi/` with narrow modules:

- `loadableState.ts`
  - Owns the tagged load-state types and pure transitions.
  - Does not perform Meteor calls or render markup.
- `asyncCommandState.ts`
  - Owns command pending/success/error transitions and duplicate-run gating.
  - Supports confirmed-value restoration when the caller opts into optimistic
    presentation.
- `templateLifetime.ts`
  - Owns a small generation/lifetime token used to reject completions after
    template destruction or request supersession.
  - This is not a cancellation claim for server work; it controls client-side
    ownership of completion.
- `routePresentationState.ts`
  - Owns the single app-lifetime management-route presentation record.
  - This is legitimately route-global; page-specific state is not.
- `managementRoutePresentationPolicies.ts`
  - Owns canonical management-route template, lazy loader, title key, chrome
    mode, authentication requirement, and allowed-role metadata.
  - Replaces rather than supplements the current separate access, lazy-loader,
    shell-membership, and title maps.
- `disclosureController.ts`
  - Owns open/close, Escape, initial focus, return focus, and `aria-expanded`
    behavior for account and page disclosures.
- `sortableTableState.ts`
  - Owns sort field/direction transitions and `aria-sort` mapping.

Each module receives a colocated `.test.ts` file. Types should use literal
unions and `unknown` at untrusted boundaries; do not create an `any`-based
catch-all UI state object.

### Shared Blaze presentation primitives

Create `mofacts/client/views/shared/adminUi/`:

- `adminUi.html`
  - `adminAsyncRegion`
  - `adminStatus`
  - `adminEmptyState`
  - `adminInlineConfirmation`
  - `adminTableShell`
- `adminUi.ts`
  - Helpers/events that bind the typed contracts to Blaze.
  - No page-specific Meteor methods or domain branching.
- `adminUi.css`
  - Moves the existing shared admin status, confirmation, table-shell, focus,
    and stable-loading behavior out of the broad global stylesheet as pages
    migrate.
- `adminFormField.html` and `adminFormField.ts`, only if a concrete pilot proves
  a partial is clearer than semantic markup directly in the page.

Do not create a universal button component. Native `<button>`, `<input>`,
`<select>`, `<table>`, and `<a>` elements remain the source of semantics. The
shared layer supplies contracts, classes, helpers, and focused partials where
they remove real duplication.

### Route-shell integration

Keep route and shell ownership in their existing files:

- `mofacts/client/lib/router.ts` begins, resolves, and fails route presentation.
- `mofacts/client/index.html` renders the stable shell and route state.
- `mofacts/client/index.ts` maps target routes to title/chrome policy and exposes
  only the helpers the layout needs.
- `mofacts/client/views/home/home.html`, `.ts`, and `.css` continue to own the
  sidebar/account markup while using the shared disclosure controller.

There should be one supported layout-render call. The current chain of render
attempts is removed when the supported contract is proven by the route-shell
slice; it is not retained as a secondary route.

## Primitive Contracts

### 1. Loadable state

Use a tagged union shaped by behavior, for example:

```ts
export type LoadableState<T> =
  | { status: 'idle' }
  | { status: 'loading'; requestId: number }
  | { status: 'ready'; value: T }
  | { status: 'empty'; value: T }
  | { status: 'refreshing'; value: T; requestId: number }
  | { status: 'refresh-error'; value: T; message: string; retryable: boolean }
  | { status: 'error'; message: string; retryable: boolean };
```

Required behavior:

- `empty` is a successful terminal state, not a missing value.
- `refreshing` retains confirmed content and labels it as refreshing; it does
  not reuse initial loading semantics.
- `refresh-error` retains confirmed content while making refresh failure
  explicit; initial failure uses `error` and cannot masquerade as stale data.
- only the current request ID may commit a result;
- the error is stored as user-facing text plus optional structured diagnostic
  data kept out of the template contract;
- callers decide whether a successful collection is empty through an explicit
  predicate;
- no module-level catch substitutes a default value after failure.

The primitive must not know about collections, publications, themes, courses,
or backups.

### 2. Async command state

Use a command state separate from page loading:

```ts
export type AsyncCommandState<TResult = unknown> =
  | { status: 'idle' }
  | { status: 'pending'; commandId: number }
  | { status: 'success'; result: TResult }
  | { status: 'error'; message: string };
```

Required behavior:

- `run()` returns without issuing work when already pending;
- only the active command may commit success/error;
- the page supplies the actual async function;
- success text is not confused with load readiness;
- caller-specific rollback is explicit and tested;
- destruction invalidates the client completion;
- controls expose disabled and busy state without disabling unrelated work.

Do not make this a Meteor-method wrapper. It must also work for file reads,
downloads, imports, and local async initialization.

### 3. Template lifetime

The lifetime token provides:

- `begin()` to get the current operation generation;
- `isCurrent(generation)` before applying completion;
- `supersede()` when a newer request replaces an older one;
- `destroy()` during `onDestroyed`.

It does not abort DDP work and must not imply that the server operation was
cancelled. It prevents stale client mutation.

### 4. Route presentation

The app-lifetime route record should include:

- route name and path identity;
- target template;
- title translation key;
- chrome mode (`app`, `practice`, or `none`), though this project migrates only
  management/app mode in this plan;
- status (`loading`, `ready`, `error`);
- navigation generation;
- retry action for a failed lazy import where retry is valid.

Required sequence:

1. Route access policy begins resolution.
2. Once the target is known, the shell receives the target title/chrome and a
   loading page frame synchronously.
3. Lazy module loading begins.
4. The current generation alone may publish `ready`.
5. Import or render-contract failure publishes `error` and never attempts to
   render a missing template.
6. Unauthorized targets route away without briefly rendering their content.

Auth hydration must not expose role-dependent navigation before roles resolve.
The stable pending shell may reserve navigation geometry without guessing role
links.

### 5. Status and async region

`adminStatus` accepts a constrained variant (`info`, `success`, `warning`,
`error`), title/text, live behavior, and optional action slot. It owns:

- icon treatment and `aria-hidden`;
- `role=status` for nonurgent updates;
- `role=alert` only for urgent failures requiring immediate announcement;
- stable spacing;
- a consistent text container.

`adminAsyncRegion` owns mutually exclusive loading/ready/empty/error markup and
`aria-busy`. It must support reserved geometry supplied by the page. It does not
decide what data to load.

### 6. Inline confirmation

The confirmation contract contains:

- unique confirmation ID and trigger element;
- title, message, confirm/cancel labels, and severity;
- confirm/cancel callbacks;
- initial-focus policy;
- Escape cancellation;
- focus restoration;
- pending state after confirmation.

Only one confirmation may own focus in a page region. A row confirmation must
remain associated with that row even if the collection refreshes.

### 7. Disclosure menu/controller

The first consumer is `appAccountMenu`. The controller requires:

- a native trigger button separate from the controlled content;
- `aria-controls` and `aria-expanded`;
- Escape close and trigger-focus restoration;
- initial focus when opened by keyboard;
- a documented keyboard model: disclosure navigation or true menu, not a mix;
- nested locale/theme disclosure state using the same contract;
- outside-click handling registered and removed once.

### 8. Table behavior

The shared table layer owns:

- labeled scroll region and table shell;
- stable loading/empty/error row geometry;
- sortable-header button and `aria-sort` behavior;
- numeric/action alignment utilities;
- accessible icon-action naming rules;
- the three named mobile modes: `scroll`, `priority`, and `cards`.

Each domain page continues to own columns, row markup, data shaping, and its
mobile card information hierarchy. Do not build a column-schema renderer in the
first implementation.

### 9. Form behavior

The shared form contract requires:

- visible label associated through `for/id`;
- optional help and error IDs connected with `aria-describedby`;
- required and invalid state;
- stable error region;
- fieldset/legend for grouped choices;
- 44 px target sizing at user-facing mobile widths;
- no placeholder-only accessible name;
- unique label for every icon-only action.

Use direct semantic HTML when that is simpler than a partial.

## Migration Strategy

Migration proceeds by vertical slices. A primitive is not considered complete
until at least one real page consumes it, and a page migration is not complete
until its replaced local behavior is deleted.

### Phase 0 — Freeze the baseline and add guard tests

Purpose: prevent new divergence while primitives are introduced.

Implementation:

- Add this plan and the audit as the implementation baseline.
- Inventory the current access-policy, lazy-loader, app-shell membership, and
  title maps and add a failing characterization test that proves their current
  management-route coverage. Do not add another production map in this phase.
- Add source-level guard tests for:
  - one shell `h1` per management route contract;
  - no clickable sortable `<th>` in migrated tables;
  - no native `alert()`/`confirm()` in migrated management pages;
  - no new page-local copies of `requestInlineConfirmation` after the shared
    controller exists.
- Capture current public method names and route paths as behavior-preservation
  fixtures. Do not change server contracts in this plan.
- Create `docs-developer/administration-interface-behavioral-primitives-status.md`
  when implementation starts. It should record migrated pages, deleted local
  paths, verification, and known blockers.

Gate:

- The audit inventory and route map agree.
- Guard tests fail on deliberate duplicate/omitted fixtures.
- No runtime behavior has changed.

### Phase 1 — Implement and test the pure state contracts

Purpose: establish narrow behavior before adding markup.

Implementation:

- Add `loadableState.ts`, `asyncCommandState.ts`, and `templateLifetime.ts` with
  pure tests.
- Test all legal transitions and reject stale request/command completions.
- Test empty classification separately from failure.
- Test refresh retention separately from initial loading.
- Test destruction/supersession behavior.
- Keep the state API small. Add no domain-specific convenience methods.

Gate:

- Full TypeScript check passes.
- Lint passes.
- State tests cover transition tables and stale completion.
- No page has adopted an untested draft API.

### Phase 2 — Establish stable route and page-frame presentation

Purpose: eliminate the highest-leverage stale-page and blank-refresh risks.

Implementation:

- Add and test `routePresentationState.ts`.
- Add `managementRoutePresentationPolicies.ts` as the canonical management
  metadata owner. Migrate route access, lazy loading, shell classification, and
  titles to it in the same slice; delete the replaced entries from
  `routeAccessPolicies`, `lazyTemplateLoaders`, `APP_SHELL_TEMPLATES`, and
  `APP_SHELL_TITLE_KEYS` rather than retaining synchronized maps.
- Refactor `renderRouteTemplate()` so navigation publishes the target pending
  state before the lazy import.
- Make missing/rejected modules explicit route errors.
- Render the authenticated pending shell with stable target title and reserved
  navigation geometry while auth/roles resolve.
- Replace the multiple render attempts with the one supported layout call.
- Store and clean the `DefaultLayout` interval, document-click handler, and
  window keypress handler, or move true app-lifetime work to one startup owner.
- Make shell title derive from route presentation rather than a template that
  has not loaded yet.
- Preserve all current access policies and redirects.

Pilot routes:

- `/admin/tests` for the smallest admin-only lazy route.
- `/profile` for an authenticated non-admin route.
- `/classEdit` for a role-restricted teacher route.

Gate:

- Delayed import does not leave old page controls active.
- Direct refresh retains stable shell geometry without exposing role links
  before authorization.
- Import failure renders a named error with retry/back behavior.
- Back/forward and repeated route navigation accept only the current generation.
- Existing route-access-policy tests still pass.

### Phase 3 — Build shared status, async region, and command presentation

Purpose: prove the typed state integrates cleanly with Blaze.

Implementation:

- Add `adminStatus`, `adminAsyncRegion`, `adminEmptyState`, and
  `adminTableShell` templates/styles.
- Add binding helpers that accept only the documented tagged states.
- Migrate `/admin/tests` completely:
  - declarative results instead of `innerHTML`;
  - command pending state and duplicate prevention;
  - stable output region;
  - semantic result table.
- Migrate `/admin/backups` load state:
  - no false empty state;
  - explicit refresh/error;
  - stable history-row skeleton.
- Remove the page-local status/load markup replaced by these primitives.

Gate:

- Each primitive has one real consumer and DOM/state tests.
- Admin Tests issues one command per activation.
- Backups distinguishes initial loading, true empty, ready, refresh, and error.
- Shared markup does not accept raw HTML strings.

### Phase 4 — Implement confirmation, disclosure, and form semantics

Purpose: standardize focus and control behavior before broad destructive-action
migration.

Implementation:

- Add the shared inline-confirmation controller/template and focus tests.
- Migrate Backups restore/delete confirmation as the pilot.
- Migrate Profile key deletion and avatar selection semantics.
- Implement the account-menu disclosure controller:
  - replace the `div[role=button]` with a native sibling trigger/content shape;
  - add Escape, initial focus, return focus, and nested locale/theme disclosure;
  - expose theme-library loading instead of a false empty state.
- Add the form association contract and migrate Class Selection:
  - page-local load state;
  - inline validation/error instead of native alerts;
  - pending Save state;
  - lifecycle-token protection.
- Delete migrated page-local confirmation helpers.

Gate:

- Keyboard-only account navigation works by the documented interaction model.
- Confirmation focus enters and returns correctly.
- Class Selection never shows stale options or an indefinite spinner.
- Profile selection state is programmatically exposed.

### Phase 5 — Fix the highest-risk page readiness paths

Purpose: remove permanent loading, false empty, and post-mount rearrangement
before lower-risk consistency work.

#### Slice 5A — Content and TDF editors

- Replace schema/subscription booleans with explicit load state.
- Render error outside the ready editor branch.
- Add TDF editor initialization readiness matching Content Edit.
- Guard deferred editor initialization and schema completion by lifetime.
- Keep JSON Editor domain behavior and save contracts unchanged.

Deletion gate:

- No `loading()` helper infers terminal state solely from
  `subscriptionsReady()` and `schemaLoaded`.
- Schema errors cannot coexist with a permanently rendered spinner.

#### Slice 5B — Audio Settings

- Build the initial form from resolved reactive state.
- Remove the `requestAnimationFrame` value/visibility initialization path.
- Make conditional groups declarative.
- Use command state for saves and key operations.
- Surface key-status lookup failure.
- Preserve user-triggered TTS/SR warm-up behavior.

Deletion gate:

- Initial control values and group visibility are not assigned through jQuery or
  direct DOM mutation after mount.

#### Slice 5C — Content Manager list/quota/summaries

- Compose list, summary, and quota results into an explicit page presentation
  model without hiding independent failures.
- Reserve quota geometry until resolved.
- Move row shaping out of the throttled template helper into tested selectors.
- End each summary row in ready or explicit error; remove terminal
  `Loading...` strings.
- Retain upload progress and row-level subscriptions as domain-owned behavior.

Deletion gate:

- `listError` and summary errors are rendered, not log-only.
- `quotaStatus` has an unresolved state rather than defaulting to unlimited.

#### Slice 5D — Reporting, course/assignment management, admin controls, and MTurk

- Migrate initial page loads to loadable state and lifetime tokens.
- Stop/ignore readiness work on destruction.
- Add command state to course saves/deletes and MTurk operations.
- Do not mutate local course collections before confirmed persistence.
- Migrate Assignment Management course/assignment loading and save/reset state;
  preserve its existing authored assignment contract.
- Migrate Admin Controls storage/settings readiness and cache/verbosity command
  state; a failed verbosity update restores the confirmed selection.
- Add explicit MTurk experiment-list loading/error.
- Add confirmation and result state to MTurk removal.

Deletion gate:

- No initial `onRendered(async ...)` path lacks a caught terminal state.
- No fire-and-forget user-visible mutation remains.

Gate for Phase 5:

- Every migrated page has a state-matrix test.
- Delayed, rejected, empty, successful, superseded, and destroyed paths are
  covered as applicable.
- Typecheck and lint pass after each slice.
- Supported browser smoke verifies the route and visible state after each UI
  slice; this is implementation verification, not part of the completed audit.

### Phase 6 — Standardize table behavior page by page

Purpose: share interaction and responsive contracts while preserving domain
information hierarchy.

Implementation order:

1. **Admin Tests and Data Download**
   - Smallest tables; establish semantic headers, icon names, stable loading,
     and compact mobile behavior.
2. **Instructor Reporting**
   - Replace pointer-only anchors, add row-group/totals semantics, and introduce
     reporting cards or priority rows on mobile.
3. **User Administration**
   - Sort buttons and `aria-sort`, row command state, explicit widths, and user
     cards on mobile.
4. **Courses**
   - Complete or remove `treegrid` semantics while retaining the existing
     table/card split.
5. **Content Manager package/media tables**
   - Remove blockified table semantics; use dedicated mobile package/file rows.
6. **Manual Creator and IMSCC**
   - Add row-specific input labels and mobile editable/selectable cards.
7. **Mechanical Turk logs**
   - Add labeled scroll region, explicit column widths, worker action state, and
     mobile worker cards.

Per-table gate:

- Column purpose and widths match section E of the audit.
- Numeric columns are right-aligned; actions do not dominate primary content.
- Loading approximates final geometry.
- Empty and error remain distinct.
- Sort/action controls are keyboard operable and named.
- The declared mobile mode is implemented without corrupting table semantics.

Do not wait for every table before merging a completed table slice.

### Phase 7 — Complete form and wizard uniformity

Purpose: eliminate repeated accessibility and interaction defects without
changing authoring workflows.

Implementation:

- Migrate Manual Creator repeated inputs and icon actions to stable row IDs and
  associated labels.
- Migrate APKG and IMSCC repeated configuration fields.
- Add fieldsets/legends for choice groups and modes.
- Migrate MTurk placeholder-only inputs and Reporting selectors/date fields.
- Label User Admin import input and connect file/result status.
- Normalize wizard step semantics and validation summary behavior.
- Guard AI Creator deferred auto-start and draft loads with template lifetime.
- Convert embedded AI heading to the correct section level.

Gate:

- No migrated form control depends on placeholder text as its accessible name.
- Repeated controls have unique IDs and error/help associations.
- Icon-only actions name the row/item they affect.
- Existing generated package and save behavior remains unchanged.

### Phase 8 — Theme Management specialization

Purpose: apply the primitives while preserving theme-specific behavior that is
not generic.

Implementation:

- Gate library/editor on subscription terminal state with reserved geometry.
- Use shared form association for every property text/color pair.
- Introduce a theme-owned draft preview model distinct from confirmed server
  theme state.
- Commit or roll back property changes on persistence outcome.
- Apply external fonts only after explicit load/error resolution with
  metric-compatible sizing.
- Keep global theme application and validation in theme-owned modules; do not
  put theme logic into generic admin primitives.
- Add narrow mobile one-column property rows.

Gate:

- A failed save cannot leave the editor/shell claiming an unpersisted confirmed
  theme.
- Slow/failed theme publications do not render false empty/default states.
- All editable properties have accessible labels and errors.
- Font load/failure has an explicit terminal state.

### Phase 9 — CSS ownership, deletion, and final consistency

Purpose: remove obsolete duplication after behavior is stable.

Implementation:

- Move migrated shared admin CSS out of `classic.css` into `adminUi.css`.
- Move page `<style>` blocks into scoped page CSS.
- Remove high-specificity and `!important` rules made unnecessary by primitive
  markup.
- Replace management-shell `100vh` assumptions with the explicit supported
  dynamic-viewport contract and centralize management-page scroll ownership.
- Extend the reduced-motion rule to account-menu, sidebar, route/table loading,
  progress, and page-transition motion introduced or retained by the migrated
  interfaces.
- Replace only repeated magic dimensions with semantic tokens; leave justified
  domain dimensions local.
- Remove hidden duplicate page titles and their CSS hiding rule.
- Normalize translated labels still hard-coded in migrated surfaces.
- Search for and delete obsolete local status, confirmation, load, sort, and
  direct-DOM helpers.

Final deletion searches should cover at least:

```text
requestInlineConfirmation
sortable-useradmin
onclick="navigateToStudentReporting
customLoading
page-header-title
page-header-text
window.themeSaveTimeout
window.themeColorSaveTimeout
requestAnimationFrame
alert(
confirm(
```

Each result must be classified as removed, intentionally out of scope, or still
owned by a documented non-management surface. A search hit is not deleted
blindly.

Gate:

- No migrated page retains a parallel local implementation.
- CSS ownership is explicit.
- Typecheck and lint pass.
- The implementation status document records every migrated page and remaining
  intentional exception.

## Page Migration Matrix

| Surface | Load/page state | Command state | Confirmation/disclosure | Form contract | Table contract | Primary phase |
| --- | --- | --- | --- | --- | --- | --- |
| Shared route shell | Route presentation | — | — | Heading ownership | — | 2 |
| Account menu | Theme-list load | Locale/theme writes | Disclosure controller | Native trigger/menu controls | — | 4 |
| Profile | Existing user hydration | Save/test/delete | Delete confirmation | Segmented/radio semantics | — | 4 |
| Audio Settings | Settings/key readiness | Per-setting/key saves | Key delete confirmation | Labels/busy/errors | Reference table | 5B, 6 |
| Courses | Snapshot state | Join/launch commands | Course disclosure | Search/sort labels | Table/cards/tree semantics | 6 |
| Class Selection | Options state | Save enrollment | — | Inline validation | — | 4 |
| Content Manager | List/summary/quota | Upload/access/delete/visibility | Row/package confirmations | Upload/access fields | Package/media tables | 5C, 6 |
| AI Creator | Capability state | Create | — | Visible source label/modes | — | 7 |
| Manual Creator | Draft/generation state | Save/delete/upload | Shared confirmation | Repeated fields/groups | Starter rows/cards | 7 |
| APKG | Analysis/generation state | Generate/upload | Shared confirmation | Repeated config fields | — | 7 |
| IMSCC | Analysis/generation state | Generate/upload | Shared confirmation | Repeated config fields | Quiz table/cards | 6, 7 |
| Draft workspace | Editor initialization | Save/continue | — | Tabs/select labels | — | 5A, 7 |
| Content Edit | Schema/data/editor state | Save/generate/remove | Shared confirmation | Generated-editor boundary | — | 5A |
| TDF Edit | Schema/data/editor state | Save | — | Generated-editor boundary | — | 5A |
| Data Download | File list state | Per-download | — | — | Compact action table | 6 |
| Course Management | Course list state | Save/delete | Delete confirmation | Course fields | — | 5D |
| Assignments | Course/assignment state | Save/reset | Unsaved-leave decision only if current workflow already requires it | Row controls | Assignment rows | 5D, 7 |
| Instructor Reporting | Publication/method state | Exception changes | — | Select/date fields | Reporting table/cards | 5D, 6 |
| Admin Controls | Status/settings state | Cache/verbosity | — | Radio groups | — | 5D |
| User Administration | Subscription state | Role/delete/import/API keys | Delete/key confirmation | Filter/import/API fields | Sortable user table/cards | 6, 7 |
| Mechanical Turk | Experiments/log state | Pay/bonus/message/remove/profile | Removal confirmation/modal disclosure | All credential/query/message fields | Worker table/cards | 5D, 6, 7 |
| Theme Management | Library/editor readiness | Activate/save/import/assets | Theme destructive confirmation | Property rows | — | 8 |
| Admin Tests | Result region state | Run checks | — | — | Small results table | 3 |
| Backups | Config/history state | Create/verify/download/restore/delete | Focus-managed confirmations/disclosure | Confirmation fields | History rows | 3, 4 |

## Audit Checklist Coverage

| Audit item | Owning phase or slice | Coverage |
| --- | --- | --- |
| P1.1 deterministic route pending/error | Phase 2 | Direct |
| P1.2 editor terminal readiness | Slice 5A | Direct |
| P1.3 declarative Audio Settings | Slice 5B | Direct |
| P1.4 Content Manager list/quota/summary state | Slice 5C | Direct |
| P1.5 accessible account menu | Phase 4 | Direct |
| P1.6 table interaction accessibility | Phase 6 | Direct |
| P1.7 mutation busy/confirmation/rollback | Phases 3–6 | Direct |
| P1.8 Theme readiness/labels/persistence | Phase 8 | Primitives plus theme-owned specialization |
| P1.9 reporting/enrollment lifecycle | Phases 4 and 5D | Direct |
| P2.1 shared page/async states | Phases 1–4 | Direct |
| P2.2 per-table responsive behavior | Phase 6 | Direct |
| P2.3 authoring/import form associations | Phase 7 | Direct |
| P2.4 inline CSS/specificity cleanup | Phase 9 | Separate cleanup after primitive migration |
| P2.5 viewport/scroll/reduced motion | Phases 2 and 9 | Page-frame contribution plus shell CSS work |
| P2.6 heading ownership | Phases 2, 7, and 9 | Direct |
| P2.7 Backups stability/focus | Phases 3 and 4 | Direct |
| P2.8 declarative Admin Tests | Phase 3 | Direct |
| P2.9 Profile selection/destructive safeguards | Phase 4 | Direct |
| P3.1 residual dimensions/tokens/labels | Phase 9 | Separate low-risk cleanup |

## Implementation Slices and Review Boundaries

Keep changes reviewable and reversible at the commit/PR level without retaining
two runtime paths:

1. Pure state contracts and tests.
2. Route presentation and stable shell.
3. Shared status/async/table shell plus Admin Tests pilot.
4. Backups load/command/confirmation pilot.
5. Account menu and Class Selection disclosure/form pilot.
6. Editor readiness.
7. Audio Settings declarative state.
8. Content Manager load model.
9. Reporting/course/MTurk lifecycle and command state.
10. Small tables, then reporting/user/content/wizard/MTurk tables.
11. Form and wizard semantics.
12. Theme specialization.
13. CSS/deletion/final consistency.

Do not mix the route-shell cutover with broad page-table or theme changes. Do
not introduce all templates first and defer consumers; every primitive slice
must prove itself on a real page.

## Verification Plan

### Every TypeScript-bearing slice

From `mofacts/`:

```text
npm run typecheck
npm run lint
```

Do not substitute targeted TypeScript compilation for the full application
check.

### Pure behavior tests

Add colocated tests for:

- every tagged-state transition;
- stale request/command completion;
- destruction/supersession;
- sort transitions and `aria-sort` mapping;
- route-presentation generations and failure;
- confirmation/disclosure focus state;
- page-specific selectors introduced during migration.

Run these through the supported project test environment. `npm run test:ci`
remains CI-gated and should not be used routinely on local Windows.

### UI/runtime implementation verification

For each UI migration, use the native hotfix dev server and MoFaCTS Playwright
sidecar as required by the repository guide. Verify:

- direct refresh;
- first uncached route entry;
- cached navigation;
- back/forward;
- delayed response;
- rejected response;
- empty success;
- repeat navigation;
- navigation away while pending;
- desktop and mobile target widths;
- keyboard-only operation;
- console and network errors.

The audit itself remained static-only; this runtime work begins only during
implementation.

### Required browser/viewport matrix at phase completion

- Chromium, Firefox, and WebKit.
- Wide desktop, standard laptop, 1024 px, 768 px, 390 px, 375 px, and 320 px.
- Portrait and landscape mobile where the surface is usable.
- 200% zoom and long translated labels.
- Reduced-motion preference.
- Mobile on-screen keyboard for forms and confirmations.

### Accessibility checks

- One page `h1` and ordered headings.
- Named landmarks and async regions.
- All form controls labeled and described.
- All icon-only controls named with their target.
- Visible focus and logical order.
- Disclosure and confirmation focus restoration.
- Table captions/labels, scoped headers, and sort state.
- Status not conveyed by color alone.
- Busy, success, and error announcements are neither missing nor duplicated.

## Completion Criteria

The strategy is complete when:

1. Every in-scope route uses the deterministic route/page presentation path.
2. Every initial async page load has an explicit terminal state.
3. Every user-visible mutation prevents duplicate activation and reports
   failure.
4. Every destructive management action uses the shared focus-managed
   confirmation contract or a documented server-enforced workflow with an
   equivalent interaction contract.
5. The account menu uses valid native interactive structure and the documented
   keyboard model.
6. Every audited table implements its declared desktop and mobile behavior.
7. Every audited form control has an accessible name and associated error/help
   where applicable.
8. Migrated pages no longer use global `Session` for page-local load, error,
   command, or selection state.
9. Replaced local helpers and markup are deleted; there is no compatibility
   behavioral layer.
10. Management route access, template loading, shell mode, and title metadata
    have one canonical owner.
11. Dynamic viewport, scroll ownership, and reduced-motion behavior pass the
    documented mobile/accessibility matrix.
12. Full typecheck and lint pass.
13. Required browser, responsive, keyboard, and async-failure verification is
    recorded in the implementation status document.
14. The audit checklist is updated or accompanied by evidence showing each item
    complete, intentionally deferred, or blocked with a concrete reason.

## Risks and Controls

### Risk: a generic UI framework emerges accidentally

Control: primitives own only repeated behavior. Domain pages retain data
shaping, columns, workflows, and server calls. Reject configuration-heavy
renderers in early phases.

### Risk: new primitives coexist indefinitely with old helpers

Control: every migration slice has a deletion gate and source search. A
primitive without a migrated consumer is incomplete.

### Risk: route-shell work destabilizes authentication

Control: preserve route access policies, separate target identity from
authorization result, pilot one route per role class, and test direct refresh
plus delayed auth before broader migration.

### Risk: global Session is replaced by another global bag

Control: only route presentation is app-lifetime global. Load and command state
are template-owned; modules expose constructors/pure transitions rather than a
singleton page store.

### Risk: abstraction hides accessibility details

Control: native elements remain primary. Shared partials have fixed semantic
contracts and DOM tests; callers cannot inject arbitrary status/table markup.

### Risk: responsive work becomes a redesign

Control: use the information priorities documented in audit section E and
preserve actions/workflows. Change representation only where the current table
cannot remain usable at narrow widths.

### Risk: theme behavior contaminates generic primitives

Control: theme draft, font, asset, and global CSS application remain theme-owned.
Generic primitives provide only readiness, command, form, status, and
confirmation behavior.

## Documentation

- Keep this plan and its future status/evidence log in `docs-developer/`.
- Update `docs-developer/mofacts_administration_interface_polish_audit.md` only
  when implementation evidence changes a finding or closes an item.
- Update public docs or the wiki only if implementation changes an established
  user workflow, setup, schema, or operator behavior. Pure internal primitive
  extraction does not require a public documentation change.
- Update root `AGENTS.md` only if the supported UI development or verification
  workflow changes.
