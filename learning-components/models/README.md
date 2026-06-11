# Models

Target home for adaptive model contracts and reusable model primitives.

Current status: shared adaptive-model boundary. The reusable logistic/adaptive model primitives live under `learning-components/models/adaptive-logistic/` and are shared by unit components through explicit unit-owned wrappers.

Belongs here:

- Shared model state interfaces and factories.
- Shared probability functions and calculation.
- Shared selection policies.
- Stable model-policy contracts.
- Shared model-practice update application helpers that consume canonical practice requests without depending on a particular unit such as Learning Session or SPARC.
- Live model-state query helpers for metrics such as probability that cannot be reconstructed from history alone.

Does not belong here:

- Trial rendering.
- App persistence and server methods.
- TDF parsing that is not model-specific.
- Canonical learner history recording, persistence, accepted fields, or reconstruction. Those are app/runtime responsibilities.
- Unit-specific session lifecycle, layout, rendering, or authored-content interpretation files that a contributor would edit as part of one unit component.

This directory should make the adaptive sequencing behavior inspectable and testable for research contributors.
