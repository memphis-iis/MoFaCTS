# Learning Component Runtime

Target home for runtime contracts used by learning components.

Current status: learning-component runtime contract source. Keep this layer small: it defines explicit dependencies for learning components and thin adapters used while legacy app paths delegate into `learning-components/`.

Belongs here:

- `LearningComponentContext` and related interfaces.
- Learning component manifests.
- Component-level runtime events.
- Trial-display adapters that declare interaction ownership and normalization contracts.

Does not belong here:

- App-owned persistence, routing, startup, publications, or collections.
- App routing, startup, publications, or collections.

Runtime contracts should make dependencies explicit so learning components do not reach directly into Meteor `Session`, app globals, or unrelated helpers. During migration, a Meteor-backed adapter may exist here only as a bridge while the app/runtime tree is not yet executable.
