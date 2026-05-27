import type {
  UnitEngineFactory,
  UnitEngineFactoryWithDeps,
} from '../units/UnitEngineRegistry';
import type { TrialDisplayAdapter } from './TrialDisplayAdapterRegistry';

export type LearningComponentKind = 'unit' | 'trial-display';

export const learningComponentCapabilities = [
  'session',
  'delivery-settings',
  'stimuli',
  'adaptive-model',
  'assessment-state',
  'media',
  'history',
  'server-methods',
  'authz',
  'logging',
  'ui-alerts',
] as const;

export type LearningComponentCapability = typeof learningComponentCapabilities[number];

const knownLearningComponentCapabilities = new Set<string>(learningComponentCapabilities);

export type LearningComponentRuntimeContext<TDeps = unknown> = {
  readonly capabilities: ReadonlySet<LearningComponentCapability>;
  readonly serverMethods?: ReadonlySet<string>;
  registerUnitEngine(unitType: string, factory: UnitEngineFactory): void;
  registerUnitEngineWithDeps(unitType: string, factory: UnitEngineFactoryWithDeps<TDeps>): void;
  registerTrialDisplayAdapter(adapter: TrialDisplayAdapter): void;
};

export type LearningComponentManifest<TDeps = unknown> = {
  readonly id: string;
  readonly kind: LearningComponentKind;
  readonly unitTypes?: readonly string[];
  readonly displayTypes?: readonly string[];
  readonly requiredCapabilities: readonly LearningComponentCapability[];
  readonly requiredServerMethods?: readonly string[];
  register(context: LearningComponentRuntimeContext<TDeps>): void;
};

function normalizeNonEmpty(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

function hasAnyEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function assertUniqueNormalizedEntries(
  entries: readonly unknown[],
  normalizeLabel: string,
  duplicateLabel: string,
): string[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const normalized = normalizeNonEmpty(entry, normalizeLabel);
    if (seen.has(normalized)) {
      throw new Error(`${duplicateLabel}: ${normalized}`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function validateRequiredCapabilities(manifest: LearningComponentManifest): void {
  if (!Array.isArray(manifest.requiredCapabilities)) {
    throw new Error(`Learning component "${manifest.id}" must declare requiredCapabilities as an array`);
  }
  const normalizedCapabilities = assertUniqueNormalizedEntries(
    manifest.requiredCapabilities,
    `Learning component "${manifest.id}" required capability`,
    `Learning component "${manifest.id}" declares duplicate required capability`,
  );
  for (const normalizedCapability of normalizedCapabilities) {
    if (!knownLearningComponentCapabilities.has(normalizedCapability)) {
      throw new Error(`Learning component "${manifest.id}" requires unknown capability: ${normalizedCapability}`);
    }
  }
}

function validateRequiredServerMethods(manifest: LearningComponentManifest): void {
  if (manifest.requiredServerMethods === undefined) {
    return;
  }
  if (!Array.isArray(manifest.requiredServerMethods)) {
    throw new Error(`Learning component "${manifest.id}" must declare requiredServerMethods as an array`);
  }
  if (!manifest.requiredCapabilities.includes('server-methods')) {
    throw new Error(`Learning component "${manifest.id}" declares requiredServerMethods without server-methods capability`);
  }
  assertUniqueNormalizedEntries(
    manifest.requiredServerMethods,
    `Learning component "${manifest.id}" required server method`,
    `Learning component "${manifest.id}" declares duplicate required server method`,
  );
}

export function validateLearningComponentManifest(manifest: LearningComponentManifest): void {
  normalizeNonEmpty(manifest.id, 'Learning component id');
  if (manifest.kind !== 'unit' && manifest.kind !== 'trial-display') {
    throw new Error(`Unsupported learning component kind: ${String(manifest.kind)}`);
  }
  validateRequiredCapabilities(manifest);
  validateRequiredServerMethods(manifest);
  if (manifest.kind === 'unit' && (!Array.isArray(manifest.unitTypes) || manifest.unitTypes.length === 0)) {
    throw new Error(`Learning component "${manifest.id}" must declare at least one unit type`);
  }
  if (manifest.kind === 'unit' && hasAnyEntries(manifest.displayTypes)) {
    throw new Error(`Learning component "${manifest.id}" is a unit component and must not declare display types`);
  }
  if (manifest.unitTypes) {
    assertUniqueNormalizedEntries(
      manifest.unitTypes,
      `Learning component "${manifest.id}" unit type`,
      `Learning component "${manifest.id}" declares duplicate unit type`,
    );
  }
  if (manifest.kind === 'trial-display') {
    if (hasAnyEntries(manifest.unitTypes)) {
      throw new Error(`Learning component "${manifest.id}" is a trial-display component and must not declare unit types`);
    }
    if (!Array.isArray(manifest.displayTypes) || manifest.displayTypes.length === 0) {
      throw new Error(`Learning component "${manifest.id}" must declare at least one display type`);
    }
    assertUniqueNormalizedEntries(
      manifest.displayTypes,
      `Learning component "${manifest.id}" display type`,
      `Learning component "${manifest.id}" declares duplicate display type`,
    );
  }
}

export function assertLearningComponentCapabilities(
  manifest: LearningComponentManifest,
  context: Pick<LearningComponentRuntimeContext, 'capabilities' | 'serverMethods'>,
): void {
  const missing = manifest.requiredCapabilities
    .filter((capability) => !context.capabilities.has(capability));
  if (missing.length > 0) {
    throw new Error(`Learning component "${manifest.id}" requires missing capabilities: ${missing.join(', ')}`);
  }
  const missingServerMethods = (manifest.requiredServerMethods ?? [])
    .map((methodName) => methodName.trim())
    .filter((methodName) => !context.serverMethods?.has(methodName));
  if (missingServerMethods.length > 0) {
    throw new Error(`Learning component "${manifest.id}" requires missing server methods: ${missingServerMethods.join(', ')}`);
  }
}

export function registerLearningComponent<TDeps>(
  manifest: LearningComponentManifest<TDeps>,
  context: LearningComponentRuntimeContext<TDeps>,
): void {
  validateLearningComponentManifest(manifest);
  assertLearningComponentCapabilities(manifest, context);
  manifest.register(context);
}
