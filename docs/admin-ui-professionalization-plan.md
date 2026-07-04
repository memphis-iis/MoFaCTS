# Admin UI Professionalization Plan

This plan covers the combined low-hanging polish pass and shared admin design-system cleanup for MoFaCTS administrative pages. It is intentionally separate from the upload lifecycle refactor plan because the visual/professionalism work should improve the whole admin surface without taking on deeper upload orchestration changes first.

The end state is not merely "admin pages avoid clashing with the theme." The end state is that admin pages are fully theme-driven product surfaces: every visible admin surface, control, state, focus treatment, progress treatment, loading state, empty state, warning/error/success state, border, shadow, radius, typography choice, density choice, and transition uses the active MoFaCTS theme vocabulary or a deliberate new theme role added through the current theme architecture.

## Current Context

The admin/content setup surfaces are mostly Meteor Blaze templates with jQuery event handlers, Bootstrap classes, global theme tokens, and page-local `<style>` blocks. The main content page already has some smoothing work:

- `mofacts/client/views/experimentSetup/contentUpload.html` uses `admin-page`, `admin-card`, `table-display-shell`, initial-paint placeholders, loading overlays, and pending upload rows.
- `mofacts/client/views/experimentSetup/contentUpload.ts` tracks `listDisplayReady`, `overlayVisible`, `initialPaintDone`, `pendingUploads`, and row-level detail subscriptions.
- `mofacts/public/styles/classic.css` already defines shared admin spacing, button styles, table-shell loading behavior, density tokens, typography tokens, and semantic theme CSS variables.

The trial/practice runtime is in better architectural shape than the admin pages. The Svelte card runtime already has explicit launch readiness, browser-paint coordination, active/incoming trial slots, and transition controllers. Admin polish should therefore focus first on Blaze-era page behavior, visual consistency, and stable loading states.

## Goals

- Make admin pages feel stable, modern, and professionally maintained.
- Reduce visible layout shifts during loading, upload, detail hydration, and row expansion.
- Replace disruptive browser-native `alert()` and `confirm()` patterns where they affect routine workflows.
- Establish shared admin UI patterns that are fully theme-driven and reusable across pages.
- Keep changes incremental and compatible with current Blaze templates.
- Avoid a full admin rewrite unless later evidence shows the targeted approach is insufficient.

## Non-Goals

- Do not port every admin page to Svelte.
- Do not redesign server methods or package upload processing in this plan.
- Do not introduce new npm, Meteor, Docker, or system dependencies.
- Do not hard-code a new visual brand, palette, control style, progress style, shadow, focus ring, or one-off "modern" look.
- Do not bypass or weaken existing role checks, ownership checks, or content permission behavior.

## Theme Invariants

Theme compatibility is a hard requirement. Admin modernization must make the admin UI a first-class consumer of the full MoFaCTS theme rather than a lightly styled Bootstrap surface.

