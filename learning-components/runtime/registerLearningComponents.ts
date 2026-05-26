import {
  assertLearningComponentCapabilities,
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
  const pendingManifests: LearningComponentManifest<TDeps>[] = [];
  const componentIds = new Set<string>();
  const unitTypes = new Set<string>();
  const displayTypes = new Set<string>();

  for (const manifest of manifests) {
    const summary = summarizeLearningComponentManifest(manifest);
    if (componentIds.has(summary.id)) {
      throw new Error(`Learning component "${summary.id}" is declared more than once`);
    }
    componentIds.add(summary.id);

    if (options.alreadyRegistered?.(manifest) === true) {
      continue;
    }

    for (const unitType of summary.unitTypes) {
      if (unitTypes.has(unitType)) {
        throw new Error(`Unit type "${unitType}" is declared by more than one learning component`);
      }
      unitTypes.add(unitType);
    }

    for (const displayType of summary.displayTypes) {
      if (displayTypes.has(displayType)) {
        throw new Error(`Display type "${displayType}" is declared by more than one learning component`);
      }
      displayTypes.add(displayType);
    }

    assertLearningComponentCapabilities(manifest, context);
    pendingManifests.push(manifest);
  }

  for (const manifest of pendingManifests) {
    registerLearningComponent(manifest, context);
  }
}
