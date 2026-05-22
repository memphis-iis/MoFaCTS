# Models

Target home for adaptive model contracts and reusable model primitives.

Current status: shared-boundary scaffold. The current learning-session LKT/logistic model implementation lives with its owning component under `learning-components/units/learning-session/model/`. Move code here only when it is intentionally shared across units/components or promoted into a stable model API.

Belongs here:

- Shared model state interfaces and factories.
- Shared probability functions and calculation.
- Shared selection policies.
- Stable model-policy contracts.

Does not belong here:

- Trial rendering.
- App persistence and server methods.
- TDF parsing that is not model-specific.
- Canonical learner history recording, persistence, accepted fields, or reconstruction. Those are app/runtime responsibilities.
- Unit-specific LKT/logistic implementation files that a contributor would edit as part of one unit component.

This directory should make the adaptive sequencing behavior inspectable and testable for research contributors.
