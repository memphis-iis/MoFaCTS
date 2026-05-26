import type {
  UnitEngineFactory,
  UnitEngineFactoryWithDeps,
} from '../units/UnitEngineRegistry';
import type { TrialDisplayAdapter } from './TrialDisplayAdapterRegistry';

export type LearningComponentKind = 'unit' | 'trial-display';

export type LearningComponentCapability =
  | 'session'
  | 'delivery-settings'
  | 'stimuli'
  | 'adaptive-model'
  | 'assessment-state'
  | 'media'
  | 'history'
  | 'server-methods'
  | 'authz'
  | 'logging'
  | 'ui-alerts';

export type LearningComponentRuntimeContext<TDeps = unknown> = {
  readonly capabilities: ReadonlySet<LearningComponentCapability>;
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
  register(context: LearningComponentRuntimeContext<TDeps>): void;
};

function normalizeNonEmpty(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

export function validateLearningComponentManifest(manifest: LearningComponentManifest): void {
  normalizeNonEmpty(manifest.id, 'Learning component id');
  if (manifest.kind !== 'unit' && manifest.kind !== 'trial-display') {
    throw new Error(`Unsupported learning component kind: ${String(manifest.kind)}`);
  }
  if (manifest.kind === 'unit' && (!Array.isArray(manifest.unitTypes) || manifest.unitTypes.length === 0)) {
    throw new Error(`Learning component "${manifest.id}" must declare at least one unit type`);
  }
  if (manifest.unitTypes) {
    for (const unitType of manifest.unitTypes) {
      normalizeNonEmpty(unitType, `Learning component "${manifest.id}" unit type`);
    }
  }
  if (manifest.kind === 'trial-display') {
    if (!Array.isArray(manifest.displayTypes) || manifest.displayTypes.length === 0) {
      throw new Error(`Learning component "${manifest.id}" must declare at least one display type`);
    }
    for (const displayType of manifest.displayTypes) {
      normalizeNonEmpty(displayType, `Learning component "${manifest.id}" display type`);
    }
  }
}

export function assertLearningComponentCapabilities(
  manifest: LearningComponentManifest,
  context: Pick<LearningComponentRuntimeContext, 'capabilities'>,
): void {
  const missing = manifest.requiredCapabilities
    .filter((capability) => !context.capabilities.has(capability));
  if (missing.length > 0) {
    throw new Error(`Learning component "${manifest.id}" requires missing capabilities: ${missing.join(', ')}`);
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
