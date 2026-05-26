# Instruction Unit

This package owns the in-repo instruction-only unit-engine boundary.

## Ownership

- `manifest.ts`: declares the `instruction-only` unit type and required runtime capabilities.
- `InstructionUnitEngine.ts`: component-owned no-card unit-engine behavior for authored instruction-only units.

Instruction page routing, launch state, progress persistence, and DOM rendering remain app-owned in `mofacts/`. This package intentionally exposes only the minimal unit-engine behavior needed by the registry.
