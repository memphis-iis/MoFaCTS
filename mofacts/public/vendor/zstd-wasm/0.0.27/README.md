Vendored so modern APKG import workflows can initialize Zstandard WASM without relying on Rspack WASM asset handling or a CDN.

- Package: `@bokuweb/zstd-wasm`
- Version: `0.0.27`
- Vendored file: `zstd.wasm`
- Source path: `mofacts/node_modules/@bokuweb/zstd-wasm/dist/web/zstd.wasm`
- Update process: copy `zstd.wasm` from the installed package version used by `mofacts/package.json`, then smoke-test modern APKG analysis/content generation.
