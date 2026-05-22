# Learning Component Runtime

Target home for runtime contracts used by learning components.

Current status: active migration source for learning-component runtime contracts. Keep this layer small: it defines explicit dependencies for learning components and thin adapters used during migration.

Belongs here:

- `LearningComponentContext` and related interfaces.
- Learning component manifests.
- Component-level runtime events.

Does not belong here:

- App-owned persistence, routing, startup, publications, or collections.
- App routing, startup, publications, or collections.

Runtime contracts should make dependencies explicit so learning components do not reach directly into Meteor `Session`, app globals, or unrelated helpers. During migration, a Meteor-backed adapter may exist here only as a bridge while the app/runtime tree is not yet executable.
