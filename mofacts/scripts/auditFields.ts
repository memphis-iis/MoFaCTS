import fs from 'node:fs';
import {
  DEFAULT_UI_SETTINGS,
} from '../client/views/experiment/svelte/machine/constants.ts';
import {
  DELIVERY_PARAM_ALIAS_TO_CANONICAL,
  DELIVERY_PARAM_FIELD_REGISTRY,
  DELIVERY_PARAM_RUNTIME_INVENTORY,
  DELIVERY_PARAM_SUPPORTED_KEYS,
  createDeliveryParamTooltipMap,
  createDeliveryParamValidationCoverage,
  createDeliveryParamValidatorMap,
  createStimTooltipMap,
  createStimValidatorMap,
  createTdfTooltipMap,
  createTdfValidatorMap,
  STIM_REGISTRY_SECTIONS,
  STIM_VALIDATION_COVERAGE,
  TDF_REGISTRY_SECTIONS,
  TDF_VALIDATION_COVERAGE,
  UI_SETTINGS_DEPRECATED_GUIDANCE,
  UI_SETTINGS_RUNTIME_DEFAULTS,
  UI_SETTINGS_RUNTIME_INVENTORY,
} from '../common/fieldRegistry.ts';
import {
  buildTdfSchema,
  buildStimSchema,
  tdfSchemaPath,
  stimSchemaPath,
} from './schemaGeneration.ts';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function getSchemaAtPath(schema, path) {
  let current = schema;
  for (const segment of path) {
    if (!current) {
      return null;
    }
    current = segment === 'items' ? current.items : current.properties?.[segment];
  }
  return current || null;
}

function supportedKeys(registry) {
  return Object.keys(registry).filter((key) => registry[key]?.lifecycle.status === 'supported');
}

