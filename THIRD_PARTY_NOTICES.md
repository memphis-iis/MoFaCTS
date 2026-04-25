# Third-Party Notices

MoFaCTS project-owned code is licensed under AGPL-3.0-only. Third-party code and dependencies keep their own licenses and are not relicensed by MoFaCTS.

## Dependency Inventory

Runtime npm dependency licenses are inventoried in [dependency-licenses.csv](dependency-licenses.csv). Development and build tooling licenses are inventoried in [dependency-licenses-all.csv](dependency-licenses-all.csv) when that optional report is committed.

Regenerate the reports from `mofacts/`:

```bash
npm run license:audit
npm run license:audit:all
```

Equivalent direct commands:

```bash
npx license-checker --production --summary
npx license-checker --production --csv --out ../dependency-licenses.csv
npx license-checker --summary
npx license-checker --csv --out ../dependency-licenses-all.csv
```

Dependency package license files and license metadata must be preserved in distributed dependency bundles. If `node_modules` is distributed, include the dependency package notices and license files. If only lockfiles are distributed, dependency packages remain obtainable from npm with their notices.

## Local Third-Party Code

### Recorder.js

Files:

- `mofacts/client/lib/audioRecorder.ts`
- `mofacts/public/lib/audioRecorderWorker.js`

These files retain the MIT license notice for Matt Diamond's Recorder.js-derived code:

```text
Copyright (c) 2013 Matt Diamond
```

### hark

File:

- `mofacts/client/lib/hark.ts`

This file is adapted from `hark@1.2.3`, authored by Philip Roberts and published under the MIT License at `https://github.com/latentflip/hark`.

```text
Copyright (c) Philip Roberts
```

### gaugeJS

The previous local generated file `mofacts/client/lib/vendor/gauge.generated.js` was unused and has been removed. If gauge code is restored or vendored again, preserve provenance for the upstream `gaugeJS` package, including package/version and its MIT license notice.

## Dual-License Choices

For dependencies that publish multiple license options, MoFaCTS uses these options for release review:

- `dompurify`: Apache-2.0
- `jszip`: MIT
- `node-forge` in dev tooling: BSD-3-Clause
- `@sinonjs/text-encoding`: Apache-2.0
- `opener`: MIT
- `type-fest`: MIT

## Extra Notice Obligations

Preserve notices and attribution for dependencies with multiple or less common license obligations:

- `pako`: MIT and Zlib
- `sha.js`: MIT and BSD-3-Clause
- `domain-browser@4.23.0`: Artistic-2.0; document changes if modified
- `sax`, `jackspeak`, `path-scurry`, `package-json-from-dist`: BlueOak
- `caniuse-lite`: CC-BY-4.0 in dev/build tooling; preserve attribution if distributed

## Media and Stimulus Attribution

TDF/content fields such as `licenseName`, `licenseUrl`, `creatorName`, `sourceName`, and `sourceUrl` are media/content attribution metadata. Keep them separate from MoFaCTS project licensing.
