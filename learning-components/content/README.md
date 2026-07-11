# Content

Target home for learning-content interpretation.

Current status: shared content-interpretation source. TDF cluster-list parsing and response normalization live here as first-class learning-component code.

Belongs here:

- TDF parsing and session-structure interpretation.
- Stimulus and response access.
- Display transformations.
- Media semantics.
- Response normalization.
- Response assessment policy and authored branched/alternative/regex semantics.

Does not belong here:

- App upload workflows or database persistence.
- Unit orchestration.
- Adaptive selection internals.

Content code should define what lesson data means, not how the application stores or routes it.

`response-assessment/responseAssessment.ts` is the pure learner-response contract. Callers must pass the current authored answer set and matching policy explicitly; localized feedback text remains an application projection. `tdf/runtimeStimulusInterpretation.ts` owns nested stimulus interpretation, and `tdf/clusterMapping.ts` owns shuffle/swap mapping semantics, while the Meteor adapter supplies current Session values and canonical TDF lookup.
