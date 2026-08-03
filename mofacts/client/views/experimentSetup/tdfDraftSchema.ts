function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function declareTutorPropertiesInBranch(
  branch: Record<string, any> | undefined,
  tutorProperties: Record<string, any>
) {
  if (!branch) return;

  const branchProperties = branch.properties || {};
  branch.properties = Object.fromEntries(
    Object.entries(tutorProperties).map(([key, propertySchema]) => [
      key,
      {
        ...propertySchema,
        ...(branchProperties[key] || {})
      }
    ])
  );
}

/**
 * JSON Editor 2.15.2 applies its no-additional-properties option to an active
 * conditional branch independently of the enclosing object schema. Declare
 * the tutor's canonical properties in both branches so valid sibling fields
 * are not reported as additional while preserving branch-specific rules.
 */
export function prepareTutorSchemaForJsonEditor(tutorSchema: Record<string, any>) {
  const preparedSchema = clone(tutorSchema || {});
  const tutorProperties = preparedSchema.properties || {};

  for (const conditional of preparedSchema.allOf || []) {
    declareTutorPropertiesInBranch(conditional.then, tutorProperties);
    declareTutorPropertiesInBranch(conditional.else, tutorProperties);
  }

  return preparedSchema;
}
