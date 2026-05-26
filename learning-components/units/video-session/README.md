# Video Session Unit

This package owns the in-repo video-session unit-engine boundary.

## Ownership

- `manifest.ts`: declares the `video` unit type and required runtime capabilities.
- `VideoUnitEngine.ts`: component-owned video unit-engine lifecycle, explicit checkpoint-card selection, and no-op model update behavior.

Video playback UI, Plyr integration, media asset resolution, resume orchestration, adaptive video question mutation, and app-owned Meteor Session state live in `mofacts/` app services. This package receives only the runtime capabilities declared by its manifest.
