# Packages

Target home for stable public APIs and future independently versioned MoFaCTS modules.

Current status: architectural scaffold. The active Meteor packages still live under `mofacts/packages/`.

Belongs here:

- Public contracts for unit engines, trial types, model policies, and content adapters.
- Shared package metadata when an API becomes stable enough to version independently.

Does not belong here:

- Application-specific Meteor packages that are not stable public extension APIs.
- Experimental examples. Put those under `examples/`.

Before executable package code is moved here, wire root-level package discovery, TypeScript, lint, and tests deliberately.
