# Learning Session Unit

This package owns the learning-session unit wrapper and authored runtime config.
The reusable adaptive/logistic model engine lives in `../../models/adaptive-logistic/`
so other unit types can use the same model code without depending on the
learning-session unit.

## Ownership

- `LearningSessionUnitEngine.ts`: thin unit wrapper that supplies learning-session
  type/config resolvers to the shared adaptive/logistic engine.
- `learningSessionRuntimeConfig.ts`: authored learning/video session runtime config selection for model-style behavior, including unit mode and probability-function source resolution.

App-owned Meteor Session, routing, persistence, authorization, and server-method capabilities are passed in through the manifest dependency adapter rather than read directly by the package. The manifest names its server-method dependencies explicitly: `getLearningHistoryForUnit` and `getResponseKCMapForTdf`.
