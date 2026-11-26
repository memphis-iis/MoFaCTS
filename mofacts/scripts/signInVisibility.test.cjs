const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { isOAuthCredentialValue } = require('../common/oauthConfiguration.ts');

// Execute the actual template autorun with a controlled paint queue so the
// authentication/paint race is deterministic, without a Meteor test server.
const source = fs.readFileSync(path.join(__dirname, '../client/views/login/signIn.ts'), 'utf8');
const ast = ts.createSourceFile('signIn.ts', source, ts.ScriptTarget.Latest, true);
let autorun;
let googleSignIn;
function visit(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'template._themeAutorunHandle') {
    autorun = node.right.arguments[0].getText(ast);
  }
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)
    && node.name.text === 'click #signInButtonOAuth') {
    googleSignIn = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(autorun, 'sign-in theme autorun must exist');
const autorunJavaScript = ts.transpileModule(`(${autorun})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

assert.ok(googleSignIn, 'Google sign-in must expose its button action');
const googleSignInJavaScript = ts.transpileModule(`(${googleSignIn})`, {
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

test('Google sign-in shows a provider error when no client ID is configured', async () => {
  for (const [record, ready, expected] of [
    [undefined, false, 'auth.oauthConfigLoading'],
    [{}, true, 'auth.googleSignInUnavailable'],
    [{ clientId: 'undefined' }, true, 'auth.googleSignInUnavailable'],
    [{ clientId: ' ' }, true, 'auth.googleSignInUnavailable'],
  ]) {
    const events = [];
    const template = { oauthConfigSub: { ready: () => ready } };
    const eventHandler = vm.runInNewContext(googleSignInJavaScript, {
      ServiceConfiguration: { configurations: { findOne: () => record } },
      isOAuthCredentialValue,
      authText: key => key,
      showInlineSignInError: (key, options, owner) => {
        assert.equal(options.serverErrorScope, 'provider');
        assert.equal(owner, template);
        events.push(key);
      },
      focusFirstSignInError: owner => {
        assert.equal(owner, template);
        events.push('focus');
      },
      $: () => assert.fail('Unavailable provider must leave the form operable'),
      MeteorAny: { promisify: () => assert.fail('Unavailable provider must not open OAuth') },
    });
    await eventHandler({ preventDefault: () => events.push('preventDefault') }, template);
    assert.deepEqual(events, ['preventDefault', expected, 'focus']);
  }
});

test('Google sign-in still initiates OAuth with a configured client ID', async () => {
  const events = [];
  const reachedOAuth = new Error('OAuth invocation reached');
  const eventHandler = vm.runInNewContext(googleSignInJavaScript, {
    ServiceConfiguration: { configurations: { findOne: () => ({ clientId: 'synthetic.apps.googleusercontent.com' }) } },
    isOAuthCredentialValue,
    clientConsole: () => {},
    Meteor: { userId: () => null, loginWithGoogle: () => {} },
    MeteorAny: { promisify: () => { events.push('oauth'); throw reachedOAuth; } },
    $: () => ({ prop: () => {} }),
    document: { getElementById: () => null },
    Session: { get: () => null, set: () => {} },
  });
  const template = { isLoggingIn: { set: value => events.push(value) } };
  await assert.rejects(eventHandler({ preventDefault: () => {} }, template), error => error === reachedOAuth);
  assert.deepEqual(events, [true, 'oauth']);
});
