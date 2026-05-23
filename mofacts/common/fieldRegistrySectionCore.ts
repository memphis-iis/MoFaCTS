import {
  type TdfUnitType,
} from './fieldApplicability.ts';

export type FieldLifecycleStatus = 'supported' | 'deprecated' | 'ignored';
export type ValidatorSeverity = 'error' | 'warning';
export type DeliveryDisplayRuntimeCoercionKind = 'none' | 'boolean' | 'number';
export type DeliveryDisplayRuntimeValidationKind =
  | 'any'
  | 'boolean'
  | 'booleanOrEnum'
  | 'color'
  | 'enum'
  | 'integerRange'
  | 'numberRange'
  | 'string'
  | 'stringMaxLength'
  | 'stringMaxLengthNonEmpty';

export type TooltipContent = {
  brief: string;
  verbose: string;
};

export type ValidatorConfig = {
  validators: Array<Record<string, unknown>>;
  severity: ValidatorSeverity;
  breaking?: boolean;
};

export type DeliveryDisplayRuntimeValidationDefinition = {
  kind: DeliveryDisplayRuntimeValidationKind;
  min?: number;
  max?: number;
  values?: readonly string[];
};

export type SectionFieldDefinition = {
  authoringSchema: Record<string, unknown>;
  surfaces?: {
    schema?: boolean;
    editor?: boolean;
    learnerConfig?: boolean;
    runtime?: boolean;
  };
  appliesToUnitTypes?: readonly TdfUnitType[];
  lifecycle: {
    status: FieldLifecycleStatus;
  };
  tooltip: TooltipContent;
  validation?: ValidatorConfig | null;
  runtime?: {
    default?: unknown;
    coerce?: DeliveryDisplayRuntimeCoercionKind;
    validation?: DeliveryDisplayRuntimeValidationDefinition;
  };
  migration?: {
    replacement?: string;
    note?: string;
  };
  aliases?: readonly string[];
};

export type SectionFieldRegistry = Record<string, SectionFieldDefinition>;

export type RegistrySectionDescriptor = {
  schemaLabel: string;
  schemaPath: string[];
  tooltipPrefixes: string[];
  registry: SectionFieldRegistry;
  directRuntimeKeys?: readonly string[];
};

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function withGrid(schema: Record<string, unknown>, gridColumns?: number): Record<string, unknown> {
  if (!gridColumns) {
    return schema;
  }
  return {
    ...schema,
    options: {
      ...((schema.options as Record<string, unknown>) || {}),
      grid_columns: gridColumns,
    },
  };
}

