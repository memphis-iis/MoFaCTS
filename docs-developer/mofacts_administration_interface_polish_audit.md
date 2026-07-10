# MoFaCTS Administration Interface Code-Quality Audit

Date: 2026-07-10  
Method: static source review only  
Scope: authenticated, non-practice management interfaces for regular users, teachers, and administrators, including the shared application shell and account menu. Learner delivery surfaces (flashcards, instructions, video/H5P, and SPARC) are excluded. The non-exposed SPARC authoring route is also excluded.

No running application, browser automation, screenshots, Docker service, hotfix server, or UI test was used. Timing-dependent findings below are explicitly described as code-based risks.

## A. Executive summary

The administration interface has a useful shared shell, consistent color/spacing variables, reusable status styles, and several page-specific responsive treatments. The newer Profile and Courses surfaces are materially more systematic than older Blaze/jQuery panels. However, the overall management experience is not yet internally coherent enough for a production SaaS baseline because route readiness, async error ownership, form semantics, table behavior, and mutation feedback are implemented separately on almost every page.

The most consequential defect is in route presentation. `renderRouteTemplate()` waits for a lazy import before changing `currentTemplate`, so a client-side transition to a not-yet-loaded management page can leave the previous page visible and interactive under the new URL. During direct-route authentication hydration, the empty `customLoading` template removes the authenticated shell entirely. Both paths violate the invariant that the shell and page identity should be coherent before presentation.

Other high-impact defects are:

- Content and TDF editors can remain on a spinner forever after schema or subscription failure; their error message is structurally hidden behind the loading branch.
- Audio Settings renders default markup and then changes controls and whole sections in `requestAnimationFrame`, implying an avoidable post-paint rearrangement.
- Content Manager records list failures without rendering them, treats quota as unlimited until the real result arrives, and can present permanent `Loading...` row values after summary failure.
- Theme Management renders false empty/default states before its subscriptions are ready, exposes dozens of visually described but programmatically unlabeled controls, and applies optimistic global CSS/font changes without rollback when persistence fails.
- Instructor Reporting, Course Selection, Course Management, Mechanical Turk, and Backups have incomplete async failure, lifecycle, busy, focus, or confirmation ownership.
- The User Administration and Instructor Reporting tables use pointer-only interactive headers or anchors and lack complete table semantics.
- The account-menu trigger is a `div[role=button]` containing descendant buttons; it lacks Escape, arrow-key, initial-focus, and focus-restoration behavior.

No P0 release blocker is asserted from static evidence alone. The P1 items should be implemented first because they can expose stale controls, permanent loading, misleading empty states, inaccessible operations, or destructive duplicate actions. The recommended sequence is: deterministic shell/route readiness; shared async state contract; editor/content/reporting fixes; shared interaction primitives; table/mobile corrections; then CSS and cross-browser hardening.

## B. Page inventory

“Reviewed” means route wiring, lifecycle/state, markup, CSS ownership, responsive rules, and relevant test source were inspected. “Partial” identifies a generated or external surface that cannot be fully concluded from static source.

| Route or entry point | Audience and purpose | Implementation status | Responsive review | Major findings | Shared components/patterns |
| --- | --- | --- | --- | --- | --- |
| Shared `DefaultLayout`, sidebar, top header | All authenticated users; persistent navigation and page chrome | Reviewed | Reviewed at shell breakpoints | Lazy route retains old panel; auth wait removes shell; layout listener/timer cleanup risk; duplicate in-page headings hidden with CSS | `DefaultLayout`, `appSidebar`, `appAccountMenu`, `.tool-content` |
| Top-right account menu | All authenticated users; profile, locale, audio, theme, help, logout | Reviewed | Reviewed through 640/1024 px rules | Invalid nested interactive structure; incomplete menu keyboard/focus model; false “no themes” state possible before subscription readiness | `appAccountMenu`, `.home-user-menu` |
| `/profile` | User account, avatar, locale, personal OpenRouter settings | Reviewed | Reviewed | Strong base layout; segmented selections lack selected-state semantics; async status insertion is not reserved; destructive key deletion has no confirmation | Profile-specific controls and CSS |
| `/audioSettings` | User speech/TTS settings and personal speech key | Reviewed | Reviewed via Bootstrap grid/global rules | Post-mount `requestAnimationFrame` changes visibility and values; silent key-status lookup failure; inconsistent busy/error handling; inline hidden groups | Bootstrap controls plus shared admin status |
| `/courses` | User course enrollment, assignment overview, launch entry | Reviewed | Reviewed; explicit table/card switch | Good skeleton and mobile cards; `treegrid` contract is incomplete; loading error and content geometry differ; no cancellation guard for late snapshot completion | Dashboard skeletons, course table/cards |
| `/classSelection`; `/classes/:teacherId/:sectionId` | Secondary user enrollment and invitation flow | Reviewed | Reviewed | Session state is not reset on entry; failures become indefinite loading; native alerts; no busy/duplicate-submit protection | Bootstrap card/grid |
| `/contentUpload` | Content library, package upload, access, visibility, media, deletion | Reviewed | Reviewed at 576/768/1100 px | Unrendered list/summary errors; quota banner inserts late; large helper owns async presentation indirectly; mobile table semantics are changed with `display:block`; inline CSS | Admin table shell, status/badge/confirmation patterns |
| Embedded and `/aiContentCreate` | AI-assisted content creation | Reviewed | Reviewed at 680 px | Embedded `<h1>` duplicates shell `<h1>`; capability loads after presentation; deferred auto-start has no destruction guard; textarea relies on `aria-label` instead of visible label | AI-specific card |
| `/contentCreate` | Manual multi-step content authoring | Reviewed | Reviewed at 768/991 px | Most controls have no explicit programmatic labels; icon-only row actions are unlabeled; draft load can complete after destruction; starter table has no mobile information hierarchy | Manual wizard, inline confirmation/status |
| APKG wizard nested in Content Manager | Import and configure Anki packages | Reviewed | No dedicated mobile breakpoint found | Fixed-height/progress geometry and 900 px container; repeated controls lack IDs/label association; async lifecycle has no destruction guard | Wizard-local CSS/ReactiveVars |
| IMSCC wizard nested in Content Manager | Import and configure Common Cartridge quizzes | Reviewed | Limited 640 px rule | Six-column table has only generic horizontal scrolling; repeated controls lack label association; no destroyed lifecycle; fixed step geometry | Wizard-local CSS/ReactiveVars |
| Draft editor workspace | Edit generated TDF/content working copies | Partial | Reviewed source CSS | JSON editors are runtime-generated; async autorun may resolve after tab/lesson change or destruction; tab buttons do not expose tab semantics | `draftEditorWorkspace`, JSON editor adapters |
| `/contentEdit/:tdfId` | Stimulus/content JSON editor | Partial | Reviewed at 576/768 px | Schema/subscription failure can leave permanent spinner; generated editor semantics require later runtime verification; large inline CSS/high specificity | JSON Editor, validator, inline editor status |
| `/tdfEdit/:tdfId` | TDF settings JSON editor | Partial | Reviewed at 576/768 px | Same permanent-spinner defect; spinner hides before deferred editor initialization, implying blank-to-editor shift; hard-coded English Back label | JSON Editor, validator, inline editor status |
| `/dataDownload` | User history and owned-content downloads | Reviewed | Generic table scrolling only | Icon-only row actions lack accessible names; anchor-with-empty-`href` acts as a button; no per-action busy state; loading row does not reserve final geometry | Shared admin table/status |
| `/classEdit` | Teacher course/section management | Reviewed | Reviewed at 576/768 px | Load rejection leaves permanent spinner; save/delete lack busy state; failed create mutates local course array before persistence; section links expose raw navigation only | Admin cards, inline confirmation |
| `/tdfAssignmentEdit` | Teacher syllabus/assignment management | Reviewed | Reviewed at 720 px | Global Session state; no unsaved-navigation guard; icon-only move/remove controls rely on `title`; save disables only for loading, not dirty/saving distinction | Assignment rows and save bar |
| `/instructorReporting` | Teacher course/lesson performance and exceptions | Reviewed | No page-specific responsive CSS | Uncaught initial load; late continuation after destroy; unlabeled selects/date; pointer-only anchors; generic table scrolling; inline global input CSS | Shared admin cards/table/status |
| `/adminControls` | Admin storage, cache, server/client verbosity | Reviewed | Reviewed at 768/992 px | No explicit readiness state; stale/default storage values; server radio is set imperatively; server verbosity mutation is fire-and-forget; no busy state | Admin maintenance/verbosity cards |
| `/userAdmin` | Admin API alternatives, users, roles, usage, import | Reviewed | Generic table scrolling; API grid stacks | Sort headers are mouse-only and lack `aria-sort`; 10-column mobile table has no priority model; row mutations lack busy state; file input lacks label | Shared admin cards/table/status |
| `/turkWorkflow` | Admin MTurk credentials, logs, payment, messaging, removal | Reviewed | Bootstrap/global table scrolling | Legacy `rendered` async has no error/loading state or cleanup; stale Session/local collection data; many placeholder-only inputs; removal is unconfirmed/fire-and-forget; 12-column table | Bootstrap modals, admin table/status |
| `/theme` plus generation wizard | Admin theme library, global tokens, assets/help content | Reviewed | Library only has 768/992 rules; editor grid remains two columns | False empty state before subscription readiness; extensive missing labels; global optimistic preview not rolled back; external font loads can reflow shell; global timers | Theme library, generation wizard, theme tokens |
| `/admin/tests` | Admin deployment-readiness checks | Reviewed | Generic table scrolling | Imperative `innerHTML`, no busy/duplicate-run state, no live/busy semantics, generated headers lack scope | Admin card only |
| `/admin/backups` | Admin create/list/verify/download/restore/delete backups | Reviewed | Reviewed at 720 px | False empty/stale history before load; no explicit loading state; confirmation insertion lacks focus transfer/restoration; manifest insertion shifts page | Admin cards, history rows, inline destructive controls |

