import { createDeliverySettingSchema } from './fieldRegistry.ts';
import {
  INTERACTIVE_TDF_UNIT_TYPES,
  type TdfUnitType,
} from './fieldApplicability.ts';
import {
  coerceDeliveryDisplayRuntimeValue,
  createClosedObjectSchema,
  createDeprecatedGuidance,
  createRuntimeDefaults,
  createTooltipMapForRegistry,
  createValidationCoverageForRegistry,
  createValidatorMapForRegistry,
  isDeliveryDisplayRuntimeValueValid,
  type RegistrySectionDescriptor,
  type TooltipContent,
  type ValidatorConfig,
} from './fieldRegistrySectionCore.ts';
import { DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY } from './deliveryDisplayFieldRegistry.ts';
import {
  ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY,
  ASSESSMENT_SESSION_DIRECT_RUNTIME_KEYS,
  ASSESSMENT_SESSION_FIELD_REGISTRY,
  LEARNING_SESSION_DIRECT_RUNTIME_KEYS,
  LEARNING_SESSION_FIELD_REGISTRY,
  SETSPEC_DIRECT_RUNTIME_KEYS,
  SETSPEC_FIELD_REGISTRY,
  UNIT_DIRECT_RUNTIME_KEYS,
  UNIT_FIELD_REGISTRY,
  VIDEO_SESSION_DIRECT_RUNTIME_KEYS,
  VIDEO_SESSION_FIELD_REGISTRY,
} from './tdfFieldRegistries.ts';
import {
  AUTOTUTOR_SESSION_DIRECT_RUNTIME_KEYS,
  AUTOTUTOR_SESSION_FIELD_REGISTRY,
} from './autoTutorFieldRegistry.ts';
import {
  STIM_CLUSTER_DIRECT_RUNTIME_KEYS,
  STIM_CLUSTER_FIELD_REGISTRY,
  STIM_DIRECT_RUNTIME_KEYS,
  STIM_DISPLAY_DIRECT_RUNTIME_KEYS,
  STIM_DISPLAY_FIELD_REGISTRY,
  STIM_FIELD_REGISTRY,
  STIM_RESPONSE_DIRECT_RUNTIME_KEYS,
  STIM_RESPONSE_FIELD_REGISTRY,
} from './stimFieldRegistries.ts';

const DELIVERY_DISPLAY_SETTINGS_SUPPORTED_KEYS = Object.freeze(
  Object.keys(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY).filter(
    (key) => DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[key]?.lifecycle.status === 'supported'
  )
);

export const DELIVERY_DISPLAY_SETTINGS_LEARNER_CONFIGURABLE_KEYS = Object.freeze(
  DELIVERY_DISPLAY_SETTINGS_SUPPORTED_KEYS.filter(
    (key) => DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[key]?.surfaces?.learnerConfig !== false
  )
);

export const DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS = Object.freeze(
  DELIVERY_DISPLAY_SETTINGS_SUPPORTED_KEYS.filter(
    (key) =>
      DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[key]?.surfaces?.runtime !== false &&
      Boolean(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[key]?.runtime)
  )
);

export const DELIVERY_DISPLAY_SETTINGS_APPLICABILITY = Object.freeze(
  Object.fromEntries(
    DELIVERY_DISPLAY_SETTINGS_SUPPORTED_KEYS.map((key) => [
      key,
      [...(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[key]?.appliesToUnitTypes || INTERACTIVE_TDF_UNIT_TYPES)],
    ])
  ) as Record<string, readonly TdfUnitType[]>
);

export const DELIVERY_DISPLAY_SETTINGS_RUNTIME_DEFAULTS = Object.freeze(
  createRuntimeDefaults(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY)
);

export const DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE = Object.freeze(
  createDeprecatedGuidance(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY)
);

export const DELIVERY_DISPLAY_SETTINGS_RUNTIME_INVENTORY = Object.freeze({
  supportedKeys: DELIVERY_DISPLAY_SETTINGS_SUPPORTED_KEYS,
  runtimeKeys: DELIVERY_DISPLAY_SETTINGS_RUNTIME_KEYS,
  learnerConfigurableKeys: DELIVERY_DISPLAY_SETTINGS_LEARNER_CONFIGURABLE_KEYS,
  applicability: DELIVERY_DISPLAY_SETTINGS_APPLICABILITY,
  deprecatedKeys: Object.keys(DELIVERY_DISPLAY_SETTINGS_DEPRECATED_GUIDANCE),
});

