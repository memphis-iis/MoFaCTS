# Release Scripts

Target home for release-owner scripts.

Do not add deploy, build, or push automation here unless the release process and `deploy/` workflow are updated together.

## Open-Core Readiness Scan

Run the static public-readiness scan before release:

```bash
node scripts/release/open-core-readiness-scan.cjs
```

The scan checks for required release/source-availability artifacts, common committed secrets, and private local paths. It is intentionally conservative; review each finding and either fix it or document why it is acceptable for the public release.
