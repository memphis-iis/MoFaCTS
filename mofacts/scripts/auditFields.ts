import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DELIVERY_SETTINGS,
} from '../client/views/experiment/svelte/machine/constants.ts';
import {
  DELIVERY_SETTINGS_ALIAS_TO_CANONICAL,
  DELIVERY_SETTINGS_FIELD_REGISTRY,
  DELIVERY_SETTINGS_RUNTIME_INVENTORY,
  DELIVERY_SETTINGS_SUPPORTED_KEYS,
  createDeliverySettingTooltipMap,
  createDeliverySettingValidationCoverage,
  createDeliverySettingValidatorMap,
  createStimTooltipMap,
  createStimValidatorMap,
  createTdfTooltipMap,
  createTdfValidatorMap,
  STIM_REGISTRY_SECTIONS,
  STIM_VALIDATION_COVERAGE,
  TDF_REGISTRY_SECTIONS,
  TDF_VALIDATION_COVERAGE,
  DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE,
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS,
  DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY,
} from '../common/fieldRegistry.ts';
import {
  buildTdfSchema,
  buildStimSchema,
  tdfSchemaPath,
  stimSchemaPath,
} from './schemaGeneration.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const importParameterDefaultsPath = path.resolve(
  __dirname,
  '../lib/importParameterDefaultsShared.json'
);

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

function supportedSchemaKeys(registry) {
  return supportedKeys(registry).filter((key) => registry[key]?.surfaces?.schema !== false);
}

