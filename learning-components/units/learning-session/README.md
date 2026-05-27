# Learning Session Unit

This package owns the in-repo model learning-session unit engine.

## Ownership

- `LearningSessionUnitEngine.ts`: component-owned unit-engine behavior and model engine integration.
- `learningSessionRuntimeConfig.ts`: authored learning/video session runtime config selection for model-style behavior, including unit mode and probability-function source resolution.
- `learningSessionModelPreparation.ts`: cluster-list setup and probability preparation for the model engine.
- `learningSessionSelection.ts`, `prefetchAndLocking.ts`, and `cardCommit.ts`: card selection, prefetch/lock, and prepared-card commit behavior.

App-owned Meteor Session, routing, persistence, authorization, and server-method capabilities are passed in through the manifest dependency adapter rather than read directly by the package. The manifest names its server-method dependencies explicitly: `getLearningHistoryForUnit` and `getResponseKCMapForTdf`.
