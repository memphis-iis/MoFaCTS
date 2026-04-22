# Schema Generator Status

This folder contains legacy manual tooling for generating the editor schema files:

- `../../public/tdfSchema.json`
- `../../public/stimSchema.json`

Current project behavior:

- The MoFaCTS app serves the committed schema JSON files from `public/`.
- The editor UI consumes those checked-in files at runtime.
- Schema regeneration is not part of normal app startup, CI, or Docker image builds.

Maintenance status:

- `@jsonhero/schema-infer` has been removed from the main app install path because it produced stale engine warnings during `npm ci` and is not required for normal runtime/build workflows.
- The legacy generator scripts in this folder and `../generateTdfSchema.js` are retained for reference, but they are not part of the supported Node 22 app toolchain.
- If schema regeneration becomes necessary again, replace this tooling with a maintained generator or isolate it in a dedicated tooling package/environment instead of restoring it to the main app dependencies.
