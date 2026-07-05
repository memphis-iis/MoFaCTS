# sql.js 1.13.0

Vendored so APKG import workflows can initialize SQLite WASM without `sql.js.org` or cdnjs.

- Package: `sql.js`
- Version: `1.13.0`
- Vendored file: `sql-wasm.wasm`
- Source path: `mofacts/node_modules/sql.js/dist/sql-wasm.wasm`
- License: MIT
- Update process: copy `sql-wasm.wasm` from the installed `sql.js` package version used by `mofacts/package.json`, then smoke-test APKG analysis/content upload.
- Reason: sql.js JavaScript and WASM must come from the same package version; APKG import runs client-side and should not request CDN WASM.
