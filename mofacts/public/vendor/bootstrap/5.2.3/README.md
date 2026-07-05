# Bootstrap 5.2.3

Vendored so MoFaCTS public startup routes do not depend on jsDelivr.

- Package: `bootstrap`
- Version: `5.2.3`
- Vendored files:
  - `css/bootstrap.min.css`
  - `js/bootstrap.bundle.min.js`
- Source URLs:
  - `https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css`
  - `https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js`
- License: MIT
- Update process: replace these files from the same pinned npm package version or an explicitly approved newer version, then run typecheck/lint and smoke-test startup routes and Bootstrap modal/collapse behavior.
- Reason: Bootstrap is required for global layout, controls, alerts, and modal behavior on first load.