export function coerceAndValidateDeliveryDisplaySetting(fieldName: string, rawValue: unknown): {
  valid: boolean;
  value: unknown;
  defaultValue: unknown;
} {
  const definition = DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY[fieldName];
  if (!definition || definition.lifecycle.status !== 'supported') {
    return { valid: false, value: rawValue, defaultValue: undefined };
  }

  const coercedValue = coerceDeliveryDisplayRuntimeValue(definition, rawValue);
  return {
    valid: isDeliveryDisplayRuntimeValueValid(definition, coercedValue),
    value: coercedValue,
    defaultValue: definition.runtime?.default,
  };
}

function createDeliveryDisplaySettingsSchema(): Record<string, unknown> {
  return createClosedObjectSchema('delivery settings', DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY, [], INTERACTIVE_TDF_UNIT_TYPES);
}

function createDeliverySettingsSchema(): Record<string, unknown> {
  const timingSettingsSchema = createDeliverySettingSchema();
  const displaySettingsSchema = createDeliveryDisplaySettingsSchema();
  return {
    type: 'object',
    title: 'Delivery Settings',
    description: 'Canonical learner-runtime delivery settings for timing, feedback, answer controls, prompt presentation, and related lesson behavior.',
    properties: {
      ...((timingSettingsSchema.properties as Record<string, unknown>) || {}),
      ...((displaySettingsSchema.properties as Record<string, unknown>) || {}),
    },
    additionalProperties: false,
  };
}

function createUnitDeliverySettingsSchema(): Record<string, unknown> {
  const deliverySettingsSchema = createDeliverySettingsSchema();
  return {
    oneOf: [
      deliverySettingsSchema,
      {
        type: 'array',
        title: 'Condition Delivery Settings',
        description: 'Per-condition delivery settings. The runtime selects the entry matching the active experiment condition.',
        items: deliverySettingsSchema,
      },
    ],
  };
}

function createConditionTemplateSchema(): Record<string, unknown> {
  return createClosedObjectSchema(
    'Condition Templates By Group',
    ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY
  );
}

function createAssessmentSessionSchema(): Record<string, unknown> {
  const schema = createClosedObjectSchema('Assessment Session', ASSESSMENT_SESSION_FIELD_REGISTRY);
  (schema.properties as Record<string, unknown>).conditiontemplatesbygroup = createConditionTemplateSchema();
  return schema;
}

function createLearningSessionSchema(): Record<string, unknown> {
  return createClosedObjectSchema('Learning Session', LEARNING_SESSION_FIELD_REGISTRY);
}

function createSparcSessionSchema(): Record<string, unknown> {
  return createClosedObjectSchema('SPARC Session', LEARNING_SESSION_FIELD_REGISTRY);
}

function createVideoSessionSchema(): Record<string, unknown> {
  return createClosedObjectSchema('Video Session', VIDEO_SESSION_FIELD_REGISTRY);
}

function createAutoTutorSessionSchema(): Record<string, unknown> {
  return createClosedObjectSchema('AutoTutor Session', AUTOTUTOR_SESSION_FIELD_REGISTRY);
}

function createUnitSchema(title = 'Unit'): Record<string, unknown> {
  const schema = createClosedObjectSchema(title, UNIT_FIELD_REGISTRY);
  (schema.properties as Record<string, unknown>).deliverySettings = createUnitDeliverySettingsSchema();
  (schema.properties as Record<string, unknown>).learningsession = createLearningSessionSchema();
  (schema.properties as Record<string, unknown>).sparcsession = createSparcSessionSchema();
  (schema.properties as Record<string, unknown>).assessmentsession = createAssessmentSessionSchema();
  (schema.properties as Record<string, unknown>).videosession = createVideoSessionSchema();
  (schema.properties as Record<string, unknown>).autotutorsession = createAutoTutorSessionSchema();
  return schema;
}

