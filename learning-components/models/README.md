# Models

Target home for adaptive model state, probability calculation, selection policies, history reconstruction, and answer updates.

Current status: active migration source. Probability calculation, selection policies, model-state initialization, answer updates, practice-time updates, and model-specific resume restoration are being extracted here from the learning-session unit flow.

Belongs here:

- Model state interfaces and factories.
- Probability functions and calculation.
- Selection policies.
- Model-specific resume-state restoration from app-owned reconstructed history.
- Answer and practice-time updates.

Does not belong here:

- Trial rendering.
- App persistence and server methods.
- TDF parsing that is not model-specific.
- Canonical learner history recording, persistence, accepted fields, or reconstruction. Those are app/runtime responsibilities.

This directory should make the adaptive sequencing behavior inspectable and testable for research contributors.
