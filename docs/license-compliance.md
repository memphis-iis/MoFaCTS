# License Compliance

MoFaCTS project-owned code is AGPL-3.0-only. The University of Memphis controls MoFaCTS project-owned code and has authorized AGPL-3.0-only release for that code.

Third-party code keeps its own license. Do not describe third-party code as relicensed to AGPL. Preserve local third-party notices, dependency package license files, and package-lock license metadata.

## Release Policy

- Keep the root `LICENSE` as the official AGPL v3 text.
- Keep `README.md`, `CITATION.cff`, `mofacts/package.json`, and the root entry in `mofacts/package-lock.json` aligned to `AGPL-3.0-only`.
- Keep [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) current for local copied or vendor files with separate licenses.
- Commit [dependency-licenses.csv](../dependency-licenses.csv) for runtime dependencies.
- Commit [dependency-licenses-all.csv](../dependency-licenses-all.csv) when dev/build audit transparency is useful for the release.
- Do not vendor `node_modules` unless necessary. If distributed, include dependency package notices and license files.
- Keep TDF media/stimulus attribution metadata separate from project licensing.

## Source Availability

Deployed MoFaCTS instances must provide source access to network users as required by AGPL section 13. The app footer includes a visible "License / Source" link. Release deployments should point that link, deployment docs, or release notes to the exact public repository tag or source archive corresponding to the deployed version.

Distributed Docker images, source tarballs, and bundled JavaScript releases should include:

- AGPL license text.
- Third-party notices.
- Build scripts and lockfiles needed to rebuild.
- Enough source mapping or release documentation for minified/bundled frontend code to be traced back to Corresponding Source.

## Audit Commands

Run from `mofacts/`:

```bash
npm run license:audit
npm run license:audit:all
```

Before release, also scan for stale license terms and third-party provenance:

```bash
rg -n -i "BUSL|Business Source|Change Date|Change License|commercial license|not an Open Source license|source-available|source available" .
rg -n -i "copyright|license|permission is hereby granted|mit license|apache license|bsd|gpl|lgpl|agpl|mozilla public license|mpl|isc license|unlicense|creative commons|cc-by|cc0" . --glob '!node_modules/**' --glob '!.meteor/**'
```

Review local copied/vendor files manually after the scan.
