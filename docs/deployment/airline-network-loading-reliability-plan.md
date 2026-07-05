# Airline Network Loading Reliability Plan

## Purpose

This is a pre-implementation planning document. It does not claim that any remediation has been completed.

The immediate goal is to decide whether the remediation plan is complete enough to implement safely. Implementation verification belongs after code changes are made and must not be treated as part of the plan-readiness review.

Production was reported not loading on restrictive in-flight internet while other sites worked. The main suspected risks are:

- Public startup depends on third-party CDN assets in `mofacts/client/index.html`.
- The sign-in and home UI can remain hidden while Meteor/DDP-backed theme or auth readiness is delayed.
- Some route-specific workflows dynamically load CDN scripts or WASM.

The reliability target is: public startup routes should render a visible same-origin app shell, and users should see a clear non-modal status when realtime startup data is delayed.

## Implementation Decisions

- Do not add new npm, Meteor, Docker, or system dependencies for this remediation.
- Vendor pinned browser assets when no approved package path already exists.
- Do not introduce CDN fallback paths. If a same-origin asset fails, show a clear inline or user-visible error on the affected route.
- Remove external first-load hints as well as external asset tags. This includes `dns-prefetch`, `preconnect`, stylesheet, script, and WASM requests for CDN/font domains.
- Keep public startup routes renderable from same-origin assets.
- Keep route-specific internet features, such as help links, YouTube embeds, Wikipedia/Commons enrichment, Google Cloud sample audio, and user-authored remote media, outside this startup remediation unless they block public first paint.
- Allow theme-provided remote `app_font_stylesheet_url` values only as non-blocking post-shell styling. A delayed or failed remote theme font must not block public first paint, `themeReady`, sign-in visibility, or home visibility.

## Review Modes

### Plan-Readiness Review

Use this before implementation. The reviewer should inspect the plan and relevant code only enough to confirm the plan is complete, coherent, and compatible with `AGENTS.md`.

Do not report implementation acceptance failures during this review unless the plan falsely claims the work is already done.

Expected output:

- Missing plan coverage.
- Ambiguous or risky implementation guidance.
- Any plan step that conflicts with `AGENTS.md`.
- Any dependency, docs, TDF/config, or wiki implication that is not accounted for.
- A readiness verdict: `Ready`, `Ready with plan follow-ups`, or `Not ready`.

### Post-Implementation Verification

Use this only after code changes exist. This review checks whether the implemented behavior satisfies the acceptance criteria.

Expected output:

- Remaining external requests from tested routes.
- Route-specific runtime results.
- Console and network errors from sidecar smoke testing.
- Typecheck/lint results.
- Docs/wiki update result.

## Current Known Assets To Address

### Global First-Load Assets In `mofacts/client/index.html`

The plan must account for every external asset currently loaded by the global shell:

| Asset | Current source | Current role | Planned treatment |
| --- | --- | --- | --- |
| Bootstrap CSS | `https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css` | Global layout, forms, buttons, alerts, modals, utilities. | Same-origin vendor asset, exact version first. |
| Select2 CSS | `https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.0/css/select2.min.css` | No known app usage beyond global link. | Remove unless usage is found and documented. |
| Font Awesome 4 CSS | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css` | Existing `fa fa-*` icons and JSONEditor `fontawesome4` iconlib. | Same-origin vendor asset with fonts, exact version first. |
| External startup hints | `dns-prefetch` / `preconnect` for `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com` | Hint third-party startup domains before the app shell paints. | Remove from global first load. |
| Google Font preconnect/link | `fonts.googleapis.com`, `fonts.gstatic.com`, `League Spartan` | No known required startup usage. | Remove from global first load unless usage is found and documented. Theme-provided font URLs may load later only as non-blocking styling. |
| Plyr CSS | `https://cdnjs.cloudflare.com/ajax/libs/plyr/3.7.8/plyr.min.css` | Video-session styling only. | Move out of global startup; load from package or same-origin route asset. |
| JSONEditor CSS/JS | `https://cdn.jsdelivr.net/npm/@json-editor/json-editor@2.15.2/...` | TDF/content/draft editor routes only. The JS is blocking in the document head. | Remove from global startup; lazy-load pinned same-origin vendored assets. |
| Bootstrap JS bundle | `https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js` | Modal/collapse behavior. | Same-origin vendor asset, exact version first. |
| Commented eruda script | `https://cdn.jsdelivr.net/npm/eruda` | Commented mobile debug aid. | Leave commented or remove in cleanup; it must not become an active startup dependency. |

### Route-Specific External Loads

The plan must also account for external route-specific script or WASM loading:

| Surface | Current external path | Planned treatment |
| --- | --- | --- |
| APKG processor | `https://sql.js.org/dist/${file}` in `mofacts/client/lib/apkgProcessor.ts` | Use the existing installed `sql.js` package version and a same-origin copy of its matching WASM file. |
| Content upload APKG path | `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm` and `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` in `mofacts/client/views/experimentSetup/contentUpload.ts` | Remove the CDN script loader and use the same shared installed-package initializer as the APKG processor. |
| Multi-TDF select | `https://use.fontawesome.com/releases/v5.0.9/js/all.js` in `mofacts/client/views/experiment/multiTdfSelect.html` | Remove or replace with the same-origin Font Awesome 4 path already planned for the app. |

