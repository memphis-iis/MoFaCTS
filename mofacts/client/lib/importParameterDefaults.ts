import sharedDefaults from '../../lib/importParameterDefaultsShared.json';

type ImportParameterDefaults = {
  lfparameter: string;
  purestudy: string;
  drill: string;
  skipstudy: string;
  reviewstudy: string;
  correctprompt: string;
  optimalThreshold: string;
  practiceseconds: string;
  fontsize: string;
  displayMinSeconds?: string;
  displayMaxSeconds?: string;
};

const IMPORT_PARAMETER_DEFAULTS: ImportParameterDefaults = sharedDefaults.IMPORT_PARAMETER_DEFAULTS;

export const CALCULATE_PROBABILITY_FORMULA: string = sharedDefaults.CALCULATE_PROBABILITY_FORMULA;

export function cloneImportParameterDefaults(): ImportParameterDefaults {
  return JSON.parse(JSON.stringify(IMPORT_PARAMETER_DEFAULTS));
}
