# PhET public-source pilot

This directory contains reproducible builds and browser probes for the implemented local shared-monitor feasibility pilot. The shared collector and bridge are in `packages/phet-monitor/`; the SPARC host and dedicated telemetry storage are in the application. Source checkouts, installed build dependencies, compiled simulations, and diagnostic evidence remain under the ignored `tmp/phet-pilot/` directory. Submitted SPARC proposal records are not changed. Local supported-binding checks pass; final full-suite requalification awaits fresh authorization.

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

Protocol 3 separates reactive instruction from research persistence. Validated ordered batches update SPARC working memory and rules directly. Browser receipt acknowledgments release the child to deliver further events while an independent ordered writer saves research batches. The shared collector remains object-event based, with no model polling. Required bindings and sequence/coverage checks still apply before instructional effects.

The host retains accepted batches in a bounded 32 MiB queue until storage completes. Research failure or overflow stops further dependent instruction and marks the attempt incomplete. Decisions already made keep their attempt/sequence references and are not retroactively erased; their raw evidence can still be pending. Normal departure drains accepted writes before closing; abrupt browser loss can interrupt unsaved research. Restart preserves completed work and marks the previous attempt interrupted. This pilot does not provide a crash-proof offline outbox.

Use `verify-host.mjs <activity-ids.json> --hold-research` to hold the first research write until actual instructional feedback appears, then release storage and verify normal persistence/reload. The failure and bounded-queue contracts are tested with synthetic streams.

The preceding protocol-1 object-event builds also passed the real local SPARC browser checks: authenticated durable ingestion, authored completion, iframe preservation, explicit restart after reload, and preservation of completed tasks. Observation-to-saved-rule p95 delays were 788 ms for Density (one firing), 179 ms for Pendulum (four), and 171 ms for CCK (three). Density still exceeds the 500 ms target; the small samples do not establish sustained performance. These results replace earlier revision timings for these build identities.

The versioned child bridge accepts only its configured host origin and parent window. The local pilot currently permits `http://localhost:3200`. It retransmits immutable batches until acknowledged and stops on timeout. The host validates origin, source, version, build and attempt, immediately projects declarative bindings into `simulation-observation` SPARC events. These events bypass ordinary answer submission. A dedicated server-only `simulation_telemetry` collection owns attempts and raw batches; export is administrator-only and bounded. Reload requires an explicit new physical attempt; existing SPARC history remains the owner of completed tasks and instructional decisions.

All three final registration-contract activities passed the supported local Docker application's real browser run, including Mongo/DDP ingestion, authored feedback and task completion, iframe preservation during feedback, explicit restart after reload, and saved task completion. The latest tests use native sliders for Density and Pendulum, a pointer drag for Pendulum motion, and pointer creation plus the native focusable component for CCK keyboard deletion. The closed circuit uses public model APIs in test code. Embedded CCK did not respond to Delete with only a canvas selection and BODY focus; component keyboard focus is required in the verified interaction. These tests do not establish complete accessibility. The full Meteor result is recorded below.

