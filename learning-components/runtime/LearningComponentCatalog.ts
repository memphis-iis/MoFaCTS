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

export function createLearningComponentCatalog<TUnitDeps>(
  catalog: LearningComponentCatalog<TUnitDeps>,
): LearningComponentCatalog<TUnitDeps> {
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