- Treat current code as the source of truth. Before implementation, re-check `mofacts/server/lib/themeRegistry.ts`, `mofacts/client/views/theme.ts`, `mofacts/common/themePropertyNormalization.ts`, `mofacts/common/themeRoleSchema.ts`, `mofacts/client/lib/themeGenerator.ts`, `mofacts/client/views/themeGenerationWizard.ts`, and bundled JSON in `mofacts/public/themes/`.
- Treat older theme planning notes as obsolete if they conflict with current code. Do not route implementation through old planning documents.
- Use existing semantic CSS custom properties from `mofacts/public/styles/classic.css` and the active theme property set in code.
- Current active themes are stored through `DynamicSettings` keys such as `customTheme` and `themeLibrary`; do not assume a different theme store without verifying code.
- Current runtime CSS variable emission in `theme.ts` converts theme property names by replacing underscores with hyphens, for example `app_background_color` becomes `--app-background-color`.
- Current property normalization is explicit and narrow: length, transition, and density-scale fields are normalized by `themePropertyNormalization.ts`. Do not assume all theme values are normalized, parsed, or contrast-checked at runtime.
- Follow the current code vocabulary: stored theme JSON uses property names such as `app_background_color`, `app_text_color`, `learning_card_surface_color`, `practice_menu_accuracy_bar_fill_color`, and `brand_logo_url`.
- Prefer semantic roles such as `--app-background-color`, `--app-text-color`, `--learning-card-surface-color`, `--app-subtle-surface-color`, `--app-muted-surface-color`, `--border-color`, `--app-accent-color`, `--app-info-color`, `--app-success-color`, `--app-warning-color`, `--feedback-error-color`, `--app-loading-overlay-color`, and transition/density tokens.
- Respect `--app-density-scale`, `--app-font-size-base`, `--app-button-height`, `--app-border-radius-sm`, `--app-border-radius-lg`, and `--app-transition-*`.
- Admin pages should use theme roles for all visible state categories: page backgrounds, cards, panels, tables, headers, body text, muted text, links, buttons, icon buttons, forms, selects, toggles, focus rings, hover states, disabled states, loading overlays, skeletons, progress bars, badges, destructive states, success states, warning states, error states, borders, shadows, radii, density, and motion.
- Do not introduce fixed white, black, gray, green, blue, red, or shadow values unless they are already part of a theme token or are a temporary diagnostic style.
- Do not keep Bootstrap defaults merely because they look acceptable in the default theme. Bootstrap classes may remain as structural helpers, but their visible colors, spacing, radii, focus states, and transitions must be overridden or validated against active theme roles.
- Test at least all bundled themes in `mofacts/public/themes/` before considering visual polish complete.
- If an existing token is missing for a recurring admin concept, add a named semantic theme role deliberately through the current theme architecture rather than using a component-local color shortcut.
- Any new theme role must be added coherently to the code path that owns theme defaults, editing, generation, and runtime emission. Do not add a CSS-only variable that custom themes cannot control.

## Plan

### Phase 1: Inventory and Visual Risk Audit

1. Inventory the admin-facing pages that use `admin-page`, `admin-card`, page-local styles, tables, upload/status flows, or browser-native alerts.
2. Group pages by pattern:
   - content manager and import wizards,
   - content/TDF editors,
   - user/admin controls,
   - reporting/download pages,
   - theme/admin utility pages.
3. Record the major visible-state problems per page:
   - loading flashes,
   - row height changes,
   - table column jumps,
   - slide animations that move too much content,
   - blocking browser alerts,
   - inconsistent button/icon sizing,
   - inconsistent empty/error/success states.
4. Identify any public docs or wiki pages that describe affected user-facing workflows.

Deliverable: a short checklist of admin surfaces and visible-risk categories.

### Phase 2: Shared Admin UI Contract

Create or refine shared CSS patterns in `mofacts/public/styles/classic.css` rather than scattering more page-local styling. The shared contract should make admin UI theme consumption explicit enough that future admin pages naturally use the active full theme.

Shared patterns should include:

- admin page header and subheader treatment,
- admin section spacing,
- admin card body/header spacing,
- compact admin table shell,
- skeleton/placeholder rows,
- inline loading state,
- inline success/warning/error state,
- empty state,
- stable icon button sizing,
- row action button groups,
- upload/progress state visuals,
- inline confirmation panel pattern.

Rules:

- Keep the selectors broad enough to reuse but not so broad that learner/trial UI changes unexpectedly.
- Prefer additive classes such as `admin-status`, `admin-inline-confirmation`, `admin-progress-row`, or `admin-skeleton-row`.
- Avoid styling all Bootstrap `.alert`, `.card`, `.table`, or `.btn` globally beyond existing conventions unless the effect is already desired app-wide.
- Use existing theme variables for all color, spacing, radius, typography, and transition decisions.
- Where Bootstrap classes remain in markup, audit computed visible styles and add admin-scoped theme overrides when Bootstrap defaults leak through.
- Define admin patterns in terms of theme roles, not individual pages. For example, an upload progress bar, backup status row, and report generation status should share the same themed progress/status treatment unless there is a domain reason to differ.

