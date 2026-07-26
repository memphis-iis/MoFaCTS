Vendored so modern APKG import workflows can initialize Zstandard WASM without relying on Rspack WASM asset handling, package-root browser exports, or a CDN.

- Package: `@bokuweb/zstd-wasm`
- Version: `0.0.27`
- License: MIT
- Vendored files: `zstd.js`, `zstd.js.map`, `zstd.wasm`
- Source paths from the package tarball: `dist/web/zstd.js`, `dist/web/zstd.js.map`, `dist/web/zstd.wasm`
- Runtime owner: `mofacts/client/lib/zstdDecoder.ts`
- Update process: copy the three files from the package version being adopted, then smoke-test modern APKG analysis/content generation.
