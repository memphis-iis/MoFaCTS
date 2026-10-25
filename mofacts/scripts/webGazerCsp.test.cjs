const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { chromium } = require('playwright');
const { prepareWasmRuntime, prepareWebGazerAssets } = require('./prepareWebGazerAssets.cjs');
const app = path.resolve(__dirname, '..');
const upstream = path.join(app, 'node_modules/webgazer/dist/mediapipe/face_mesh');
const generated = path.join(app, 'public/webgazer/mediapipe/face_mesh');
const runtimes = ['face_mesh_solution_wasm_bin.js', 'face_mesh_solution_simd_wasm_bin.js'];

function bindingHelpers(source) {
  const helpers = [];
  function visit(node) {
    if (node.type === 'FunctionDeclaration' && ['makeLegalFunctionName', 'createNamedFunction',
      'new_', 'craftInvokerFunction', '__emval_get_method_caller'].includes(node.id.name)) {
      helpers.push(source.slice(node.start, node.end));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) visit(child); });
      else if (value?.type) visit(value);
    }
  }
  visit(acorn.parse(source, { ecmaVersion: 'latest' }));
  return helpers.join('\n');
}

test('CSP bindings match upstream conversion, cleanup, arity and callback contracts', () => {
  const original = fs.readFileSync(path.join(upstream, runtimes[0]), 'utf8');
  const scenario = `
    const char_0 = 48, char_9 = 57;
    const events = [];
    const throwBindingError = message => { throw new Error(message); };
    const runDestructors = stack => { events.push(['stack', ...stack]); };
    const ret = { name: 'number', fromWireType: value => value + 1,
      toWireType: (stack, value) => { events.push(['return', stack, value]); return value + 2; } };
    for (const classMethod of [false, true]) for (const stacked of [false, true]) {
      const type = { name: 'arg', toWireType: (stack, value) => {
        if (stack) stack.push(value); return typeof value === 'object' ? value.value : value * 2;
      }, destructorFunction: stacked ? undefined : value => events.push(['destroy', value]) };
      const fn = craftInvokerFunction('example', [ret, classMethod ? type : null, type],
        classMethod ? {} : null, (...args) => { events.push(['invoke', ...args]); return 10; }, 99);
      events.push(['metadata', fn.name, fn.length]);
      events.push(['result', fn.call({ value: 7 }, 3)]);
      try { fn(); } catch (error) { events.push(['error', error.message]); }
    }
    const types = [ret, { name: 'first', argPackAdvance: 4,
      readValueFromPointer: pointer => pointer, deleteObject: value => events.push(['delete', value]) },
      { name: 'second', argPackAdvance: 8, readValueFromPointer: pointer => pointer * 2 }];
    const __emval_lookupTypes = () => types;
    const __emval_addMethodCaller = fn => fn;
    const caller = __emval_get_method_caller(3, 0);
    const handle = { value: 5, method(a, b) { events.push(['callback', this.value, a, b]); return a + b; } };
    events.push(['caller', caller.name, caller.length, caller(handle, 'method', [], 100)]);
    JSON.stringify(events);
  `;
  const expected = vm.runInNewContext(bindingHelpers(original) + scenario);
  const actual = vm.runInNewContext(bindingHelpers(prepareWasmRuntime(original)) + scenario, {}, {
    contextCodeGeneration: { strings: false, wasm: false },
  });
  assert.equal(actual, expected);
  assert.throws(() => prepareWasmRuntime(original + '\n'), /checksum changed/);
});

test('named wrappers preserve calls, construction, names and exceptions without string compilation', () => {
  const source = prepareWasmRuntime(fs.readFileSync(path.join(upstream, runtimes[0]), 'utf8'));
  const helper = source.slice(source.indexOf('function createNamedFunction('), source.indexOf('var emval_free_list'));
  const make = vm.runInNewContext('const makeLegalFunctionName = name => name; ' + helper + ';createNamedFunction', {}, {
    contextCodeGeneration: { strings: false, wasm: false },
  });
  let receiver;
  const wrapper = make('Example', function() {});
  assert.equal(wrapper.name, 'Example');
  const call = make('Call', function(a, b) { receiver = this; return a + b; });
  const object = {};
  assert.equal(call.call(object, 2, 3), 5);
  assert.equal(receiver, object);
  const Constructor = make('Constructor', function(value) { this.value = value; });
  const instance = new Constructor(7);
  assert.ok(instance instanceof Constructor);
  assert.equal(instance.value, 7);
  const error = new Error('expected');
  assert.throws(make('Throws', () => { throw error; }), value => value === error);
  assert.throws(() => prepareWasmRuntime('changed upstream'), /helper changed/);
});

test('both real MediaPipe WASM runtimes initialize under CSP without unsafe-eval', { timeout: 120000 }, async () => {
  prepareWebGazerAssets();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const runtime of runtimes) {
      for (const prepared of [false, true]) {
        const page = await browser.newPage();
        const violations = [];
        await page.exposeFunction('recordViolation', value => violations.push(value));
        await page.route('http://gaze.test/**', async route => {
          const name = new URL(route.request().url()).pathname.slice(1);
          if (!name) {
            await route.fulfill({ contentType: 'text/html', headers: {
              'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'",
            }, body: `<script src="/${runtime}"></script>` });
          } else {
            await route.fulfill({ path: path.join(prepared ? generated : upstream, name),
              contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
          }
        });
        await page.goto('http://gaze.test/');
        const result = await page.evaluate(async () => {
          document.addEventListener('securitypolicyviolation', event => window.recordViolation(event.blockedURI));
          try {
            const module = await window.createMediapipeSolutionsWasm({ locateFile: name => '/' + name });
            const solution = new module.SolutionWasm();
            solution.delete();
            return { ready: true };
          } catch (error) { return { ready: false, error: String(error) }; }
        });
        if (prepared) {
          assert.equal(result.ready, true, `${runtime}: ${result.error}`);
          assert.deepEqual(violations, []);
        } else {
          assert.equal(result.ready, false);
          assert.match(result.error, /unsafe-eval|EvalError|Content Security Policy/);
        }
        await page.close();
      }
    }
  } finally { await browser.close(); }
});