function createSetspecSchema(): Record<string, unknown> {
  const schema = createClosedObjectSchema('Setspec', SETSPEC_FIELD_REGISTRY, ['lessonname', 'stimulusfile']);
  (schema.properties as Record<string, unknown>).unitTemplate = {
    type: 'array',
    title: 'Unit Templates',
    items: createUnitSchema('Unit Template'),
  };
  return schema;
}

export function createTdfSchemaFromRegistry(): Record<string, unknown> {
  const tutorDeliverySettingsSchema = createDeliverySettingsSchema();
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'MoFaCTS TDF Schema',
    description: 'Schema for MoFaCTS tutor definition files, including lesson metadata, delivery settings, unit configuration, and adaptive session definitions.',
    type: 'object',
    required: ['tutor'],
    additionalProperties: false,
    properties: {
      tutor: {
        type: 'object',
        title: 'Tutor',
        required: ['setspec', 'unit'],
        additionalProperties: false,
        properties: {
          setspec: createSetspecSchema(),
          unit: {
            type: 'array',
            title: 'Units',
            items: createUnitSchema(),
          },
          deliverySettings: tutorDeliverySettingsSchema,
        },
      },
    },
  };
}

function createStimDisplaySchema(title = 'Display'): Record<string, unknown> {
  return createClosedObjectSchema(title, STIM_DISPLAY_FIELD_REGISTRY);
}

function createStimResponseSchema(title = 'Response'): Record<string, unknown> {
  return createClosedObjectSchema(title, STIM_RESPONSE_FIELD_REGISTRY);
}

function createStimSchemaObject(): Record<string, unknown> {
  const stimSchema = createClosedObjectSchema('Stim', STIM_FIELD_REGISTRY);
  (stimSchema.properties as Record<string, unknown>).display = createStimDisplaySchema();
  (stimSchema.properties as Record<string, unknown>).response = createStimResponseSchema();
  return stimSchema;
}

function createStimClusterSchema(): Record<string, unknown> {
  const clusterSchema = createClosedObjectSchema('Cluster', STIM_CLUSTER_FIELD_REGISTRY);
  (clusterSchema.properties as Record<string, unknown>).stims = {
    type: 'array',
    title: 'Stims',
    items: createStimSchemaObject(),
  };
  return clusterSchema;
}

export function createStimSchemaFromRegistry(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'MoFaCTS Stimulus Schema',
    description: 'Schema for MoFaCTS stimulus files, including clusters, learner-facing display content, expected responses, media references, and alternate displays.',
    type: 'object',
    required: ['setspec'],
    additionalProperties: false,
    properties: {
      setspec: {
        type: 'object',
        title: 'Setspec',
        required: ['clusters'],
        additionalProperties: false,
        properties: {
          clusters: {
            type: 'array',
            title: 'Clusters',
            items: createStimClusterSchema(),
          },
        },
      },
    },
  };
}

export function createTdfTooltipMap(): Record<string, TooltipContent> {
  return {
    ...createTooltipMapForRegistry(SETSPEC_FIELD_REGISTRY, ['setspec']),
    ...createTooltipMapForRegistry(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY, [
      'deliverySettings',
      'unit[].deliverySettings',
      'setspec.unitTemplate[].deliverySettings',
    ]),
    ...createTooltipMapForRegistry(UNIT_FIELD_REGISTRY, ['unit[]', 'setspec.unitTemplate[]']),
    ...createTooltipMapForRegistry(LEARNING_SESSION_FIELD_REGISTRY, [
      'unit[].learningsession',
      'setspec.unitTemplate[].learningsession',
    ]),
    ...createTooltipMapForRegistry(ASSESSMENT_SESSION_FIELD_REGISTRY, [
      'unit[].assessmentsession',
      'setspec.unitTemplate[].assessmentsession',
    ]),
    ...createTooltipMapForRegistry(ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY, [
      'unit[].assessmentsession.conditiontemplatesbygroup',
      'setspec.unitTemplate[].assessmentsession.conditiontemplatesbygroup',
    ]),
    ...createTooltipMapForRegistry(VIDEO_SESSION_FIELD_REGISTRY, [
      'unit[].videosession',
      'setspec.unitTemplate[].videosession',
    ]),
    ...createTooltipMapForRegistry(AUTOTUTOR_SESSION_FIELD_REGISTRY, [
      'unit[].autotutorsession',
      'setspec.unitTemplate[].autotutorsession',
    ]),
  };
}

