# Assessment Session Unit

This package owns the in-repo assessment schedule unit engine.

## Ownership

- `manifest.ts`: declares the `schedule` unit type and required runtime capabilities.
- `AssessmentUnitEngine.ts`: component-owned schedule engine lifecycle and schedule cursor behavior.
- `assessmentSettings.ts` and `createAssessmentSchedule.ts`: authored assessment-session settings parsing and schedule construction.
- `__fixtures__/`: package-owned assessment schedule fixtures used by compatibility tests.

App-owned Meteor Session, persistence, learner state, UI alerts, routing, and authorization stay outside this package and enter through the manifest dependency adapter. This unit does not declare `server-methods`; schedule persistence is owned by the `assessment-state` capability. Missing runtime capabilities must fail during component registration rather than being recovered from globals.
