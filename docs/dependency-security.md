# Dependency Security Notes

This page records current dependency-audit decisions that are not obvious from
`package.json` or lockfile diffs alone.

## Accepted Residuals

### `meteor-node-stubs` bundled `qs`

`mofacts/package.json` overrides top-level `qs` to a fixed release, but
`meteor-node-stubs@1.2.27` bundles its own `url` dependency and nested
`qs@6.14.2` copy. npm overrides do not replace that bundled package.

The remaining `npm audit --omit=dev` finding for `qs` is accepted until one of
these durable fixes is available:

- `meteor-node-stubs` publishes a release with a fixed bundled `qs`.
- MoFaCTS replaces the dependency path that requires `meteor-node-stubs`.
- MoFaCTS deliberately vendors or forks `meteor-node-stubs` with a fixed bundled
  dependency set.

Do not add a local silent fallback or ad hoc lockfile-only edit for this finding.