function collectFailures() {
  const failures = [];
  const generatedTdfSchema = buildTdfSchema();
  const generatedStimSchema = buildStimSchema();
  const committedTdfSchema = readJson(tdfSchemaPath);
  const committedStimSchema = readJson(stimSchemaPath);

  if (stableJson(generatedTdfSchema) !== stableJson(committedTdfSchema)) {
    failures.push({
      category: 'Generated schema freshness',
      message: 'Committed public/tdfSchema.json is stale relative to scripts/generateSchemas.ts',
    });
  }

  if (stableJson(generatedStimSchema) !== stableJson(committedStimSchema)) {
    failures.push({
      category: 'Generated schema freshness',
      message: 'Committed public/stimSchema.json is stale relative to scripts/generateSchemas.ts',
    });
  }

  const tdfTooltipMap = {
    ...createTdfTooltipMap(),
    ...createDeliveryParamTooltipMap(),
  };
  const stimTooltipMap = createStimTooltipMap();
  const tdfValidatorMap = {
    ...createTdfValidatorMap(),
    ...createDeliveryParamValidatorMap(),
  };
  const stimValidatorMap = createStimValidatorMap();
  const nestedSchemaKeys = {
    'tutor.setspec': ['uiSettings', 'unitTemplate'],
    'tutor.unit[]': ['deliveryparams', 'uiSettings', 'learningsession', 'assessmentsession', 'videosession'],
    'tutor.unit[].assessmentsession': ['conditiontemplatesbygroup'],
    'setspec.clusters[]': ['stims'],
    'setspec.clusters[].stims[]': ['display', 'response'],
  };

  for (const section of TDF_REGISTRY_SECTIONS) {
    const schemaNode = getSchemaAtPath(generatedTdfSchema, section.schemaPath);
    const expectedKeys = supportedKeys(section.registry);
    const extraKeys = nestedSchemaKeys[section.schemaLabel] || [];
    const propertyKeys = Object.keys(schemaNode?.properties || {});
    const unsupportedKeys = propertyKeys.filter((key) => !expectedKeys.includes(key) && !extraKeys.includes(key));
    const missingKeys = expectedKeys.filter((key) => !propertyKeys.includes(key));

    if (schemaNode?.additionalProperties !== false) {
      failures.push({
        category: 'Closed authoring schema',
        message: `${section.schemaLabel} should set additionalProperties: false`,
      });
    }
    if (unsupportedKeys.length > 0) {
      failures.push({
        category: 'Deprecated or ignored fields in authoring schema',
        message: `${section.schemaLabel} contains non-supported keys: ${unsupportedKeys.join(', ')}`,
      });
    }
    if (missingKeys.length > 0) {
      failures.push({
        category: 'Registry completeness against generated schema',
        message: `${section.schemaLabel} is missing supported keys: ${missingKeys.join(', ')}`,
      });
    }

    for (const key of expectedKeys) {
      for (const prefix of section.tooltipPrefixes) {
        const fieldPath = `${prefix}.${key}`;
        if (!tdfTooltipMap[fieldPath]) {
          failures.push({
            category: 'Tooltip projection completeness',
            message: `Missing tooltip metadata for ${fieldPath}`,
          });
        }

        const coverageKey = section.schemaLabel.includes('uiSettings')
          ? 'uiSettings'
          : section.schemaLabel.includes('learningsession')
            ? 'learningsession'
            : section.schemaLabel.includes('conditiontemplatesbygroup')
              ? 'conditiontemplatesbygroup'
              : section.schemaLabel.includes('assessmentsession')
                ? 'assessmentsession'
                : section.schemaLabel.includes('videosession')
                  ? 'videosession'
                  : section.schemaLabel.includes('setspec')
                    ? 'setspec'
                    : 'unit';
        const validationKind = TDF_VALIDATION_COVERAGE[coverageKey]?.[key];
        if (validationKind === 'validator' && !tdfValidatorMap[fieldPath]) {
          failures.push({
            category: 'Validator projection completeness',
            message: `Missing validator metadata for ${fieldPath}`,
          });
        }
      }
    }

    for (const key of section.directRuntimeKeys || []) {
      if (extraKeys.includes(key)) {
        continue;
      }
      if (!expectedKeys.includes(key)) {
        failures.push({
          category: 'Registry completeness against runtime inventories',
          message: `${section.schemaLabel} runtime key "${key}" is not represented in the registry`,
        });
      }
    }
  }

  for (const section of STIM_REGISTRY_SECTIONS) {
    const schemaNode = getSchemaAtPath(generatedStimSchema, section.schemaPath);
    const expectedKeys = supportedKeys(section.registry);
    const extraKeys = nestedSchemaKeys[section.schemaLabel] || [];
    const propertyKeys = Object.keys(schemaNode?.properties || {});
    const unsupportedKeys = propertyKeys.filter((key) => !expectedKeys.includes(key) && !extraKeys.includes(key));
    const missingKeys = expectedKeys.filter((key) => !propertyKeys.includes(key));

    if (schemaNode?.additionalProperties !== false) {
      failures.push({
        category: 'Closed authoring schema',
        message: `${section.schemaLabel} should set additionalProperties: false`,
      });
    }
    if (unsupportedKeys.length > 0) {
      failures.push({
        category: 'Deprecated or ignored fields in authoring schema',
        message: `${section.schemaLabel} contains non-supported keys: ${unsupportedKeys.join(', ')}`,
      });
    }
    if (missingKeys.length > 0) {
      failures.push({
        category: 'Registry completeness against generated schema',
        message: `${section.schemaLabel} is missing supported keys: ${missingKeys.join(', ')}`,
      });
    }

    for (const key of expectedKeys) {
      for (const prefix of section.tooltipPrefixes) {
        const fieldPath = `${prefix}.${key}`;
        if (!stimTooltipMap[fieldPath]) {
          failures.push({
            category: 'Tooltip projection completeness',
            message: `Missing tooltip metadata for ${fieldPath}`,
          });
        }

        const coverageKey = section.schemaLabel.includes('.response')
          ? 'response'
          : section.schemaLabel.includes('.display')
            ? 'display'
            : section.schemaLabel.includes('.stims[]')
              ? 'stim'
              : 'cluster';
        const validationKind = STIM_VALIDATION_COVERAGE[coverageKey]?.[key];
        if (validationKind === 'validator' && !stimValidatorMap[fieldPath]) {
          failures.push({
            category: 'Validator projection completeness',
            message: `Missing validator metadata for ${fieldPath}`,
          });
        }
      }
    }

    for (const key of section.directRuntimeKeys || []) {
      if (!expectedKeys.includes(key)) {
        failures.push({
          category: 'Registry completeness against runtime inventories',
          message: `${section.schemaLabel} runtime key "${key}" is not represented in the registry`,
        });
      }
    }
  }

  const deliveryParamPaths = [
    'deliveryparams',
    'unit[].deliveryparams',
    'setspec.unitTemplate[].deliveryparams',
  ];
  for (const key of DELIVERY_PARAM_SUPPORTED_KEYS) {
    for (const prefix of deliveryParamPaths) {
      const fieldPath = `${prefix}.${key}`;
      if (!tdfTooltipMap[fieldPath]) {
        failures.push({
          category: 'Tooltip projection completeness',
          message: `Missing tooltip metadata for ${fieldPath}`,
        });
      }

      if (createDeliveryParamValidationCoverage()[key] !== 'none' && !tdfValidatorMap[fieldPath]) {
        failures.push({
          category: 'Validator projection completeness',
          message: `Missing validator metadata for ${fieldPath}`,
        });
      }
    }
  }

  for (const key of DELIVERY_PARAM_RUNTIME_INVENTORY.directRuntimeKeys || []) {
    if (
      !DELIVERY_PARAM_RUNTIME_INVENTORY.canonicalKeys.includes(key) &&
      !Object.prototype.hasOwnProperty.call(DELIVERY_PARAM_RUNTIME_INVENTORY.aliasToCanonical, key)
    ) {
      failures.push({
        category: 'Registry completeness against runtime inventories',
        message: `Direct runtime key "${key}" is not represented as a canonical key or alias`,
      });
    }
  }

  if (DELIVERY_PARAM_ALIAS_TO_CANONICAL.allowRevisitUnit !== 'allowRevistUnit') {
    failures.push({
      category: 'Alias and migration coverage',
      message: 'Legacy alias allowRevisitUnit -> allowRevistUnit is missing',
    });
  }

  for (const [key, field] of Object.entries(DELIVERY_PARAM_FIELD_REGISTRY)) {
    for (const alias of field.aliases || []) {
      if (DELIVERY_PARAM_ALIAS_TO_CANONICAL[alias] !== key) {
        failures.push({
          category: 'Alias and migration coverage',
          message: `Alias ${alias} does not resolve to canonical key ${key}`,
        });
      }
    }
  }

  if (stableJson(DEFAULT_UI_SETTINGS) !== stableJson(UI_SETTINGS_RUNTIME_DEFAULTS)) {
    failures.push({
      category: 'Registry completeness against runtime inventories',
      message: 'DEFAULT_UI_SETTINGS does not match the registry-derived UI settings defaults',
    });
  }

  for (const supportedKey of UI_SETTINGS_RUNTIME_INVENTORY.supportedKeys) {
    if (!Object.prototype.hasOwnProperty.call(UI_SETTINGS_RUNTIME_DEFAULTS, supportedKey)) {
      failures.push({
        category: 'Registry completeness against runtime inventories',
        message: `UI settings supported key "${supportedKey}" is missing a runtime default`,
      });
    }
  }

  for (const deprecatedKey of UI_SETTINGS_RUNTIME_INVENTORY.deprecatedKeys) {
    if (!UI_SETTINGS_DEPRECATED_GUIDANCE[deprecatedKey]) {
      failures.push({
        category: 'Alias and migration coverage',
        message: `Deprecated UI setting "${deprecatedKey}" is missing migration guidance`,
      });
    }
  }

  return failures;
}

function printReport(failures) {
  console.log('Field Registry Audit');
  console.log(`TDF registry sections: ${TDF_REGISTRY_SECTIONS.length}`);
  console.log(`Stim registry sections: ${STIM_REGISTRY_SECTIONS.length}`);
  console.log(`Delivery params supported: ${DELIVERY_PARAM_SUPPORTED_KEYS.length}`);
  console.log(`UI settings supported: ${UI_SETTINGS_RUNTIME_INVENTORY.supportedKeys.length}`);
  console.log(`UI settings deprecated: ${UI_SETTINGS_RUNTIME_INVENTORY.deprecatedKeys.length}`);

  if (failures.length === 0) {
    console.log('Audit passed.');
    return;
  }

  console.log('Audit failed:');
  failures.forEach((failure) => {
    console.log(`- [${failure.category}] ${failure.message}`);
  });
}

function main() {
  const failures = collectFailures();
  printReport(failures);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
