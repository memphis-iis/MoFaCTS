# Pinned Meteor Rspack override

This directory is a source copy, with whitespace-only normalization, of Meteor pull request
[#14562](https://github.com/meteor/meteor/pull/14562) at commit
`fa20c29abb4ae30fe78facab2819ce4f5c99e588`.

It temporarily replaces the stable Atmosphere `rspack@1.1.0` package. That
package drops the compiled Blaze client bundle during `meteor test` and can
therefore report a false-green zero-test client phase
([Meteor issue #14561](https://github.com/meteor/meteor/issues/14561)). The
pinned upstream fix serves and injects the client Rspack bundle in test,
build, and production modes while retaining the existing development path.

The application remains on stable Meteor 3.5. No Meteor beta and no generated
build/cache patch is used.

## Client output boundary

The 2026-08-02 Linux qualification proved that this upstream correction loads
the client bundle and executes tests, but it is not complete with stable
`@meteorjs/rspack@2.0.1`. That npm package emits the web bundle with
`libraryTarget: "commonjs2"`; direct browser injection reaches the generated
`module.exports = __webpack_exports__` footer without a CommonJS `module`
binding. The run executed 29 client checks and then failed with
`ReferenceError: module is not defined` before the Change Streams recovery
markers.

The application now owns the corresponding output correction in
`rspack.config.js`: every injected web client bundle, including development/HMR,
uses a named browser `window` library target. Server and native-client output
retain their existing ownership. The standalone harness tests that mode
boundary. This is implemented source, not completed qualification evidence; the
full Linux suite must still pass before Change Streams can advance.

Two later authorized runs exposed the remaining external-resolution boundary.
Although eager Meteor imports were present in `client-meteor.js`, changing the
bundle library target to `window` had also changed Rspack's implicit external
type. The injected bundle therefore read nonexistent
`window["meteor/mongo"]`, `window["meteor/meteor"]`, and related entries. The
project output contract now keeps `externalsType: "commonjs2"` explicitly while
using the browser-owned library target. That preserves Meteor's browser module
loader for package imports without restoring the invalid CommonJS bundle
footer. The eager-plugin experiment was removed.

The next Linux qualification confirmed this bridge correction by executing the
full browser suite. Two focused failures were initially attributed to stable
Meteor 3.5.0, but neither modeled an application Change Streams requirement:
MoFaCTS uses dotted projections rather than the fixture's unsupported nested
object syntax, and Meteor intentionally routes ordered skip/limit cursors to
polling. The override is therefore no longer the Phase 4 blocker. The corrected
mixed-driver suite has now executed the stable Meteor 3.5 client qualification.
Production still requires the independent Phase 5 database acceptance and
rollout gates.

## Verification and removal

`npm run test:ci:harness` verifies that both Meteor package graphs select this
local package version and that the pinned fix is present. `npm run test:ci`
additionally fails unless the browser client reporter has a nonzero passing
count, which is the end-to-end regression gate for the original defect.

Remove this directory and change both `.meteor/packages` and
`.meteor/versions` back to an official stable `rspack` release only after that
release contains the equivalent of upstream PR #14562 and the full Meteor CI
suite passes without the override.
