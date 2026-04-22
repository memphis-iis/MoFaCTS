const originalWarn = console.warn;

console.warn = function patchedWarn(...args) {
  const message = typeof args[0] === 'string' ? args[0] : '';
  const isConditionNamesWarning =
    message.includes('You should add "svelte" to the "resolve.conditionNames" array');

  if (!isConditionNamesWarning) {
    return originalWarn.apply(console, args);
  }
};

const svelteLoader = require('svelte-loader');

console.warn = originalWarn;

module.exports = svelteLoader;
