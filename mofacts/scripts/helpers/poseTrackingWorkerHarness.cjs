// Executes the production worker handler in a controlled realm. The browser
// suite separately verifies native Worker termination and real WASM inference.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../../client/views/experiment/svelte/services/poseTrackingWorker.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
module.exports = function createPoseWorkerHarness(models) {
  const instances = [];
  class ControlledWorker {
    terminated = false;
    onmessage = null;
    onerror = null;
    constructor() {
      instances.push(this);
      this.scope = { location: { origin: 'http://localhost:3200' }, onmessage: null,
        postMessage: data => { if (!this.terminated) this.onmessage?.({ data }); } };
      vm.runInNewContext(code, { exports: {}, self: this.scope, Error,
        OffscreenCanvas: class {}, require(name) {
          if (name !== '@mediapipe/tasks-vision') throw Error(name);
          return models;
        },
      });
    }
    postMessage(data) {
      if (this.terminated) throw Error('Worker terminated');
      void this.scope.onmessage({ data }).catch(error => {
        if (!this.terminated) this.onerror?.({ message: error.message, preventDefault() {} });
      });
    }
    terminate() { this.terminated = true; }
  }
  return { Worker: ControlledWorker, instances };
};
