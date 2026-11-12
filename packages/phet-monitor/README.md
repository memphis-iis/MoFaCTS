# Shared PhET research monitor

This is active source compiled identically into Density, Pendulum Lab, and Circuit Construction Kit: DC by `tools/phet-pilot/prepare-monitored.mjs`. MoFaCTS imports the pure protocol and lesson modules for validation, reconstruction, and declarative projection.

Monitoring is object-level and event-based. There is no model-step hook, recurring model scan, polling mode, lower sampling cadence, or full-frame reference collector. One initial breadth-first discovery reads each screen model's own data descriptors without invoking getters. Afterward, only a notified property, an explicitly mutated Axon observable collection, a newly discovered object, or an object explicitly carried by an observed event is inspected. Existing descendants are not recursively rescanned. Shared Joist frame-end callbacks settle captured events, reconcile affected identity edges, and emit checkpoints; they do not inspect model values.

The shared hooks are `beginModel`, `model`, `register`, `excludeType`, `collectionChanged`, `emit`, `dispose`, and `frame`. Axon notifications remain ordered and unthrottled. Observable-array hooks capture membership after the backing mutation and before downstream callbacks, including transient insertions/removals. Candidate notifications begin before the first screen-model factory and resolve when their source becomes model-owned. Module-loading events before that boundary are outside coverage. Primitive arguments are captured at notification time; mutable reference arguments before discovery resolve later and do not establish their earlier field values.

## Registration and notification contract

The shared declaration is `registration-contract.d.ts`. Each framework-owned observable registers before it can become model-owned:

```javascript
monitor.register(property, {
  version: 1,
  kind: 'property',
  source: notificationSource,
  read: property.get.bind(property)
});
monitor.register(emitter, { version: 1, kind: 'emitter', source: notificationSource });
monitor.register(collection, {
  version: 1, kind: 'collection', members: backingArray,
  children: () => ({ lengthProperty, elementAddedEmitter, elementRemovedEmitter })
});
```

Only explicit registrations grant notification coverage. `source` maps an internal emission object to its logical public owner, so property and wrapper emitters are recorded once. TinyProperty refines its base TinyEmitter registration during construction. Conflicting sources, invalid versions, duplicate or late registration, and notifications from unregistered sources fail explicitly. Registration itself does not make an object model-owned or keep it in the active catalog.

The collector does not recognize objects by `_value`, `listeners`, `tinyProperty`, `changedEmitter`, `tinyEmitter`, or rendering-field lookalikes. The framework supplies public value readers, exact notification-source identities, collection membership, optional Tandem names, and explicitly exposed child handles. Value readers run during discovery or that property's notification, never from idle frames. Ordinary model objects retain descriptor-based initial inventories and remain unsupported for continuous silent writes.

Rendering, Screen, Sim, and Tandem exclusions use explicitly registered constructor identities, including subclasses. There is no private-field exclusion heuristic. Axon/Joist/Scenery/Tandem adapters are maintained by framework generation, with no simulation-model patches. Preparation validates every transformation before writing source; each build records the declaration hash and registration version. Upstream source hooks remain a deliberate maintained extension, not a promise of compatibility with arbitrary framework versions.

Shared Sun/Scenery controls use `registerInteraction(control, { version: 1, kind: 'value', property })` or `kind: 'reset'`, followed by `interaction(control, 'start' | 'complete' | 'cancel', { trusted, modality })`. Controls remain opaque identities and never become model-discovery roots. Native DOM trust establishes input provenance; callbacks without a verified input event remain observations. Identical shared registrations are idempotent; conflicting registrations fail.

`linkInteractionProperties(owner, element)` accepts the framework's explicit public `addLinkedElement` property relation. This associates a control adapter with its scientific model property while preserving model units. It does not infer relationships from field names or convert units itself. The collector follows only declared property links at interaction boundaries, with cycle detection and weak references; disposed properties are excluded. The pilot browser must support `WeakRef`. Reset markers suppress reset-induced component-removal activity; raw notifications remain intact.

