# Plyr 3.8.4

Vendored so video-session styling is loaded only on video routes and without cdnjs.

- Package: `plyr`
- Version: `3.8.4`
- Vendored file: `plyr.css`
- Source path: `mofacts/node_modules/plyr/dist/plyr.css`
- License: MIT
- Update process: copy the CSS from the installed `plyr` package version used by `mofacts/package.json`, then smoke-test a video session.
- Reason: Plyr JavaScript is bundled from npm, while the CSS was previously a global CDN first-load asset.
