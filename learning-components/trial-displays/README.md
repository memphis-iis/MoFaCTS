# Trial Display Components

Trial display components own interactive display adapters that can normalize display configuration and learner results without becoming unit engines.

Belongs here:

- Display adapter manifests for H5P-style interactive content.
- Display ownership checks such as "this trial is handled by H5P".
- Display/result normalization that feeds app-owned history and model-update paths.

Does not belong here:

- App routing, persistence, server methods, package upload, or asset serving.
- Unit/session scheduling logic.
- Recovery paths that hide missing display capabilities.

New display components should export a `LearningComponentManifest` and register through `TrialDisplayAdapterRegistry`. Required capabilities must be declared in the manifest and validated during bootstrap.
