# App Runtime

Target home for MoFaCTS application runtime glue.

Current status: architectural target plus app-owned boundary documentation. Some canonical runtime/history implementation still lives under `mofacts/` while root `app/` is not yet an executable source root.

Belongs here:

- Meteor-backed runtime context implementations.
- Application configuration readers.
- Session-key and runtime-event boundaries used by the app shell.
- Canonical learner history recorder contracts and app-owned history normalization/reconstruction boundaries.

Does not belong here:

- Learning component contracts that should be portable outside Meteor.
- Model, selection, probability, or trial-type logic.

Learning components should depend on explicit context interfaces rather than reaching directly into this app runtime layer.

History ownership note:

Learner history is a stable app/runtime contract. Learning components emit history event data through the recorder and may provide component-specific payload fields, but they do not redefine the recorder or own history persistence.