Static limitations:

- JSON Editor generates most `/contentEdit`, `/tdfEdit`, and draft-workspace controls at runtime; source shows the configuration and post-processing but cannot prove final accessible names, tab order, focus restoration, or browser layout.
- Bootstrap modal focus trapping/restoration and Flow Router/Blaze mount retention partly depend on package runtime behavior. The owning code risks are still identifiable, but acceptance tests must confirm final behavior.
- Data length, translations, user-selected themes, external fonts, and server latency can materially affect wrapping and timing. These are future test dimensions, not runtime observations from this audit.
- Existing tests cover route policy and several pure helpers, but no in-scope component-level accessibility, responsive, route-transition, or loading-state tests were found.

## C. Prioritized implementation checklist

Each item heading supplies required field 1 (priority). Its numbered body supplies fields 2–15 in order: affected surface, defect/risk, consequence, cause, change, files, shared pattern, desktop, mobile, accessibility, acceptance, scope, dependencies, and regression/tests.

### P1 — high priority

#### P1.1 — Give route transitions one deterministic pending/error state

1. **Affected:** all management routes in `mofacts/client/lib/router.ts`; `DefaultLayout` in `mofacts/client/index.html`.
2. **Defect/risk:** `renderRouteTemplate()` awaits the lazy import before calling `renderLayout()`; the old `currentTemplate` remains active. Import failure is logged and the missing template is rendered anyway. Auth hydration renders an empty template that is not classified as authenticated chrome.
3. **User consequence:** code-based risk of the previous panel remaining visible under a new URL, blank direct-route refreshes, shell removal/reinsertion, or a blank failed route.
4. **Cause:** route, shell, module readiness, and error ownership are separate global/session concerns.
5. **Change:** synchronously set a route presentation record `{target, status:'loading'}` before import; keep `DefaultLayout` mounted for authenticated target routes; render a stable page-frame skeleton with the target title; on success atomically swap content; on failure render a target-specific error with Retry/Back. Remove the catch-and-continue path and the multiple `controller.render` compatibility attempts; use the single supported render contract.
6. **Files:** `mofacts/client/lib/router.ts:298-369,567-621`; `mofacts/client/index.html:47-124,224-227`; `mofacts/client/index.ts:95-145,864-910`.
7. **Shared pattern:** `RoutePresentationState` plus `AdminPageFrame`/route-error template.
8. **Desktop:** sidebar/header/title stay fixed; old controls become unavailable immediately.
9. **Mobile:** mobile sidebar/header remain fixed; no blank viewport.
10. **Accessibility:** loading region uses `aria-busy`; error heading receives focus; title changes are announced once.
11. **Acceptance:** uncached transitions, direct refresh, back/forward, rejected dynamic import, signed-out redirect, and slow auth never expose old controls or remove stable chrome.
12. **Scope:** Large.
13. **Dependencies:** first implementation phase; precedes page-specific loaders.
14. **Regression/tests:** route-policy tests plus future fake-delayed-import tests and browser checks at desktop/mobile; verify public/auth routes still render without app chrome.

#### P1.2 — Replace permanent editor spinners with explicit readiness failures

1. **Affected:** `/contentEdit/:tdfId`, `/tdfEdit/:tdfId`.
2. **Defect/risk:** schema failure leaves `schemaLoaded=false`, so the loading branch remains active and hides `editorMessage`; subscription absence/error has the same indefinite state. TDF Edit has no `editorReady` state around deferred initialization.
3. **User consequence:** permanent spinner after a failed schema/data load; TDF editor can show an empty card before generated controls appear.
4. **Cause:** readiness is inferred from booleans rather than a state machine; the error surface is nested after the loading branch.
5. **Change:** model schema, publication, document, and editor initialization as `idle/loading/ready/error`; render errors outside the ready branch with Retry and Back; add `editorReady` to TDF Edit; cancel/ignore deferred initialization after destruction.
6. **Files:** `contentEdit.ts:68-116,168-180,499-516,1299-1315`; `contentEdit.html:701-856`; `tdfEdit.ts:61-100,150-157,328-345`; `tdfEdit.html:511-579`.
7. **Shared pattern:** `EditorReadinessState` and common editor frame.
8. **Desktop:** reserve editor frame height without showing an empty editor card.
9. **Mobile:** same sequence; Retry/Back are full-width at narrow widths.
10. **Accessibility:** error uses `role=alert`; loading has named status; generated editor receives focus only after ready.
11. **Acceptance:** schema 404, malformed JSON, publication denial/no document, initialization exception, navigation during load, and successful cached load all terminate in one coherent state.
12. **Scope:** Medium.
13. **Dependencies:** P1.1 page frame.
14. **Regression/tests:** unit-test reducer/state transitions; future browser tests with mocked fetch/publication and unsaved-state checks.