Other intentional external URLs, such as help links, Wikipedia/Commons enrichment calls, Google Cloud sample audio, YouTube embeds, or user-authored content URLs, are outside this startup asset remediation unless they block first paint on public startup routes.

## Implementation Plan

### Phase 1: Remove JSONEditor From Global Startup

- Remove JSONEditor CSS and JS from `mofacts/client/index.html`.
- Remove the global `window.module` / `window.exports` shim from `mofacts/client/index.html` unless implementation proves another active same-origin startup asset still requires it.
- Vendor the currently used JSONEditor browser assets as same-origin files:
  - Package/version: `@json-editor/json-editor@2.15.2`.
  - Target location: `mofacts/public/vendor/json-editor/2.15.2/`.
  - Required files: the minified JS and CSS currently loaded from jsDelivr.
  - No npm dependency will be added for JSONEditor in this remediation.
  - No CDN fallback is allowed.
- Add an editor-only loader, for example `ensureJsonEditor()`, used by:
  - `mofacts/client/views/experimentSetup/tdfEdit.ts`
  - `mofacts/client/views/experimentSetup/contentEdit.ts`
  - `mofacts/client/views/experimentSetup/contentDraftEditor.ts`
  - `mofacts/client/views/experimentSetup/tdfDraftEditor.ts`
- `ensureJsonEditor()` must load the same-origin CSS/JS once, resolve only after `window.JSONEditor` is available, and reject clearly if the asset fails to load.
- Editor routes must show a clear inline error if JSONEditor cannot load.
- Include vendor provenance notes with exact version, original source URLs, license, update process, and reason for vendoring.

Acceptance criteria after implementation:

- `/`, `/auth/login`, `/home`, course/practice menus, instructions, and card routes do not request JSONEditor.
- Editor routes still initialize JSONEditor.
- Blocking `cdn.jsdelivr.net` cannot block the public app shell.

### Phase 2: Remove Unused Global External Assets And Startup Hints

- Remove Select2 from global startup unless active usage is found.
- Remove global `League Spartan` and related Google Font preconnect/prefetch unless active usage is found.
- Remove all CDN/font startup hints from `mofacts/client/index.html`, including `dns-prefetch` and `preconnect` tags for `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, and `fonts.gstatic.com`.
- Remove the duplicate Font Awesome v5 script from `multiTdfSelect`.

Acceptance criteria after implementation:

- Public startup routes do not request Select2, Google Fonts, `use.fontawesome.com`, or external startup hint domains.
- `multiTdfSelect` still renders expected icons using the same-origin Font Awesome 4 path, or no longer depends on those icons.

### Phase 3: Self-Host Required Global Assets

- Vendor Bootstrap `5.2.3` under `mofacts/public/vendor/bootstrap/5.2.3/`.
- Vendor Font Awesome `4.7.0` under `mofacts/public/vendor/font-awesome/4.7.0/`.
- Replace global Bootstrap CSS/JS CDN references with same-origin assets.
- Replace global Font Awesome 4 CDN references with same-origin CSS and font files.
- Font Awesome vendoring must include font files and preserve CSS font URL relationships.
- Keep the current Bootstrap 5.2.3 and Font Awesome 4.7.0 versions unless an explicit version-change task is approved.
- Do not add npm dependencies for Bootstrap or Font Awesome in this remediation.

Vendored assets must include:

- Exact version.
- Source URL.
- License.
- Update notes.
- Reason the asset is vendored.

Acceptance criteria after implementation:

- Public first-load routes have no required third-party CSS or JS network requests.
- Bootstrap modal/collapse behavior still works.
- Font Awesome 4 icons still render where used, including JSONEditor icon buttons.

### Phase 4: Normalize Bootstrap Modal Usage

- Replace app calls to `$(...).modal(...)` with Bootstrap 5 `bootstrap.Modal` APIs.
- Cover these modal surfaces:
  - `#errorReportingModal`
  - `#helpModal`
  - `#generateIncorrectModal`
  - `#turkModal`
  - `#profileWorkModal`
  - `#detailsModal`
- Remove jQuery modal assumptions before relying on same-origin Bootstrap 5 assets.
- Keep explicit backdrop/body cleanup only if a tested workflow still requires it.

Acceptance criteria after implementation:

- No app code calls `$(...).modal(...)`.
- Modal close behavior leaves no stale `.modal-backdrop`, `body.modal-open`, `overflow`, or `padding-right` state.

### Phase 5: Move Route-Specific Assets Off CDN Paths

