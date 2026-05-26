import type { LearningComponentCapability } from './ComponentManifest';

export type TrialDisplayAdapter<TDisplay = unknown, TResult = unknown> = {
  readonly id: string;
  readonly displayType: string;
  readonly requiredCapabilities: readonly LearningComponentCapability[];
  ownsInteraction(display: TDisplay): boolean;
  normalizeDisplay(display: unknown): TDisplay;
  normalizeResult?(result: unknown, display: TDisplay): TResult;
};

const trialDisplayAdapters = new Map<string, TrialDisplayAdapter>();

function normalizeNonEmpty(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

export function validateTrialDisplayAdapter(adapter: TrialDisplayAdapter): void {
  normalizeNonEmpty(adapter.id, 'Trial display adapter id');
  normalizeNonEmpty(adapter.displayType, `Trial display adapter "${adapter.id}" displayType`);
  if (typeof adapter.ownsInteraction !== 'function') {
    throw new Error(`Trial display adapter "${adapter.id}" must provide ownsInteraction`);
  }
  if (typeof adapter.normalizeDisplay !== 'function') {
    throw new Error(`Trial display adapter "${adapter.id}" must provide normalizeDisplay`);
  }
}

export function registerTrialDisplayAdapter(adapter: TrialDisplayAdapter): void {
  validateTrialDisplayAdapter(adapter);
  const displayType = adapter.displayType.trim();
  if (trialDisplayAdapters.has(displayType)) {
    throw new Error(`Trial display adapter for "${displayType}" is already registered`);
  }
  trialDisplayAdapters.set(displayType, adapter);
}

export function getTrialDisplayAdapter(displayType: string): TrialDisplayAdapter {
  const normalizedDisplayType = normalizeNonEmpty(displayType, 'Trial display adapter lookup displayType');
  const adapter = trialDisplayAdapters.get(normalizedDisplayType);
  if (!adapter) {
    throw new Error(`No trial display adapter registered for "${normalizedDisplayType}"`);
  }
  return adapter;
}

export function hasTrialDisplayAdapter(displayType: string): boolean {
  const normalizedDisplayType = typeof displayType === 'string' ? displayType.trim() : '';
  return normalizedDisplayType.length > 0 && trialDisplayAdapters.has(normalizedDisplayType);
}

export function getRegisteredTrialDisplayAdapterTypes(): string[] {
  return Array.from(trialDisplayAdapters.keys()).sort();
}

export function resetTrialDisplayAdapterRegistryForTests(): void {
  trialDisplayAdapters.clear();
}
