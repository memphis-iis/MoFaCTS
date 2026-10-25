// WebGazer 3.5.3 resolves MediaPipe assets at runtime; serve the pinned package locally.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const acorn = require('acorn');
const app = path.resolve(__dirname, '..');

// Emscripten's named Embind wrappers must work under script-src without unsafe-eval.
// Preserve strict receiver/arguments/constructor semantics and the diagnostic name;
// only the runtime string compilation is removed. Match the reviewed pinned helper
// exactly so dependency changes require review instead of silently shipping eval.
const namedFunctionSource = String.raw`function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\n"+'    "use strict";'+"    return body.apply(this, arguments);\n"+"};\n")(body)}`;
const namedFunctionReplacement = `function createNamedFunction(name,body){
  var wrapper = function() { "use strict"; return body.apply(this, arguments); };
  Object.defineProperty(wrapper, "name", { value: makeLegalFunctionName(name), configurable: true });
  return wrapper;
}`;

// Ordinary closures implementing the pinned Embind marshalling contracts. These
// are emitted into the runtime's scope, where its type registry owns conversion
// and destruction. No runtime code generation or alternate inference path remains.
const invokerReplacement = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc) {
  var argCount = argTypes.length;
  if (argCount < 2) throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
  var isClassMethodFunc = argTypes[1] !== null && classType !== null;
  var needsDestructorStack = argTypes.slice(1).some(function(type) {
    return type !== null && type.destructorFunction === undefined;
  });
  var wrapper = function() {
    if (arguments.length !== argCount - 2) {
      throwBindingError('function ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount - 2) + ' args!');
    }
    var destructors = needsDestructorStack ? [] : null;
    var wired = [cppTargetFunc];
    if (isClassMethodFunc) wired.push(argTypes[1].toWireType(destructors, this));
    for (var i = 2; i < argCount; i++) wired.push(argTypes[i].toWireType(destructors, arguments[i - 2]));
    var result = cppInvokerFunc.apply(null, wired);
    if (needsDestructorStack) runDestructors(destructors);
    else {
      var first = isClassMethodFunc ? 1 : 2;
      for (var i = first; i < argCount; i++) {
        var destructor = argTypes[i].destructorFunction;
        if (destructor !== null) destructor(wired[i - first + 1]);
      }
    }
    if (argTypes[0].name !== "void") return argTypes[0].fromWireType(result);
  };
  Object.defineProperty(wrapper, "name", { value: makeLegalFunctionName(humanName), configurable: true });
  Object.defineProperty(wrapper, "length", { value: argCount - 2, configurable: true });
  return wrapper;
}`;
const methodCallerReplacement = `function __emval_get_method_caller(argCount,argTypes) {
  var types = __emval_lookupTypes(argCount, argTypes);
  var retType = types[0];
  var signatureName = retType.name + "_$" + types.slice(1).map(function(t) { return t.name; }).join("_") + "$";
  var caller = function(handle, name, destructors, args) {
    var values = [];
    var offset = 0;
    for (var i = 1; i < argCount; i++) {
      values.push(types[i].readValueFromPointer(args + offset));
      offset += types[i].argPackAdvance;
    }
    var result = handle[name].apply(handle, values);
    for (var i = 1; i < argCount; i++) {
      if (types[i].deleteObject) types[i].deleteObject(values[i - 1]);
    }
    if (!retType.isVoid) return retType.toWireType(destructors, result);
  };
  Object.defineProperty(caller, "name", { value: makeLegalFunctionName("methodCaller_" + signatureName), configurable: true });
  return __emval_addMethodCaller(caller);
}`;

function prepareWasmRuntime(source) {
  if (source.split(namedFunctionSource).length !== 2) {
    throw new Error('WebGazer MediaPipe named-function helper changed; review CSP compatibility');
  }
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  if (!['68dcacddb41013a2e23860565e0e1103c7f6865c722d3bfccdf6f9f7cc717fdf',
    'e331fd5b355adcf08b92b74417e9437d5877d2a9acace8cac1d6c678785b3f57'].includes(digest)) {
    throw new Error('WebGazer MediaPipe runtime checksum changed; review CSP compatibility');
  }
  const replacements = new Map([
    ['createNamedFunction', namedFunctionReplacement],
    ['craftInvokerFunction', invokerReplacement],
    ['__emval_get_method_caller', methodCallerReplacement],
  ]);
  const edits = [];
  function visit(node) {
    if (node.type === 'FunctionDeclaration' && replacements.has(node.id.name)) {
      edits.push({ start: node.start, end: node.end, source: replacements.get(node.id.name) });
      replacements.delete(node.id.name);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) visit(child); });
      else if (value?.type) visit(value);
    }
  }
  visit(acorn.parse(source, { ecmaVersion: 'latest' }));
  if (replacements.size) throw new Error('Missing WebGazer MediaPipe binding helpers');
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.source + source.slice(edit.end);
  }
  return source;
}

function prepareWebGazerAssets() {
  const metadata = JSON.parse(fs.readFileSync(path.join(app, 'node_modules/webgazer/package.json'), 'utf8'));
  if (metadata.version !== '3.5.3') throw new Error('WebGazer asset preparation requires version 3.5.3');
  const runtimeNames = ['face_mesh_solution_wasm_bin.js', 'face_mesh_solution_simd_wasm_bin.js'];
  const runtimes = runtimeNames.map(name => [name, prepareWasmRuntime(fs.readFileSync(
    path.join(app, 'node_modules/webgazer/dist/mediapipe/face_mesh', name), 'utf8'))]);
  fs.cpSync(path.join(app, 'node_modules/webgazer/dist/mediapipe'),
    path.join(app, 'public/webgazer/mediapipe'), { recursive: true });
  for (const [name, source] of runtimes) {
    fs.writeFileSync(path.join(app, 'public/webgazer/mediapipe/face_mesh', name), source);
  }

  fs.copyFileSync(path.join(app, 'scripts/licenses/mediapipe-LICENSE'),
    path.join(app, 'public/webgazer/mediapipe-LICENSE'));
  fs.writeFileSync(path.join(app, 'public/webgazer/NOTICE.txt'),
    'MediaPipe Face Mesh assets packaged by WebGazer 3.5.3. Copyright Google LLC. Apache-2.0.\n' +
    'Source: https://github.com/google-ai-edge/mediapipe ; upstream package metadata retained in mediapipe/face_mesh/package.json.\n' +
    'Modified by MoFaCTS: Embind binding helpers use ordinary JavaScript functions for Content Security Policy compatibility.\n');
}

if (require.main === module) prepareWebGazerAssets();
module.exports = { prepareWasmRuntime, prepareWebGazerAssets };
