# Contributor Docs

Target home for contributor-facing guides.

Belongs here:

- Guides for adding unit engines, trial types, model policies, content adapters, and H5P integrations.
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
- UI/runtime behavior changes: native hotfix dev server plus browser smoke testing at `http://localhost:3200`.
- Meteor integration or client contract coverage: CI or another supported Meteor test environment. `npm run test:ci` refuses local Windows execution unless `MOFACTS_ALLOW_WINDOWS_METEOR_TESTS=1` is set for deliberate harness debugging; do not describe a narrower local check as equivalent.
- Docker build, push, or deploy verification: only when explicitly requested by a maintainer.

See `docs/development.md` for setup requirements and common development commands.
