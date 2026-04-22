# Contributing to MoFaCTS

Thanks for contributing to MoFaCTS.

## Documentation Routing (Important)

- Start with [Developer Documentation Map](https://github.com/memphis-iis/mofacts/wiki/Developer-Documentation-Map).
- The GitHub wiki is the canonical location for contributor onboarding, architecture, data model, and deployment guidance.
- `svelte-app/docs` is reserved for current reference/planning docs that are not canonical guides.

## Development Setup

New contributors should start with [Local Install](https://github.com/memphis-iis/mofacts/wiki/Local-Install) for guided local setup and first-change workflow.

Supported runtime/tooling policy and required CI checks are documented in `SUPPORT.md`.

1. Clone the repository and enter the app directory:
   ```bash
   git clone https://github.com/memphis-iis/mofacts.git
   cd mofacts/svelte-app/mofacts
   ```
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Create local settings:
   ```bash
   cp example.settings.json settings.json
   ```
4. Run the app:
   ```bash
   meteor run --settings settings.json
   ```

## Branching and Pull Requests

- Branch from `main`.
- Use focused feature branches (example: `feature/svelte-admin-panel`).
- Open a pull request against `main`.
- Keep PRs small and scoped when possible.

## Quality Checks

Required checks are defined in `SUPPORT.md`.
Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test:ci
```

Use auto-fix when appropriate:

```bash
npm run lint:fix
```

Optional diagnostics for external declaration packages:

```bash
npm run typecheck:vendor
```

## Dependency Updates and Pinning

- Follow `docs/DEPENDENCY_POLICY.md` for dependency update cadence, lockfile usage, and override requirements.
- Use `npm ci` for reproducible installs in local dev and CI.
- Treat `package.json` `overrides` as a security/compatibility exception mechanism, not normal version management.

## Pre-Commit Hooks

- Husky-managed Git hooks are installed via `npm run prepare` (included in install workflows).
- Pre-commit runs staged-file linting (`lint-staged`) and staged secret checks.
- To bypass secret scanning for an intentional one-off case, use `SKIP_SECRET_SCAN=1` for that commit command.

## Commit Conventions

We recommend Conventional Commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `test: ...`
- `chore: ...`

## Reporting Security Issues

Do not open public issues for security vulnerabilities. Follow `SECURITY.md`.
