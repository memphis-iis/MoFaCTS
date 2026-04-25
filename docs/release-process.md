# Release Process

This document defines the proposed release process for the first public pre-1.0 release.

## Target Release

- Tag: `v0.1.0-alpha.1`
- GitHub Release title: `MoFaCTS v0.1.0-alpha.1`
- GitHub Release status: mark as pre-release

## Preparation Branch

Use:

```bash
git switch -c release/v0.1.0-alpha.1
```

## Commit Plan

1. `docs: prepare public release documentation`
2. `chore: archive internal planning docs`
3. `chore: set alpha release metadata`

Commit boundaries can be adjusted if reviewers prefer a smaller or larger diff.

## Required Checks

From `mofacts/`:

```bash
npm run lint
npm run typecheck
npm run license:audit
```

Record any test limitations explicitly. If maintainers want release-confidence build validation, use the Docker Compose workflow under `mofacts/.deploy/`.

## Pre-Tag Checklist

- README describes MoFaCTS as a web-based adaptive learning system.
- README clearly marks the release as a pre-1.0 public release suitable for evaluation, research collaboration, and managed pilot deployments.
- `CHANGELOG.md` includes the planned release entry.
- `CITATION.cff` uses `0.1.0-alpha.1`.
- `mofacts/package.json` and `mofacts/package-lock.json` use `0.1.0-alpha.1`.
- Project code is documented as AGPL-3.0-only and third-party code keeps its own license.
- `THIRD_PARTY_NOTICES.md` covers local third-party code and the npm dependency inventory policy.
- `dependency-licenses.csv` is regenerated for runtime dependencies.
- `dependency-licenses-all.csv` is regenerated if the release includes the optional dev/build audit report.
- The deployed app exposes a visible "License / Source" link to the exact repository tag or source archive for the deployed version.
- Docker images, source archives, and bundled JavaScript artifacts include AGPL text, third-party notices, build scripts, and lockfiles needed for Corresponding Source.
- GitHub issue and PR templates are present.
- Security reporting guidance is present.
- Historical planning notes are not exposed as root public docs.
- Maintainers have reviewed the release notes.

## License Audit Commands

From `mofacts/`:

```bash
npx license-checker --production --summary
npx license-checker --production --csv --out ../dependency-licenses.csv
npx license-checker --summary
npx license-checker --csv --out ../dependency-licenses-all.csv
```

Final stale-license and provenance scans:

```bash
rg -n -i "BUSL|Business Source|Change Date|Change License|commercial license|not an Open Source license|source-available|source available" .
rg -n -i "copyright|license|permission is hereby granted|mit license|apache license|bsd|gpl|lgpl|agpl|mozilla public license|mpl|isc license|unlicense|creative commons|cc-by|cc0" . --glob '!node_modules/**' --glob '!.meteor/**'
```

## Tagging

Do not tag until maintainers approve.

After approval:

```bash
git switch main
git pull --ff-only
git tag -a v0.1.0-alpha.1 -m "MoFaCTS v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
```

## Post-Release Verification

- Confirm the GitHub Release is marked pre-release.
- Confirm README, license, citation, contributing, and security files render correctly on GitHub.
- Confirm the repository citation panel shows the expected metadata.
- Confirm the release tarball does not expose archived internal planning notes.
- Confirm issues and pull request templates render correctly.
- Confirm linked wiki pages are reachable.