- Move Plyr CSS out of global `index.html`.
- Load Plyr CSS through video-session code from the existing `plyr` package path or a same-origin vendored/package-backed asset.
- Replace both sql.js CDN/WASM loading paths with one shared client sql.js initializer.
- Use the existing installed `sql.js` npm package version; do not retain the older CDN-pinned `1.8.0` path.
- Serve/load the matching `sql-wasm.wasm` file from a same-origin location, for example a pinned `mofacts/public/vendor/sql.js/<installed-version>/` path populated from the installed package.
- Keep the sql.js JavaScript initializer and WASM file from the same package version so the APKG reader does not mix incompatible engine assets.
- Update both:
  - `mofacts/client/lib/apkgProcessor.ts`
  - `mofacts/client/views/experimentSetup/contentUpload.ts`
- Keep APKG/content-upload processing client-side.
- Do not add a CDN fallback.

Acceptance criteria after implementation:

- Non-video public routes do not request Plyr CSS.
- Video sessions still render expected controls and styling.
- APKG/content-upload workflows initialize sql.js without `sql.js.org` or `cdnjs.cloudflare.com`.

### Phase 6: Make Theme, Auth, Role, And Realtime Startup Delays Visible

- Keep cached theme startup behavior.
- If no cached theme exists and the theme subscription is delayed, apply temporary startup styling and make that state visible.
- The server theme must still replace temporary startup styling when ready.
- Do not introduce silent compatibility paths.
- Keep `app_font_stylesheet_url` supported, but load it only after the same-origin app shell can paint.
- Do not let a delayed or failed `app_font_stylesheet_url` block public first paint, `themeReady`, sign-in visibility, or home visibility.
- Add a non-modal startup diagnostic when `Meteor.status().connected` remains false during boot.
- Include auth and role readiness in the diagnostic scope, because `/home` currently waits on theme readiness, auth readiness, role hydration, and role sync.
- Clear diagnostics automatically when the relevant startup condition is resolved.

Acceptance criteria after implementation:

- Sign-in can become visible while theme/DDP data is still pending.
- Home does not look blank when realtime, auth, role, or theme startup readiness is delayed.
- Users can distinguish “page loaded, startup data pending” from a full page-load failure.

## Plan-Readiness Checklist

Before implementation, confirm:

- Every external first-load asset in `mofacts/client/index.html` is inventoried above.
- Every route-specific external script or WASM load in `mofacts/client/` is inventoried above.
- Each asset has a planned treatment: remove, same-origin vendor, existing package path, or explicit approval-needed dependency.
- The plan does not add npm, Meteor, Docker, or system dependencies without explicit approval.
- Vendored-asset requirements are explicit: version, source URL, license, update notes, and reason.
- The plan does not introduce silent fallbacks or hidden compatibility paths.
- Temporary startup behavior is visible to users when theme, DDP, auth, or role readiness is delayed.
- Bootstrap modal cleanup accounts for all modal surfaces and removes `$(...).modal(...)` reliance.
- Verification includes typecheck, lint, hotfix dev UI smoke testing, sidecar console/network reporting, and blocked-domain checks.
- Blocked-domain checks include external startup hints as well as CSS, JS, and WASM requests.
- The plan includes checking whether `C:\dev\MoFaCTS.wiki` needs an update.

## Post-Implementation Verification Checklist

Run this only after code changes are made.

Required local checks:

```bash
cd mofacts
npm run typecheck
npm run lint
```

Required UI checks:

- Start the native hotfix dev app from `deploy/`.
- Use the MoFaCTS Playwright sidecar against `http://host.docker.internal:3200`.
- Report route tested, browser-visible result, console errors, and network errors.
- If a required smoke-test route cannot be reached locally, report the exact missing prerequisite: account, role, fixture, TDF, course, video session, editor document, or APKG sample.
- Test at least:
  - `/`
  - `/auth/login`
  - authenticated `/home`
  - course/practice menu
  - instructions/card route
  - an editor route requiring JSONEditor
  - a video-session route
  - APKG/content-upload workflow

Blocked-domain checks:

- `cdn.jsdelivr.net`
- `cdnjs.cloudflare.com`
- `fonts.googleapis.com`
- `fonts.gstatic.com`
- `use.fontawesome.com`
- `sql.js.org`

Blocked-domain checks must include startup hint tags as well as script, stylesheet, and WASM requests.

Expected post-implementation result:

- Public startup routes still render from same-origin assets.
- Public startup routes do not request JSONEditor, Select2, Google Fonts, Plyr CSS, sql.js, CDN Bootstrap, or CDN Font Awesome assets.
- JSONEditor loads only on editor routes.
- sql.js works in APKG/content-upload workflows without CDN access.
- Plyr styling appears on video sessions without global startup CSS.
- Startup diagnostics appear when realtime, auth, role, or theme startup readiness is delayed and clear after the relevant condition resolves.

## Documentation And Wiki

Because this work changes production/user-facing startup behavior, check whether `C:\dev\MoFaCTS.wiki` needs an update.

Update public docs only if setup, local run, deployment, contributor expectations, schema behavior, or user-visible workflow expectations change. If no docs/wiki update is needed, record why in the final implementation report.