#### P1.3 — Render Audio Settings from resolved state, not post-mount DOM mutation

1. **Affected:** `/audioSettings`.
2. **Defect/risk:** default checkboxes/values and hidden groups render first; `requestAnimationFrame` then sets values and shows/hides sections. Key-status lookup errors are swallowed, and some save handlers have no error/busy handling.
3. **User consequence:** code-based risk of controls changing after paint, vertical shifts, misleading key status, duplicate edits, and silent save failures.
4. **Cause:** jQuery/DOM is the state owner instead of reactive data.
5. **Change:** initialize a reactive settings snapshot in `onCreated`; render a reserved skeleton until both user settings and key status resolve; bind visibility/value/checked states declaratively; represent key lookup failure; use one queued save helper with per-control busy/error and rollback.
6. **Files:** `audioSettings.ts:71-119,121-275,288-488`; `audioSettings.html:20-220`.
7. **Shared pattern:** settings form state and `AsyncStatus`.
8. **Desktop:** cards render once at final geometry.
9. **Mobile:** conditional groups do not push the following section after first paint.
10. **Accessibility:** busy controls expose `aria-busy/disabled`; failures announce; status icons are hidden from AT.
11. **Acceptance:** silent/all/input-enabled/key-lookup-error/save-error states produce no post-paint visibility mutation and preserve/revert the correct value.
12. **Scope:** Medium.
13. **Dependencies:** shared async state from P1.1/P2.1.
14. **Regression/tests:** component-state tests; future slow-response browser checks; verify TTS/SR warm-up remains user-triggered.

#### P1.4 — Correct Content Manager list, quota, and summary state ownership

1. **Affected:** `/contentUpload` main library.
2. **Defect/risk:** list errors are stored but never rendered; summary errors only log; default quota is `{unlimited:true}`, so a limited-user banner appears late; missing summaries yield row text such as `Loading...` after readiness is declared.
3. **User consequence:** false empty library, permanent placeholder values, missing quota information, and layout insertion above content.
4. **Cause:** list/summary/quota fetches have independent booleans and indirect rendering through a throttled helper.
5. **Change:** use a single presentation snapshot with independent resolved/error metadata; reserve quota region until resolved; render list and summary errors with Retry; do not mark ready until each requested summary is resolved or explicitly failed; move row shaping out of the template helper into a testable selector.
6. **Files:** `contentUpload.ts:399-704,757-974`; `contentUpload.html:168-174,236-330`; `contentUpload.css:1-350`.
7. **Shared pattern:** stable table shell and `LoadableCollectionState`.
8. **Desktop:** fixed summary/action columns remain stable.
9. **Mobile:** use explicit stacked row markup rather than changing table elements to blocks.
10. **Accessibility:** failed/partial rows are named; `aria-busy` ends only at a terminal state.
11. **Acceptance:** quota/list/summary success and each independent failure show truthful, stable output; no `Loading...` remains after terminal failure.
12. **Scope:** Large.
13. **Dependencies:** P1.1; table primitive in P2.2 can follow.
14. **Regression/tests:** selector tests for partial responses/deletes/uploads; future delayed-response and narrow-width browser tests.

#### P1.5 — Make the account control a real accessible menu

1. **Affected:** top-right `appAccountMenu` on every management page.
2. **Defect/risk:** a `div role=button tabindex=0` contains the menu’s buttons; open/close is class-based with Enter/Space only. Escape, arrows, Home/End, initial focus, focus restoration, and menu semantics are absent.
3. **User consequence:** keyboard and screen-reader users can enter an ambiguous nested interactive structure and cannot predictably dismiss or traverse it.
4. **Cause:** visual dropdown behavior without a menu/flyout interaction contract.
5. **Change:** use a native trigger `<button>` separate from a sibling menu; implement Escape, focus-in, focus return, and either roving menu keyboard behavior or a documented disclosure-navigation pattern; expose loading for theme choices instead of “no themes.”
6. **Files:** `home.html:136-190`; `home.ts:186-200,318-568,955-990`; `home.css:550-735`.
7. **Shared pattern:** reusable `DisclosureMenu` controller.
8. **Desktop:** preserve placement and account identity.
9. **Mobile:** keep menu within dynamic viewport and ensure 44 px targets.
10. **Accessibility:** valid interactive tree, correct `aria-controls/expanded`, focus management, selected locale/theme state.
11. **Acceptance:** mouse, touch, Tab, Shift+Tab, Escape, Enter/Space, and chosen arrow-key model work; focus returns to trigger; async theme list never reports a false empty state.
12. **Scope:** Medium.
13. **Dependencies:** none; coordinate with shell work.
14. **Regression/tests:** DOM semantics/unit controller tests and future keyboard browser test across all roles.

#### P1.6 — Repair inaccessible table interactions in User Admin and Reporting

1. **Affected:** `/userAdmin`, `/instructorReporting`.
2. **Defect/risk:** User Admin sorts by clicking `<th>` and exposes `^/v` without `aria-sort`; Reporting uses `<a>` without `href` and inline `onclick`, and repeated IDs for exception links.
3. **User consequence:** sorting, student drill-down, and exception actions are not reliably keyboard operable or announced.
4. **Cause:** interaction handlers attached to non-controls.
5. **Change:** put sort `<button>` elements inside scoped headers and maintain `aria-sort`; replace reporting anchors with buttons/real routes; use classes/data attributes, unique row identity, and row-scoped handlers; add caption or `aria-labelledby`.
6. **Files:** `userAdmin.html:146-220`; `userAdmin.ts:697-716`; `instructorReporting.html:124-210`.
7. **Shared pattern:** sortable-header and table-action primitives.
8. **Desktop:** preserve compact header layout and row actions.
9. **Mobile:** pair with P2.2 priority/card models.
10. **Accessibility:** all actions keyboard operable; sort state and table purpose announced.
11. **Acceptance:** every action works with keyboard alone; automated semantics contain no clickable non-control; sort announcement changes correctly.
12. **Scope:** Medium.
13. **Dependencies:** table specification P2.2.
14. **Regression/tests:** handler tests for sort/action identity; future accessibility scan and keyboard test.

#### P1.7 — Give teacher/admin mutations explicit busy, confirmation, and rollback behavior

