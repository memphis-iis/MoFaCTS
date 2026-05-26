import {
  registerLearningComponent,
  validateLearningComponentManifest,
  type LearningComponentCapability,
  type LearningComponentManifest,
  type LearningComponentKind,
  type LearningComponentRuntimeContext,
} from './ComponentManifest';

export type LearningComponentAlreadyRegistered<TDeps = unknown> = (
  manifest: LearningComponentManifest<TDeps>
) => boolean;

export type LearningComponentManifestSummary = {
  id: string;
  kind: LearningComponentKind;
  unitTypes: string[];
  displayTypes: string[];
  requiredCapabilities: LearningComponentCapability[];
};

export function summarizeLearningComponentManifest(
  manifest: LearningComponentManifest,
): LearningComponentManifestSummary {
  validateLearningComponentManifest(manifest);
  return {
    id: manifest.id.trim(),
    kind: manifest.kind,
    unitTypes: [...(manifest.unitTypes ?? [])].map((unitType) => unitType.trim()).sort(),
    displayTypes: [...(manifest.displayTypes ?? [])].map((displayType) => displayType.trim()).sort(),
    requiredCapabilities: [...manifest.requiredCapabilities].sort(),
  };
}

export function summarizeLearningComponentManifests(
  manifests: readonly LearningComponentManifest[],
): LearningComponentManifestSummary[] {
  return manifests
    .map((manifest) => summarizeLearningComponentManifest(manifest))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function registerLearningComponents<TDeps>(
  manifests: readonly LearningComponentManifest<TDeps>[],
  context: LearningComponentRuntimeContext<TDeps>,
  options: {
    alreadyRegistered?: LearningComponentAlreadyRegistered<TDeps>;
  } = {},
): void {
  for (const manifest of manifests) {
    if (options.alreadyRegistered?.(manifest) === true) {
      continue;
    }
    registerLearningComponent(manifest, context);
  }
}
