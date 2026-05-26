import type {
  LearningComponentCapability,
  LearningComponentManifest,
} from '../../learning-components/runtime/ComponentManifest';
import { registerLearningComponents } from '../../learning-components/runtime/registerLearningComponents';
import {
  getTrialDisplayAdapter,
  hasTrialDisplayAdapter,
  registerTrialDisplayAdapter,
} from '../../learning-components/runtime/TrialDisplayAdapterRegistry';
import { defaultTrialDisplayComponentManifestsFromCatalog } from '../../learning-components/defaultLearningComponentCatalog';

export const defaultTrialDisplayComponentManifests: readonly LearningComponentManifest[] = [
  ...defaultTrialDisplayComponentManifestsFromCatalog,
];

const defaultTrialDisplayCapabilities = new Set<LearningComponentCapability>([
  'media',
  'history',
]);

function assertAlreadyRegisteredWithManifest(manifest: LearningComponentManifest): boolean {
  const displayTypes = manifest.displayTypes ?? [];
  if (displayTypes.length === 0 || !displayTypes.every((displayType) => hasTrialDisplayAdapter(displayType))) {
    return false;
  }

  for (const displayType of displayTypes) {
    const adapter = getTrialDisplayAdapter(displayType);
    if (adapter.id !== manifest.id) {
      throw new Error(
        `Trial display component "${manifest.id}" cannot register "${displayType}"; ` +
        `adapter "${adapter.id}" is already registered`,
      );
    }
  }
  return true;
}

export function registerDefaultTrialDisplayComponents(): void {
  registerLearningComponents(defaultTrialDisplayComponentManifests, {
    capabilities: defaultTrialDisplayCapabilities,
    registerUnitEngine() {
      throw new Error('Trial display components cannot register unit engines');
    },
    registerUnitEngineWithDeps() {
      throw new Error('Trial display components cannot register unit engines');
    },
    registerTrialDisplayAdapter,
  }, {
    alreadyRegistered: assertAlreadyRegisteredWithManifest,
  });
}