1. **Affected:** `/classEdit`, `/tdfAssignmentEdit`, `/userAdmin`, `/turkWorkflow`, `/adminControls`, `/dataDownload`.
2. **Defect/risk:** several mutations remain enabled while pending; server verbosity and MTurk removal are fire-and-forget; course creation mutates the local array before server success; destructive or sensitive operations have inconsistent confirmation.
3. **User consequence:** duplicate requests, misleading selected values, repeated downloads, accidental user/MTurk changes, or ghost course state after failure.
4. **Cause:** no common mutation state/command boundary.
5. **Change:** route each operation through a per-command `idle/pending/success/error` state; disable only affected controls; rollback optimistic values; require inline confirmation for destructive MTurk/user/key actions; do not mutate course collections until server success.
6. **Files:** `classEdit.ts:228-395`; `tdfAssignmentEdit.ts:305-340`; `userAdmin.ts:883-935`; `turkWorkflow.ts:304-690`; `adminControls.ts:131-179`; `dataDownload.ts:83-139`.
7. **Shared pattern:** `AsyncCommandState` and inline confirmation with focus management.
8. **Desktop:** avoid disabling unrelated page regions.
9. **Mobile:** pending labels remain visible without width jumps.
10. **Accessibility:** busy state announced; destructive confirmation gets focus and restores it.
11. **Acceptance:** double activation produces one method call; failure restores prior value; navigation during pending work does not update destroyed UI.
12. **Scope:** Large across pages; small per command.
13. **Dependencies:** shared status/confirmation primitives.
14. **Regression/tests:** per-command unit tests; future delayed/rejected-method browser checks.

#### P1.8 — Make Theme Management ready, labeled, and persistence-consistent

1. **Affected:** `/theme` and theme-generation panel.
2. **Defect/risk:** subscription readiness is not rendered; an empty library and blank properties are valid initial output. Many text/color fields have adjacent text rather than associated labels. Local/global CSS is changed before save succeeds and not rolled back; external font stylesheet is injected after input.
3. **User consequence:** false empty flash, inaccessible fields, shell/nav reflow during font load, and a UI preview that can disagree with persisted server state.
4. **Cause:** subscription, editor, preview, and persistence state are conflated.
5. **Change:** gate editor/library on subscription terminal state with reserved geometry; generate stable IDs and `<label for>` for each property pair; separate draft preview from persisted theme; commit atomically or rollback on failure; load fonts with metric-compatible sizing and apply after `load`/failure state.
6. **Files:** `theme.html:1-658`; `theme.ts:304-345,347-638,823-893`; `classic.css:279-405,2465-2643`.
7. **Shared pattern:** labeled property row, theme draft store, async asset/font state.
8. **Desktop:** prevent library/editor insertion and shell-wide font jumps.
9. **Mobile:** replace permanent `.row-cols-2` with one-column labeled fields below an intentional breakpoint.
10. **Accessibility:** every input has an accessible name/help association; invalid values expose text and `aria-invalid`.
11. **Acceptance:** slow/failed subscriptions, failed saves, invalid values, and font failure are truthful and reversible; label audit passes for all fields.
12. **Scope:** Large.
13. **Dependencies:** route/page frame; can be phased by readiness, labels, then draft persistence.
14. **Regression/tests:** theme helper tests plus future browser checks in Chromium/Firefox/WebKit with font blocking and 200% zoom.

#### P1.9 — Fix reporting and enrollment async terminal states and lifecycle

1. **Affected:** `/instructorReporting`, `/classSelection`, `/classEdit`.
2. **Defect/risk:** Reporting’s initial subscription/method sequence has no catch/finally and its local readiness autorun is not retained for destruction; Class Selection uses persistent `Session.setDefault`, never resets readiness on entry, and failure leaves loading text forever; Class Edit load rejection leaves its spinner forever.
3. **User consequence:** stale options, permanent loading, late mutation of a different route’s Session state, or no recovery action.
4. **Cause:** async work starts in `onRendered` without abort/instance-alive ownership.
5. **Change:** initialize page-local state in `onCreated`; reset on every entry; store/stop readiness handles; guard completions with lifecycle token; catch every initial request and expose Retry; replace native alerts with inline status; disable Save while pending.
6. **Files:** `instructorReporting.ts:159-218`; `classSelection.ts:12-167`; `classEdit.ts:207-227`; corresponding HTML.
7. **Shared pattern:** `PageLoadState` plus lifecycle token.
8. **Desktop:** stable card/skeleton geometry.
9. **Mobile:** inline errors remain adjacent to controls.
10. **Accessibility:** errors announced; focus moves to first invalid/missing choice, not a browser alert.
11. **Acceptance:** reject/delay/navigate-away/revisit branches reach correct terminal state without stale data.
12. **Scope:** Medium.
13. **Dependencies:** P2.1 shared state recommended.
14. **Regression/tests:** lifecycle unit tests and future slow-network route-switch tests.

### P2 — medium priority

#### P2.1 — Standardize page frames and async states

1. **Affected:** all in-scope pages.
2. **Defect/risk:** loading, empty, error, warning, success, and page spacing are manually rebuilt.
3. **User consequence:** inconsistent geometry, announcements, retry behavior, and perceived quality.
4. **Cause:** CSS utilities exist, but there is no component/state contract.
5. **Change:** introduce incremental Blaze-compatible primitives: `AdminPageFrame`, `AsyncStatus`, `EmptyState`, `InlineConfirmation`, and `StableLoadingRegion`; require `loading|ready|empty|error` to be mutually exclusive.
6. **Files:** `index.html`, `classic.css:1666-2205`, all page templates.
7. **Shared pattern:** named above; no framework rewrite.
8. **Desktop:** standard max width/gutters and reserved regions.
9. **Mobile:** shared full-width action and spacing rules.
10. **Accessibility:** consistent roles/live regions/focus.
11. **Acceptance:** each inventory page maps every async request to a terminal state and uses one heading/page frame.
12. **Scope:** Medium.
13. **Dependencies:** design before broad page migration.
14. **Regression/tests:** primitive unit/markup tests and per-page state matrix.

#### P2.2 — Implement the per-table responsive specifications in section E

1. **Affected:** all tables listed in section E.
2. **Defect/risk:** global `.table-responsive table { min-width:700px }` is the default for unrelated information hierarchies; some pages use blockified tables, others only horizontal scrolling.
3. **User consequence:** excessive horizontal travel, loss of header context, squeezed actions, and inconsistent mobile use.
4. **Cause:** one global table rule substitutes for page-level column contracts.
5. **Change:** add a shared table shell with explicit column tokens and three named mobile modes: scroll, priority-column, and stacked/card; adopt the specific mode in section E.
6. **Files:** `classic.css:2644-2945`, page templates/CSS in section E.
7. **Shared pattern:** `AdminDataTable` CSS contract.
8. **Desktop:** fixed widths for IDs/status/dates/actions; flexible primary text.
9. **Mobile:** intentional mode per table.
10. **Accessibility:** retain real table semantics when scrolling; separate semantic card markup when stacking.
11. **Acceptance:** 320, 375, 768, 1024, and wide layouts meet the section E rules at 200% zoom.
12. **Scope:** Large across tables.
13. **Dependencies:** P1.6 first for interactive semantics.
14. **Regression/tests:** markup tests and future cross-browser width matrix.

#### P2.3 — Associate labels, help, errors, and groups across authoring/import forms

