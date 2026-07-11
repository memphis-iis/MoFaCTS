# Airline Network Loading Reliability Audit Prompt

Use this prompt before implementing the CDN/startup reliability plan, and again after implementation as a review checklist.

## Prompt

You are auditing MoFaCTS production startup reliability against `docs/deployment/airline-network-loading-reliability-plan.md` and the root `AGENTS.md` rules.

Do not edit files unless explicitly asked. First inspect the relevant code and report findings with file/line references.

Audit scope:

- Global startup assets in `mofacts/client/index.html`.
- Route-specific CDN loads in `mofacts/client/`.
- JSONEditor usage in TDF/content/draft editor paths.
- Bootstrap and Font Awesome usage, especially modal behavior.
- Plyr and sql.js loading paths.
- Theme startup readiness in `mofacts/client/lib/themeRuntime.ts`.
- Sign-in/home visibility gates in login/home code.
- Any changed docs or wiki implications.

Preflight completeness check:

1. Confirm every external first-load asset in `mofacts/client/index.html` is inventoried in the plan.
2. Confirm every external route-specific asset load outside `index.html` is inventoried, including dynamic script or WASM loading.
3. Confirm each asset has a planned treatment: remove, same-origin vendor, existing package path, or explicit approval-needed dependency.
4. Confirm the plan does not add npm, Meteor, Docker, or system dependencies without explicit approval.
5. Confirm vendored-asset requirements are explicit: version, source URL, license, and update notes.
6. Confirm the plan does not introduce silent fallbacks or hidden compatibility paths.
7. Confirm temporary startup behavior is visible to users when theme/DDP readiness is delayed.
8. Confirm modal cleanup accounts for all Bootstrap modal surfaces and removes `$(...).modal(...)` reliance.
9. Confirm verification includes `npm run typecheck`, `npm run lint`, hotfix dev app UI smoke testing, sidecar console/network reporting, and route-specific blocked-domain tests.
10. Confirm the plan includes checking whether `C:\dev\MoFaCTS.wiki` needs an update.

Implementation review:

1. List all remaining external network requests from public startup routes (`/`, `/auth/login`, authenticated `/home`) and classify each as intentional or a bug.
2. Verify public startup routes do not require `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `use.fontawesome.com`, or `sql.js.org`.
3. Verify JSONEditor is not requested on sign-in, home, course/practice menu, instructions, or card routes.
4. Verify JSONEditor still loads on editor routes and reports a clear inline error if unavailable.
5. Verify Select2 and global `League Spartan` are removed unless new usage was found and documented.
6. Verify Font Awesome 4 icons still render where used, including editor JSONEditor icons.
7. Verify the duplicate Font Awesome v5 script in `multiTdfSelect` is removed or replaced with the approved same-origin Font Awesome path.
8. Verify Bootstrap CSS/JS are loaded from same-origin assets and that modal/collapse behavior still works.
9. Verify no app code still calls `$(...).modal(...)`.
10. Verify modal close behavior leaves no stale `.modal-backdrop`, `body.modal-open`, `overflow`, or `padding-right` state.
11. Verify Plyr CSS is no longer part of global startup and video sessions still render correctly.
12. Verify sql.js and its WASM load without external CDN access in APKG/content-upload workflows.
13. Verify theme startup uses cached or temporary default styling visibly when DDP is delayed, then applies the server theme once ready.
14. Verify external `app_font_stylesheet_url` values cannot block public first paint.
15. Verify user-visible realtime startup diagnostics appear when `Meteor.status().connected` remains false during boot and clear when connected.
16. Verify vendored assets include provenance/license/update notes and live under an intentional public path.
17. Verify no generated local artifacts, screenshots, one-off dumps, or unrelated files are included.

Required report format:

- Findings first, ordered by severity.
- Include file/line references for every issue.
- For each issue, state whether it violates `AGENTS.md`, the reliability plan, or both.
- Then list verification performed and results.
- If verification could not run, state why and name the next supported check.
- End with a concise readiness verdict: `Ready`, `Ready with follow-ups`, or `Not ready`.

