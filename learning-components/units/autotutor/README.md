# AutoTutor Unit Component

This package owns the AutoTutor unit registration boundary for the `autotutor` unit type.

Component-owned:

- Unit-type declaration and manifest registration.
- The unit-engine extension registered for `autotutor`.
- Typed runtime capability contracts in `AutoTutorRuntimeCapabilities.ts`.
- Explicit completion/end-state semantics in `AutoTutorEndState.ts`.
- AutoTutor planning, scoring, and response contract helpers in shared common code.

App-owned for the current milestone:

- Svelte chat shell and browser OpenRouter calls.
- Meteor session wiring, route flow, and card lifecycle integration.
- History persistence and server methods.
- Authoring, upload, encryption, and configuration repository sync.

Current manifest requirements:

- `session`
- `stimuli`
- `server-methods`
- `history`
- `logging`

Future extraction should wire app-owned dependencies through these typed capabilities before moving them into this package. Missing capabilities must fail clearly during manifest registration rather than being inferred from global app state.
