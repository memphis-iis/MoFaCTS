# Public experience and authentication

MoFaCTS serves a theme-aware public overview at `/` when no user is signed in. An ordinary signed-in user who opens `/` is sent to `/home`.

The overview uses one audience selector for students, teachers, and researchers. Header links and accessible tabs select a single role-specific explanation, product preview, and public-demo action; the selected role is reflected by the `#students`, `#teachers`, or `#researchers` fragment.

Authentication remains a full-page route inside the same visual shell:

- `/auth/login` signs in and normally continues to `/home`.
- `/auth/signup`, password recovery, and email verification retain dedicated routes.
- A protected route may set a validated `returnTo` path. Only allowlisted same-origin application paths are accepted; authentication, logout, experiment, and public-demo paths are rejected.
- Explicit logout returns to `/`. An unexpected ordinary-account session loss returns to sign-in with the validated internal route preserved.
- Experiment-participant entry remains compact and distinct at `/experiment/:target`.

Public demonstrations begin at `/demo/student`, `/demo/teacher`, and `/demo/researcher`. The client supplies only the demo kind. The server owns the target mapping, anonymous identity, 24-hour expiry, login token, and launch path. A signed-in ordinary account is never replaced by a demo identity.

The public and authentication surfaces use the semantic `public_*` theme roles. Installations should set all public page, alternate surface, card, text, muted text, border, action, action-contrast, and hero-decoration values in every theme.

Demo packages are authored in the canonical `mofacts_config` repository and must be uploaded through the normal package workflow before the corresponding route is available. No config content is published automatically by the application source change.
