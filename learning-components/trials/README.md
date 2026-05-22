# Trials

Target home for trial-type contracts and trial interaction implementations.

Current status: planned contributor extension boundary. Existing trial UI and service code remains under `mofacts/client/views/experiment/` until each trial type is deliberately extracted.

Belongs here:

- The `TrialType` contract.
- Trial type registry and factories.
- Standard drill, study, test, multiple-choice, H5P, video-prompt, and simulation trial behavior.

Does not belong here:

- App shell UI or route-level screens.
- Unit-level scheduling or adaptive selection.
- Server persistence APIs.

Trial types should expose clear contracts so contributors can add interactions without learning the whole Meteor app first.
