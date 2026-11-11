# PhET public-source pilot

This directory contains reproducible builds and browser probes for the implemented local shared-monitor feasibility pilot. The shared collector and bridge are in `packages/phet-monitor/`; the SPARC host and dedicated telemetry storage are in the application. Source checkouts, installed build dependencies, compiled simulations, and diagnostic evidence remain under the ignored `tmp/phet-pilot/` directory. Submitted SPARC proposal records are not changed. The pilot has **not passed full acceptance**.

## Pinned releases and current results

| Simulation | Public release | Adapted baseline |
| --- | --- | --- |
| Density | 1.2.9 | Builds with the approved branding metadata addition |
| Pendulum Lab | 1.0.34 | Builds without source changes |
| Circuit Construction Kit: DC | 1.5.1 | Builds with the approved branding metadata addition |

`audit-releases.mjs` verified that these pins match the newest publicly retained numeric release-branch tips on November 9, 2026. All three complete adapted build closures were retrieved and built. This establishes the newest releases available through that public release-branch mechanism, not equivalence to current private releases. `releases.json` preserves each original release dependency manifest, its commit, and explicitly pinned supplemental Babel locale metadata. Babel's pin is the last official commit preceding that release's publication; the upstream release manifests omit this required build metadata. No current shared-library versions are substituted.

The acquisition excludes the manifest's PhET-iO-only repositories (`phet-io`, `phet-io-sim-specific`, `phet-io-wrappers`, `studio`) from the adapted build workspace. Those entries remain in the manifest for provenance. Dependency closure is established only when that pilot's adapted build succeeds. No private PhET source or credential is used.

## Reproduction

Verified local toolchain: Windows, Node 24.15.0, npm 11.12.1. Run acquisition from the MoFaCTS root:

```powershell
node tools/phet-pilot/prepare.mjs
```

Acquisition uses official `phetsims` Git repositories, fetches exact commits, and rejects tracked source changes except the exact user-approved branding addition in Density and CCK. Each pilot has an independent sibling-repository workspace. Its enclosing `package.json` establishes CommonJS for historical dependencies without their own package metadata; it does not change an upstream checkout.