1. **Affected:** Manual Creator, APKG, IMSCC, Draft Workspace, AI Creator, MTurk, Reporting, User import.
2. **Defect/risk:** repeated controls often have visual labels without `for/id`; placeholder-only inputs and icon-only buttons are common; groups lack `fieldset/legend`.
3. **User consequence:** screen readers cannot identify controls reliably; placeholders disappear; validation is hard to associate.
4. **Cause:** repeated Blaze rows were built as visual grids rather than form components.
5. **Change:** generate stable IDs from row/config IDs; bind labels/help/error via `for`, `aria-describedby`, `aria-invalid`; label icon actions; use fieldsets for visibility, matching, mode, and toggle groups.
6. **Files:** `manualContentCreator.html:106-383`; `apkgWizard.html:187-244`; `imsccWizard.html:130-240`; `draftEditorWorkspace.html:90-115`; `turkWorkflow.html`; `instructorReporting.html`; `userAdmin.html:241-252`.
7. **Shared pattern:** form-row and icon-button primitives.
8. **Desktop:** no visual workflow change.
9. **Mobile:** label stays with stacked control.
10. **Accessibility:** full accessible-name/description/error coverage.
11. **Acceptance:** automated label audit reports no orphan controls; icon buttons have unique names.
12. **Scope:** Medium.
13. **Dependencies:** shared form-row design optional.
14. **Regression/tests:** static DOM tests plus future screen-reader spot checks.

#### P2.4 — Consolidate inline page CSS and reduce specificity overrides

1. **Affected:** Content Manager, AI/Manual/APKG/IMSCC, Content/TDF editors, Instructor Reporting.
2. **Defect/risk:** large `<style>` blocks, broad selectors, `!important`, and runtime-generated-editor overrides obscure ownership and load all rules with the template.
3. **User consequence:** inconsistent overrides, cross-page regressions, and browser-specific differences.
4. **Cause:** page styling accumulated inside HTML while shared tokens evolved separately.
5. **Change:** move styles to imported page CSS; scope under a page root; extract only repeated form/table/wizard rules; document JSON Editor override boundary; eliminate `!important` where source order/component classes suffice.
6. **Files:** `contentUpload.html:4-155`; `aiContentCreator.html:1-287`; `contentEdit.html:1-678`; `tdfEdit.html:1-494`; `instructorReporting.html:2-20`.
7. **Shared pattern:** page-root BEM-like scoping plus token usage.
8. **Desktop:** preserves wide layouts while making component and table ownership explicit.
9. **Mobile:** preserves current breakpoint intent while moving each narrow-width rule beside its owning component.
10. **Accessibility:** retain focus/invalid visibility during consolidation.
11. **Acceptance:** no page-level `<style>` remains except justified third-party isolation; computed behavior is covered later.
12. **Scope:** Medium.
13. **Dependencies:** after functional P1 changes.
14. **Regression/tests:** `git diff` review, lint, and future cross-browser visual checks.

#### P2.5 — Harden shell viewport, scrolling, and reduced-motion behavior

1. **Affected:** shared shell/sidebar/account menu/loading overlays.
2. **Defect/risk:** shell/sidebar use `100vh`; only one global reduced-motion block exists while account menu, sidebar, table shell, progress, and page fade define transitions/animations; nested scroll ownership varies.
3. **User consequence:** mobile browser chrome/keyboard can clip navigation; motion preferences are not consistently honored; nested scroll traps are possible.
4. **Cause:** viewport and motion rules are distributed.
5. **Change:** use dynamic viewport units under the explicit supported-browser baseline; centralize scroll ownership; extend reduced-motion to shell/menu/table/progress animations; avoid backdrop-filter as the sole loading distinction.
6. **Files:** `home.css:1-35,550-805,1010-1065`; `classic.css:2665-2708,3591-3605`; `index.html:50-60`.
7. **Shared pattern:** viewport/motion tokens.
8. **Desktop:** unchanged full-height shell.
9. **Mobile:** navigation remains reachable above browser chrome and keyboard.
10. **Accessibility:** honors reduced motion and zoom.
11. **Acceptance:** future iOS/WebKit and Android/Chromium checks in portrait/landscape and keyboard-open states.
12. **Scope:** Medium.
13. **Dependencies:** coordinate with P1.1 shell work.
14. **Regression/tests:** CSS tests where possible; future browser matrix.

#### P2.6 — Normalize heading hierarchy and page-title ownership

1. **Affected:** all app-shell pages, especially embedded AI Creator.
2. **Defect/risk:** pages render their own `h3` and hide it with CSS while the shell renders `h1`; embedded AI renders a second visible `h1`.
3. **User consequence:** duplicate or skipped heading levels for assistive technology and fragile CSS-dependent title ownership.
4. **Cause:** pre-shell page headings remain in templates.
5. **Change:** make shell `h1` the only page title; convert page-local headings to `h2/h3` according to structure; do not hide semantic duplicates with CSS; render embedded AI heading as `h2`.
6. **Files:** `index.html:68`; `home.css:808-816`; all page templates; `aiContentCreator.html:296`.
7. **Shared pattern:** page-frame title plus section-heading component.
8. **Desktop:** visual title remains in the fixed header without a duplicate content heading.
9. **Mobile:** wrapped titles remain in the shell header and do not reappear inside the page body.
10. **Accessibility:** one `h1`, ordered section hierarchy.
11. **Acceptance:** heading-outline test passes each route.
12. **Scope:** Small/Medium.
13. **Dependencies:** P1.1/P2.1.
14. **Regression/tests:** static heading tests.

#### P2.7 — Stabilize Backups loading, disclosure, and destructive focus

1. **Affected:** `/admin/backups`.
2. **Defect/risk:** prior Session data is not cleared or marked stale; first load renders “no jobs”; manifest/restore/delete blocks insert below the history without focus movement.
3. **User consequence:** false empty/stale history and hard-to-locate confirmation/content shifts.
4. **Cause:** config/jobs have no load state and disclosures are page-level Session insertions.
5. **Change:** page-local load state; skeleton matching history rows; explicit stale refresh state; render manifest in a labeled disclosure/detail region; focus confirmation input/heading on open and restore trigger focus on close.
6. **Files:** `adminBackups.ts:10-85,170-310`; `adminBackups.html:15-171`; `classic.css:1743-1830`.
7. **Shared pattern:** stable collection loader and focus-managed inline confirmation.
8. **Desktop:** keep action row layout.
9. **Mobile:** stack actions and make confirmation actions full width.
10. **Accessibility:** labeled inputs, focus transfer/restoration, alert on mismatch.
11. **Acceptance:** slow/error/revisit/no-jobs states are distinct; keyboard focus follows disclosures.
12. **Scope:** Medium.
13. **Dependencies:** P2.1 and P1.7.
14. **Regression/tests:** state/focus tests and future destructive-flow browser test.

#### P2.8 — Render Admin Tests declaratively

1. **Affected:** `/admin/tests`.
2. **Defect/risk:** output is string-built `innerHTML`; button remains enabled; running status is not a live/busy region; generated table lacks scoped headers.
3. **User consequence:** duplicate runs, weak announcements, and inconsistent table styling/state.
4. **Cause:** no template state for results.
5. **Change:** store `idle/running/result/error` in ReactiveVars; render Blaze rows; disable button while running; add `aria-busy`, live status, caption/scoped headers, and stable result region height.
6. **Files:** `testRunner.ts:1-65`; `testRunner.html:1-28`.
7. **Shared pattern:** `AsyncCommandState`, small results table.
8. **Desktop:** stable result card; table uses the available content width.
9. **Mobile:** table scrolls or stacks only when result messages exceed the viewport.
10. **Accessibility:** results announced and semantically inspectable.
11. **Acceptance:** one request per activation and valid table markup for pass/fail/error/empty checks.
12. **Scope:** Small.
13. **Dependencies:** none.
14. **Regression/tests:** component handler/state test.