export function createStimTooltipMap(): Record<string, TooltipContent> {
  return {
    ...createTooltipMapForRegistry(STIM_CLUSTER_FIELD_REGISTRY, ['[]']),
    ...createTooltipMapForRegistry(STIM_FIELD_REGISTRY, ['[].stims[]']),
    ...createTooltipMapForRegistry(STIM_DISPLAY_FIELD_REGISTRY, [
      '[].stims[].display',
      '[].stims[].alternateDisplays[]',
    ]),
    ...createTooltipMapForRegistry(STIM_RESPONSE_FIELD_REGISTRY, ['[].stims[].response']),
  };
}

export function createTdfValidatorMap(): Record<string, ValidatorConfig> {
  return {
    ...createValidatorMapForRegistry(SETSPEC_FIELD_REGISTRY, ['setspec']),
    ...createValidatorMapForRegistry(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY, [
      'deliverySettings',
      'unit[].deliverySettings',
      'setspec.unitTemplate[].deliverySettings',
    ]),
    ...createValidatorMapForRegistry(UNIT_FIELD_REGISTRY, ['unit[]', 'setspec.unitTemplate[]']),
    ...createValidatorMapForRegistry(LEARNING_SESSION_FIELD_REGISTRY, [
      'unit[].learningsession',
      'setspec.unitTemplate[].learningsession',
    ]),
    ...createValidatorMapForRegistry(ASSESSMENT_SESSION_FIELD_REGISTRY, [
      'unit[].assessmentsession',
      'setspec.unitTemplate[].assessmentsession',
    ]),
    ...createValidatorMapForRegistry(ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY, [
      'unit[].assessmentsession.conditiontemplatesbygroup',
      'setspec.unitTemplate[].assessmentsession.conditiontemplatesbygroup',
    ]),
    ...createValidatorMapForRegistry(VIDEO_SESSION_FIELD_REGISTRY, [
      'unit[].videosession',
      'setspec.unitTemplate[].videosession',
    ]),
    ...createValidatorMapForRegistry(AUTOTUTOR_SESSION_FIELD_REGISTRY, [
      'unit[].autotutorsession',
      'setspec.unitTemplate[].autotutorsession',
    ]),
  };
}

export function createStimValidatorMap(): Record<string, ValidatorConfig> {
  return {
    ...createValidatorMapForRegistry(STIM_CLUSTER_FIELD_REGISTRY, ['[]']),
    ...createValidatorMapForRegistry(STIM_FIELD_REGISTRY, ['[].stims[]']),
    ...createValidatorMapForRegistry(STIM_DISPLAY_FIELD_REGISTRY, [
      '[].stims[].display',
      '[].stims[].alternateDisplays[]',
    ]),
    ...createValidatorMapForRegistry(STIM_RESPONSE_FIELD_REGISTRY, ['[].stims[].response']),
  };
}