In each pilot workspace, run `npm ci --no-audit --no-fund` in `chipper`, the simulation repository, and `perennial-alias` where the manifest includes it. Use the checked-in lock files. Set `PUPPETEER_SKIP_DOWNLOAD=true` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` for these build installations; browser verification uses the existing MoFaCTS Playwright installation. Preserve installation logs alongside the baseline evidence. No MoFaCTS application dependency is added.

Then, from the MoFaCTS root:

```powershell
node tools/phet-pilot/build-baseline.mjs pendulum-lab
node tools/phet-pilot/verify-baseline.mjs pendulum-lab
```

The same commands accept `density` and `circuit-construction-kit-dc`. The runner records exact source revisions, approved metadata diffs, license-file hashes, command, Node version, exit status, and successful artifact hash. It invokes upstream `grunt build` with the historical singular `--brand` for Pendulum Lab and plural `--brands` for the newer build systems. The modern adapted build route skips upstream typechecking because it depends on private PhET-iO imports; a successful adapted build is not an upstream typecheck result.

The smoke verifier serves only the built HTML on an ephemeral loopback port, blocks remote browser requests, waits for model/view initialization and completed frames, and saves `baseline-smoke.json` plus `baseline.png`. Use Playwright's full Chromium channel (`channel: 'chromium'`), not its headless-shell executable: the latter lacked WebGL in this environment and did not render Density's 3D scene. Launch success is not interaction, accessibility, state-reconstruction, or performance acceptance.

## Shared monitoring builds

The user approved adding `adapted-from-phet` to each of Density and CCK's `phet.supportedBrands` on 2026-11-09. Those are **uninstrumented baselines with a branding configuration change**. Pendulum's baseline is unmodified. No assertion bypass, alternative branding, replacement simulation, or simulation-specific collector is used.

```powershell
node tools/phet-pilot/prepare-monitored.mjs
node tools/phet-pilot/install-build-tools.mjs
node tools/phet-pilot/build-monitored.mjs density
node tools/phet-pilot/verify-monitor.mjs density
```

Repeat the last two commands for each pilot. Preparation creates independent source checkouts and records exact shared-infrastructure transformations. Build dependencies are installed independently from their pinned lockfiles; dependency-directory links violate the modern bundler's repository-boundary checks. The installer uses the npm cache offline and fails if a locked package is unavailable.

| Framework generation | Shared integration |
| --- | --- |
| AMD framework (Pendulum) | Explicit Property/Emitter/ObservableArray registration, notifications and disposal; Joist model construction and frame settlement; Node/Screen/Sim/Tandem type exclusions; Chipper preloads |
| TypeScript framework (Density and CCK) | Explicit TinyProperty/ReadOnlyProperty/Emitter/TinyEmitter/collection registration, source ownership, notifications and disposal; Joist lifecycle; registered type exclusions; Chipper preloads |

All receive identical collector/bridge source; no simulation model is patched. One initial descriptor-only discovery establishes object identities and ownership. Thereafter only properties, Axon observable collections, newly discovered objects, and explicit event arguments are inspected in response to their own notifications. Frame boundaries only settle captured records and affected cached identity edges. There are no model-step hooks, whole-model rescans, polling modes, or full-frame reference collectors.

Plain numeric fields, ordinary arrays/maps/sets, typed-array physics buffers, vector/matrix direct writes, and mutation outside the shared API have no dependable signal. They are inventoried initially and marked unsupported for continuous observation. Accessors and rendering/browser objects are not traversed. Event-point object snapshots are explicitly labeled. Paths describe first discovery; dynamic identity uses stable session IDs and collection references. Required lesson values must resolve to observed properties/collections. See the [coverage contract](../../packages/phet-monitor/README.md).

`verify-object-events.mjs` checks scripted changes and 1,000 synchronous idle frame callbacks with zero additional object inspections. It does not compare against polling. `verify-startup.mjs` independently checks scalar notification order before the first frame for surviving addressable sources. Earlier module-loading events and pre-discovery mutable argument field values remain outside established coverage.

Preparation archives a successful previous artifact, exact modified shared sources/preloads, build logs, and matching evidence under `tmp/phet-pilot/<simulation>/archive/<build-id>/`. New hashes identify changed collectors; old timing results cannot qualify a new build.

`verify-monitor.mjs` saves a coverage inventory and compressed trace, exercises first-screen pointer entry, and compares reconstructed supported state with the final sampled checkpoint. All three final registration-contract builds passed supported-state reconstruction. This does not establish physical replay or full interaction coverage.

## Object-event verification

Exact source/build hashes, coverage inventories and results are joined in ignored `tmp/phet-pilot/registration-verification.json`. These results establish the three pinned pilots, not universal coverage. Each build's `monitor-probe.json` identifies unsupported fields and reasons. Reference reassignment being unsupported does not make notifications from the referenced property unsupported.

## Host and verification status

Protocol 2 separates reactive instruction from research persistence. Validated ordered batches update SPARC working memory and rules directly. Browser receipt acknowledgments release the child to deliver further events while an independent ordered writer saves research batches. The shared collector remains object-event based, with no model polling. Required bindings and sequence/coverage checks still apply before instructional effects.

The host retains accepted batches in a bounded 32 MiB queue until storage completes. Research failure or overflow stops further dependent instruction and marks the attempt incomplete. Decisions already made keep their attempt/sequence references and are not retroactively erased; their raw evidence can still be pending. Normal departure drains accepted writes before closing; abrupt browser loss can interrupt unsaved research. Restart preserves completed work and marks the previous attempt interrupted. This pilot does not provide a crash-proof offline outbox.

Use `verify-host.mjs <activity-ids.json> --hold-research` to hold the first research write until actual instructional feedback appears, then release storage and verify normal persistence/reload. The failure and bounded-queue contracts are tested with synthetic streams.

The preceding protocol-1 object-event builds also passed the real local SPARC browser checks: authenticated durable ingestion, authored completion, iframe preservation, explicit restart after reload, and preservation of completed tasks. Observation-to-saved-rule p95 delays were 788 ms for Density (one firing), 179 ms for Pendulum (four), and 171 ms for CCK (three). Density still exceeds the 500 ms target; the small samples do not establish sustained performance. These results replace earlier revision timings for these build identities.

The versioned child bridge accepts only its configured host origin and parent window. The local pilot currently permits `http://localhost:3200`. It retransmits immutable batches until acknowledged and stops on timeout. The host validates origin, source, version, build and attempt, immediately projects declarative bindings into `simulation-observation` SPARC events. These events bypass ordinary answer submission. A dedicated server-only `simulation_telemetry` collection owns attempts and raw batches; export is administrator-only and bounded. Reload requires an explicit new physical attempt; existing SPARC history remains the owner of completed tasks and instructional decisions.

