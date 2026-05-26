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
  const unitTypes = new Set<string>();
  const displayTypes = new Set<string>();

  for (const manifest of [...summary.units, ...summary.trialDisplays]) {
    if (componentIds.has(manifest.id)) {
      throw new Error(`Learning component "${manifest.id}" is declared more than once in the catalog`);
    }
    componentIds.add(manifest.id);
  }

  for (const manifest of summary.units) {
    for (const unitType of manifest.unitTypes) {
      if (unitTypes.has(unitType)) {
        throw new Error(`Unit type "${unitType}" is declared more than once in the catalog`);
      }
      unitTypes.add(unitType);
    }
  }

  for (const manifest of summary.trialDisplays) {
    for (const displayType of manifest.displayTypes) {
      if (displayTypes.has(displayType)) {
        throw new Error(`Display type "${displayType}" is declared more than once in the catalog`);
      }
      displayTypes.add(displayType);
    }
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

export function combineLearningComponentCatalogs<TUnitDeps>(
  catalogs: readonly LearningComponentCatalog<TUnitDeps>[],
): LearningComponentCatalog<TUnitDeps> {
  return createLearningComponentCatalog({
    unitManifests: catalogs.flatMap((catalog) => [...catalog.unitManifests]),
    trialDisplayManifests: catalogs.flatMap((catalog) => [...catalog.trialDisplayManifests]),
  });
}

export function summarizeLearningComponentCatalog(
  catalog: LearningComponentCatalog,
): LearningComponentCatalogSummary {
  return {
    units: summarizeLearningComponentManifests(catalog.unitManifests),
    trialDisplays: summarizeLearningComponentManifests(catalog.trialDisplayManifests),
  };
}
