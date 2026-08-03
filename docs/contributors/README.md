# Contributor Docs

Target home for contributor-facing guides.

Belongs here:

- Guides for adding unit engines, trial types, model policies, and content adapters.
- Orientation for first-time consortium contributors.
- Cross-links from docs to the matching source directories.

Does not belong here:

- Internal architecture rationale better suited for `docs/architecture/`.
- Deployment operations better suited for `docs/deployment/`.

Contributor docs should help a new developer decide where to work without reverse-engineering the current Meteor tree.

## Verification Matrix

Run commands from `mofacts/` unless a guide says otherwise. Choose the checks that match the change and record any unavailable local checks explicitly.

- TypeScript-bearing app changes: `npm run typecheck`.
- Lintable TypeScript, JavaScript, or Svelte changes: `npm run lint`.
- TDF field registry or schema changes: `npm run generate:schemas`, followed by an inspection of generated schema diffs.
- UI/runtime behavior changes: canonical localhost hotfix server plus browser smoke testing at `http://localhost:3200`.
- Meteor integration or client contract coverage: CI owns `npm run test:ci` with an explicit test-settings file and browser driver. A local invocation requires fresh maintainer authorization; do not overwrite private settings or describe a narrower check as equivalent.
- Docker build, push, or deploy verification: only when explicitly requested by a maintainer.

See `docs/development.md` for setup requirements and common development commands.
