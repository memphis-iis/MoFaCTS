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

## Ordinary ZIP lesson packages

```powershell
node tools/phet-pilot/generate-catalogs.mjs
node tools/phet-pilot/create-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
node tools/phet-pilot/verify-activities.cjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
```

Generate catalogs after matching successful monitor probes. The generator writes three ordinary, self-contained upload ZIPs to `C:/dev/mofacts_config` (`SPARC PhET density.zip`, `SPARC PhET pendulum-lab.zip`, `SPARC PhET circuit-construction-kit-dc.zip`) and the combined `SPARC PhET Pilot.zip`. Editable JSON, simulation HTML, descriptive catalogs, source ZIPs and notices live in `SPARC PhET Pilot/`. Upload through the normal Content page; no simulation server, domain setup, per-lesson settings or build registry is required. Use the canonical Docker watcher at `http://localhost:3200` for local testing.

Each stimulus simulation node supplies `buildId`, `asset: { url, sha256, catalog: { url, sha256 } }`, and bindings. Asset URLs in the ZIP are filenames. Upload verifies both hashes, catalog/build identity and supported required addresses before persistence, then resolves them to the immutable assets written in that upload and stimulus set. JSON catalogs are attachments, not TDFs. Source and notices accompany every package.

The existing dynamic-asset service serves simulation HTML with CSP `sandbox allow-scripts` and restricted network/navigation. The iframe also allows scripts only, giving the simulation a unique opaque origin rather than access to application storage/cookies. The host accepts messages only from that exact window, origin `null`, protocol/build and unpredictable attempt identity. Parent delivery uses `*` only because opaque origins cannot be named; child delivery targets the browser-supplied embedding origin exactly. The bridge derives that origin from origin-only referrer metadata, so builds are portable across application hosts. No authentication or learner identity enters the simulation. Native launch parameters such as Pendulum accessibility remain in the asset reference.

Upload user-facing demos under their intended administrator and update existing lessons through the normal confirmation flow to preserve IDs, ownership and progress. For repeatable tests, create fresh synthetic lessons instead of clearing history:

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
node --test mofacts/scripts/simulationPackage.test.cjs mofacts/scripts/simulationActivity.test.cjs mofacts/scripts/simulationResearch.test.cjs
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

The November 12 integration receipt and November 11 performance results above qualify their historical build identities. The ZIP/opaque-origin revision changes the shared bridge/bootstrap and receives new identities; its upload/browser verification is recorded separately. The collector remains identical and event-based.

## ZIP integration verification (November 13)

All three normal uploads, live-feedback/held-research checks, completion/reload, ordinary Download scopes and portable package exports pass. Package downloads retain source/notices and repeat safely through the export cache. Current evidence: `package-embedding-acceptance.json`, `package-host-acceptance.json`, `history-acceptance.json`, `package-roundtrip-acceptance.json`, and per-build probes. The collector is unchanged; all three inspect zero objects over 1,000 idle frames. Targeted checks pass 62 collector/host/history/package/helper cases, 30 localization, 25 identity preflight and seven export/asset-route cases, plus required typecheck/lint/schema generation.

The first full Meteor snapshot `dc2ca10ebbed803bcc3b6b76715b9862096f7108` failed (1,030 server passed/one timed out/15 pending; 1,247 client passed/two failed/seven pending). Missing Spanish asset-field text caused the two client failures and is corrected with localization tests passing. The server failure was the existing concurrent Mongo allocation case exceeding 2,000 ms; its cause is not established. The failure receipt retains source/cleanup checks in `zip-meteor-first-20261113.json`. A full retry needs fresh authorization.

Use `node tools/phet-pilot/verify-package-embedding.mjs` for opaque-origin browser checks and `node tools/phet-pilot/verify-package-roundtrip.mjs <fixture-ids.json>` for normal package download/hashes/filenames. Uploader `--simulation=<pilot-name>` selects one independent fixture; `--collect-existing` only reads existing IDs. Full corresponding-source archives accompany the packages and retain upstream licenses plus the MoFaCTS license. They account for most upload size; runtime fetches only HTML and catalog.

## Package resource ownership (November 14)

PhET model execution, event observation, selected-state projection and production-rule evaluation remain in the browser. Research persistence is asynchronous. These storage changes add no model polling or simulation-specific collector code.

The server streams ZIP entries into an owned temporary directory, hashing each entry during extraction. Only authored JSON is retained in memory. Limits are 10,000 entries, 512 MiB per binary entry, 64 MiB per JSON entry and total authored JSON, and 2 GiB total expanded bytes. Simulation HTML/catalog/source bounds remain 64/8/512 MiB. The upload workflow disposes staging on preflight confirmation, success and failure; repair uses the same lifetime contract. Source archives and notices remain intact.

Declared simulation dependencies are uploaded only to their declaring stimulus-set scopes. Shared dependencies accumulate their declaring scopes. Ordinary package media retains its existing scoping behavior. The three-simulation combined package therefore needs 12 extracted media records instead of 36. Existing uploaded copies are left intact; this changes new uploads, not durable lessons or learner history.

Package SHA-256 checks read streams. FilesCollection's public addFile API registers durable filesystem copies. Exports lazily open one asset stream at a time, generate the ZIP into owned temporary storage and register that file. S3 writes receive streams with ContentLength; S3 downloads stream with backpressure and close on disconnect. Buffered storage reads remain explicit for bounded consumers such as readiness checks. Independent server-side telemetry validation produces the serialization used for both byte limits and the batch digest; sequence, ownership and transaction checks remain unchanged.

No lesson configuration or simulation rebuild is required for these server changes. Temporary disk space must accommodate expanded assets, durable copies and exports. This removes package-size RAM buffering; it does not claim a measured concurrency or capacity limit.

### Verified efficiency result (November 14)

Private detached snapshot cc8c06198a30ff10a7f033d0145833cdef24401a passed the one authorized full Meteor run: 1,036 server and 1,249 client tests, zero failures or hook failures, 15/seven pending. Test source matched before/after, existing containers were unchanged, and the worker removed its owned containers/network/cache. This closes the earlier pending full-suite check for this implementation; the earlier failed receipt is retained. The native receipt is in ignored tmp/phet-pilot/efficiency-meteor-20261114.json.

Full typecheck and lint (including all 330 security surfaces) pass. Focused collector, bridge, registration, telemetry, package, storage and sandbox checks pass. All three distribution ZIPs validate with streamed extraction, complete corresponding source and unchanged hashes. No TDF/schema fields changed in this efficiency revision.

An actual fresh combined normal upload produced three lessons with 12 media records, 267,930,569 total bytes and three intact source archives. Compared with the former 36 copies (803,791,707 bytes), extracted-media storage is reduced by two thirds. The initial five-minute browser-harness transfer wait expired; the same normal UI upload completed with a ten-minute bound. The repeatable helper now uses that measured transfer allowance. This is a harness bound, not a claimed upload-speed improvement.

All three fresh SPARC nodes passed live feedback while research writes were held, keyboard operation, task completion, stable iframe identity, explicit restart after reload and preserved completed work. Normal streamed package downloads retain all portable filenames, queries, hashes, source and notices. Ordinary history Download agrees across scopes with 9/12/16 activity rows and no inventory or duplicate activity rows. Completed upload/export operations left zero package/export staging directories. Results are local verification, not deployment or new ten-minute frame-performance qualification.
