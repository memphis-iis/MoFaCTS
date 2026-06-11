# Learning Component Runtime

Target home for runtime contracts used by learning components.

Current status: learning-component runtime contract source. Keep this layer small: it defines explicit dependencies for learning components and thin adapters used while legacy app paths delegate into `learning-components/`.

Belongs here:

- `LearningComponentContext` and related interfaces.
- Typed runtime capability bags and helpers that project those dependencies into manifest capability names.
- Learning component manifests.
- Component-level runtime events.
- Trial-display adapters that declare interaction ownership and normalization contracts.
- The canonical history envelope contract in `historyEnvelope.ts`; app/common code may re-export it, but learning components should import the runtime-owned contract directly.
- Generic model-practice update contracts in `modelPracticeUpdates.ts`; SPARC, flashcards, and future components should use this shared path when they need canonical `levelUnitType: "model"` history rows.
- Generic model-practice history exchange in `modelPracticeHistoryExchange.ts`; SPARC, flashcards, and future components should read shared `levelUnitType: "model"` rows through this API before applying component-specific extension fields. Existing flashcard practice history-log rows with the shared model identity fields are model-practice-readable rows, not a separate legacy format for SPARC to ignore.
- Shared model-practice state queries in `modelPracticeStateQueries.ts`, including the exported `MODEL_PRACTICE_METRICS` vocabulary that SPARC conditions and other component model queries should reuse instead of redefining locally.
- The adaptive-model runtime contract in `modelPracticeRuntime.ts`; hosts provide this capability to apply a generic model-practice update request and answer live model-state queries without exposing Learning Session or SPARC internals.
- The transitional `adaptive-card-model` unit capability names the older adaptive-logistic card-selection surface used by Learning Session and SPARC while SPARC is still borrowing that shared model engine. Do not treat it as the long-term SPARC document-engine boundary.
- Explicit runtime capabilities for unit-engine state surfaces. Components that still need card-position state must declare `card-state` so that coupling is visible at the manifest boundary instead of hidden inside unit factories.
- History runtime contracts such as `HistoryRuntime.writeCanonicalHistory`, which require components to emit the shared app history envelope instead of calling persistence directly. The app stamps and validates `historySchemaVersion`, total wire size, and known extension-field size on that envelope before persistence.
- Named server-method requirements on manifests. A component that needs `server-methods` must declare the specific method names it expects instead of relying on an undocumented generic call pipe.
- Adapter-context helpers that project app-supplied functions into component contracts without naming a specific host runtime.

Does not belong here:

- App-owned persistence, routing, startup, publications, or collections.
- Server method calls or direct history collection writes from component code.

Runtime contracts should make dependencies explicit so learning components do not reach directly into Meteor `Session`, app globals, or unrelated helpers. App runtime code may supply adapters from Meteor-backed services, but component-owned runtime contracts should stay host-runtime neutral.

The canonical history schema, stable event-type vocabulary, and migration rule are documented in `docs/history-envelope.md`.
The manifest/runtime contract for component authors is documented in `docs/learning-component-contracts.md`.
