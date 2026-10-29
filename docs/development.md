# Development Guide

This guide covers the public contributor baseline for MoFaCTS.

## Requirements

- Git and PowerShell
- Docker Desktop using Linux containers, with Docker Compose 2.24.4 or newer

The container supplies Meteor `3.5.4`, Node `24.22.1` (Undici `7.30.1`) and
npm `11.19.1`. Do not install or run Meteor on the Windows host for this workflow.

## First Local Run

1. From `deploy/`, create `.env.local` and its private settings file from the
   supplied examples for a new installation. Preserve existing private files.
2. Replace placeholder credentials. `MONGO_URL` must use the Compose MongoDB
   service and configured replica set. The settings JSON must define `owner`.
   Prepare the replica-set keyfile with `New-MongoReplicaSetKeyfile.ps1` when
   setting up a new database; do not reinitialize existing data.
3. Run `./hotfix-local.ps1 -Action start`. The manager validates Linux Docker and
   Compose, checks MongoDB authentication and primary readiness, and starts the
   sole source-watching Linux application at http://localhost:3200.
4. The container selects the pinned runtime and installs locked npm dependencies
   into a Linux volume. Source edits rebuild and reload automatically. Startup
   returns after app health, browser bundle, HMR and Change Streams are ready.

Use the manager's `status`, `logs`, `restart` and `stop` actions. Docker owns
processes and bounded logs; named volumes own dependencies and generated caches.
Stopping the application does not delete database data. Local administrator
credentials remain in ignored `deploy/local-hotfix/agent-secrets.env`.

For static checks using the same Linux toolchain, run from `deploy/`:

```powershell
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml exec -T mofacts meteor npm run typecheck
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml exec -T mofacts meteor npm run lint
```

The full integration suite requires a separate supported Linux test environment,
an isolated test database and explicit authorization. Never point it at the
localhost application database. See `deploy/hotfix/README.md` for ownership.

## First Admin And Content Pass

After the first local startup:

1. Sign in at `http://localhost:3200` using the local admin credentials from `deploy/local-hotfix/agent-secrets.env`.
2. Open the content upload or content management area from the app navigation.
3. Use a small local TDF/config package for smoke testing. Public TDF authoring concepts are summarized in [authoring.md](authoring.md); canonical project content lives outside this repository in the MoFaCTS configuration/content repository used by maintainers.
4. Launch the uploaded or available lesson from the home/practice dashboard and complete a few trials.
5. Re-run the checks that match your change:

   ```powershell
   cd ..\mofacts
   npm run typecheck
   npm run lint
   ```

The localhost hotfix watcher is not release confidence. Production validation
and deployment remain separate workflows.

## Common Checks

```bash
npm run lint
npm run typecheck
```

The full TypeScript check is the required TypeScript verification path for app code changes.

## Tests

### Pinned Meteor toolchain and package installation

Meteor `3.5.4` owns the official DDP and Rspack Meteor packages. Application
dependencies, including `@meteorjs/rspack`, are installed from the application
lockfile with `npm ci`; Meteor installs its own package dependencies when
`meteor update --npm` compiles plugins. There are no local DDP or Rspack package
copies or separate package-dependency installer to run.

