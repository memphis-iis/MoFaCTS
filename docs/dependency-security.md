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

The current source baseline is Meteor `3.5.4`, Node `24.22.1` and npm
`11.19.1`. Node's bundled Undici is `7.30.1`, which fixes
[`GHSA-xjj6-f33q-929c`](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)
in server `fetch()`. An npm override does not replace that built-in copy:
verify `process.versions.undici` as well as the ordinary dependency tree.
The builder and final image assert the supported runtime versions. These are
source and verification contracts, not a claim about the deployed image.

### Historical audit snapshot

On 2026-10-08, compatible updates to Knip, lint-staged, and other existing
dependencies reduced the application's full-tree audit from 33 to 25 findings:
8 high, 10 moderate, and 7 low. Its production subset has 7 moderate findings
and no high/critical findings. The Mongo sidecar lockfile has no findings after
updating its SDK and affected transitive dependencies.

The high development findings in that snapshot were under the pinned Rspack 1.7.12
toolchain: `@rspack/dev-server`, `webpack-dev-server`, `chokidar`,
`http-proxy-middleware`, `micromatch`, `braces`, `selfsigned`, and `node-forge`.
The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
list no patched releases. Do not force Rspack 2 or incompatible transitive
majors into this pinned toolchain to change an audit result. A toolchain upgrade
needs its own Meteor build, browser, and watcher qualification.

That audit snapshot also included bundled `pbkdf2` and the `sprintf-js` paths
used by TensorFlow/WebGazer and Remarkable/Deep Chat. Those historical counts
are not a current dependency audit or evidence of deployed runtime exposure.

## Bundled browser dependencies

The supported upstream `meteor-node-stubs` package owns its browser Node shims
and bundled dependencies. The published
[`meteor-node-stubs@1.2.32` archive](https://registry.npmjs.org/meteor-node-stubs/-/meteor-node-stubs-1.2.32.tgz)
was reviewed and includes `pbkdf2@3.1.7` and `qs@6.16.1`. The application pins
that upstream release instead of replacing files inside its installed package.

The superseded postinstall `qs` rewrite and its dedicated fixture were removed;
they targeted `meteor-node-stubs@1.2.29` and would replace the newer upstream
`qs` with an older reviewed version. Asset-preparation postinstall steps and
the other dependency security gates remain independent.

npm overrides govern ordinary resolved dependencies, but do not establish that
packages already bundled in a published archive were replaced. For future
bundled fixes, update the supported upstream package and inspect both its
published contents and the installed tree. Keep browser inclusion and actual
runtime reachability separate from a package's dependency classification.
