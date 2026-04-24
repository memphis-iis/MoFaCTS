# Support Policy

MoFaCTS is actively used and stable enough for evaluation, research collaboration, and managed pilot deployments. Support is currently focused on the latest development line and the current pre-1.0 release train.

## Runtime Baseline

- Node.js: `22.x`
- npm: `10.x`
- Meteor: `3.4`

These versions are the contributor and CI baseline.

## Quality Gates

For routine pull requests:

```bash
cd mofacts
npm run lint
npm run typecheck
```

For release preparation, record:

- lint result,
- full TypeScript result,
- relevant test result or explicit test limitation,
- Docker Compose build/deploy validation result if maintainers request release-confidence validation.

## Version Support

| Version line | Status |
| --- | --- |
| `v0.1.0-alpha.x` | active pre-1.0 public release line |
| older versions | unsupported |

Pre-1.0 releases may include breaking changes. Stable compatibility commitments will be documented before a 1.0 release.
