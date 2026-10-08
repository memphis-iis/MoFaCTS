// Pure locale completeness and interpolation contracts; rendered integration remains in CI.
require('./registerHistoryTypescript.cjs');
const nodeTest = require('node:test');
for (const name of ['describe', 'it']) global[name] = nodeTest[name];
require('../client/lib/interfaceI18n.test.ts');