function collectFailures() {
  const failures = [];
  const generatedTdfSchema = buildTdfSchema();
  const generatedStimSchema = buildStimSchema();
  const committedTdfSchema = readJson(tdfSchemaPath);
  const committedStimSchema = readJson(stimSchemaPath);
  const importParameterDefaults = readJson(importParameterDefaultsPath).IMPORT_PARAMETER_DEFAULTS || {};

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
    ...createDeliverySettingTooltipMap(),
  };
  const stimTooltipMap = createStimTooltipMap();
  const tdfValidatorMap = {
    ...createTdfValidatorMap(),
    ...createDeliverySettingValidatorMap(),
  };
  const stimValidatorMap = createStimValidatorMap();
  const nestedSchemaKeys = {
    'tutor.setspec': ['unitTemplate'],
    'tutor.unit[]': ['deliverySettings', 'learningsession', 'assessmentsession', 'videosession'],
    'tutor.unit[].assessmentsession': ['conditiontemplatesbygroup'],
    'setspec.clusters[]': ['stims'],
    'setspec.clusters[].stims[]': ['display', 'response'],
  };

  for (const section of TDF_REGISTRY_SECTIONS) {
    const schemaNode = getSchemaAtPath(generatedTdfSchema, section.schemaPath);
    const expectedKeys = supportedKeys(section.registry);
    const expectedSchemaKeys = supportedSchemaKeys(section.registry);
    const extraKeys = nestedSchemaKeys[section.schemaLabel] || [];
    const propertyKeys = Object.keys(schemaNode?.properties || {});
    const unsupportedKeys = propertyKeys.filter((key) => !expectedSchemaKeys.includes(key) && !extraKeys.includes(key));
    const missingKeys = expectedSchemaKeys.filter((key) => !propertyKeys.includes(key));

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

        const coverageKey = section.schemaLabel.includes('learningsession')
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
    const expectedSchemaKeys = supportedSchemaKeys(section.registry);
    const extraKeys = nestedSchemaKeys[section.schemaLabel] || [];
    const propertyKeys = Object.keys(schemaNode?.properties || {});
    const unsupportedKeys = propertyKeys.filter((key) => !expectedSchemaKeys.includes(key) && !extraKeys.includes(key));
    const missingKeys = expectedSchemaKeys.filter((key) => !propertyKeys.includes(key));

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
    'deliverySettings',
    'unit[].deliverySettings',
    'setspec.unitTemplate[].deliverySettings',
  ];
  for (const key of DELIVERY_SETTINGS_SUPPORTED_KEYS) {
    for (const prefix of deliveryParamPaths) {
      const fieldPath = `${prefix}.${key}`;
      if (!tdfTooltipMap[fieldPath]) {
        failures.push({
          category: 'Tooltip projection completeness',
          message: `Missing tooltip metadata for ${fieldPath}`,
        });
      }

      if (createDeliverySettingValidationCoverage()[key] !== 'none' && !tdfValidatorMap[fieldPath]) {
        failures.push({
          category: 'Validator projection completeness',
          message: `Missing validator metadata for ${fieldPath}`,
        });
      }
    }
  }

  for (const key of DELIVERY_SETTINGS_RUNTIME_INVENTORY.directRuntimeKeys || []) {
    if (
      !DELIVERY_SETTINGS_RUNTIME_INVENTORY.canonicalKeys.includes(key) &&
      !Object.prototype.hasOwnProperty.call(DELIVERY_SETTINGS_RUNTIME_INVENTORY.aliasToCanonical, key)
    ) {
      failures.push({
        category: 'Registry completeness against runtime inventories',
        message: `Direct runtime key "${key}" is not represented as a canonical key or alias`,
      });
    }
  }

  const allowedImportOnlyKeys = new Set(['lfparameter']);
  for (const key of Object.keys(importParameterDefaults)) {
    if (!DELIVERY_SETTINGS_SUPPORTED_KEYS.includes(key) && !allowedImportOnlyKeys.has(key)) {
      failures.push({
        category: 'Import defaults against registry',
        message: `Import parameter default "${key}" is not a supported delivery setting or approved import-only key`,
      });
    }
  }

  for (const [key, field] of Object.entries(DELIVERY_SETTINGS_FIELD_REGISTRY)) {
    for (const alias of field.aliases || []) {
      if (DELIVERY_SETTINGS_ALIAS_TO_CANONICAL[alias] !== key) {
        failures.push({
          category: 'Alias and migration coverage',
          message: `Alias ${alias} does not resolve to canonical key ${key}`,
        });
      }
    }
  }

  if (stableJson(DEFAULT_DELIVERY_SETTINGS) !== stableJson(DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS)) {
    failures.push({
      category: 'Registry completeness against runtime inventories',
      message: 'DEFAULT_DELIVERY_SETTINGS does not match the registry-derived delivery settings defaults',
    });
  }

  for (const runtimeKey of DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.runtimeKeys) {
    if (!Object.prototype.hasOwnProperty.call(DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS, runtimeKey)) {
      failures.push({
        category: 'Registry completeness against runtime inventories',
        message: `Delivery display setting runtime key "${runtimeKey}" is missing a runtime default`,
      });
    }
  }

  for (const deprecatedKey of DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.deprecatedKeys) {
    if (!DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE[deprecatedKey]) {
      failures.push({
        category: 'Alias and migration coverage',
        message: `Deprecated delivery display setting "${deprecatedKey}" is missing migration guidance`,
      });
    }
  }

  return failures;
}

function printReport(failures) {
  console.log('Field Registry Audit');
  console.log(`TDF registry sections: ${TDF_REGISTRY_SECTIONS.length}`);
  console.log(`Stim registry sections: ${STIM_REGISTRY_SECTIONS.length}`);
  console.log(`Delivery timing/control settings supported: ${DELIVERY_SETTINGS_SUPPORTED_KEYS.length}`);
  console.log(`Delivery timing/control settings learner-configurable: ${DELIVERY_SETTINGS_RUNTIME_INVENTORY.learnerConfigurableKeys.length}`);
  console.log(`Delivery display settings supported: ${DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.supportedKeys.length}`);
  console.log(`Delivery display settings learner-configurable: ${DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.learnerConfigurableKeys.length}`);
  console.log(`Delivery display settings deprecated: ${DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY.deprecatedKeys.length}`);

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
