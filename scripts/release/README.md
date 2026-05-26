# Release Scripts

Target home for release-owner scripts.

Do not add deploy, build, or push automation here unless the release process and `deploy/` workflow are updated together.

## Open-Core Readiness Scan

Run the static public-readiness scan before release:

```bash
node scripts/release/open-core-readiness-scan.cjs
```

The scan checks that required release/source-availability artifacts exist and are tracked, verifies required release checklist topics, checks self-hosted settings examples against the settings reference, runs the field registry/schema audit, and scans tracked text files for common committed secrets and private local paths. It is intentionally conservative; review each finding and either fix it or document why it is acceptable for the public release.
