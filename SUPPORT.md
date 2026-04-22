# Support Policy

This document defines supported runtime/tooling baselines for MoFaCTS contributors and consortium partners.

## Supported Runtime

- Node.js: `22.x`
- npm: `10.x`
- Meteor: `3.4`

These versions are the baseline used by CI and should be used for local development.

## TypeScript Policy

- Project TypeScript is enforced with strict settings.
- `npm run typecheck` must pass for app-owned code.
- External declaration-package conflicts are currently handled with `skipLibCheck: true`.

## CI Quality Gates

Required checks:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:ci`

## Dependency Policy

- Use committed lockfiles.
- Use `npm ci` in CI and recommended local workflows.
- Update dependencies on a scheduled cadence.
- Use `overrides` only for explicit security/compatibility reasons.
