# Development Guide

This guide covers the public contributor baseline for MoFaCTS.

## Requirements

- Node.js `22.x`
- npm `10.x`
- Meteor `3.4`
- Git

## Setup

```bash
git clone https://github.com/memphis-iis/mofacts.git
cd mofacts/mofacts
npm ci
cp example.settings.json settings.json
```

Adjust `settings.json` for your local environment. Do not commit local settings or secrets.

## Common Checks

```bash
npm run lint
npm run typecheck
```

The full TypeScript check is the required TypeScript verification path for app code changes.

## Tests

The repository defines test scripts in `mofacts/package.json`. Some local Meteor workflows may require additional environment setup. For release preparation, record any test limitations explicitly rather than treating a narrowed check as full release confidence.

## Docker Build and Deployment

The canonical build and deployment workflow lives in `mofacts/.deploy/`. Do not substitute a local Meteor build for release-confidence deployment validation.

Do not run Docker build, push, or deploy commands unless a maintainer explicitly asks for that task.

## Documentation Updates

Update documentation when a change affects:

- setup or runtime requirements,
- TDF structure or authoring expectations,
- user-facing behavior,
- deployment or configuration,
- release process,
- public terminology.

Use "adaptive learning system" for public project descriptions.