export function stringField(defaultValue?: string, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'string' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

export function textareaField(defaultValue = ''): Record<string, unknown> {
  return withGrid(
    {
      type: 'string',
      default: defaultValue,
      format: 'textarea',
    },
    12
  );
}

export function integerField(defaultValue?: number, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'integer' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

export function booleanField(defaultValue?: boolean, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'boolean' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

export function enumStringField(
  values: readonly string[],
  defaultValue?: string,
  gridColumns?: number
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: 'string',
    enum: [...values],
  };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

// Sourced from Google Cloud's published supported-language tables on April 7, 2026.
export const GOOGLE_STT_LANGUAGE_CODES = Object.freeze([
  'af-ZA',
  'am-ET',
  'ar-AE',
  'ar-BH',
  'ar-DZ',
  'ar-EG',
  'ar-IL',
  'ar-IQ',
  'ar-JO',
  'ar-KW',
  'ar-LB',
  'ar-MA',
  'ar-MR',
  'ar-OM',
  'ar-PS',
  'ar-QA',
  'ar-SA',
  'ar-SY',
  'ar-TN',
  'ar-YE',
  'az-AZ',
  'bg-BG',
  'bn-BD',
  'bn-IN',
  'bs-BA',
  'ca-ES',
  'cs-CZ',
  'da-DK',
  'de-AT',
  'de-CH',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-GH',
  'en-HK',
  'en-IE',
  'en-IN',
  'en-KE',
  'en-NG',
  'en-NZ',
  'en-PH',
  'en-PK',
  'en-SG',
  'en-TZ',
  'en-US',
  'en-ZA',
  'es-AR',
  'es-BO',
  'es-CL',
  'es-CO',
  'es-CR',
  'es-DO',
  'es-EC',
  'es-ES',
  'es-GT',
  'es-HN',
  'es-MX',
  'es-NI',
  'es-PA',
  'es-PE',
  'es-PR',
  'es-PY',
  'es-SV',
  'es-US',
  'es-UY',
  'es-VE',
  'et-EE',
  'eu-ES',
  'fa-IR',
  'fi-FI',
  'fil-PH',
  'fr-BE',
  'fr-CA',
  'fr-CH',
  'fr-FR',
  'gl-ES',
  'gu-IN',
  'hi-IN',
  'hr-HR',
  'hu-HU',
  'hy-AM',
  'id-ID',
  'is-IS',
  'it-CH',
  'it-IT',
  'iw-IL',
  'ja-JP',
  'jv-ID',
  'ka-GE',
  'kk-KZ',
  'km-KH',
  'kn-IN',
  'ko-KR',
  'lo-LA',
  'lt-LT',
  'lv-LV',
  'mk-MK',
  'ml-IN',
  'mn-MN',
  'mr-IN',
  'ms-MY',
  'my-MM',
  'ne-NP',
  'nl-BE',
  'nl-NL',
  'no-NO',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'rw-RW',
  'si-LK',
  'sk-SK',
  'sl-SI',
  'sq-AL',
  'sr-RS',
  'st-ZA',
  'su-ID',
  'sv-SE',
  'sw-KE',
  'sw-TZ',
  'ta-IN',
  'ta-LK',
  'ta-MY',
  'ta-SG',
  'te-IN',
  'th-TH',
  'tr-TR',
  'ts-ZA',
  'uk-UA',
  'ur-IN',
  'ur-PK',
  'uz-UZ',
  've-ZA',
  'vi-VN',
  'xh-ZA',
  'zu-ZA',
] as const);

export const GOOGLE_TTS_LANGUAGE_CODES = Object.freeze([
  'af-ZA',
  'ar-XA',
  'bg-BG',
  'bn-IN',
  'ca-ES',
  'cmn-CN',
  'cmn-TW',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-GB',
  'en-IN',
  'en-US',
  'es-ES',
  'es-US',
  'et-EE',
  'eu-ES',
  'fi-FI',
  'fil-PH',
  'fr-CA',
  'fr-FR',
  'gl-ES',
  'gu-IN',
  'he-IL',
  'hi-IN',
  'hr-HR',
  'hu-HU',
  'id-ID',
  'is-IS',
  'it-IT',
  'ja-JP',
  'kn-IN',
  'ko-KR',
  'lt-LT',
  'lv-LV',
  'ml-IN',
  'mr-IN',
  'ms-MY',
  'nb-NO',
  'nl-BE',
  'nl-NL',
  'pa-IN',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'sk-SK',
  'sl-SI',
  'sr-RS',
  'sv-SE',
  'ta-IN',
  'te-IN',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'ur-IN',
  'vi-VN',
  'yue-HK',
] as const);

export function legacyBooleanField(defaultValue?: string | boolean, gridColumns = 4): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    anyOf: [
      {
        type: 'string',
        enum: ['true', 'false'],
      },
      {
        type: 'boolean',
      },
    ],
  };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

export function stringArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'string',
      title: itemTitle,
    },
  };
}

export function integerArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'integer',
      title: itemTitle,
    },
  };
}

export function numberArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'number',
      title: itemTitle,
    },
  };
}

export function simpleField(
  authoringSchema: Record<string, unknown>,
  tooltip: TooltipContent,
  options: Partial<SectionFieldDefinition> = {}
): SectionFieldDefinition {
  return {
    authoringSchema,
    lifecycle: { status: 'supported' },
    tooltip,
    validation: null,
    ...options,
  };
}

