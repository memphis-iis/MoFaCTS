# Trial Display Components

Trial display components own interactive display adapters that can normalize display configuration and learner results without becoming unit engines.

Belongs here:

- Display adapter manifests for H5P-style interactive content.
- Display ownership checks such as "this trial is handled by H5P".
- Display/result normalization that feeds app-owned history and model-update paths.
- Bounded display/result payload contracts that the app can place into the shared canonical history envelope without exceeding per-extension telemetry budgets.

Does not belong here:

- App routing, persistence, server methods, package upload, or asset serving.
- Unit/session scheduling logic.
- Direct server calls or history writes.
- Recovery paths that hide missing display capabilities.

New display components should export a `LearningComponentManifest` and register through `TrialDisplayAdapterRegistry`. Required capabilities must be declared in the manifest and validated during bootstrap.
