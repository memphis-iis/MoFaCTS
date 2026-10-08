# Dependency Security Notes

This page records current dependency-audit decisions that are not obvious from
`package.json` or lockfile diffs alone.

## CI dependency gates

The Security workflow runs source/scanner contracts, secret scanning, and the
application and Mongo sidecar dependency audits independently. A failure in the
application audit cannot skip the sidecar audit.

Each dependency job captures both the full lockfile audit and the production
audit (`--omit=dev`). `check-ci-dependencies.mjs` validates both reports and
blocks high/critical production findings. Development-only advisories remain
visible as maintenance information. A specifically reviewed build or CI
exploitation path in `development-dependency-exposure.json` also blocks, using
the same classification policy as the repository security scanner. Missing or
malformed audit output, registry errors, and invalid exposure policy fail the job.

Moderate/low production findings remain visible; the blocking threshold stays
high. A passing dependency job does not mean the full tree has no advisories,
nor does it establish deployed-image security. The Docker build separately
audits its installed server bundle at the high threshold.

## Current maintenance findings

On 2026-10-08, compatible updates to Knip, lint-staged, and other existing
dependencies reduced the application's full-tree audit from 33 to 25 findings:
8 high, 10 moderate, and 7 low. Its production subset has 7 moderate findings
and no high/critical findings. The Mongo sidecar lockfile has no findings after
updating its SDK and affected transitive dependencies.

The remaining high development findings are under the pinned Rspack 1.7.12
toolchain: `@rspack/dev-server`, `webpack-dev-server`, `chokidar`,
`http-proxy-middleware`, `micromatch`, `braces`, `selfsigned`, and `node-forge`.
The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
list no patched releases. Do not force Rspack 2 or incompatible transitive
majors into this pinned toolchain to change an audit result. A toolchain upgrade
needs its own Meteor build, browser, and watcher qualification.

The remaining production findings concern bundled `pbkdf2` and the
`sprintf-js` paths used by TensorFlow/WebGazer and Remarkable/Deep Chat. npm
overrides do not replace packages bundled inside `meteor-node-stubs`.
`scripts/hardenBundledDependencies.cjs` already owns the reviewed replacement
of its bundled `qs`; that older `qs` finding is no longer an accepted residual.
Further bundled replacements require dependency and browser-runtime review.