Deliverable: a shared admin CSS vocabulary that page templates can adopt incrementally.

### Phase 3: Content Manager Polish Pass

Focus first on `contentUpload` because it is the highest-trust surface: users are uploading files and watching the app respond.

Target improvements:

- Make pending upload rows reserve stable vertical space for status, progress, and result text.
- Make the pending-to-real-row replacement visually calm. The pending row should remain until the real lesson row is hydrated enough to avoid an abrupt "Loading..." replacement.
- Use skeleton rows that approximate the final table shape instead of a generic blank table overlay.
- Prevent upload badge text and progress notes from changing row height more than necessary.
- Replace routine upload success/error alerts with inline status messages.
- Replace destructive or overwrite confirmations with inline confirmation panels where feasible.
- Avoid `slideDown`/`slideUp` for large wizard panels unless space is reserved or the transition is visually controlled.
- Keep media manager progress and package upload progress visually consistent even if their underlying logic remains separate for now.

This phase may still call existing upload functions. The deeper unification of upload orchestration belongs in `docs/admin-upload-lifecycle-plan.md`.

Deliverable: content manager feels stable during list load, package upload, media upload, wizard open/close, and row detail expansion.

### Phase 4: Apply Shared Patterns Across Admin Pages

Move through admin pages in small batches:

1. Admin controls and backups.
2. User admin and reporting/download pages.
3. Content/TDF editors.
4. Import wizard shells.
5. Theme editor only where changes are compatible with existing theme editing workflows.

For each page:

- replace local one-off status treatments with shared admin status classes,
- normalize action buttons and icon buttons,
- replace routine `alert()` success/failure messages with inline status,
- use stable loading/empty/error blocks,
- check responsive layout at desktop and mobile widths,
- preserve the page's existing behavior.

Deliverable: admin pages read as one coherent product surface while retaining the active theme.

### Phase 5: Browser Smoke and Theme QA

For UI changes, use the native hotfix dev app and MoFaCTS Playwright sidecar as required by `AGENTS.md`.

Smoke-test routes should include at minimum:

- `/contentUpload`,
- `/adminControls`,
- `/admin/backups` if enabled in local settings,
- `/userAdmin`,
- `/dataDownload` or active reporting route,
- `/theme`,
- one content editor route when local data allows.

For each route, capture:

- browser-visible result,
- console errors,
- network errors,
- whether loading/status transitions appear stable,
- whether the current theme is respected.

Theme checks:

- every bundled theme in `mofacts/public/themes/`,
- one custom/current theme if configured locally,
- generated theme output if the local theme generation workflow is available.

Theme QA should explicitly verify:

- admin surfaces do not retain fixed Bootstrap colors,
- text contrast remains usable for normal, muted, link, warning, error, and success text,
- focus rings are visible,
- disabled states are recognizable,
- progress/loading states are legible,
- destructive actions remain visually distinct,
- density changes keep controls aligned and readable.

Verification commands for code changes:

```bash
cd mofacts
npm run typecheck
npm run lint
```

No TypeScript/lint verification is required for documentation-only planning changes, but it is required once implementation touches TS, JS, Svelte, or lintable app files.

## Risks

- Global CSS changes can accidentally affect learner/trial UI. Scope admin patterns carefully.
- Hard-coded modern colors would break theme guarantees and make custom themes look unprofessional.
- Replacing `confirm()` too aggressively can alter safety behavior around destructive actions. Inline confirmations must still block the operation clearly.
- Polishing around the current upload lifecycle may expose deeper state duplication. If that becomes the limiting issue, switch to the upload lifecycle plan rather than layering more CSS over it.

## Recommended First Implementation Slice

1. Add shared admin status, skeleton row, progress row, and inline confirmation styles using theme tokens.
2. Apply them only to `contentUpload`.
3. Replace routine upload success/error alerts in the content manager with inline messages.
4. Stabilize pending upload row dimensions and pending-to-real-row replacement.
5. Smoke-test `/contentUpload` under at least two themes.