export function createClosedObjectSchema(
  title: string,
  registry: SectionFieldRegistry,
  required: string[] = [],
  defaultApplicableUnitTypes?: readonly TdfUnitType[]
): Record<string, unknown> {
  const properties = Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) =>
        definition.lifecycle.status === 'supported' &&
        definition.surfaces?.schema !== false
      )
      .map(([key, definition]) => {
        const schema: Record<string, unknown> = {
          title: definition.tooltip.brief,
          description: definition.tooltip.verbose,
          ...deepClone(definition.authoringSchema),
        };
        const applicableUnitTypes = definition.appliesToUnitTypes || defaultApplicableUnitTypes;
        if (applicableUnitTypes?.length) {
          schema['x-appliesToUnitTypes'] = [...applicableUnitTypes];
        }
        if (definition.surfaces?.editor === false) {
          schema['x-editor'] = false;
        }
        return [key, schema];
      })
  );

  const schema: Record<string, unknown> = {
    type: 'object',
    title,
    properties,
    additionalProperties: false,
  };

  const supportedRequired = required.filter((key) => Object.prototype.hasOwnProperty.call(properties, key));
  if (supportedRequired.length > 0) {
    schema.required = supportedRequired;
  }

  return schema;
}

export function createTooltipMapForRegistry(
  registry: SectionFieldRegistry,
  prefixes: string[]
): Record<string, TooltipContent> {
  const tooltips: Record<string, TooltipContent> = {};
  for (const [key, definition] of Object.entries(registry)) {
    if (definition.lifecycle.status !== 'supported') {
      continue;
    }
    for (const prefix of prefixes) {
      tooltips[`${prefix}.${key}`] = definition.tooltip;
    }
  }
  return tooltips;
}

export function createValidatorMapForRegistry(
  registry: SectionFieldRegistry,
  prefixes: string[]
): Record<string, ValidatorConfig> {
  const validators: Record<string, ValidatorConfig> = {};
  for (const [key, definition] of Object.entries(registry)) {
    if (definition.lifecycle.status !== 'supported' || !definition.validation) {
      continue;
    }
    for (const prefix of prefixes) {
      validators[`${prefix}.${key}`] = definition.validation;
    }
  }
  return validators;
}

export function createValidationCoverageForRegistry(
  registry: SectionFieldRegistry
): Record<string, 'validator' | 'none'> {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) => definition.lifecycle.status === 'supported')
      .map(([key, definition]) => [key, definition.validation ? 'validator' : 'none'])
  );
}

export function createDeprecatedGuidance(registry: SectionFieldRegistry): Record<string, string> {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) => definition.lifecycle.status === 'deprecated')
      .map(([key, definition]) => [
        key,
        definition.migration?.note ||
          definition.migration?.replacement ||
          'Deprecated field. Remove it from authored content.',
      ])
  );
}

export function createRuntimeDefaults(registry: SectionFieldRegistry): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) =>
        definition.lifecycle.status === 'supported' &&
        definition.surfaces?.runtime !== false &&
        definition.runtime
      )
      .map(([key, definition]) => [key, definition.runtime?.default])
  );
}

export function coerceDeliveryDisplayRuntimeValue(definition: SectionFieldDefinition, value: unknown): unknown {
  switch (definition.runtime?.coerce) {
    case 'boolean':
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    case 'number':
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
      }
      return value;
    case 'none':
    default:
      return value;
  }
}

export function isDeliveryDisplayRuntimeValueValid(definition: SectionFieldDefinition, value: unknown): boolean {
  const rule = definition.runtime?.validation;
  if (!rule) {
    return true;
  }

  switch (rule.kind) {
    case 'any':
      return true;
    case 'boolean':
      return typeof value === 'boolean';
    case 'booleanOrEnum':
      return typeof value === 'boolean' || rule.values?.includes(String(value)) === true;
    case 'color':
      return (
        typeof value === 'string' &&
        (/^#[0-9A-Fa-f]{3,6}$/.test(value) || /^var\(--[a-z0-9-]+\)$/i.test(value))
      );
    case 'enum':
      return rule.values?.includes(String(value)) === true;
    case 'integerRange':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        (rule.min === undefined || value >= rule.min) &&
        (rule.max === undefined || value <= rule.max)
      );
    case 'numberRange':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (rule.min === undefined || value >= rule.min) &&
        (rule.max === undefined || value <= rule.max)
      );
    case 'string':
      return typeof value === 'string';
    case 'stringMaxLength':
      return typeof value === 'string' && (rule.max === undefined || value.length <= rule.max);
    case 'stringMaxLengthNonEmpty':
      return (
        typeof value === 'string' &&
        value.length > 0 &&
        (rule.max === undefined || value.length <= rule.max)
      );
    default:
      return false;
  }
}

// Registry data continues below.
