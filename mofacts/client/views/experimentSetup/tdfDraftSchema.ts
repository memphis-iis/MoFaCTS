function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function declarePropertiesInBranch(
  branch: Record<string, any> | undefined,
  canonicalProperties: Record<string, any>
) {
  if (!branch) return;

  const branchProperties = branch.properties || {};
  branch.properties = Object.fromEntries(
    Object.entries(canonicalProperties).map(([key, propertySchema]) => [
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
 * allOf member and conditional branch independently of the enclosing object
 * schema. Declare canonical properties in the condition and its unit-exclusion
 * check too, so strict validation does not change which branch applies.
 */
export function prepareTutorSchemaForJsonEditor(tutorSchema: Record<string, any>) {
  const preparedSchema = clone(tutorSchema || {});
  function prepareObject(schema: Record<string, any>) {
    // Unit objects have their own conditional session exclusions. Prepare
    // nested definitions before sharing canonical properties into branches.
    for (const property of Object.values(schema.properties || {}) as Record<string, any>[]) prepareObject(property);
    if (schema.items && !Array.isArray(schema.items)) prepareObject(schema.items);
    const properties = schema.properties || {};
    for (const conditional of schema.allOf || []) {
      for (const branch of [conditional, conditional.if, conditional.then, conditional.then?.not, conditional.else,
        ...(conditional.then?.not?.anyOf || [])]) declarePropertiesInBranch(branch, properties);
    }
  }
  prepareObject(preparedSchema);
  return preparedSchema;
}