#### P2.9 — Expose Profile selection state and destructive safeguards

1. **Affected:** `/profile`.
2. **Defect/risk:** avatar-type and icon selection is conveyed primarily by `.active`; key deletion is immediate; testing and saving can overlap because their disabled states are separate.
3. **User consequence:** selected state is unclear to AT, accidental key deletion, and conflicting requests.
4. **Cause:** segmented controls are styled buttons without a selection contract.
5. **Change:** use radio semantics or `aria-pressed`; group icon choices; confirm key deletion inline; use one command lock for overlapping profile/key operations.
6. **Files:** `profile.html:48-129`; `profile.ts:261-387`; `profile.css:120-235`.
7. **Shared pattern:** segmented/radio button group and inline confirmation.
8. **Desktop:** preserve the current two-column avatar layout and compact action row.
9. **Mobile:** preserve the current stacked avatar layout and full-width actions.
10. **Accessibility:** selected state, group name, and destructive focus are explicit.
11. **Acceptance:** selection and deletion work by keyboard and are announced.
12. **Scope:** Small.
13. **Dependencies:** P1.7 confirmation primitive.
14. **Regression/tests:** DOM state test.

### P3 — low priority

#### P3.1 — Normalize residual magic dimensions and labels

1. **Affected:** APKG/IMSCC step indicators, content action widths, waiting images, table header caps, editor navigation widths.
2. **Defect/risk:** values such as 220 px action columns, 300/320/400 px delays/heights, 80 px images, and 700 px table minimums are embedded by page.
3. **User consequence:** minor inconsistencies at intermediate widths and custom density/font settings.
4. **Cause:** pre-token layout values remain.
5. **Change:** promote only repeated values to semantic tokens; replace hard-coded English `Back`, `Loading...`, `Public/Private`, and generated status strings with translation keys where still present.
6. **Files:** `classic.css`, `contentUpload.ts/css`, `apkgWizard.html`, `imsccWizard.html`, `tdfEdit.html`.
7. **Shared pattern:** action-column, preview-size, and stable-delay tokens.
8. **Desktop:** smoother behavior at laptop, split-screen, and wide-monitor widths.
9. **Mobile:** fewer fixed-size collisions at very narrow widths and with long translated labels.
10. **Accessibility:** translated labels remain meaningful at text zoom.
11. **Acceptance:** no duplicated magic value remains without a documented local reason.
12. **Scope:** Small.
13. **Dependencies:** after layout work.
14. **Regression/tests:** CSS/source review and future translation expansion test.

## D. Rendering-stability code-risk report

These are source-implied sequences, not visually reproduced observations.

| Path | Refresh/navigation | Timing dependency | Source-implied visible sequence | Expected sequence | Root cause and fix | Future confirmation test |
| --- | --- | --- | --- | --- | --- | --- |
| Lazy management route | Navigation | Dynamic import | URL changes; previous panel remains until import; then content swaps | Header/title and reserved page frame switch immediately; controls swap once ready | `router.ts:298-310` changes template after import. Set pending target synchronously and disable old content | Delay first import by 1 s; assert old buttons disappear immediately and shell geometry is fixed |
| Auth hydration on direct management route | Refresh/direct URL | Meteor auth/user hydration | `customLoading` is empty and not in app-shell set, so authenticated chrome is absent; full shell later appears | Stable authenticated shell skeleton with target title from first authorized paint | `router.ts:567-621`, `index.ts:95-145`; classify pending target independently of loaded template | Delay auth publication; compare header/sidebar bounding boxes throughout |
| Lazy import failure | Both | Rejected import | Error logs; render attempts missing template; blank/incomplete content possible | Stable route error with Retry/Back | Catch-and-continue in `router.ts:303-309`; fail explicitly | Force rejected import and assert named error/focus |
| Audio Settings initialization | Both | Next animation frame | Default controls/hidden sections render; frame callback checks values and inserts groups | Skeleton/reserved form, then one declarative final render | `audioSettings.ts:213-243`; initialize reactive data before presentation | Seed enabled audio/input; measure layout shifts and first-frame checked state |
| Content quota | Both | Method response | Limited users initially see no quota banner because default is unlimited; banner inserts above page | Reserved quota status resolves to unlimited or limited without moving content | `contentUpload.ts:760,965-970`; use unresolved state and reserved region | Delay quota method and compare package-card position |
| Content summaries | Both | List and summary responses | Table shell becomes terminal after summary failure, but rows can retain `Loading...`; no error appears | Partial/error rows clearly terminate and retry | `contentUpload.ts:875-917`; render summary error and terminal row state | Reject summary method after successful IDs; assert no placeholder text remains |
| Backups initial/revisit | Both | Config/list response | Empty or previous Session history renders; current result later replaces it | Skeleton or labeled stale-refresh state, then atomic current snapshot | `adminBackups.ts:65-85`; page-local load state and reset/stale marker | Delay list on first load and revisit with changed data |
| Theme initial subscription | Both | DDP readiness | Blank active theme/false “no themes” output; library and 60+ fields later fill | Reserved library/editor skeleton, then final data | `theme.ts:304-366`; gate on subscription readiness | Delay theme publications and measure library/editor insertion |
| Theme font/property preview | User input | External stylesheet/save | Shell CSS changes immediately; font arrives later and reflows; failed save leaves local preview | Draft preview is bounded; committed theme applies after persistence/font readiness or rolls back | `theme.ts:538-638,823-893`; draft store and font load state | Block/font-delay and reject save; assert shell metrics/persisted state |
| Editor schema failure | Both | Fetch failure | Spinner persists; error object exists but is in hidden branch | Spinner replaced by named error and retry | `contentEdit.ts:499-516`, `tdfEdit.ts:328-345`; terminal readiness state | Return 404/malformed schema and assert error replaces spinner |
| TDF editor initialization | Both | `Meteor.defer`/JSON Editor ready | Loading hides when schema/subscription ready; empty editor card can appear before controls | Initialization skeleton remains until editor ready | `tdfEdit.ts:89-100,150-157`; add `editorReady` | Delay JSON editor ready callback and track card height |
| Reporting initial load | Both | Subscription plus three methods | Page renders empty selectors/table; loading text is local to module section; rejection can leave loading indefinitely | Stable whole-page/section state, then ready or error | `instructorReporting.ts:164-210`; catch/finally and page load state | Delay/reject each dependency and navigate away mid-load |
| Class Selection revisit/failure | Both | Method response and persistent Session | Prior ready/options may display immediately; failure can revert to indefinite loading with no error | Reset to skeleton on entry, then ready/error | `classSelection.ts:12-17,142-167`; page-local reset/terminal state | Visit twice with changed server result; reject second request |
| User Admin list load/page/filter | Both | Three subscriptions | Entire toolbar/table is removed for loading and inserted at readiness; height changes with each filter/page | Keep toolbar/table frame; replace rows with geometry-matched placeholders | `userAdmin.html:104-230`, `userAdmin.ts:313-332` | Delay usage publication while users/count are ready; measure table-frame stability |
| Account theme submenu | Both | `themeLibrary` publication | If opened before ready, “no themes configured” can appear, then choices insert | Loading row, then choices or true empty | `home.html:172-184`, `home.ts:955-966`; expose readiness | Open immediately with delayed publication |
| MTurk experiment list | Both | Initial method | Empty select renders with no loading; rejected method is unhandled | Stable loading/empty/error select region | `turkWorkflow.ts:304-365`; explicit lifecycle state | Delay/reject `getTurkWorkflowExperiments` |
| Global diagnostics/listeners | Repeated layout mounts | Mount count/time | Each `DefaultLayout.onRendered` starts an interval and window keypress handler without stored cleanup; repeated layout mounts could multiply work/announcements | One app-lifetime service or paired teardown | `index.ts:714-767`; store handles and clean on destroy or initialize once | Count callbacks after repeated route transitions/layout remounts |