## Meaningful activity and ordinary history

Protocol 3 adds ordered `interaction` records to the independent bridge. `activity.ts` projects selected bindings over reconstructed trace state, emitting completed/cancelled interactions, explicit reset, collection membership changes and settled observation facts. No model reads or polling are introduced. Transient collection changes retain object IDs even if added and removed before one checkpoint. Ordinary physics notifications may drive authored conditions without generating a learner-history row.

Stimulus production rules may use one `history-event` effect per rule, with `selection`, `action`, `input`, optional `outcome` (default `unknown`), optional expression-valued `values`, and optional `endsAttempt`. It writes semantic fields through the existing canonical history boundary. It does not award credit, classify answers, or update KCs; those remain separate authored effects. A completed control interaction is an input only when the framework supplies trusted input provenance. Property changes and component topology alone remain observations.

The normal Download TSV includes a bounded, lossless `CF (Simulation Activity)` JSON column containing build/attempt/source-event identity, origin, selected values with labels/units and evidence sequences. Internal simulation state/trace rows are retained for SPARC replay and excluded from this export. Other units and historical records retain their existing export behavior. Raw catalogs, initial object inventories and detailed notifications stay in the separate research collection.

Build descriptions live in a hash-verified catalog asset, without attempt values or IDs. Stimuli own bindings and instructional meaning. Initial selected values and dynamic object IDs belong to attempt metadata/research traces. Lifecycle history records Start, interruption and monitoring failure with stable retry identities. Completion is an authored history effect after successful persistence. Reload starts no simulation automatically; host actions referring to prior evidence explicitly carry `last-recorded-state-after-reload` and do not claim restored physical state. The pilot associates general host buttons only when one simulation node is present; multiple simulation nodes need explicit authored association before this convenience can be extended.

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

`onRecords` pushes availability to the bridge. The first notification schedules a flush in the next event-loop task after the current notification transaction; idle streams have no recurring timer. Each batch contains at most 4,000 records and 1 MiB of UTF-8 JSON. An outstanding immutable batch has a one-second delivery retry and a ten-second acknowledgment deadline. Readiness and active host processing also have one-shot deadlines; a ready idle simulation needs no heartbeat. These deadlines never inspect model state.

Protocol version 2 gives ACK an explicit browser-receipt meaning. The host validates and reconstructs ordered state, retains the accepted batch in its bounded 32 MiB queue, acknowledges receipt, and dispatches settled facts through the existing SPARC rule path. An independent ordered writer saves research batches. Its database calls never gate observations. Duplicate retries cannot repeat instructional effects.

Research writes retain sequence/evidence identifiers, have a ten-second request deadline, and release queue ownership only after storage. Overflow, failed writes, or incomplete storage stop further dependent instruction and mark the attempt incomplete. Earlier instructional decisions remain in history with their attempt/sequence references; their raw evidence may not yet be durable. Exports must interpret those references with the research attempt status. Normal departure drains accepted writes before closing the attempt; abrupt browser termination can lose unpersisted records, and restart explicitly interrupts the old attempt. There is no durable offline outbox or claim of crash-proof persistence.

Origin, source window, protocol version, build identity, session, sequence, ordering, exact acknowledgments, and authenticated durable ingestion remain mandatory. Missing required bindings, gaps, conflicting retries, overflow, oversized records, or transport failure mark evidence incomplete and stop dependent instruction. The collector never changes model values or listener behavior.

Run `node --test packages/phet-monitor/*.test.mjs mofacts/scripts/simulationResearch.test.cjs`. Browser probes and exact build identities are documented in the [pilot tools](../../tools/phet-pilot/README.md). Successful reconstruction covers recorded state only, not silent mutable state or full physical replay.

Research-only coalescing starts a 100 ms window for each pending storage group. Contiguous receipts are combined into bounded storage batches without changing record sequences. Further writes follow completion of the preceding write and receive their own coalescing window, limiting sustained requests to at most ten per second. No timer runs on an idle queue. This storage scheduling never gates SPARC observation delivery.