export const TDF_REGISTRY_SECTIONS: RegistrySectionDescriptor[] = [
  {
    schemaLabel: 'tutor.setspec',
    schemaPath: ['tutor', 'setspec'],
    tooltipPrefixes: ['setspec'],
    registry: SETSPEC_FIELD_REGISTRY,
    directRuntimeKeys: SETSPEC_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'tutor.unit[]',
    schemaPath: ['tutor', 'unit', 'items'],
    tooltipPrefixes: ['unit[]', 'setspec.unitTemplate[]'],
    registry: UNIT_FIELD_REGISTRY,
    directRuntimeKeys: UNIT_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'tutor.unit[].learningsession',
    schemaPath: ['tutor', 'unit', 'items', 'learningsession'],
    tooltipPrefixes: ['unit[].learningsession', 'setspec.unitTemplate[].learningsession'],
    registry: LEARNING_SESSION_FIELD_REGISTRY,
    directRuntimeKeys: LEARNING_SESSION_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'tutor.unit[].assessmentsession',
    schemaPath: ['tutor', 'unit', 'items', 'assessmentsession'],
    tooltipPrefixes: ['unit[].assessmentsession', 'setspec.unitTemplate[].assessmentsession'],
    registry: ASSESSMENT_SESSION_FIELD_REGISTRY,
    directRuntimeKeys: ASSESSMENT_SESSION_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'tutor.unit[].assessmentsession.conditiontemplatesbygroup',
    schemaPath: ['tutor', 'unit', 'items', 'assessmentsession', 'conditiontemplatesbygroup'],
    tooltipPrefixes: [
      'unit[].assessmentsession.conditiontemplatesbygroup',
      'setspec.unitTemplate[].assessmentsession.conditiontemplatesbygroup',
    ],
    registry: ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY,
  },
  {
    schemaLabel: 'tutor.unit[].videosession',
    schemaPath: ['tutor', 'unit', 'items', 'videosession'],
    tooltipPrefixes: ['unit[].videosession', 'setspec.unitTemplate[].videosession'],
    registry: VIDEO_SESSION_FIELD_REGISTRY,
    directRuntimeKeys: VIDEO_SESSION_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'tutor.unit[].autotutorsession',
    schemaPath: ['tutor', 'unit', 'items', 'autotutorsession'],
    tooltipPrefixes: ['unit[].autotutorsession', 'setspec.unitTemplate[].autotutorsession'],
    registry: AUTOTUTOR_SESSION_FIELD_REGISTRY,
    directRuntimeKeys: AUTOTUTOR_SESSION_DIRECT_RUNTIME_KEYS,
  },
];

export const STIM_REGISTRY_SECTIONS: RegistrySectionDescriptor[] = [
  {
    schemaLabel: 'setspec.clusters[]',
    schemaPath: ['setspec', 'clusters', 'items'],
    tooltipPrefixes: ['[]'],
    registry: STIM_CLUSTER_FIELD_REGISTRY,
    directRuntimeKeys: STIM_CLUSTER_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'setspec.clusters[].stims[]',
    schemaPath: ['setspec', 'clusters', 'items', 'stims', 'items'],
    tooltipPrefixes: ['[].stims[]'],
    registry: STIM_FIELD_REGISTRY,
    directRuntimeKeys: STIM_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'setspec.clusters[].stims[].display',
    schemaPath: ['setspec', 'clusters', 'items', 'stims', 'items', 'display'],
    tooltipPrefixes: ['[].stims[].display', '[].stims[].alternateDisplays[]'],
    registry: STIM_DISPLAY_FIELD_REGISTRY,
    directRuntimeKeys: STIM_DISPLAY_DIRECT_RUNTIME_KEYS,
  },
  {
    schemaLabel: 'setspec.clusters[].stims[].response',
    schemaPath: ['setspec', 'clusters', 'items', 'stims', 'items', 'response'],
    tooltipPrefixes: ['[].stims[].response'],
    registry: STIM_RESPONSE_FIELD_REGISTRY,
    directRuntimeKeys: STIM_RESPONSE_DIRECT_RUNTIME_KEYS,
  },
];

export const TDF_VALIDATION_COVERAGE = Object.freeze({
  setspec: createValidationCoverageForRegistry(SETSPEC_FIELD_REGISTRY),
  deliverySettings: createValidationCoverageForRegistry(DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY),
  unit: createValidationCoverageForRegistry(UNIT_FIELD_REGISTRY),
  learningsession: createValidationCoverageForRegistry(LEARNING_SESSION_FIELD_REGISTRY),
  assessmentsession: createValidationCoverageForRegistry(ASSESSMENT_SESSION_FIELD_REGISTRY),
  conditiontemplatesbygroup: createValidationCoverageForRegistry(ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY),
  videosession: createValidationCoverageForRegistry(VIDEO_SESSION_FIELD_REGISTRY),
  autotutorsession: createValidationCoverageForRegistry(AUTOTUTOR_SESSION_FIELD_REGISTRY),
});

export const STIM_VALIDATION_COVERAGE = Object.freeze({
  cluster: createValidationCoverageForRegistry(STIM_CLUSTER_FIELD_REGISTRY),
  stim: createValidationCoverageForRegistry(STIM_FIELD_REGISTRY),
  display: createValidationCoverageForRegistry(STIM_DISPLAY_FIELD_REGISTRY),
  response: createValidationCoverageForRegistry(STIM_RESPONSE_FIELD_REGISTRY),
});
