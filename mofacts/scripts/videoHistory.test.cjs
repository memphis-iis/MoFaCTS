// Pure video identity, canonical-wire and TSV-mapping coverage; DDP integration belongs to CI.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const nodeTest = require('node:test');

for (const name of ['describe', 'it']) global[name] = nodeTest[name];
require.extensions['.ts'] = (module, filename) => {
  module.paths.push(path.resolve(__dirname, '../node_modules'));
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
require('../client/views/experiment/svelte/services/videoHistoryIdentity.test.ts');
