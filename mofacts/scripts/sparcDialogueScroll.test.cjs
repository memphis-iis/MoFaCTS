const { it } = require('node:test');
const assert = require('node:assert/strict');
require('./registerHistoryTypescript.cjs');
const { createSparcDialogueScroll } = require('../client/views/experiment/svelte/services/sparcDialogueScroll.ts');

it('follows additions and resizes without redefining manual scroll intent, and releases all observers', () => {
  let frame, resize, disconnects = 0, cancellations = 0;
  const priorWindow = global.window, priorObserver = global.ResizeObserver;
  global.window = { requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame: () => { frame = undefined; cancellations++; } };
  global.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnects++; }
  };
  let top = 0;
  const listeners = new Map();
  const viewport = {
    scrollHeight: 1000, clientHeight: 300,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  const flush = () => { const callback = frame; frame = undefined; callback?.(); };
  try {
    const scroll = createSparcDialogueScroll(viewport, {});
    flush(); assert.equal(top, 700);
    viewport.scrollHeight += 200; resize(); assert.equal(top, 900, 'Resize follows before the next animation frame');
    flush(); assert.equal(top, 900);
    viewport.scrollTop = 400; listeners.get('scroll')();
    assert.equal(scroll.isFollowing(), false);
    viewport.scrollHeight += 500; resize(); scroll.schedule(); flush(); assert.equal(top, 400);
    viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight - 48; listeners.get('scroll')();
    assert.equal(scroll.isFollowing(), true);
    resize(); flush(); assert.equal(top, 1400);
    viewport.scrollTop = 1351; listeners.get('scroll')(); assert.equal(scroll.isFollowing(), false);
    scroll.schedule(); scroll.destroy(); assert.equal(frame, undefined);
    assert.equal(disconnects, 1); assert.equal(cancellations, 1); assert.equal(listeners.size, 0);
    resize(); assert.equal(frame, undefined);
  } finally { global.window = priorWindow; global.ResizeObserver = priorObserver; }
});
