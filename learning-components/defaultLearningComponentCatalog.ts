import {
  createLearningComponentCatalog,
  type LearningComponentCatalog,
} from './runtime/LearningComponentCatalog';
import type { CreateUnitEngineDeps } from './units/createUnitEngine';
import { defaultUnitComponentManifests } from './units/defaultUnitComponents';
import { sparcTrialDisplayComponentManifest } from './trial-displays/sparc/SparcTrialDisplayAdapter';

export const defaultLearningComponentCatalog: LearningComponentCatalog<CreateUnitEngineDeps> =
  createLearningComponentCatalog({
    unitManifests: defaultUnitComponentManifests,
    trialDisplayManifests: [
      sparcTrialDisplayComponentManifest,
    ],
  });

export const defaultUnitComponentManifestsFromCatalog =
  defaultLearningComponentCatalog.unitManifests;

export const defaultTrialDisplayComponentManifestsFromCatalog =
  defaultLearningComponentCatalog.trialDisplayManifests;
