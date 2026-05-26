# Adapters

Target home for external learning-component adapters.

Current status: planned external-widget boundary. The first H5P trial-display adapter now lives under `learning-components/trial-displays/h5p/`; app-owned H5P storage, upload, routing, publications, and persistence remain in `mofacts/`.

Belongs here:

- H5P adapter boundaries.
- xAPI adapter boundaries.
- External-widget adapter boundaries.

Does not belong here:

- Generic trial registry logic.
- Application persistence APIs.
- App-level upload and administration screens.

Adapters should translate external component behavior into MoFaCTS learning-component contracts.
