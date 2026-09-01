const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkServerAlgorithmBoundary } = require('./checkServerAlgorithmBoundary.cjs');

function createFixture(files) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mofacts-server-boundary-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repositoryRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  return repositoryRoot;
}

function checkFixture(files) {
  const repositoryRoot = createFixture(files);
  try {
    return checkServerAlgorithmBoundary({
      repositoryRoot,
      serverRoot: path.join(repositoryRoot, 'mofacts/server'),
    });
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
}

test('permits validation modules and type-only server interfaces', () => {
  const failures = checkFixture({
    'mofacts/server/main.ts': "import { validate } from '../../../learning-components/content/validation';\nimport type { Engine } from '../../../learning-components/units/UnitEngine';\nvalidate();",
    'learning-components/content/validation.ts': 'export const validate = () => true;',
    'learning-components/units/UnitEngine.ts': 'export type Engine = unknown;',
  });
  assert.deepEqual(failures, []);
});

for (const prohibitedPath of [
  'learning-components/models/learnerModel.ts',
  'learning-components/units/sparcsession/runtime.ts',
  'learning-components/units/autotutor/runtime.ts',
  'learning-components/units/assessment-session/runtime.ts',
  'learning-components/units/video-session/runtime.ts',
]) {
  test(`rejects a transitive dependency on ${prohibitedPath}`, () => {
    const failures = checkFixture({
      'mofacts/server/main.ts': "import {\n  bridge,\n} from '../common/bridge';\nbridge();",
      'mofacts/common/bridge.ts': `export { learnerRuntime as bridge } from '../../${prohibitedPath}';`,
      [prohibitedPath]: 'export const learnerRuntime = () => true;',
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0].at(-1), /learning-components\/(?:models|units)\//);
  });
}