## E. Table review

### Courses assignment tree table

- **Current:** Course, assignment, action, status, due, trials, accuracy, items, days, time, last practice; desktop table plus separate cards below 1024 px.
- **Widths/alignment:** keep course/assignment flexible; action 7–9 rem; status 6–8 rem; dates 9–11 rem; numeric metrics 4–6 rem and right-aligned. Existing `colgroup` is the correct ownership point.
- **Wrapping:** course/assignment wrap to two lines; dates/status do not; full names remain in title/detail. Do not let metric columns expand.
- **Actions/loading/empty:** one compact action; skeleton must match the exact 11-column `colgroup`; keep current section empty states.
- **Desktop overflow:** horizontal scroll only below the intrinsic minimum; consider sticky Course/Assignment headers only after verifying stacking.
- **Mobile:** retain the existing dedicated card templates, not a compressed table.
- **Semantics:** either complete the `treegrid` contract (`aria-controls`, owned child relationship, keyboard expansion model) or use a normal table with disclosure buttons; label both table and card sections so duplicate representations are never simultaneously exposed.
- **Shared component:** table shell and skeleton can be shared; the tree/card row remains course-specific.

### Content Manager package table

- **Current:** Summary and Actions, with nested metadata, selectors, status, progress, access, and media disclosures.
- **Widths/alignment:** summary flexible; actions fixed near 13.75 rem on wide screens; actions centered/top-aligned.
- **Wrapping:** title natural wrap; IDs/file references `overflow-wrap:anywhere`; badges and toggle labels do not wrap individually.
- **Actions/loading/empty:** preserve two-column placeholder; render per-row summary error; reserve progress row height only for pending uploads.
- **Desktop overflow:** no global 700 px minimum is needed for a two-column table.
- **Mobile:** create a semantic package card/description-list representation. Do not set `table/tr/td` to `display:block` while hiding the header.
- **Semantics:** add caption/label; action buttons already need unique accessible names including lesson title; expanded access/media controls need `aria-expanded/controls`.
- **Shared component:** shared table shell/status; package row is domain-specific.

### Content Manager media-file table

- **Current:** checkbox, type, filename, size, action.
- **Widths/alignment:** checkbox 44 px, type 56 px, size 5–6 rem right, action 44–48 px, filename flexible.
- **Wrapping:** filename truncate on desktop with full value available; wrap/anywhere on narrow cards.
- **Actions/loading/empty:** selected count and bulk delete remain above; placeholder rows match columns; empty state spans all columns.
- **Desktop overflow:** stay within expanded package row; no page-level horizontal scroll.
- **Mobile:** compact stacked file rows with checkbox/type adjacent and delete at end.
- **Semantics:** label select-all and each delete with filename; announce selection count.
- **Shared component:** small selectable-file table variant.

### User Administration table

- **Current:** identifier, six usage metrics plus last activity/cache updated, roles, actions (10 columns for admins).
- **Widths/alignment:** identifier 14–20 rem flexible; counts/accuracy/time 5–7 rem right; dates 9–11 rem; roles 12–15 rem; actions 7–9 rem.
- **Wrapping:** identifier may wrap/anywhere; header labels wrap; metrics/dates/role buttons do not.
- **Actions/loading/empty:** row-scoped busy state; geometry-matched 10-column loading rows; explicit zero-results state for a filter.
- **Desktop overflow:** intentional horizontal scroll below the intrinsic width; optionally sticky identifier only after browser testing.
- **Mobile:** use user cards: identifier first, compact metrics grid, roles and destructive action in a separate footer. Do not ask users to pan across 10 columns.
- **Semantics:** scoped headers, caption, sort buttons, `aria-sort`, accessible role toggle state (`aria-pressed` or checkbox semantics).
- **Shared component:** sortable table header and card/table responsive pair.

### Mechanical Turk experiment-log table

- **Current:** 12 columns including IDs, email states, correctness, pay, delivery, unit, timestamp, counts, bonus.
- **Widths/alignment:** ID/name flexible; numeric unit/count/correct 4–5 rem right; timestamp 10–12 rem; status/action columns 7–10 rem.
- **Wrapping:** IDs use anywhere; status labels/buttons do not; detailed delivery data belongs in disclosure, not the cell.
- **Actions/loading/empty:** row-specific pay/bonus busy state; skeleton only after an experiment is selected; distinguish no users from load failure.
- **Desktop overflow:** deliberate horizontal scroll with a labeled scroll region; keep identity column visible only if sticky behavior is verified in Safari/Firefox.
- **Mobile:** worker card with summary (name, questions, last action) and expandable operational details/actions.
- **Semantics:** caption names selected experiment; scoped headers; action names include worker; status not color-only.
- **Shared component:** status badges and responsive data card; table remains domain-specific.

### Instructor Reporting table

- **Current:** student, percent correct, count, total minutes, exceptions, actions, plus group rows and totals.
- **Widths/alignment:** student flexible; three numeric columns 6–8 rem right; exceptions flexible; actions 9–12 rem.
- **Wrapping:** student/exception wrap; numeric values do not.
- **Actions/loading/empty:** replace false no-data during load with skeleton; keep group headers; action buttons are row-scoped.
- **Desktop overflow:** should fit standard laptop without forced 700 px minimum after explicit widths.
- **Mobile:** student cards or priority rows showing student/accuracy/count first, with time/exception/action stacked below.
- **Semantics:** caption, `scope=col`, group label rows as `<th scope=rowgroup colspan=6>`, totals headers, real buttons/links.
- **Shared component:** reporting numeric table variant.

### Data Download table

- **Current:** link/actions, lesson name, filename.
- **Widths/alignment:** action 56–88 px; lesson flexible ~55%; filename flexible ~45%.
- **Wrapping:** lesson wraps; filename wraps/anywhere; no ellipsis unless full filename has a disclosure.
- **Actions/loading/empty:** per-download busy icon/disabled state; skeleton with three columns; truthful empty/error.
- **Desktop overflow:** no horizontal scroll should be necessary; remove inherited 700 px minimum for this table.
- **Mobile:** three-column table can become a compact row/card with actions first or last; lesson then filename.
- **Semantics:** `aria-label` on icon buttons; replace empty-href anchor with button; caption/label.
- **Shared component:** compact action table.

### Audio threshold reference table

