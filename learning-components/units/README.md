# Units

Target home for unit engines and unit-level orchestration.

Current status: active executable source. The legacy app path `mofacts/client/views/experiment/unitEngine.ts` is now a Meteor-facing compatibility facade that supplies app dependencies and delegates unit-engine construction here.

Belongs here:

- The `UnitEngine` contract.
- Unit engine registry and factory code.
- Instruction, learning-session, assessment-session, and video-session engines.
- Shared card preparation and unit progression logic.

Does not belong here:

- App routing, subscriptions, or server methods.
- Probability formulas and selection policy internals; those belong under `learning-components/models/`.
- TDF parsing that is reusable beyond units; that belongs under `learning-components/content/`.

Use deliberate, behavior-preserving import facades when moving code from legacy paths. Do not create alternate implementations, recovery paths, or duplicated legacy behavior.