```powershell
node --test packages/phet-monitor/collector.test.mjs packages/phet-monitor/protocol.test.mjs packages/phet-monitor/lesson.test.mjs packages/phet-monitor/bridge.test.mjs
node --test mofacts/scripts/simulationResearch.test.cjs
node tools/phet-pilot/generate-catalogs.mjs
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

The measurement harness compares baseline and collector frame intervals sequentially in the same full Chromium browser, with reproducible model actions every two seconds. It asserts that the first simulation screen is active and records the resulting values. Collector methods run without profiling wrappers: per-notification stopwatch calls would add benchmark-only overhead. The harness records frame intervals and cached active-object counts; it does not time individual collector methods or inspect the model from frame callbacks. Earlier home-screen timing diagnostics are invalid for acceptance. A hidden-tab frame, a frame gap of two seconds or more, or a run overshoot greater than five seconds invalidates a timing run; its evidence is retained with `measurementValid: false`. This harness measures collection/rendering, not durable transport or instructional latency.

## Meaningful simulation history (protocol 3)

The current shared collector adds explicit control registration/notifications and public framework-declared property links. It preserves scientific model units without simulation-specific hooks. The independent bridge is protocol 3. Frame boundaries settle captured events; there is no model polling or periodic state sampler. The browser requires WeakRef for non-retaining declared property links.

The approved build entry now requires `catalog: { url, sha256 }`. After successful monitor probes, run `node tools/phet-pilot/generate-catalogs.mjs`; the simulation server verifies these descriptive assets alongside HTML artifacts and writes their public settings. The host verifies catalog hash, build/artifact/protocol identity and required binding addresses before Start. Catalogs contain no attempt values or object identities.

Stimuli own binding labels/units and `history-event` rule effects. Completed adjustments, reset, component membership changes, checks, hints and completion use the existing canonical history writer. Detailed notifications remain in the dedicated research collection. Normal Download adds a lossless `CF (Simulation Activity)` JSON column after existing fixed columns, including build/attempt IDs, provenance, selected values and supporting observation sequences. Internal simulation rule/state rows remain for replay and are omitted from normal exports; prior records and other units retain existing behavior. History alone never awards credit or updates a KC.

Use fresh synthetic fixtures with `upload-local-activities.mjs`, then `verify-host.mjs <fixture-ids.json> --hold-research` and `verify-history.mjs <fixture-ids.json>`. The history probe uses the real Download UI for own-history, owned-data and individual-lesson scopes. It checks failed task checks, repeated hints, one explicit reset, completed native adjustments, interruption and completion after reload. `--collect-existing` on the uploader reads IDs from an already imported fixture run without reuploading it. User-facing demos must stay under their intended owner; update them in place without clearing progress.

The new local probes pass startup/reconstruction, zero object inspections over 1,000 idle callbacks, native pointer/keyboard controls, screen switching/resource cleanup, and a 100-cycle CCK weak-reference retention check. Current performance and the newly authorized full Meteor result are recorded separately below when complete; historical results do not qualify new hashes.

## Current protocol-3 verification (2026-11-11 local)

The shared event collector passes supported-state reconstruction, startup ordering, native pointer/keyboard/reset/screen-switch checks, and resource cleanup in all three builds. One thousand idle frame callbacks inspect zero objects in each pilot. A 100-cycle CCK create/reset probe retained none of the 200 tested component/property WeakRefs after forced garbage collection; this is not a complete heap audit.

| Simulation | Current build | Baseline p95 interval | Monitored p95 interval | Additional p95 time | Scripted ordinary activity rows |
| --- | --- | --- | --- | --- | --- |
| Density | density-1.2.9-cce0fa6475e2474e | 9.0 ms | 9.1 ms | 1.1% | 9 |
| Pendulum Lab | pendulum-lab-1.0.34-a11bcc23b8d1af40 | 8.6 ms | 8.7 ms | 1.2% | 12 |
| CCK DC | circuit-construction-kit-dc-1.5.1-4345ad43e84da17e | 8.7 ms | 8.8 ms | 1.1% | 16 |

Each baseline and monitored session ran ten minutes, sequentially on the same machine in Chromium 148.0.7778.96. All six validity checks passed with no page errors; every monitored stream remained complete. All three satisfy the 10% p95 target. Maximum gaps were 17.6/354.8 ms for Density, 15.1/15.2 ms for Pendulum and 90.9/300.7 ms for Circuit (baseline/monitored). These are frame intervals from one pair per simulation, not direct CPU-cost measurements or worst-case responsiveness guarantees. Cached frame-ended inventory measurements precede collector settlement; settled active counts were 6,193/245/593 at the ends of the three monitored runs. Circuit's workload alternated between 388 after reset and a conducting circuit.

Actual SPARC feedback appeared while the first research write was held, then supporting observations were persisted after release. The iframe survived feedback updates. Reload preserved completed tasks and required explicit physical restart. The ordinary Download UI passed own-history, owned-data and individual-lesson exports with exact matching activity fields, no internal simulation rows and no duplicate activity. The scripted rows include unsuccessful checks, repeated hints, explicit reset, completed adjustments, component transitions, interruption and completion. These counts describe the scripted interactions, not a fixed row count for every learner.

Final local checks passed 56 monitor/history/host/storage contracts plus 19 Download transport/cancellation tests, Linux typecheck/lint and schema generation. A full Meteor run on private detached snapshot `93373fa859b5225e9a49c76273fa06b789321414` passed 1,018 server and 1,249 client tests with zero failures or hook failures; 15/seven were pending. Retained source before/after and pre-existing containers matched. That run precedes the final export listener-cleanup and small contract refinements. Those changes pass the targeted checks; a final full-suite rerun has been requested and awaits fresh one-use authorization under the repository guide. The earlier failed protocol-2 result remains historical below. These results establish local test evidence; publishing the source does not establish deployment qualification.

The browser checks use ordinary owned lessons. Course-assignment launch-context propagation into server-written lifecycle rows is not qualified by this local pilot. CCK's pinned build exposes a blank component label after Reset All; the verifier uses its unique declared native component-edit focus target for Delete. Complete accessibility and physical-state replay are not established.

Current local evidence is in ignored `tmp/phet-pilot/acceptance-summary.json`, `history-acceptance.json`, `history-meteor-first.json`, and per-build probe/performance files. Matching descriptive catalogs are archived with their artifacts and modified shared source. The canonical six-file lesson ZIP and three existing main-admin lessons were updated; lesson IDs, ownership and prior progress were preserved.

## Historical protocol-2 comparisons and full Meteor result (2026-11-11)

The previous protocol-2 builds completed six ten-minute sessions on November 11, 2026, in Chromium 148.0.7778.96 using the same Intel Arc/ANGLE renderer. Each baseline/monitored pair used the same scripted action policy, viewport and launch configuration. Actual action counts were 299/298 for Density, 299/299 for Pendulum and 297/294 for Circuit; action execution time contributes to the two-second loop cadence. All runs passed visibility, elapsed-duration and maximum-gap validity checks, with no page errors. All monitored streams remained complete. The collector, bridge and registration declaration hashes were identical across all three builds.

| Simulation | Baseline p95 frame interval | Monitored p95 frame interval | Additional p95 time | 10% target |
| --- | --- | --- | --- | --- |
| Density | 9.0 ms | 9.0 ms | 0% at recorded precision | Passed |
| Pendulum Lab | 8.6 ms | 8.7 ms | 1.2% | Passed |
| Circuit Construction Kit: DC | 8.7 ms | 8.8 ms | 1.1% | Passed |

This is one local sequential pair per simulation. The comparison isolates collector/rendering with an event-driven local drain; SPARC transport and asynchronous database storage are tested separately. The benchmark installs no per-notification profiling wrappers. Long frames remain: monitored maximum gaps were 447 ms for Density, 18 ms for Pendulum and 317 ms for Circuit (baseline maxima: 188, 13 and 65 ms). Passing the p95 target does not establish worst-case responsiveness or zero CPU cost. Cached inventories showed bounded transient variation, returning to 6,193/245 objects for Density/Pendulum at settlement; Circuit returned to 388 after reset. Frame-ended inventory samples precede collector settlement and include transient objects.

One explicitly authorized full Meteor run used clean committed source `19334b49` (including PhET commit `64cc3edb`) in the isolated 6 GiB/two-CPU Linux worker. It exited 1: 1,009 server cases passed, one timed out, 15 were pending; 1,249 client cases passed, zero failed, seven were pending; zero hook failures. The failing case was `course method authorization / denies assignment edits by teachers who do not own the course`, exceeding its 2,000 ms timeout. Its cause is not established. Retained source before/after matched, cleanup preserved the pre-existing containers, and no success receipt is claimed. A retry requires fresh authorization under the repository guide.

`tmp/phet-pilot/qualification-20261111.json` joins that revision's performance/coverage evidence, the failed Meteor result and the existing recording inventory. `event-history-example.json` contains small examples extracted from the original short-probe traces. Previous timing files are preserved as `performance-before-registration-<timestamp>.json`; they do not qualify the current builds.

Representative native pointer/keyboard controls, reset, and screen navigation passed for all three pilots, with supported-state reconstruction checked after each stage and collector shutdown releasing its active inventory and queues. A separate CCK probe ran 100 component creation/reset cycles for both baseline and monitored builds: none of the 200 tested component/property weak references remained reachable after forced garbage collection in either build. This is a bounded retention probe, not a complete heap or accessibility audit.

The canonical activity package is `C:/dev/mofacts_config/SPARC PhET Pilot.zip`. Detailed authoring, local configuration, research export, and coverage documentation are in the wiki's **PhET Simulation Pilot** page. The simulation server writes the exact public build catalog to ignored `tmp/phet-pilot/settings-fragment.json`; use an isolated local settings file with the canonical Docker watcher. The server verifies artifact hashes and serves only those artifacts on a separate loopback origin. Authentication and learner identity are never passed to the simulation.

For repeatable local browser tests after completing the demonstration lessons, use `upload-local-activities.mjs 'C:/dev/mofacts_config/SPARC PhET Pilot' unique-run-label`. It imports three fresh local fixtures through the ordinary upload UI and writes their IDs to `tmp/phet-pilot/local-activity-ids-unique-run-label.json`. Pass that file to `verify-host.mjs`. This preserves completed tasks and prior history instead of clearing them to rerun a test. The browser verifier reads only the canonical ignored local agent credentials and refuses non-local application URLs. These credentials are for isolated test fixtures. Upload user-facing lessons under the intended author/admin account so they appear in that account's content list.

Keep timing runs sequential and separate from other browser workloads. `verify-disposal.mjs` deliberately forces Chromium garbage collection after repeated circuit creation/removal; it is separate from timing measurements. `verify-interactions.mjs` exercises representative native controls and checks state reconstruction after changes, reset, and screen navigation. Its Pendulum keyboard probe explicitly uses the pinned framework's `?accessibility` launch flag. These probes are narrower than a complete accessibility or heap audit.

Upstream license files, source, and notices are retained in their checkouts. The generated inventory is provenance evidence, not a completed review of all code, assets, or redistribution obligations. There is no distribution bundle or deployment in this milestone's current state.

Research-only coalescing starts a 100 ms window for each pending storage group. Contiguous receipts are combined into bounded storage batches without changing record sequences. Further writes follow completion of the preceding write and receive their own coalescing window, limiting sustained requests to at most ten per second. No timer runs on an idle queue. This storage scheduling never gates SPARC observation delivery.

The shared monitor now uses an explicit version-1 registration contract for properties, emitters and observable collections. Shared framework constructors supply kind, exact notification source, public value reader and collection child handles. Rendering/instrumentation exclusions use registered constructor identities. Private-field lookalikes never gain observed coverage. The declaration in `packages/phet-monitor/registration-contract.d.ts` is identical across the three adapted builds; release manifests record its hash. Framework adapters preserve startup capture, collection identity, disposal and the independent reactive SPARC/research paths. No simulation model is patched and no polling mode is introduced.

Previous protocol-2 verification passed on its three build identities: 43 contracts, full application typecheck/lint, reconstruction and startup checks, zero inspections over 1,000 idle frame callbacks, representative native controls/reset/screen switching, and a 100-cycle CCK retention probe with zero retained references among 200 tested component/property references. Real SPARC feedback preceded held research writes, eventual storage reached the supporting observations, and reload preserved completed tasks. Exact source/build hashes and results are in ignored `tmp/phet-pilot/registration-verification.json`. That revision's ten-minute comparisons and Meteor result are historical above. No deployment was performed. Feedback timing is a diagnostic, not a monitor correctness requirement.