All three final registration-contract activities passed the supported local Docker application's real browser run, including Mongo/DDP ingestion, authored feedback and task completion, iframe preservation during feedback, explicit restart after reload, and saved task completion. The latest tests use native sliders for Density and Pendulum, a pointer drag for Pendulum motion, and pointer creation plus the native focusable component for CCK keyboard deletion. The closed circuit uses public model APIs in test code. Embedded CCK did not respond to Delete with only a canvas selection and BODY focus; component keyboard focus is required in the verified interaction. These tests do not establish complete accessibility. No full `npm run test:ci` has been authorized or executed.

```powershell
node --test packages/phet-monitor/collector.test.mjs packages/phet-monitor/protocol.test.mjs packages/phet-monitor/lesson.test.mjs packages/phet-monitor/bridge.test.mjs
node --test mofacts/scripts/simulationResearch.test.cjs
node tools/phet-pilot/create-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
node tools/phet-pilot/verify-activities.cjs 'C:/dev/mofacts_config/SPARC PhET Pilot'
node tools/phet-pilot/serve-pilot.mjs
# In another terminal, after configuring the local build catalog and uploading the activities:
node tools/phet-pilot/verify-host.mjs tmp/phet-pilot/local-activity-ids.json
node tools/phet-pilot/measure.mjs density 600000
# Repeat the measurement for the other two pilots before generating the report.
node tools/phet-pilot/verify-interactions.mjs
node tools/phet-pilot/verify-disposal.mjs
node tools/phet-pilot/verify-startup.mjs
node tools/phet-pilot/verify-object-events.mjs
node tools/phet-pilot/report.mjs
```

The object-event revision replaces the previous model-dirty scan design. Contract tests check idle behavior, notification order, startup capture, collection identity, disposal, unsupported binding rejection, bridge delivery, host integrity, and storage ownership. Exact browser evidence must match the new build identities; previous revision results are historical.

Record notifications schedule a flush in the next event-loop task, bounded to 4,000 records and 1 MiB. An outstanding batch has a one-second retry and a ten-second delivery deadline. No recurring idle transport/host timer remains. Browser test sinks also drain on record notifications. `measure-ingestion.mjs <local-activity-ids.json>` measures authenticated local storage without awarding lesson credit.

The measurement harness compares baseline and collector frame intervals sequentially in the same full Chromium browser, with reproducible model actions every two seconds. It asserts that the first simulation screen is active and records the resulting values. Earlier home-screen timing diagnostics are invalid for acceptance. A hidden-tab frame, a frame gap of two seconds or more, or a run overshoot greater than five seconds invalidates a timing run; its evidence is retained with `measurementValid: false`. This harness measures collection/rendering, not durable transport or instructional latency.

The original collector's six ten-minute sessions completed on November 10, 2026, using Chromium 148.0.7778.96 on the same machine. These historical results do not qualify the object-event implementation. Each row is one baseline/monitored comparison, not a repeated statistical study:

| Simulation | Baseline p95 frame interval | Monitored p95 frame interval | Additional time | 10% target |
| --- | --- | --- | --- | --- |
| Density | 10.9 ms | 28.7 ms | 163% | Failed |
| Pendulum Lab | 8.8 ms | 8.8 ms | approximately 0% | Passed in this run |
| Circuit Construction Kit: DC | 8.9 ms | 10.4 ms | 17% | Failed |

