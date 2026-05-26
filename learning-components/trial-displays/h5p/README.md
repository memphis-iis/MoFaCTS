# H5P Trial Display Component

This package owns the H5P trial-display adapter boundary. It does not own H5P package upload, storage, serving, persistence, or routing.

Component-owned responsibilities:

- Identify displays that are handled by H5P.
- Normalize H5P display configuration before trial rendering/history use.
- Normalize H5P trial result payloads for app-owned history/model paths.
- Declare required runtime capabilities through `h5pTrialDisplayComponentManifest`.

App-owned responsibilities:

- H5P package import and validation.
- H5P content/library storage and asset serving.
- Server methods, authorization enforcement, and persistence.
- History row writing and model update orchestration.

The component must fail clearly when required H5P display/result data is invalid. It must not substitute local storage, history writing, or server calls when those app-owned capabilities are unavailable.
