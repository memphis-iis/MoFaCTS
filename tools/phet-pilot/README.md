# PhET public-source pilot

Reproducible builds and browser probes for the local shared-monitor feasibility pilot. The collector and bridge live in `packages/phet-monitor/`; SPARC hosting and research storage live in the application. Detailed authoring, transport, research-export contracts, and current/historical qualification are maintained in the wiki's [PhET Simulation Pilot](https://github.com/memphis-iis/MoFaCTS/wiki/PhET-Simulation-Pilot) page. Submitted SPARC proposal records are preserved.

## Pinned public builds

| Simulation | Public release | Adapted baseline |
| --- | --- | --- |
| Density | 1.2.9 | Approved branding metadata addition |
| Pendulum Lab | 1.0.34 | Unmodified source |
| Circuit Construction Kit: DC | 1.5.1 | Approved branding metadata addition |

`audit-releases.mjs` verified these as the newest publicly retained numeric release-branch tips on November 9, 2026; this does not establish equivalence to private releases. `releases.json` pins original dependency manifests and commits, plus the required supplemental Babel locale metadata omitted by upstream manifests (the last official commit before each release's publication). No current library revisions are substituted. Acquisition excludes PhET-iO-only repositories (`phet-io`, `phet-io-sim-specific`, `phet-io-wrappers`, `studio`) while retaining their manifest entries for provenance. Each successful adapted build establishes its public dependency closure.

## Reproduce the builds

Verified build toolchain: Windows, Node 24.15.0, npm 11.12.1. From the MoFaCTS root:

```powershell
node tools/phet-pilot/prepare.mjs
```

Acquisition fetches exact official `phetsims` commits into independent sibling-repository workspaces under ignored `tmp/phet-pilot/`. It rejects tracked edits except the approved `adapted-from-phet` addition to Density/CCK `phet.supportedBrands`. Each enclosing workspace declares CommonJS for historical dependencies without their own package metadata; upstream files are unchanged.

In each workspace run `npm ci --no-audit --no-fund` in `chipper`, the simulation repository, and `perennial-alias` where included. Use pinned lockfiles, set `PUPPETEER_SKIP_DOWNLOAD=true` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, and retain installation logs. Verification uses the existing MoFaCTS Playwright installation; no application dependency is added.

```powershell
node tools/phet-pilot/build-baseline.mjs density
node tools/phet-pilot/verify-baseline.mjs density
node tools/phet-pilot/prepare-monitored.mjs
node tools/phet-pilot/install-build-tools.mjs
node tools/phet-pilot/build-monitored.mjs density
node tools/phet-pilot/verify-monitor.mjs density
```

Repeat the per-simulation build/verify commands for `pendulum-lab` and `circuit-construction-kit-dc`. Verify all baselines before monitoring. The runners record source revisions, metadata diffs, license hashes, toolchain, commands, exit status and artifact hashes. They use upstream `grunt build` with the historical singular `--brand` for Pendulum and plural `--brands` for newer systems. Modern adapted builds skip upstream typechecking because it requires private PhET-iO imports; build success is not an upstream typecheck result. No assertion bypass or replacement branding is used.

Monitored preparation records shared-infrastructure transformations and independently installs exact dependencies (directory links violate modern bundler boundaries). The installer uses the offline npm cache and fails on missing locked packages. Before rebuilding, preparation archives successful artifacts, modified shared source/preloads and matching evidence under `<simulation>/archive/<build-id>/`. Preserve upstream source, licenses and notices; inventories alone do not establish a complete asset/redistribution review.

## Shared event monitoring

| Framework generation | Shared integration |
| --- | --- |
| AMD (Pendulum) | Explicit Property/Emitter/ObservableArray registration, notifications/disposal; Joist construction/settlement; registered rendering/instrumentation exclusions; Chipper preloads |
| TypeScript (Density, CCK) | Explicit TinyProperty/ReadOnlyProperty/Emitter/TinyEmitter/collection registration and source ownership; Joist lifecycle; registered exclusions; Chipper preloads |

All three compile identical collector/bridge code and the same `registration-contract.d.ts`; no simulation model is patched. Initial descriptor discovery establishes identities and ownership. Subsequent inspection follows object notifications, collection changes, new objects and event arguments. Frame boundaries settle captured records and affected cached identity edges. There are no model-step hooks, whole-model rescans or polling modes. See the [coverage contract](../../packages/phet-monitor/README.md).

Silent numeric fields, ordinary arrays/maps/sets, typed buffers, direct vector/matrix writes and mutation outside registered APIs remain explicitly unsupported for continuous observation. Required lesson bindings must resolve to observed properties/collections. Event-point snapshots are labeled; paths describe first discovery and dynamic objects use session IDs. Startup verification establishes pre-first-frame scalar order for surviving addressable sources, not events before module loading or pre-discovery mutable argument values.

## Local SPARC activities

```powershell
node tools/phet-pilot/generate-catalogs.mjs
node tools/phet-pilot/create-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
node tools/phet-pilot/verify-activities.cjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
node tools/phet-pilot/serve-pilot.mjs
```

Generate catalogs after matching successful monitor probes. The simulation server verifies HTML/catalog hashes, serves only approved assets on `127.0.0.1:3212`, and writes ignored `settings-fragment.json`. Merge `public.simulationBuilds` (including `catalog: { url, sha256 }`) into isolated local settings for the canonical Docker watcher at `http://localhost:3200` through `deploy/hotfix-local.ps1`. The host validates build/protocol/catalog identity and required addresses before Start; catalogs contain no runtime values or dynamic IDs. Authentication and learner identity stay in MoFaCTS.

The canonical package is `C:/dev/mofacts_config/SPARC PhET Pilot.zip` (three TDF/stimulus pairs). Import user-facing demos under the intended main administrator; update existing lessons in place to preserve IDs, ownership and progress. For repeatable tests, create fresh synthetic lessons instead of clearing history:

```powershell
node tools/phet-pilot/upload-local-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot' unique-run-label
node tools/phet-pilot/verify-host.mjs tmp/phet-pilot/local-activity-ids-unique-run-label.json --hold-research
node tools/phet-pilot/verify-history.mjs tmp/phet-pilot/local-activity-ids-unique-run-label.json
```

Uploader `--collect-existing` reads an imported fixture run's IDs without reuploading. These tools and the ingestion benchmark share `local-app.mjs`: headless full Chromium, exact localhost origin, and the canonical ignored `deploy/local-hotfix/agent-secrets.env` test credentials. User-facing trials use Chrome. Credentials are never embedded in lesson packages or simulation builds.

Protocol 3 delivers validated ordered observations directly to SPARC rules; independent research storage cannot delay feedback. The bounded storage queue stops dependent instruction on failure/overflow. Departure drains accepted writes; abrupt browser loss can lose pending raw evidence. Reload preserves completed tasks and requires explicit physical restart; there is no crash-proof offline outbox or physical replay. Notification-triggered transport has no idle timer; outstanding delivery retries and research-only 100 ms coalescing do not poll model state.

Stimulus bindings and `history-event` effects define meaningful activity, scientific labels/units, hints and checks. Normal Download exports lossless `CF (Simulation Activity)` JSON with build/attempt/source identities, selected values and supporting sequences. Internal rule/state records remain for replay, and detailed catalogs/notifications stay in separate research storage. Credit and KC changes require explicit authored effects. A property notification alone is an observed change; input provenance requires a registered interaction.

## Verification and retained evidence

```powershell
node --test tools/phet-pilot/local-app.test.mjs packages/phet-monitor/collector.test.mjs packages/phet-monitor/protocol.test.mjs packages/phet-monitor/lesson.test.mjs packages/phet-monitor/bridge.test.mjs
node --test mofacts/scripts/simulationActivity.test.cjs mofacts/scripts/simulationResearch.test.cjs
node tools/phet-pilot/verify-startup.mjs
node tools/phet-pilot/verify-object-events.mjs
node tools/phet-pilot/verify-interactions.mjs
node tools/phet-pilot/verify-disposal.mjs
node tools/phet-pilot/measure.mjs density 600000
# Repeat measure sequentially for pendulum-lab and circuit-construction-kit-dc.
node tools/phet-pilot/report.mjs
```

Use full Chromium (`channel: 'chromium'`); the headless-shell executable lacked Density's WebGL support. Native probes cover representative pointer/keyboard input, reset and screen changes, not complete accessibility. The CCK host test constructs its closed circuit through public model APIs and focuses the native component control for Delete. Pendulum native checks use `?accessibility`. Reconstruction covers supported observed state, not full physics replay. Idle checks require zero object inspections over 1,000 frame callbacks; disposal uses a separate 100-cycle forced-GC probe.

Keep timing sessions sequential and separate from other browser workloads/profiling. The harness runs reproducible actions every two seconds and records frame intervals/cached counts without inspecting model fields from frames. Hidden frames, gaps of at least two seconds, or overshoot above five seconds invalidate a run. `profile-collector.mjs <simulation>` is a separate CPU diagnostic; its profiling overhead cannot qualify timing. `measure-ingestion.mjs <fixture-ids.json>` diagnoses authenticated storage and creates explicit synthetic attempt/lifecycle rows, without lesson credit. `report.mjs` requires evidence matching current source/build hashes and the same host/history fixtures.

Current protocol-3 local results (November 11, 2026):

| Simulation | Baseline / monitored p95 frame interval | Additional time | Scripted ordinary activity rows |
| --- | --- | --- | --- |
| Density | 9.0 / 9.1 ms | 1.1% | 9 |
| Pendulum | 8.6 / 8.7 ms | 1.2% | 12 |
| CCK DC | 8.7 / 8.8 ms | 1.1% | 16 |

All six ten-minute sessions passed validity checks. These are one local pair per simulation, not worst-case responsiveness guarantees. Feedback preceded held research writes; Download agreed across all three scopes. Detailed qualifications, build identities, limitations and historical results have one maintained record in the wiki. Evidence remains in ignored `acceptance-summary.json`, `history-acceptance.json`, `history-meteor-first.json` and per-build files.

The final full Meteor suite passed on November 12, 2026, using private detached snapshot `b1c0335598e71219d55c58dee4a5e00c85144fb3` (published PhET work plus local tool cleanup): 1,019 server and 1,249 client tests passed, zero failures/hook failures, and 15/seven pending. Source before/after matched, pre-existing containers were unchanged, and worker-owned containers/network/cache were removed. The receipt is retained in ignored `cleanup-integration-20261112-results/summary.json`; raw evidence remains on the isolated Linux worker. This closes the final-source integration rerun; it does not establish deployment qualification. Keep current/archived builds, pinned dependencies, corresponding source/licenses, catalogs, traces and qualification receipts. Only disposable local scratch diagnostics should be removed during routine cleanup.
