const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual template autorun with a controlled paint queue so the
// authentication/paint race is deterministic, without a Meteor test server.
const source = fs.readFileSync(path.join(__dirname, '../client/views/login/signIn.ts'), 'utf8');
const ast = ts.createSourceFile('signIn.ts', source, ts.ScriptTarget.Latest, true);
let autorun;
function visit(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'template._themeAutorunHandle') {
    autorun = node.right.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(autorun, 'sign-in theme autorun must exist');
const autorunJavaScript = ts.transpileModule(`(${autorun})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let loggingIn = false;
  const queue = [];
  const classes = new Set(['page-loading']);
  const container = { style: {}, classList: {
    add: value => classes.add(value), remove: value => classes.delete(value),
  } };
  const computation = { stopped: false, invalidated: false };
  const context = {
    template: { isLoggingIn: { get: () => loggingIn } },
    Session: { get: key => key === 'themeReady' ? true : 'experiment' },
    Meteor: { user: () => ({ loginParams: { loginMode: 'experiment' } }), userId: () => 'synthetic-user' },
    Tracker: { afterFlush: callback => queue.push(callback) },
    requestAnimationFrame: callback => queue.push(callback),
    document: { getElementById: () => container },
    clientConsole: () => {},
  };
  const run = vm.runInNewContext(autorunJavaScript, context);
  return {
    computation, classes, queue,
    run: () => run(computation),
    setLaunching: value => { loggingIn = value; },
    paint: () => { while (queue.length) queue.shift()(); },
  };
}

test('experiment entry displays the form before login', () => {
  const f = fixture(); f.run(); f.paint();
  assert.ok(f.classes.has('page-loaded'));
});

test('authentication changes cannot schedule form display while launching', () => {
  const f = fixture(); f.setLaunching(true); f.run(); f.paint();
  assert.ok(f.classes.has('page-loading'));
  assert.equal(f.queue.length, 0);
});

test('launch starting at any paint stage prevents a queued fade-in', () => {
  for (let stage = 0; stage < 3; stage++) {
    const f = fixture(); f.run();
    for (let i = 0; i < stage; i++) f.queue.shift()();
    f.setLaunching(true); f.paint();
    assert.ok(f.classes.has('page-loading'), `paint stage ${stage}`);
  }
});

test('destroyed or invalidated computations cannot reveal sign-in', () => {
  for (const state of ['stopped', 'invalidated']) {
    const f = fixture(); f.run(); f.computation[state] = true; f.paint();
    assert.ok(f.classes.has('page-loading'), state);
  }
});

test('clearing launch state after an error permits the form to return', () => {
  const f = fixture(); f.setLaunching(true); f.run();
  f.setLaunching(false); f.run(); f.paint();
  assert.ok(f.classes.has('page-loaded'));
});
