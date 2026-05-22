# Learning Component Tests

Target home for tests around contributor-facing learning component boundaries.

Current status: architectural scaffold. The active test configuration must be updated before tests here are expected to run automatically.

Belongs here:

- Unit engine boundary tests.
- Trial type contract tests.
- Probability and selection policy tests.
- TDF interpretation tests.
- Adapter contract tests.

Does not belong here:

- App shell integration tests.
- Deployment smoke tests.
- Fixtures that are shared across test areas.

As executable code moves into `learning-components/`, add tests here around behavior and contracts rather than only file-level implementation details.
