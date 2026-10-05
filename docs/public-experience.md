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

Each role action on the overview starts its demonstration directly; there is no intermediate launch page. The compact disclosure identifies the authored-content language, no-sign-up contract, and 24-hour data deletion. Existing `/demo/student`, `/demo/teacher`, and `/demo/researcher` links select the corresponding overview role. The client supplies only the demo kind. The server owns the target mapping, anonymous identity, 24-hour expiry, login token, and launch path. A signed-in ordinary account is never replaced by a demo identity. Completing, leaving, or expiring a public demonstration clears the demo session and returns to `/`; ordinary experiment-participant routing is unchanged.

The overview and ordinary authentication surfaces use the same semantic application roles as the authenticated interface. A theme selected on the current device therefore remains active before sign-in, after logout, and when the overview first loads; there is no separate public palette. Only colors, typography, density, and other visual styling come from the selected theme; identity comes from the deployment Brand Profile.

Demo packages are authored in the canonical `mofacts_config` repository and must be uploaded through the normal package workflow before the corresponding route is available. No config content is published automatically by the application source change.

## Standalone practice settings and reset

Every lesson in Practice exposes **Settings**, including video, assessment, and instruction lessons. The panel shows only applicable personal settings. **Reset test progress → Confirm reset** removes the caller's saved history and attempt state for the whole lesson family, including prequiz answers and generated adaptive sequences; the next launch starts anew. Cancel leaves progress intact. This reset cannot be undone.

Confirmation applies to the lesson family selected through that lesson's Settings button. Settings and confirmation remain attached to the selected lesson when resetting progress, sorting, or filtering changes the list. Opening another lesson's settings starts a separate confirmation.

Course Settings does not offer progress reset. The server also rejects a Practice reset when the lesson family is assigned through a current class in which the learner is enrolled. Reset does not change authored content, other learners' data, or personal lesson settings.
