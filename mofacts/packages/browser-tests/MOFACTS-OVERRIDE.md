# Pinned Meteor browser-tests correction

This local package is based on
[`meteortesting:browser-tests@1.8.0`](https://github.com/Meteor-Community-Packages/meteor-browser-tests)
at upstream commit `b88bfb72822ce3d67aa2726c7c14f27a8f37fcb4`.

The upstream Playwright worker builds its dynamic import with
`${process.cwd()}/node_modules/playwright/index.mjs`. On Windows that produces a
raw drive-letter specifier such as `C:\dev\...`, which Node 24 rejects with
`ERR_UNSUPPORTED_ESM_URL_SCHEME`. This override resolves the same checked-in
Playwright dependency through `pathToFileURL`, which is valid on Windows and
Linux.

MoFaCTS CI has one browser-driver contract: Playwright with Chromium. The local
package exposes only that driver instead of retaining unrelated historical
drivers. Remove this override after an official `meteortesting:browser-tests`
release uses a cross-platform module URL and the full Meteor CI suite passes
against it.
