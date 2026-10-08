// The app owns field lifecycle policy; the learning component receives it as
// an explicit dependency and never interprets opaque unit metadata.
import { UNIT_FIELD_REGISTRY } from '../tdfFieldRegistries';
import {
  validateTdfExpressions as validateExpressions,
  assertValidTdfExpressions as assertExpressions,
} from '../../../learning-components/content/tdfExpressionValidation';

const ignoredUnitFields = new Set(Object.entries(UNIT_FIELD_REGISTRY)
  .filter(([, field]) => field.lifecycle.status === 'ignored')
  .map(([key]) => key));

export function validateTdfExpressions(tdfValue: unknown, rootPath = 'tdfs.tutor') {
  return validateExpressions(tdfValue, rootPath, ignoredUnitFields);
}

export function assertValidTdfExpressions(tdfValue: unknown, rootPath = 'tdfs.tutor'): void {
  assertExpressions(tdfValue, rootPath, ignoredUnitFields);
}
