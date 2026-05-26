# Sample Echo Unit Component

This sample is a package-shape fixture for learning component modularity. It is not registered in the default MoFaCTS catalog and does not add runtime behavior.

The package demonstrates the minimum in-repo component shape:

- `EchoUnitEngine.ts`: unit implementation.
- `manifest.ts`: `LearningComponentManifest` that declares the unit type and required capabilities.
- `fixtures.ts`: test dependencies for registry and creation tests.

Use this as the reference layout before adding production components such as deeper AutoTutor units or additional H5P-style displays.
