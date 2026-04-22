// Engine manager - Phase 4 state management refactor
// Replaces window.engine global with managed module state

let currentEngine: unknown = null;

export const getEngine = (): unknown => currentEngine;

export const setEngine = (engine: unknown): void => {
  currentEngine = engine;
};

export const clearEngine = (): void => {
  currentEngine = null;
};

