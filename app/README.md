# App

This directory is the target home for the stable MoFaCTS application shell.

Current status: architectural scaffold. The running Meteor application still lives under `mofacts/` until the build-system bridgework is completed.

Belongs here:

- Meteor application shell and startup wiring.
- Routing and app-level runtime glue.
- Learner, authoring, admin, and shared UI surfaces.
- Data access boundaries, publications, server methods, schemas, logging, and migrations.

Does not belong here:

- Contributor-facing learning-system extension code such as unit engines, trial types, adaptive models, TDF interpretation, or H5P adapters. Those belong under `learning-components/`.
- Deployment operations. Those belong under `deploy/`.

Before moving executable code here, update TypeScript, Meteor/Rspack, Docker, lint, and test configuration so this directory is a first-class source root.
