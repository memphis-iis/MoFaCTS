import type {
  LearningComponentManifest,
} from './ComponentManifest';
import {
  summarizeLearningComponentManifests,
  type LearningComponentManifestSummary,
} from './registerLearningComponents';

export interface LearningComponentCatalog<TUnitDeps = unknown> {
  readonly unitManifests: readonly LearningComponentManifest<TUnitDeps>[];
  readonly trialDisplayManifests: readonly LearningComponentManifest[];
}

export interface LearningComponentCatalogSummary {
  readonly units: readonly LearningComponentManifestSummary[];
  readonly trialDisplays: readonly LearningComponentManifestSummary[];
}

export function validateLearningComponentCatalog(catalog: LearningComponentCatalog): void {
  const summary = summarizeLearningComponentCatalog(catalog);
  const componentIds = new Set<string>();

  for (const manifest of [...summary.units, ...summary.trialDisplays]) {
    if (componentIds.has(manifest.id)) {
      throw new Error(`Learning component "${manifest.id}" is declared more than once in the catalog`);
    }
    componentIds.add(manifest.id);
  }
}

export function createLearningComponentCatalog<TUnitDeps>(
  catalog: LearningComponentCatalog<TUnitDeps>,
): LearningComponentCatalog<TUnitDeps> {
  validateLearningComponentCatalog(catalog);
  return {
    unitManifests: [...catalog.unitManifests],
    trialDisplayManifests: [...catalog.trialDisplayManifests],
  };
}

export function summarizeLearningComponentCatalog(
  catalog: LearningComponentCatalog,
): LearningComponentCatalogSummary {
  return {
    units: summarizeLearningComponentManifests(catalog.unitManifests),
    trialDisplays: summarizeLearningComponentManifests(catalog.trialDisplayManifests),
  };
}
