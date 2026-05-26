import {
  createLearningComponentCatalog,
  type LearningComponentCatalog,
} from './runtime/LearningComponentCatalog';
import type { CreateUnitEngineDeps } from './units/createUnitEngine';
import { defaultUnitComponentManifests } from './units/defaultUnitComponents';
import { h5pTrialDisplayComponentManifest } from './trial-displays/h5p/H5PTrialDisplayAdapter';

export const defaultLearningComponentCatalog: LearningComponentCatalog<CreateUnitEngineDeps> =
  createLearningComponentCatalog({
    unitManifests: defaultUnitComponentManifests,
    trialDisplayManifests: [
      h5pTrialDisplayComponentManifest,
    ],
  });

export const defaultUnitComponentManifestsFromCatalog =
  defaultLearningComponentCatalog.unitManifests;

export const defaultTrialDisplayComponentManifestsFromCatalog =
  defaultLearningComponentCatalog.trialDisplayManifests;