CI installs Meteor `3.5.4` directly and asserts Meteor's Node, npm and built-in
Undici versions alongside the host toolchain. Docker retains the digest-pinned
Meteor `3.5` image only to bootstrap the official CLI: in the application
directory the CLI selects `METEOR@3.5.4` from `.meteor/release`. The builder
asserts the resulting `3.5.4` / `24.22.1` / `11.19.1` / `7.30.1` versions before
installing dependencies, and uses that selected Node binary for compiler child
processes. The dependency and runtime stages use the pinned Node `24.22.1`
Alpine image. See [the build context notes](../deploy/README.md#build-context).

After plugin compilation, CI checks the entire captured input tree. Docker
additionally checks `.meteor/release`, `.meteor/packages`, `.meteor/versions`,
`package.json` and `package-lock.json` before and after compilation and after the
final bundle build. These guards remain blocking. Dependency updates must be
intentional source changes; do not suppress synchronization errors or exclude
source declarations and locks from source identity.

Docker's acquisition boundary excludes the regenerated
`packages/ostrio-files/.npm/` and `public/webgazer/` output trees. Ostrio's source
package declaration pins its npm dependency; `prepareWebGazerAssets.cjs` copies
MediaPipe assets from the locked WebGazer installation and source license files.
Both outputs are regenerated before bundling. Source-owned package declarations
and the application lockfile remain source inputs. A Linux GitHub CI regression
uses the actual Docker acquisition target to verify this distinction and reject
changes to captured dependency inputs.

Rspack's `_build`, public/private `build-assets` and `build-chunks`, and `.rsdoctor`
trees are compiler outputs too. Docker acquisition excludes them, including the
standard `METEOR_LOCAL_DIR` suffix variants. The application configuration,
package declarations and locks remain captured; the upstream compiler regenerates
the outputs before bundling. The same regression covers these output families.

The supplemental test-input contract includes the public qualification workflow,
agent guide, local/qualification Compose recipes, hotfix manager and Change Streams
assertion scripts read by the Meteor CI harness. These supplement the captured
build tree and are hashed separately. The Linux Docker regression also runs the
harness inside its captured test workspace, so missing fixture inputs fail early.
Private runtime settings, environment files and local service state stay excluded.

The repository defines test scripts in `mofacts/package.json`. Some local Meteor workflows may require additional environment setup. For release preparation, record any test limitations explicitly rather than treating a narrowed check as full release confidence.

CI owns `npm run test:ci`. The workflow supplies an explicit checked-in test
settings file and launches Chromium through the configured Meteor browser
driver, so both server and client tests execute. The test runner owns the fixed
test-process contract: database name `meteor`,
`METEOR_REACTIVITY_ORDER=changeStreams`, `DDP_TRANSPORT=sockjs`,
Playwright/Chromium, and non-self-hosted/no-Redis mode. `MONGO_URL` remains
owned by Meteor's local test database or CI's replica-set container. A local
invocation requires fresh maintainer authorization.
`server-test-entry.js` recursively discovers server test files, including
`server/lib/clusterKcChainSolver.test.ts`. Its real worker/HiGHS integration runs
as part of this Meteor server suite, not as a separate command. The pure SPARC
Node runner excludes that Meteor-dependent module.
The source-owned browser-test package makes that Playwright contract portable
in the supported Linux CI job and explicitly authorized Linux test containers.
Meteor resolves the dynamically selected test driver into `.meteor/versions`
during a test run. The repository runner removes only those test-driver entries
when it exits, while lint and the pre-commit hook reject any such entries left
in the application dependency manifest. Do not commit these `meteortesting:*`
resolutions as application dependencies.

The integration and image-smoke jobs use the explicit `ubuntu-22.04` runner and
one workflow-owned MongoDB image pin (`CI_MONGO_IMAGE`, currently `mongo:8.0.34`).
The runner's documented Linux 6.8 kernel is compatible with MongoDB 8.0.
Linux 6.19 through 7.0.13 is incompatible with MongoDB's allocator; a host preflight
rejects that range before database startup or image building. Maintain this runner
and image pair in `.github/workflows/ci.yml`; move to a newer supported runner only
after its kernel satisfies the same compatibility check and the full integration
and image-smoke jobs pass. Do not bypass MongoDB's kernel check or substitute an
older MongoDB major version. See [MongoDB 8.0 release notes](https://www.mongodb.com/docs/manual/release-notes/8.0/)
and the [GitHub runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md).

The application startup callback validates MongoDB database identity, version,
topology and required authentication before migrations, index creation, cleanup,
or background timers. Invalid topology must fail at that boundary with the
connection validator's redacted diagnostic, before transactional work starts.

CI waits for the explicitly named test MongoDB container to accept a ping and
then become writable primary in `mofacts-ci-rs`. The readiness helper fails
immediately when the container stops, limits probe attempts, and records
bounded startup logs plus exit/OOM status and image identity. Failure steps
also record diagnostics before cleanup in the integration and Docker smoke
jobs. These diagnostics inspect only `mofacts-ci-*` containers and never dump
container environments or mounted files. The helper's synthetic tests run
before CI starts the test database; they do not start Docker or Meteor.

Never overwrite a private `settings.json` or describe a narrower local check as
equivalent coverage.

The independent Security workflow gates high/critical production dependencies
and reviewed build exposures while reporting development advisories as
maintenance information. See [Dependency Security Notes](dependency-security.md)
for audit ownership, execution-error handling, and remaining findings.

## Modify Or Add A Unit Type

Production unit behavior lives in `learning-components/`, not in the scaffold package under `packages/unit-engine-api`.

Start here:

- `../learning-components/README.md`: current component package checklist.
- `architecture.md`: application boundaries.
- `learning-component-contracts.md`: manifest and capability rules.
- `../learning-components/units/createUnitEngine.ts`: unit-engine creation facade.
- `../learning-components/units/*/manifest.ts`: existing unit manifests.
- `../learning-components/defaultLearningComponentCatalog.ts`: default in-repo component catalog.

For a small change to an existing unit, edit the relevant folder under `../learning-components/units/`, update its tests, and keep Meteor routing, publications, collections, authorization, and app shell UI in `mofacts/`.

For a new production unit type:

1. Create `../learning-components/units/<unit-name>/`.
2. Add a manifest that declares the unit type and required runtime capabilities.
3. Add the unit engine/runtime code behind explicit dependencies.
4. Register the manifest in `../learning-components/defaultLearningComponentCatalog.ts` only when it should ship by default.
5. Add focused tests for manifest registration, missing-capability failure, and runtime behavior.
6. Run:

   ```powershell
   cd mofacts
   npm run typecheck
   npm run lint
   ```

If the change alters TDF fields, generated schemas, or authoring expectations, update the authoring docs and run the schema generation workflow described by the changed code path.

## Docker Build and Deployment

The canonical build and deployment workflow lives in `deploy/`. Do not substitute a local Meteor build for release-confidence deployment validation.

Do not run Docker build, push, or deploy commands unless a maintainer explicitly asks for that task.

## Android Web-App Support

MoFaCTS supports installation from an Android browser as a web app. This uses
the ordinary browser build and does not require Meteor's Cordova `android`
platform, an APK/AAB artifact, an Android SDK, or release signing.

## Documentation Updates

Update documentation when a change affects:

- setup or runtime requirements,
- TDF structure or authoring expectations,
- user-facing behavior,
- deployment or configuration,
- release process,
- public terminology.

Use "adaptive learning system" for public project descriptions.
