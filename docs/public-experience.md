# Public experience, deployment branding, and authentication

The application serves a branded public overview at `/` when no user is signed in. An ordinary signed-in user who opens `/` is sent to `/home`.

## Deployment Brand Profile

An administrator manages the deployment-wide identity in **Theme → Branding and Landing Page**. This Brand Profile is deliberately independent of visual themes: changing a learner's color theme never changes the institution, product identity, public copy, logo, or legal destinations.

The editor controls:

- product and organization names;
- logo, favicon, installable-app icons, and social-preview image;
- landing-page section visibility and order, account-creation visibility, hero media, and which audience demonstrations are available;
- the complete public, sign-in, footer, legal, and social-preview copy for every supported interface language;
- terms, privacy, support, and software license/source destinations.

Edits remain in an administrator-only draft until **Publish Brand Profile** succeeds. Publication is rejected unless all ten supported languages and all required identity, icon, layout, and legal fields are complete. The editor shows incomplete languages and an in-place preview. JSON import and export support repeatable branding across deployments; imported profiles remain drafts until explicitly published.

The first startup after this feature is installed creates the initial published profile from the active deployment identity and bundled public copy. Thereafter, public and authenticated identity surfaces read only the published Brand Profile. Existing visual-theme brand fields are not runtime branding controls.

The published profile drives document metadata, social previews, the web-app manifest, icons, ordinary sign-in and signup, shared headers and footers, system email subjects, downloadable archive names, help and legal links, and the public experience. `/legal` is a brand-neutral legal hub that always exposes the configured software license/source destination.

The generated 1200 × 630 social-preview image uses the published landing-page headline and eyebrow, social description, and brand logo alongside the landing page's practice and progress graphics. Colors and type come from the active application theme. A configured custom social image still takes precedence. Changes to the generated artwork use a new image-version URL so social platforms can fetch the revised image; existing platform previews may also need a fresh scrape.

## Public routes

The overview uses one audience selector for students, teachers, and researchers. Header links and accessible tabs select a single role-specific explanation, product preview, and public-demo action; the selected role is reflected by the `#students`, `#teachers`, or `#researchers` fragment.

Authentication remains a full-page route inside the same visual shell:

- `/auth/login` signs in and normally continues to `/home`.
- `/auth/signup`, password recovery, and email verification retain dedicated routes.
- A protected route may set a validated `returnTo` path. Only allowlisted same-origin application paths are accepted; authentication, logout, experiment, and public-demo paths are rejected.
- Explicit logout returns to `/`. An unexpected ordinary-account session loss returns to sign-in with the validated internal route preserved.
- Experiment-participant entry remains compact and distinct at `/experiment/:target`.

An explicit ordinary destination such as `/home` or `/auth/login` takes precedence over remembered experiment routing. Entering ordinary sign-in clears the experiment target, condition, login presentation, embedded-key mode, and remembered public-demo routing metadata. This leaves learner histories and saved progress intact. Experiment-routing cookies are shared across tabs, so this cleanup also clears remembered routing for other tabs; an explicit experiment URL can establish that context again.

Shared `/content/:tdfId` and `/instructions/:tdfId` lesson routes retain experiment continuation when the current flow is an experiment or a fresh tab remembers experiment routing. A known ordinary password or provider login instead returns to ordinary sign-in with its lesson destination preserved. Authentication remains per tab; this change does not make a new tab inherit another tab's login.

Experiment-participant lessons omit the ordinary Practice header and sidebar. The lesson fills the available viewport after instructions; questions, answer controls, and video content remain visible in this layout as well as in ordinary Practice.

Each role action on the overview starts its demonstration directly; there is no intermediate launch page. The compact disclosure identifies the authored-content language, no-sign-up contract, and 24-hour data deletion. Existing `/demo/student`, `/demo/teacher`, and `/demo/researcher` links select the corresponding overview role. The client supplies only the demo kind. The server owns the target mapping, anonymous identity, 24-hour expiry, login token, and launch path. A signed-in ordinary account is never replaced by a demo identity. Completing, leaving, or expiring a public demonstration clears the demo session and returns to `/`; ordinary experiment-participant routing is unchanged.

The overview and ordinary authentication surfaces use the same semantic application roles as the authenticated interface. A theme selected on the current device therefore remains active before sign-in, after logout, and when the overview first loads; there is no separate public palette. Only colors, typography, density, and other visual styling come from the selected theme; identity comes from the deployment Brand Profile.

Demo packages are authored in the canonical `mofacts_config` repository and must be uploaded through the normal package workflow before the corresponding route is available. No config content is published automatically by the application source change.

Public demo content is reserved for administrators. A TDF with an `experimentTarget` beginning with `public-demo-` or a `public-demo` tag requires an administrator to upload it. This check uses the acting uploader's role, independently of ownership, sharing, teacher status, or other upload permissions. Replacing an existing demo requires administrator status even if the replacement removes its demo markers. The content and stimulus editors also require administrator status to edit demo lessons, and only administrators can add demo markers through the content editor. These markers reserve content management; they do not extend the three-kind automatic-login allowlist. Editable packages live in lesson folders under `C:\dev\mofacts_config`; upload ZIPs live directly in that repository root.

## Standalone practice settings and reset

Every lesson in Practice exposes **Settings**, including video, assessment, and instruction lessons. The panel shows only applicable personal settings. **Reset test progress → Confirm reset** removes the caller's saved history and attempt state for the whole lesson family, including prequiz answers and generated adaptive sequences; the next launch starts anew. Cancel leaves progress intact. This reset cannot be undone.

Confirmation applies to the lesson family selected through that lesson's Settings button. Settings and confirmation remain attached to the selected lesson when resetting progress, sorting, or filtering changes the list. Opening another lesson's settings starts a separate confirmation.

Course Settings does not offer progress reset. The server also rejects a Practice reset when the lesson family is assigned through a current class in which the learner is enrolled. Reset does not change authored content, other learners' data, or personal lesson settings.

## Multiple-choice interaction

Each new question starts with fresh answer buttons, so the previous answer's interaction highlight does not carry into the next question, even when the answer text repeats. Submitting an answer disables the current buttons without rebuilding or resizing them while the next question is prepared. The state machine's committed answer list owns this boundary; intermediate snapshots retain the active list. Hover highlighting applies only to hover-capable, fine pointers; touchscreen taps do not apply hover styling. Keyboard navigation and visible keyboard focus remain available.

### Instructional policy execution

Authorized learners may execute both dynamic-instruction policies without an administrator role. Runtime provider, retrieval, image and own-history boundaries verify lesson access using the existing enrollment/experiment resolver and durable assignment launch context. This does not grant administrative library access or access to other users' private assets or histories. Public demo accounts and directly provisioned participants in server-marked demo lessons expire after 24 hours and share the existing 60 AI calls/hour per-account and per-IP quota; ordinary enrolled learners are not classified as demos.

Runtime failures end the loading overlay and show an inline retry message. The teacher-demo metadata repair is a separate dry-run-first operation in deploy/repair-teacher-demo-target.mongosh.js. The canonical package already has the launcher target; do not replace the installed lesson or its identity merely to repair this metadata.