- **Current:** static common-sound examples and threshold guidance.
- **Widths/alignment:** label flexible, numeric/reference columns constrained and right-aligned.
- **Wrapping:** descriptive text wraps.
- **Actions/loading/empty:** none; it should render with the resolved audio-input group.
- **Desktop/mobile:** small table may scroll only at very narrow widths; a definition list is preferable if there are only key/value pairs.
- **Semantics:** caption or `aria-labelledby`; scoped headers.
- **Shared component:** no full data-table primitive required.

### Manual Creator starter-content table

- **Current:** row number, conditional prompt/media, answer, up to three distractors, actions.
- **Widths/alignment:** number 3 rem; prompt/answer/distractors flexible; actions 5–6 rem.
- **Wrapping:** input controls use full cell width; media refs allow anywhere.
- **Actions/loading/empty:** icon actions named with row number; add-row stays above; validation tied to cells.
- **Desktop overflow:** horizontal scroll acceptable for multiple-choice authoring if the first column remains understandable.
- **Mobile:** stacked editable starter cards are preferable to seven-column panning.
- **Semantics:** scoped headers, caption, each input uniquely labeled by column and row, buttons labeled Duplicate/Delete row N.
- **Shared component:** editable-row card/table pair.

### IMSCC quiz-selection table

- **Current:** select, quiz title, due date, question count, supported, unsupported.
- **Widths/alignment:** select 44 px; title flexible; date 9–11 rem; counts/status 5–8 rem right/center.
- **Wrapping:** title wraps; date/counts do not; unsupported summary can wrap.
- **Actions/loading/empty:** analysis skeleton matches six columns; empty/error separate.
- **Desktop overflow:** horizontal scroll below tablet width.
- **Mobile:** selectable quiz cards showing title/date and a supported/unsupported summary.
- **Semantics:** checkbox accessible name includes quiz title; caption; scoped headers; status not color-only.
- **Shared component:** selectable table/card variant.

### Admin Tests generated results table

- **Current:** Check, Status, Message, created through `innerHTML`.
- **Widths/alignment:** check 25%, status 7–9 rem, message flexible.
- **Wrapping:** check/message wrap; status does not.
- **Actions/loading/empty:** stable results region and running skeleton/status.
- **Desktop/mobile:** three columns may stack to definition rows below ~540 px.
- **Semantics:** declarative table, caption, scoped headers, pass/fail text plus icon.
- **Shared component:** small results table.

## F. Shared component and design-system recommendations

### Immediate consolidation required to fix defects

- **Route/page presentation state:** one route target, shell mode, title, load/error state, and Retry contract. This is required for P1.1.
- **Async page state:** a small typed state (`loading`, `ready`, `empty`, `error`, optional `refreshing`) used by editor, reporting, backups, class selection, content list, theme, and MTurk.
- **Async command state:** per-operation busy/error/success with double-submit prevention and lifecycle cancellation.
- **Focus-managed inline confirmation:** current markup is visually shared but focus and restoration are not. Add trigger identity, initial focus, Escape/cancel, and terminal announcement.
- **Sortable table header:** native button, `aria-sort`, icon, and keyboard behavior.
- **Icon button:** require visible text or `aria-label`; standard 44 px touch target unless a documented dense-table exception is paired with sufficient row target size.

### Near-term standardization

- **Admin page frame:** common max width, gutters, section spacing, title ownership, and stable status slot.
- **Form row:** label/help/error IDs, required marker, invalid state, and mobile stacking.
- **Table modes:** scroll, priority, and card/stacked; never infer mobile behavior solely from `.table-responsive`.
- **Loading geometry:** page skeleton, table skeleton, and inline pending label with delayed disclosure only for transient background refreshes—not for initial unresolved content.
- **Status/empty/error:** consolidate Bootstrap `.alert`, `.admin-status`, profile alerts, and direct DOM messages into documented variants.
- **Disclosure:** shared `aria-expanded/controls` behavior for package detail, access, media, course tree, account submenus, and manifests.
- **Wizard frame:** step semantics (`ol`, current step), actions, progress, validation summary, and responsive container shared by Manual/APKG/IMSCC.

### Optional future design-system work

- Move repeated spacing, action-column, preview-size, stable-delay, and z-index values into semantic tokens after current duplication is measured.
- Add theme-token contrast validation for all state pairs, not only selected editor pairs.
- Publish a compact administration-interface pattern page once primitives are in use; do not block defect fixes on a broad redesign.

## G. Quick wins

1. Convert User Admin sort headers to buttons with `scope`/`aria-sort` and replace Reporting’s action anchors with buttons.
2. Add `aria-label` to Data Download, Manual starter-row, Assignment move/remove, and other icon-only actions.
3. Add a true loading/error branch to Admin Tests and disable Run while pending.
4. Reset Class Selection readiness on entry and replace native alerts with the existing inline status component.
5. Add explicit load state to Backups so “no jobs” appears only after a successful empty response.
6. Change embedded AI Creator’s visible `h1` to the correct section heading.
7. Localize the hard-coded TDF editor Back label and remaining `Loading...`/visibility strings.
8. Store and clean the `DefaultLayout` interval and keypress handler.
9. Add `aria-pressed` (or radio semantics) to Profile avatar selectors.
10. Render Content Manager `listError` and summary failure instead of logging only.

## H. Suggested implementation sequence

### Phase 1 — Rendering stability and application shell

Implement P1.1, the route presentation record, stable authenticated pending shell, deterministic render contract, and layout cleanup. This establishes the frame every later loader uses.

### Phase 2 — Shared loading, warning, error, and command states

Build the minimal P2.1 primitives and command state. Migrate editor readiness (P1.2), Audio Settings (P1.3), Content Manager list/quota (P1.4), and reporting/enrollment lifecycle (P1.9). These are dependencies for truthful rendering and safe mutations.

### Phase 3 — Shared controls and page layout

Implement the disclosure menu (P1.5), confirmation/command behavior (P1.7), form association work (P2.3), page-title hierarchy (P2.6), and Profile fixes (P2.9). Keep workflow and business logic unchanged.

### Phase 4 — Table corrections

Fix interactive semantics first (P1.6), then implement section E from the smallest tables outward: Admin Tests/Data Download, Reporting, User Admin, Content Manager, Manual/IMSCC, and MTurk. Reuse the Courses table/card split as a proven source-level pattern, while correcting its tree semantics.

### Phase 5 — Mobile responsiveness

Apply explicit mobile representations, dynamic viewport/scroll ownership, toolbar wrapping, and full-width confirmation/actions. Test intrinsic widths and translated labels rather than adding breakpoint-only patches.

### Phase 6 — Theme and accessibility completion

Implement Theme readiness/draft persistence/labels (P1.8), extend reduced-motion and focus-visible coverage (P2.5), and perform a route-by-route keyboard/heading/label/status audit.

### Phase 7 — Final consistency and cross-browser implementation verification

After implementation, run the required static checks and then the supported UI verification path. Cover current Chromium, Firefox, and WebKit at wide desktop, laptop, 1024/768 tablet classes, 390/375/320 mobile widths, 200% zoom, keyboard-only operation, reduced motion, slow/rejected async responses, direct refresh, back/forward, and repeated transitions. Verify no old page is actionable after navigation, no normal transient warning flashes, all async paths terminate, and page/shell geometry remains stable.

Because this document changes no runtime behavior, no application, browser, or integration verification was run for the audit itself.
