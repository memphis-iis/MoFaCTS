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
```

Record any test limitations explicitly. If maintainers want release-confidence build validation, use the Docker Compose workflow under `mofacts/.deploy/`.

## Pre-Tag Checklist

- README describes MoFaCTS as a web-based adaptive learning system.
- README clearly marks the release as a pre-1.0 public release suitable for evaluation, research collaboration, and managed pilot deployments.
- `CHANGELOG.md` includes the planned release entry.
- `CITATION.cff` uses `0.1.0-alpha.1`.
- `mofacts/package.json` and `mofacts/package-lock.json` use `0.1.0-alpha.1`.
- GitHub issue and PR templates are present.
- Security reporting guidance is present.
- Historical planning notes are not exposed as root public docs.
- Maintainers have reviewed the release notes.

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
