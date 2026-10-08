// Execute the browser-independent playback lifecycle tests using the installed
// app toolchain. Browser playback acceptance remains a staging Chrome check.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const nodeTest = require('node:test');
for (const name of ['describe', 'it']) global[name] = nodeTest[name];
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
require(path.resolve(__dirname, '../client/lib/voicePreview.test.ts'));
