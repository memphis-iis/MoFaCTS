# Shared PhET research monitor

This is active source compiled identically into Density, Pendulum Lab, and Circuit Construction Kit: DC by `tools/phet-pilot/prepare-monitored.mjs`. MoFaCTS imports the pure protocol and lesson modules for validation, reconstruction, and declarative projection.

Monitoring is object-level and event-based. There is no model-step hook, recurring model scan, polling mode, lower sampling cadence, or full-frame reference collector. One initial breadth-first discovery reads each screen model's own data descriptors without invoking getters. Afterward, only a notified property, an explicitly mutated Axon observable collection, a newly discovered object, or an object explicitly carried by an observed event is inspected. Existing descendants are not recursively rescanned. Shared Joist frame-end callbacks settle captured events, reconcile affected identity edges, and emit checkpoints; they do not inspect model values.

The shared hooks are `beginModel`, `model`, `registerCollection`, `collectionChanged`, `emit`, `dispose`, and `frame`. Axon notifications remain ordered and unthrottled. Observable-array hooks capture membership after the backing mutation and before downstream callbacks, including transient insertions/removals. Candidate notifications begin before the first screen-model factory and resolve when their source becomes model-owned. Module-loading events before that boundary are outside coverage. Primitive arguments are captured at notification time; mutable reference arguments before discovery resolve later and do not establish their earlier field values.

## Coverage contract

| Data | Continuous coverage |
| --- | --- |
| Axon property notifications | Observed, including intermediate scalar values |
| Axon emitter notifications | Observed, without duplicate internal-property emitter records |
| Axon ObservableArray API mutations | Observed collection membership, length, and stable object IDs |
| Plain fields, ordinary arrays/maps/sets, typed-array physics buffers | Initial inventory only; silent mutations unsupported |
| Vector/matrix coordinates | Event-point snapshot if explicitly carried by an event; direct writes unsupported |
| Accessors, closures, browser/rendering objects, unknown internal state | Unsupported; getters are never invoked |
| Direct backing-array writes or defineProperty bypassing Axon's mutation API | Unsupported |

Catalog records explicitly distinguish `observed` from `unsupported`; initial records include field-level coverage. A `sample` is an event-point object snapshot with a trigger, never a periodic physics sample. Initial-only values cannot satisfy required lesson bindings. A binding through a collection member must end at an observed property. Educational meaning remains authored content.

Session IDs identify objects. Paths are labeled `discovery-address`: the first structural address at discovery, not a live array position after reordering. Dynamic components must be followed through collection references and IDs. Supplied Tandem names remain separate descriptive addresses. Disposal and detachment are distinct. Affected-subgraph trial deletion releases retired cycles while preserving aliases; it uses cached ID edges, not model rescans. Silent membership changes in an ordinary array cannot establish removal and remain unsupported.

The pinned browser inventories identify concrete examples:

| Pilot | Fields without continuous change coverage |
| --- | --- |
| Density | `screens.1.model.engine.world.time`, `lastTimeStep`, rigid-body `position`/`velocity` buffers and direct body angles |
| Pendulum Lab | Silent writes to `positionProperty.value.x/y` and ordinary `pendula` array membership; the angle and length property notifications themselves are observed |
| CCK DC | `circuit.groupFormationCounter`, `disconnecting`, and `chargeAnimator.timeScaleRunningAverage` fields such as `sampleIndex`, `total`, `numSamples`, and `samples` |

Full path/reason inventories are generated in each build's `monitor-probe.json`. A parent field holding a property reference is initial-only for *replacement of that reference*; this does not make the referenced property's notifications unsupported. Event-carried vector snapshots do not establish coverage of silent coordinate writes between events.

## Transport and integrity

`onRecords` pushes availability to the bridge. The first notification schedules one 100 ms flush; idle streams have no recurring timer. Each batch contains at most 4,000 records and 1 MiB of UTF-8 JSON. An outstanding immutable batch has a one-second delivery retry and a ten-second acknowledgment deadline. Readiness and active host processing also have one-shot deadlines; a ready idle simulation needs no heartbeat. These deadlines never inspect model state.

Origin, source window, protocol version, build identity, session, sequence, ordering, exact acknowledgments, and authenticated durable ingestion remain mandatory. Missing required bindings, gaps, conflicting retries, overflow, oversized records, or transport failure mark evidence incomplete and stop dependent instruction. The collector never changes model values or listener behavior.

Run `node --test packages/phet-monitor/*.test.mjs mofacts/scripts/simulationResearch.test.cjs`. Browser probes and exact build identities are documented in the [pilot tools](../../tools/phet-pilot/README.md). Successful reconstruction covers recorded state only, not silent mutable state or full physical replay.
