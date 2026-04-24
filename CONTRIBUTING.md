# Contributing to MoFaCTS

Thank you for helping improve MoFaCTS. This project is in a pre-1.0 alpha stage, so clear issues, focused pull requests, and careful documentation updates are especially valuable.

## Before You Start

- Read the [README](README.md) for project scope and status.
- Use [docs/development.md](docs/development.md) for local setup.
- Check [SUPPORT.md](SUPPORT.md) for supported runtime versions and quality gates.
- Open an issue first for substantial architecture, data model, deployment, security, or user-facing workflow changes.

## Development Setup

```bash
git clone https://github.com/memphis-iis/mofacts.git
cd mofacts/mofacts
npm ci
cp example.settings.json settings.json
npm run typecheck
```

Use Node.js `22.x`, npm `10.x`, and Meteor `3.4`.

## Branches and Pull Requests

- Branch from `main`.
- Use focused branch names such as `docs/release-readiness` or `fix/tdf-import-validation`.
- Keep pull requests scoped to one logical change.
- Include screenshots or short recordings for visible UI changes.
- Update documentation when behavior, setup, configuration, or authoring expectations change.

## Quality Checks

Run the relevant checks before opening a pull request:

```bash
cd mofacts
npm run lint
npm run typecheck
```

The repository also defines `npm run test:ci`, but release confidence for this repository should be recorded through the supported checks and the canonical Docker Compose workflow under `mofacts/.deploy/` when a release owner explicitly requests build or deploy validation.

## Documentation Changes

Keep root documentation concise and public-facing. Use:

- `README.md` for orientation.
- `docs/` for stable public guides.
- the GitHub wiki for longer operational runbooks and detailed examples.
- the configuration/content repository for internal planning notes, historical audits, and content-specific work.

## Commit Style

Conventional Commits are recommended:

- `docs: update release process`
- `fix: validate tdf upload metadata`
- `feat: add authoring preview control`
- `chore: update alpha version metadata`

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).