The collector remained complete with no page errors in those runs. Active-object counts stayed constant for Density and Pendulum and alternated with creation/reset for CCK without a growth trend. Pendulum's timing run used the upstream default launch; the local SPARC catalog now enables the documented `?accessibility` flag for native keyboard controls. That flag-on configuration has not received a separate ten-minute timing comparison.

Representative native pointer/keyboard controls, reset, and screen navigation passed for all three pilots, with supported-state reconstruction checked after each stage and collector shutdown releasing its active inventory and queues. A separate CCK probe ran 100 component creation/reset cycles for both baseline and monitored builds: none of the 200 tested component/property weak references remained reachable after forced garbage collection in either build. This is a bounded retention probe, not a complete heap or accessibility audit.

The canonical activity package is `C:/dev/mofacts_config/SPARC PhET Pilot.zip`. Detailed authoring, local configuration, research export, and coverage documentation are in the wiki's **PhET Simulation Pilot** page. The simulation server writes the exact public build catalog to ignored `tmp/phet-pilot/settings-fragment.json`; use an isolated local settings file with the canonical Docker watcher. The server verifies artifact hashes and serves only those artifacts on a separate loopback origin. Authentication and learner identity are never passed to the simulation.

For repeatable local browser tests after completing the demonstration lessons, use `upload-local-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot' unique-run-label`. It imports three fresh local fixtures through the ordinary upload UI and writes their IDs to `tmp/phet-pilot/local-activity-ids-unique-run-label.json`. Pass that file to `verify-host.mjs`. This preserves completed tasks and prior history instead of clearing them to rerun a test. The browser verifier reads only the canonical ignored local agent credentials and refuses non-local application URLs. These credentials are for isolated test fixtures. Upload user-facing lessons under the intended author/admin account so they appear in that account's content list.

Keep timing runs sequential and separate from other browser workloads. `verify-disposal.mjs` deliberately forces Chromium garbage collection after repeated circuit creation/removal; it is separate from timing measurements. `verify-interactions.mjs` exercises representative native controls and checks state reconstruction after changes, reset, and screen navigation. Its Pendulum keyboard probe explicitly uses the pinned framework's `?accessibility` launch flag. These probes are narrower than a complete accessibility or heap audit.

Upstream license files, source, and notices are retained in their checkouts. The generated inventory is provenance evidence, not a completed review of all code, assets, or redistribution obligations. There is no distribution bundle or deployment in this milestone's current state.

Research-only coalescing starts a 100 ms window for each pending storage group. Contiguous receipts are combined into bounded storage batches without changing record sequences. Further writes follow completion of the preceding write and receive their own coalescing window, limiting sustained requests to at most ten per second. No timer runs on an idle queue. This storage scheduling never gates SPARC observation delivery.

The shared monitor now uses an explicit version-1 registration contract for properties, emitters and observable collections. Shared framework constructors supply kind, exact notification source, public value reader and collection child handles. Rendering/instrumentation exclusions use registered constructor identities. Private-field lookalikes never gain observed coverage. The declaration in `packages/phet-monitor/registration-contract.d.ts` is identical across the three adapted builds; release manifests record its hash. Framework adapters preserve startup capture, collection identity, disposal and the independent reactive SPARC/research paths. No simulation model is patched and no polling mode is introduced.

Registration-contract verification passed on all three final build identities: 43 contracts, full application typecheck/lint, reconstruction and startup checks, zero inspections over 1,000 idle frame callbacks, representative native controls/reset/screen switching, and a 100-cycle CCK retention probe with zero retained references among 200 tested component/property references. Real SPARC feedback preceded held research writes, eventual storage reached the supporting observations, and reload preserved completed tasks. Exact source/build hashes and results are in ignored `tmp/phet-pilot/registration-verification.json`. No full Meteor CI invocation or deployment was performed for this revision. Controlled ten-minute overhead qualification on these final builds remains outstanding. Feedback timing is a diagnostic, not a monitor correctness requirement.
