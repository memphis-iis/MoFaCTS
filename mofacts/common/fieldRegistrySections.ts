import { createDeliveryParamSchema } from './fieldRegistry.ts';

type FieldLifecycleStatus = 'supported' | 'deprecated' | 'ignored';
type ValidatorSeverity = 'error' | 'warning';
type UiRuntimeCoercionKind = 'none' | 'boolean' | 'number';
type UiRuntimeValidationKind =
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

type TooltipContent = {
  brief: string;
  verbose: string;
};

type ValidatorConfig = {
  validators: Array<Record<string, unknown>>;
  severity: ValidatorSeverity;
  breaking?: boolean;
};

type UiRuntimeValidationDefinition = {
  kind: UiRuntimeValidationKind;
  min?: number;
  max?: number;
  values?: readonly string[];
};

type SectionFieldDefinition = {
  authoringSchema: Record<string, unknown>;
  lifecycle: {
    status: FieldLifecycleStatus;
  };
  tooltip: TooltipContent;
  validation?: ValidatorConfig | null;
  runtime?: {
    default?: unknown;
    coerce?: UiRuntimeCoercionKind;
    validation?: UiRuntimeValidationDefinition;
  };
  migration?: {
    replacement?: string;
    note?: string;
  };
  aliases?: readonly string[];
};

type SectionFieldRegistry = Record<string, SectionFieldDefinition>;

type RegistrySectionDescriptor = {
  schemaLabel: string;
  schemaPath: string[];
  tooltipPrefixes: string[];
  registry: SectionFieldRegistry;
  directRuntimeKeys?: readonly string[];
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function withGrid(schema: Record<string, unknown>, gridColumns?: number): Record<string, unknown> {
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

function stringField(defaultValue?: string, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'string' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

function textareaField(defaultValue = ''): Record<string, unknown> {
  return withGrid(
    {
      type: 'string',
      default: defaultValue,
      format: 'textarea',
    },
    12
  );
}

function integerField(defaultValue?: number, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'integer' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

function booleanField(defaultValue?: boolean, gridColumns?: number): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'boolean' };
  if (defaultValue !== undefined) {
    schema.default = defaultValue;
  }
  return withGrid(schema, gridColumns);
}

function enumStringField(
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
const GOOGLE_STT_LANGUAGE_CODES = Object.freeze([
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

const GOOGLE_TTS_LANGUAGE_CODES = Object.freeze([
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

function legacyBooleanField(defaultValue?: string | boolean, gridColumns = 4): Record<string, unknown> {
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

function stringArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'string',
      title: itemTitle,
    },
  };
}

function integerArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'integer',
      title: itemTitle,
    },
  };
}

function numberArrayField(title: string, itemTitle: string): Record<string, unknown> {
  return {
    type: 'array',
    title,
    items: {
      type: 'number',
      title: itemTitle,
    },
  };
}

function simpleField(
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

function createClosedObjectSchema(
  title: string,
  registry: SectionFieldRegistry,
  required: string[] = []
): Record<string, unknown> {
  const properties = Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) => definition.lifecycle.status === 'supported')
      .map(([key, definition]) => [key, deepClone(definition.authoringSchema)])
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

function createTooltipMapForRegistry(
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

function createValidatorMapForRegistry(
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

function createValidationCoverageForRegistry(
  registry: SectionFieldRegistry
): Record<string, 'validator' | 'none'> {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) => definition.lifecycle.status === 'supported')
      .map(([key, definition]) => [key, definition.validation ? 'validator' : 'none'])
  );
}

function createDeprecatedGuidance(registry: SectionFieldRegistry): Record<string, string> {
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

function createRuntimeDefaults(registry: SectionFieldRegistry): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, definition]) => definition.lifecycle.status === 'supported')
      .map(([key, definition]) => [key, definition.runtime?.default])
  );
}

function coerceUiRuntimeValue(definition: SectionFieldDefinition, value: unknown): unknown {
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

function isUiRuntimeValueValid(definition: SectionFieldDefinition, value: unknown): boolean {
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

const SETSPEC_FIELD_REGISTRY: SectionFieldRegistry = {
  lessonname: simpleField(stringField('', 12), {
    brief: 'Full display name for the lesson.',
    verbose: 'Full name shown to learners and in reporting.'
  }, {
    validation: {
      validators: [{ type: 'required', message: 'Lesson name is required' }],
      severity: 'error',
    },
  }),
  stimulusfile: simpleField(stringField('', 12), {
    brief: 'Filename of the stimulus JSON file.',
    verbose: 'Stimulus/content filename paired with this TDF.'
  }, {
    validation: {
      validators: [{ type: 'required', message: 'Stimulus file is required' }],
      severity: 'error',
    },
  }),
  name: simpleField(stringField('', 6), {
    brief: 'Short internal lesson name.',
    verbose: 'Short internal identifier used for tracking or exports.'
  }),
  experimentTarget: simpleField(stringField('', 6), {
    brief: 'Direct experiment URL target.',
    verbose: 'Path segment used for no-login experiment links.'
  }),
  userselect: simpleField(legacyBooleanField('false'), {
    brief: 'Show lesson on the learner dashboard.',
    verbose: 'When enabled, learners can pick this lesson directly from their dashboard.'
  }),
  lfparameter: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Fuzzy matching threshold.',
    verbose: 'Edit-distance / fuzzy-match threshold used during answer evaluation.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0, max: 1, message: 'Must be between 0 and 1' }],
      severity: 'error',
    },
  }),
  hintsEnabled: simpleField(legacyBooleanField(false), {
    brief: 'Enable syllable-based hints.',
    verbose: 'Turns hint-generation support on for qualifying prompt text.'
  }),
  tags: simpleField(stringArrayField('Tags', 'Tag'), {
    brief: 'Searchable category tags.',
    verbose: 'Lesson category tags used for organization and filtering.'
  }),
  shuffleclusters: simpleField(stringField('', 12), {
    brief: 'Shuffle cluster groups.',
    verbose: 'Space-delimited start-end ranges that are shuffled within their own group.'
  }, {
    validation: {
      validators: [
        {
          type: 'clusterRangeFormat',
          message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")',
        },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  swapclusters: simpleField(stringField('', 12), {
    brief: 'Swap cluster group order.',
    verbose: 'Space-delimited cluster ranges treated as shuffleable groups.'
  }, {
    validation: {
      validators: [
        {
          type: 'clusterRangeFormat',
          message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")',
        },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  enableAudioPromptAndFeedback: simpleField(legacyBooleanField('false'), {
    brief: 'Enable text-to-speech prompts and feedback.',
    verbose: 'Advertises and enables lesson audio prompt/feedback support.'
  }),
  speechAPIKey: simpleField(stringField('', 12), {
    brief: 'Speech recognition API key.',
    verbose: 'Google Speech API key used for speech recognition.'
  }),
  textToSpeechAPIKey: simpleField(stringField('', 12), {
    brief: 'Text-to-speech API key.',
    verbose: 'Google TTS API key used for lesson audio output.'
  }),
  audioInputEnabled: simpleField(legacyBooleanField('false'), {
    brief: 'Enable speech recognition.',
    verbose: 'Enables microphone-based speech recognition for the lesson.'
  }),
  speechRecognitionLanguage: simpleField(enumStringField(GOOGLE_STT_LANGUAGE_CODES, 'en-US', 4), {
    brief: 'Speech-recognition language code.',
    verbose: 'Google Speech-to-Text language code used for microphone transcription, such as "en-US" or "es-ES".'
  }),
  audioInputSensitivity: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Speech detection threshold.',
    verbose: 'Approximate dB threshold used when deciding whether incoming audio counts as speech.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 20, max: 80, message: 'Must be between 20 and 80 dB' }],
      severity: 'warning',
    },
  }),
  audioPromptMode: simpleField(enumStringField(['silent', 'question', 'feedback', 'all'], 'silent', 4), {
    brief: 'Default TTS mode.',
    verbose: 'Default learner audio mode when opening the lesson.'
  }),
  textToSpeechLanguage: simpleField(enumStringField(GOOGLE_TTS_LANGUAGE_CODES, 'en-US', 4), {
    brief: 'Text-to-speech language code.',
    verbose: 'Google Text-to-Speech language code used for synthesized audio, such as "en-US" or "es-ES".'
  }),
  speechIgnoreOutOfGrammarResponses: simpleField(legacyBooleanField('false'), {
    brief: 'Ignore speech not in the answer set.',
    verbose: 'Discard speech transcripts that do not match the active grammar/answer set.'
  }),
  speechOutOfGrammarFeedback: simpleField(stringField('', 12), {
    brief: 'Message for ignored speech input.',
    verbose: 'Feedback shown when out-of-grammar speech is discarded.'
  }),
  audioPromptVoice: simpleField(stringField('', 6), {
    brief: 'Question voice ID.',
    verbose: 'Voice identifier used for spoken question prompts.'
  }),
  audioPromptFeedbackVoice: simpleField(stringField('', 6), {
    brief: 'Feedback voice ID.',
    verbose: 'Voice identifier used for spoken feedback prompts.'
  }),
  audioPromptQuestionSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Question speaking rate.',
    verbose: 'Speech speed multiplier for question prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  audioPromptFeedbackSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Feedback speaking rate.',
    verbose: 'Speech speed multiplier for feedback prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  audioPromptSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Legacy overall speaking rate.',
    verbose: 'Legacy lesson-wide speech speed multiplier.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  loadbalancing: simpleField(enumStringField(['max', 'min'], undefined, 4), {
    brief: 'Condition assignment mode.',
    verbose: 'Controls root-TDF experiment condition load balancing.'
  }),
  countcompletion: simpleField(
    withGrid(
      {
        anyOf: [
          { type: 'string', enum: ['beginning', 'end'] },
          { type: 'integer' },
          { type: 'boolean' },
        ],
      },
      4
    ),
    {
      brief: 'When participant counts increment.',
      verbose: 'Controls when condition completion counts are incremented.'
    }
  ),
  condition: simpleField(stringArrayField('Conditions', 'Condition'), {
    brief: 'Experiment condition file names.',
    verbose: 'Condition TDF filenames used by root experiments.'
  }),
  randomizedDelivery: simpleField({
    type: 'array',
    title: 'Randomized Delivery',
    items: {
      anyOf: [{ type: 'integer' }, { type: 'string' }],
      title: 'Condition Count',
    },
  }, {
    brief: 'Retention interval condition count.',
    verbose: 'Legacy array-based count used to randomize delivery/x-condition selection.'
  }),
  prestimulusDisplay: simpleField(textareaField(''), {
    brief: 'Prestimulus prompt text.',
    verbose: 'Prompt text shown before the main stimulus appears.'
  }),
  tips: simpleField(stringArrayField('Tips', 'Tip'), {
    brief: 'Lesson tips shown on load.',
    verbose: 'Instructional tip strings displayed before or during lesson entry.'
  }),
  progressReporterParams: simpleField(numberArrayField('Progress Reporter Params', 'Value'), {
    brief: 'Progress report parameters.',
    verbose: 'Numeric parameters used by the legacy progress reporter calculations.'
  }),
  disableProgressReport: simpleField(legacyBooleanField('false'), {
    brief: 'Hide the progress report.',
    verbose: 'Disables learner progress report display when enabled.'
  }),
  experimentPasswordRequired: simpleField(legacyBooleanField('false'), {
    brief: 'Require an experiment password.',
    verbose: 'Adds a password gate before experiment entry.'
  }),
  simTimeout: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Simulation time per trial.',
    verbose: 'Per-trial timing used by simulation/testing flows.'
  }),
  simCorrectProb: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Simulation accuracy probability.',
    verbose: 'Probability of a correct response during simulated runs.'
  }),
  allowRevistUnit: simpleField(legacyBooleanField('false'), {
    brief: 'Allow revisiting previous units.',
    verbose: 'Misspelled compatibility flag that allows going back to a previous unit.'
  }, {
    aliases: ['allowRevisitUnit'],
  }),
};

const UI_SETTINGS_FIELD_REGISTRY: SectionFieldRegistry = {
  stimuliPosition: simpleField(enumStringField(['top', 'left'], 'top', 4), {
    brief: 'Prompt placement.',
    verbose: 'Position the stimulus above or to the left of the response area.'
  }, {
    runtime: {
      default: 'top',
      coerce: 'none',
      validation: { kind: 'enum', values: ['top', 'left'] },
    },
  }),
  isVideoSession: simpleField(booleanField(false, 4), {
    brief: 'Flag the unit as a video session.',
    verbose: 'Runtime marker for video-session rendering and controls.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  videoUrl: simpleField(stringField('', 12), {
    brief: 'Resolved video URL.',
    verbose: 'Runtime-resolved video URL passed into the Svelte video session UI.'
  }, {
    runtime: {
      default: '',
      coerce: 'none',
      validation: { kind: 'string' },
    },
  }),
  displayCorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show correct feedback.',
    verbose: 'Controls whether positive feedback is rendered after correct answers.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayIncorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show incorrect feedback.',
    verbose: 'Controls whether negative feedback is rendered after incorrect answers.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  correctMessage: simpleField(stringField('Correct.', 6), {
    brief: 'Correct-answer feedback text.',
    verbose: 'Primary feedback string shown after correct answers.'
  }, {
    runtime: {
      default: 'Correct.',
      coerce: 'none',
      validation: { kind: 'stringMaxLengthNonEmpty', max: 100 },
    },
  }),
  incorrectMessage: simpleField(stringField('Incorrect.', 6), {
    brief: 'Incorrect-answer feedback text.',
    verbose: 'Primary feedback string shown after incorrect answers or timeouts.'
  }, {
    runtime: {
      default: 'Incorrect.',
      coerce: 'none',
      validation: { kind: 'stringMaxLengthNonEmpty', max: 100 },
    },
  }),
  correctColor: simpleField(stringField('var(--success-color)', 4), {
    brief: 'Correct feedback color.',
    verbose: 'CSS color token or variable used for correct feedback.'
  }, {
    runtime: {
      default: 'var(--success-color)',
      coerce: 'none',
      validation: { kind: 'color' },
    },
  }),
  incorrectColor: simpleField(stringField('var(--alert-color)', 4), {
    brief: 'Incorrect feedback color.',
    verbose: 'CSS color token or variable used for incorrect feedback.'
  }, {
    runtime: {
      default: 'var(--alert-color)',
      coerce: 'none',
      validation: { kind: 'color' },
    },
  }),
  displayUserAnswerInFeedback: simpleField(
    {
      anyOf: [
        { type: 'boolean' },
        { type: 'string', enum: ['onCorrect', 'onIncorrect'] },
      ],
      default: 'onIncorrect',
      options: { grid_columns: 4 },
    },
    {
      brief: 'Show the learner answer in feedback.',
      verbose: 'Show submitted learner text on correct answers, incorrect answers, both, or neither.'
    },
    {
      runtime: {
        default: 'onIncorrect',
        coerce: 'boolean',
        validation: { kind: 'booleanOrEnum', values: ['onCorrect', 'onIncorrect'] },
      },
    }
  ),
  singleLineFeedback: simpleField(booleanField(false, 4), {
    brief: 'Force feedback onto one line.',
    verbose: 'Strip line breaks from feedback text for a compact single-line layout.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  onlyShowSimpleFeedback: simpleField(
    {
      anyOf: [
        { type: 'boolean' },
        { type: 'string', enum: ['onCorrect', 'onIncorrect'] },
      ],
      default: 'onCorrect',
      options: { grid_columns: 4 },
    },
    {
      brief: 'Use simplified feedback.',
      verbose: 'Show only the simple correct/incorrect label for some or all feedback cases.'
    },
    {
      runtime: {
        default: 'onCorrect',
        coerce: 'boolean',
        validation: { kind: 'booleanOrEnum', values: ['onCorrect', 'onIncorrect'] },
      },
    }
  ),
  displayUserAnswerInCorrectFeedback: simpleField(booleanField(false, 4), {
    brief: 'Show learner answer on correct feedback.',
    verbose: 'Compatibility split flag for correct-answer feedback.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayUserAnswerInIncorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show learner answer on incorrect feedback.',
    verbose: 'Compatibility split flag for incorrect-answer feedback.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayPerformance: simpleField(booleanField(false, 4), {
    brief: 'Show learner performance stats.',
    verbose: 'Render the performance/status block during the lesson.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayTimeoutBar: simpleField(booleanField(false, 4), {
    brief: 'Show timeout bar.',
    verbose: 'Render timeout countdown as a progress bar.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  choiceButtonCols: simpleField(integerField(1, 4), {
    brief: 'Number of button columns.',
    verbose: 'Preferred column count for multiple-choice button layouts.'
  }, {
    runtime: {
      default: 1,
      coerce: 'number',
      validation: { kind: 'integerRange', min: 1, max: 4 },
    },
  }),
  displaySubmitButton: simpleField(booleanField(false, 4), {
    brief: 'Show explicit submit button.',
    verbose: 'Require clicking a submit button instead of auto-submitting on Enter.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  inputPlaceholderText: simpleField(stringField('Type your answer here...', 12), {
    brief: 'Input placeholder text.',
    verbose: 'Placeholder text shown in the learner response box.'
  }, {
    runtime: {
      default: 'Type your answer here...',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  displayConfirmButton: simpleField(booleanField(false, 4), {
    brief: 'Show confirm button.',
    verbose: 'Show a confirmation button before continuing past a state.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  continueButtonText: simpleField(stringField('Continue', 6), {
    brief: 'Continue button text.',
    verbose: 'Label shown on continue/confirm buttons.'
  }, {
    runtime: {
      default: 'Continue',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  skipStudyButtonText: simpleField(stringField('Skip', 6), {
    brief: 'Skip study button text.',
    verbose: 'Label shown on the study-skip button when skip-study is enabled.'
  }, {
    runtime: {
      default: 'Skip',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  caseSensitive: simpleField(booleanField(false, 4), {
    brief: 'Use case-sensitive answer matching.',
    verbose: 'Compare typed answers with case preserved.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayQuestionNumber: simpleField(booleanField(false, 4), {
    brief: 'Show the question number.',
    verbose: 'Render the current question number in the lesson UI.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  showStimuliBox: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated layout flag.' },
    migration: { note: 'Layout is auto-computed; no replacement needed' },
  },
  stimuliBoxColor: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated layout color override.' },
    migration: { note: 'Use theme colors instead' },
  },
  instructionsTitleDisplay: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated instructions header option.' },
    migration: { note: 'Not used in deployments; instructions simplified' },
  },
  feedbackDisplayPosition: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated feedback placement override.' },
    migration: { note: 'Auto-computed based on layout' },
  },
  displayPerformanceDuringStudy: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated split performance toggle.' },
    migration: { note: 'Use displayPerformance instead' },
  },
  displayPerformanceDuringTrial: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated split performance toggle.' },
    migration: { note: 'Use displayPerformance instead' },
  },
  displayProgressBar: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated progress bar flag.' },
    migration: { note: 'Performance stats are shown when displayPerformance is true' },
  },
  fadeInDuration: {
    authoringSchema: integerField(300, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated transition duration.' },
    migration: { note: 'Transitions handled by CSS; no replacement needed' },
  },
  fadeOutDuration: {
    authoringSchema: integerField(200, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated transition duration.' },
    migration: { note: 'Transitions handled by CSS; no replacement needed' },
  },
  displayFeedback: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated master feedback flag.' },
    migration: { note: 'Control feedback display via deliveryParams feedback timeout (0ms = no feedback)' },
  },
  simplefeedbackOnCorrect: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated split simple-feedback flag.' },
    migration: { note: 'Use onlyShowSimpleFeedback instead' },
  },
  simplefeedbackOnIncorrect: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated split simple-feedback flag.' },
    migration: { note: 'Use onlyShowSimpleFeedback instead' },
  },
  displayCorrectAnswerInCenter: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated centered-answer feedback flag.' },
    migration: { note: 'Not implemented in Svelte; feedback handles answer display' },
  },
  suppressFeedbackDisplay: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated suppress-feedback flag.' },
    migration: { note: 'Set deliveryParams feedback timeout to 0ms instead' },
  },
  timeoutThreshold: {
    authoringSchema: integerField(undefined, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated timeout threshold.' },
    migration: { note: 'Not used; no replacement needed' },
  },
  displayCardTimeoutAsBarOrText: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated timeout display mode.' },
    migration: { note: 'Use displayTimeoutBar boolean instead' },
  },
  displayReviewTimeoutAsBarOrText: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated timeout display mode.' },
    migration: { note: 'Use displayTimeoutBar boolean instead' },
  },
  displayReadyPromptTimeoutAsBarOrText: {
    authoringSchema: stringField('', 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated timeout display mode.' },
    migration: { note: 'Use displayTimeoutBar boolean instead' },
  },
  displayTimeOutDuringStudy: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated study-timeout display flag.' },
    migration: { note: 'Timeout behavior controlled by deliveryParams' },
  },
  displayMultipleChoiceButtons: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated explicit MC flag.' },
    migration: { note: 'Multiple choice is auto-detected from stimulus distractors' },
  },
  displayTextInput: {
    authoringSchema: booleanField(true, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated explicit text-input flag.' },
    migration: { note: 'Text input is auto-detected from trial type' },
  },
  enableAudio: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated audio toggle.' },
    migration: { note: 'Configure learner audio behavior via setspec audio prompt settings instead' },
  },
  enableSpeechRecognition: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated SR toggle.' },
    migration: { note: 'Use setspec audioInputEnabled and related audio settings instead' },
  },
  lastVideoModalText: {
    authoringSchema: stringField('', 12),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated final-video modal override.' },
    migration: { note: 'Video session uses default modal text' },
  },
  textInputDisplay: {
    authoringSchema: stringField('', 6),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated CSS/input customization hook.' },
    migration: { note: 'CSS class customization removed' },
  },
  experimentLoginText: {
    authoringSchema: stringField('', 12),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated login prompt override.' },
    migration: { note: 'Handled at login screen level' },
  },
  displayUserAnswerAtTop: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated feedback layout flag.' },
    migration: { note: 'Feedback layout no longer supports this split mode' },
  },
  stackChoiceButtons: {
    authoringSchema: booleanField(false, 4),
    lifecycle: { status: 'deprecated' },
    tooltip: { brief: 'Deprecated.', verbose: 'Deprecated button layout flag.' },
    migration: { note: 'Use choiceButtonCols instead' },
  },
};

const UNIT_FIELD_REGISTRY: SectionFieldRegistry = {
  unitname: simpleField(stringField('', 6), {
    brief: 'Unit name for tracking.',
    verbose: 'Tracking/display name for this unit.'
  }),
  unitinstructions: simpleField(textareaField(''), {
    brief: 'Instructions shown before the unit.',
    verbose: 'HTML or text instructions shown before the unit begins.'
  }),
  unitinstructionsquestion: simpleField(textareaField(''), {
    brief: 'Question shown with instructions.',
    verbose: 'Supplemental instructions question/prompt text.'
  }),
  buttonorder: simpleField(enumStringField(['fixed', 'random'], 'fixed', 4), {
    brief: 'Button arrangement order.',
    verbose: 'Controls fixed vs randomized button order.'
  }),
  buttontrial: simpleField(legacyBooleanField('false'), {
    brief: 'Use the button-based answer UI.',
    verbose: 'Enable button-choice trials instead of typed responses.'
  }),
  buttonOptions: simpleField(textareaField(''), {
    brief: 'Button choices.',
    verbose: 'Comma-delimited list of button trial options.'
  }),
  instructionminseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Minimum instruction time.',
    verbose: 'Minimum number of seconds learners must remain on instructions.'
  }, {
    validation: {
      validators: [{ type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }],
      severity: 'error',
    },
  }),
  instructionmaxseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Maximum instruction time.',
    verbose: 'Maximum number of seconds learners may remain on instructions.'
  }, {
    validation: {
      validators: [{ type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }],
      severity: 'error',
    },
  }),
  picture: simpleField(stringField('', 12), {
    brief: 'Instruction image filename.',
    verbose: 'Image shown alongside the instruction content.'
  }),
  continueButtonText: simpleField(stringField('', 6), {
    brief: 'Continue button label override.',
    verbose: 'Unit-level override for the continue button label.'
  }),
  countcompletion: simpleField(
    withGrid({ anyOf: [{ type: 'boolean' }, { type: 'string' }, { type: 'integer' }] }, 4),
    {
      brief: 'Increment participant count on this unit.',
      verbose: 'Unit-level completion-counting hook for experiments.'
    }
  ),
  turkemailsubject: simpleField(stringField('', 12), {
    brief: 'MTurk reminder email subject.',
    verbose: 'Subject line used for Turk reminder messages.'
  }),
  turkemail: simpleField(textareaField(''), {
    brief: 'MTurk reminder email body.',
    verbose: 'Body text for Turk reminder messages.'
  }),
  turkbonus: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'MTurk bonus amount.',
    verbose: 'Bonus amount associated with reaching this unit.'
  }),
  adaptive: simpleField(stringArrayField('Adaptive Targets', 'Adaptive Target'), {
    brief: 'Adaptive scheduling targets.',
    verbose: 'Adaptive unit directives such as "2,t".'
  }),
  adaptiveUnitTemplate: simpleField(integerArrayField('Adaptive Unit Templates', 'Unit Template Index'), {
    brief: 'Adaptive template indices.',
    verbose: 'Unit-template indices used when adaptive logic inserts new units.'
  }),
  adaptiveLogic: simpleField(
    {
      type: 'object',
      title: 'Adaptive Logic',
      propertyNames: { pattern: '^[0-9]+$' },
      patternProperties: {
        '^[0-9]+$': {
          type: 'array',
          title: 'Adaptive Rules',
          items: {
            type: 'string',
            title: 'Adaptive Rule',
          },
        },
      },
      additionalProperties: false,
    },
    {
      brief: 'Adaptive branching logic.',
      verbose: 'Maps unit indices to arrays of adaptive branching rules.'
    }
  ),
};

const LEARNING_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  clusterlist: simpleField(stringField('', 12), {
    brief: 'Cluster range list.',
    verbose: 'Space-delimited cluster ranges used by the learning session.'
  }, {
    validation: {
      validators: [
        { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
        { type: 'clusterlistBounds', message: 'Cluster index out of bounds' },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  unitMode: simpleField(stringField('', 4), {
    brief: 'Item-selection algorithm.',
    verbose: 'Unit engine mode used when selecting the next learning item.'
  }),
  calculateProbability: simpleField(textareaField(''), {
    brief: 'Custom probability function.',
    verbose: 'JavaScript function body used to customize item probability calculations.'
  }),
  displayminseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Minimum practice time.',
    verbose: 'Minimum allowed practice duration before advancing.'
  }),
  displaymaxseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Maximum practice time.',
    verbose: 'Maximum allowed practice duration before forcing advancement.'
  }),
};

const ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY: SectionFieldRegistry = {
  groupnames: simpleField(stringField('', 6), {
    brief: 'Condition group letters.',
    verbose: 'Space-delimited group labels such as "A B C".'
  }),
  clustersrepeated: simpleField(stringField('', 6), {
    brief: 'Cluster repetitions per group.',
    verbose: 'Space-delimited counts for how many times clusters repeat per group.'
  }),
  templatesrepeated: simpleField(stringField('', 6), {
    brief: 'Template repetition counts.',
    verbose: 'Space-delimited counts for how many times each group template repeats.'
  }),
  group: simpleField({
    anyOf: [
      { type: 'string', title: 'Group Templates' },
      {
        type: 'array',
        title: 'Group Templates',
        items: {
          type: 'string',
          title: 'Group Template',
        },
      },
    ],
  }, {
    brief: 'Group trial templates.',
    verbose: 'Trial specifications per group. Supports a single string or an array of strings.'
  }),
  initialpositions: simpleField(stringField('', 12), {
    brief: 'Initial template positions.',
    verbose: 'Space-delimited initial schedule positions such as "A_1 A_2 B_1".'
  }),
};

const ASSESSMENT_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  clusterlist: simpleField(stringField('', 12), {
    brief: 'Cluster range list.',
    verbose: 'Space-delimited cluster ranges used by the assessment session.'
  }, {
    validation: {
      validators: [
        { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
        { type: 'clusterlistBounds', message: 'Cluster index out of bounds' },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  randomizegroups: simpleField(legacyBooleanField('false'), {
    brief: 'Randomize within groups.',
    verbose: 'Randomize order within each assessment condition group.'
  }),
  permutefinalresult: simpleField(stringField('', 12), {
    brief: 'Permute final schedule ranges.',
    verbose: 'Space-delimited final-result ranges to permute independently.'
  }),
  swapfinalresult: simpleField(stringField('', 12), {
    brief: 'Swap final schedule ranges.',
    verbose: 'Space-delimited final-result ranges treated as swappable blocks.'
  }),
  assignrandomclusters: simpleField(legacyBooleanField('false'), {
    brief: 'Re-randomize cluster assignment.',
    verbose: 'Randomize cluster assignment before schedule creation.'
  }),
  initialpositions: simpleField(stringField('', 12), {
    brief: 'Initial positions.',
    verbose: 'Initial assessment template positions.'
  }),
  randomchoices: simpleField(stringField('', 6), {
    brief: 'Random choice count or range.',
    verbose: 'Random-choice selector used when a group template asks for a random item.'
  }),
};

const VIDEO_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  videosource: simpleField(stringField('', 12), {
    brief: 'Video URL or source.',
    verbose: 'Source URL or file for the video session.'
  }, {
    validation: {
      validators: [{ type: 'url', message: 'Must be a valid URL' }],
      severity: 'warning',
    },
  }),
  questions: simpleField({
    anyOf: [
      { type: 'string', title: 'Question Clusters' },
      integerArrayField('Question Clusters', 'Cluster Index'),
    ],
  }, {
    brief: 'Question cluster indices.',
    verbose: 'Question cluster indices or a range string used by the video session.'
  }),
  questiontimes: simpleField(integerArrayField('Question Times', 'Question Time'), {
    brief: 'Question checkpoint times.',
    verbose: 'Timestamps where video questions should appear.'
  }),
  checkpointBehavior: simpleField(enumStringField(['pause', 'adaptive', 'none'], undefined, 4), {
    brief: 'Checkpoint mode.',
    verbose: 'Controls how video checkpoints are interpreted.'
  }),
  checkpoints: simpleField({
    type: 'array',
    title: 'Checkpoints',
    items: {
      type: 'object',
      title: 'Checkpoint',
      properties: {
        time: {
          type: 'number',
          title: 'Time',
        },
      },
      required: ['time'],
      additionalProperties: false,
    },
  }, {
    brief: 'Explicit checkpoint definitions.',
    verbose: 'Checkpoint timestamps used by adaptive video flows.'
  }),
  preventScrubbing: simpleField(legacyBooleanField('false'), {
    brief: 'Prevent scrubbing ahead in the video.',
    verbose: 'Disallow learner seeking/scrubbing beyond the allowed point.'
  }),
  rewindOnIncorrect: simpleField(legacyBooleanField('false'), {
    brief: 'Rewind after incorrect answers.',
    verbose: 'Rewind the video after an incorrect checkpoint answer.'
  }),
  repeatQuestionsSinceCheckpoint: simpleField(legacyBooleanField('false'), {
    brief: 'Repeat questions since the last checkpoint.',
    verbose: 'Repeat checkpoint questions after rewinding to the previous anchor.'
  }),
  unitMode: simpleField(stringField('', 4), {
    brief: 'Video-session selection algorithm.',
    verbose: 'Learning engine unit mode used by mixed video/question sessions.'
  }),
  calculateProbability: simpleField(textareaField(''), {
    brief: 'Custom probability function.',
    verbose: 'Probability function used by adaptive video question selection.'
  }),
  displayText: simpleField(textareaField(''), {
    brief: 'Supplemental video text.',
    verbose: 'Display text associated with the video session.'
  }),
};

const STIM_CLUSTER_FIELD_REGISTRY: SectionFieldRegistry = {
  imageStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster image stimulus.',
    verbose: 'Cluster-level image asset used when stims inherit the shared image.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'image', message: 'Cluster image file not found' }],
      severity: 'warning',
    },
  }),
  audioStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster audio stimulus.',
    verbose: 'Cluster-level audio asset used when stims inherit the shared audio.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'audio', message: 'Cluster audio file not found' }],
      severity: 'warning',
    },
  }),
  videoStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster video stimulus.',
    verbose: 'Cluster-level video asset used when stims inherit the shared video.'
  }, {
    validation: {
      validators: [{ type: 'urlOrMediaExists', mediaType: 'video', message: 'Cluster video not found and not a valid URL' }],
      severity: 'warning',
    },
  }),
};

const STIM_DISPLAY_FIELD_REGISTRY: SectionFieldRegistry = {
  text: simpleField(textareaField(''), {
    brief: 'Question/stimulus text.',
    verbose: 'Main text prompt shown to the learner.'
  }),
  clozeText: simpleField(textareaField(''), {
    brief: 'Cloze sentence text.',
    verbose: 'Fill-in-the-blank sentence or phrase.'
  }),
  clozeStimulus: simpleField(stringField('', 12), {
    brief: 'Cloze answer token.',
    verbose: 'Answer token paired with the cloze prompt.'
  }),
  imgSrc: simpleField(stringField('', 12), {
    brief: 'Stim image filename.',
    verbose: 'Image asset displayed for this stimulus.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'image', message: 'Image file not found' }],
      severity: 'warning',
    },
  }),
  audioSrc: simpleField(stringField('', 12), {
    brief: 'Stim audio filename.',
    verbose: 'Audio asset played for this stimulus.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'audio', message: 'Audio file not found' }],
      severity: 'warning',
    },
  }),
  videoSrc: simpleField(stringField('', 12), {
    brief: 'Stim video URL or filename.',
    verbose: 'Video asset or URL shown for this stimulus.'
  }, {
    validation: {
      validators: [{ type: 'urlOrMediaExists', mediaType: 'video', message: 'Video file not found and not a valid URL' }],
      severity: 'warning',
    },
  }),
};

const STIM_RESPONSE_FIELD_REGISTRY: SectionFieldRegistry = {
  correctResponse: simpleField(stringField('', 12), {
    brief: 'Expected correct response.',
    verbose: 'Primary answer used for evaluation and feedback.'
  }, {
    validation: {
      validators: [
        { type: 'required', message: 'Correct response is required' },
        { type: 'invisibleUnicode', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' },
      ],
      severity: 'error',
    },
  }),
  incorrectResponses: simpleField(stringArrayField('Incorrect Responses', 'Incorrect Response'), {
    brief: 'Common incorrect responses.',
    verbose: 'Distractor or grammar-support responses for button/SR flows.'
  }, {
    validation: {
      validators: [
        { type: 'invisibleUnicodeArray', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' },
        { type: 'mcRequiresIncorrect', message: 'Multiple choice questions should have incorrect responses defined' },
      ],
      severity: 'warning',
    },
  }),
};

const STIM_FIELD_REGISTRY: SectionFieldRegistry = {
  parameter: simpleField(stringField('', 6), {
    brief: 'Stimulus parameter metadata.',
    verbose: 'Comma-delimited advanced metadata, often including optimal probability.'
  }, {
    validation: {
      validators: [{ type: 'parameterFormat', message: 'Parameter should be "number,number" format (e.g., "0,.7")' }],
      severity: 'warning',
    },
  }),
  optimalProb: simpleField(withGrid({ anyOf: [{ type: 'number' }, { type: 'string' }] }, 4), {
    brief: 'Stimulus optimum probability override.',
    verbose: 'Item-specific optimum probability used by the learning model.'
  }, {
    validation: {
      validators: [{ type: 'numeric', message: 'optimalProb must be a number' }],
      severity: 'error',
    },
  }),
  speechHintExclusionList: simpleField(stringField('', 12), {
    brief: 'Speech-hint exclusion list.',
    verbose: 'Comma-delimited words excluded from SR grammar support.'
  }),
  alternateDisplays: simpleField({
    type: 'array',
    title: 'Alternate Displays',
    items: createClosedObjectSchema('Alternate Display', STIM_DISPLAY_FIELD_REGISTRY),
  }, {
    brief: 'Alternate display variants.',
    verbose: 'Additional display objects that can be used as alternate prompt presentations.'
  }),
};

const SETSPEC_DIRECT_RUNTIME_KEYS = Object.freeze([
  'allowRevistUnit',
  'audioInputEnabled',
  'audioInputSensitivity',
  'audioPromptFeedbackVoice',
  'audioPromptMode',
  'audioPromptQuestionSpeakingRate',
  'audioPromptSpeakingRate',
  'audioPromptVoice',
  'condition',
  'countcompletion',
  'disableProgressReport',
  'enableAudioPromptAndFeedback',
  'experimentPasswordRequired',
  'loadbalancing',
  'prestimulusDisplay',
  'progressReporterParams',
  'randomizedDelivery',
  'speechRecognitionLanguage',
  'speechIgnoreOutOfGrammarResponses',
  'speechOutOfGrammarFeedback',
  'textToSpeechAPIKey',
  'textToSpeechLanguage',
  'tips',
]);

const UNIT_DIRECT_RUNTIME_KEYS = Object.freeze([
  'adaptive',
  'adaptiveLogic',
  'adaptiveUnitTemplate',
  'buttonOptions',
  'buttonorder',
  'buttontrial',
  'continueButtonText',
  'countcompletion',
  'instructionmaxseconds',
  'instructionminseconds',
  'picture',
  'turkbonus',
  'turkemail',
  'turkemailsubject',
  'unitinstructions',
  'unitinstructionsquestion',
  'unitname',
]);

const LEARNING_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'calculateProbability',
  'clusterlist',
  'displaymaxseconds',
  'displayminseconds',
  'unitMode',
]);

const ASSESSMENT_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'assignrandomclusters',
  'clusterlist',
  'conditiontemplatesbygroup',
  'initialpositions',
  'permutefinalresult',
  'randomchoices',
  'randomizegroups',
  'swapfinalresult',
]);

const VIDEO_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'calculateProbability',
  'checkpointBehavior',
  'checkpoints',
  'displayText',
  'preventScrubbing',
  'questiontimes',
  'questions',
  'repeatQuestionsSinceCheckpoint',
  'rewindOnIncorrect',
  'unitMode',
  'videosource',
]);

const STIM_CLUSTER_DIRECT_RUNTIME_KEYS = Object.freeze([
  'audioStimulus',
  'imageStimulus',
  'videoStimulus',
]);

const STIM_DIRECT_RUNTIME_KEYS = Object.freeze([
  'alternateDisplays',
  'optimalProb',
  'parameter',
  'speechHintExclusionList',
]);

const STIM_DISPLAY_DIRECT_RUNTIME_KEYS = Object.freeze([
  'audioSrc',
  'clozeStimulus',
  'clozeText',
  'imgSrc',
  'text',
  'videoSrc',
]);

const STIM_RESPONSE_DIRECT_RUNTIME_KEYS = Object.freeze([
  'correctResponse',
  'incorrectResponses',
]);

export const UI_SETTINGS_SUPPORTED_KEYS = Object.freeze(
  Object.keys(UI_SETTINGS_FIELD_REGISTRY).filter(
    (key) => UI_SETTINGS_FIELD_REGISTRY[key]?.lifecycle.status === 'supported'
  )
);

export const UI_SETTINGS_RUNTIME_DEFAULTS = Object.freeze(
  createRuntimeDefaults(UI_SETTINGS_FIELD_REGISTRY)
);

export const UI_SETTINGS_DEPRECATED_GUIDANCE = Object.freeze(
  createDeprecatedGuidance(UI_SETTINGS_FIELD_REGISTRY)
);

export const UI_SETTINGS_RUNTIME_INVENTORY = Object.freeze({
  supportedKeys: UI_SETTINGS_SUPPORTED_KEYS,
  deprecatedKeys: Object.keys(UI_SETTINGS_DEPRECATED_GUIDANCE),
});

export function coerceAndValidateUiSetting(fieldName: string, rawValue: unknown): {
  valid: boolean;
  value: unknown;
  defaultValue: unknown;
} {
  const definition = UI_SETTINGS_FIELD_REGISTRY[fieldName];
  if (!definition || definition.lifecycle.status !== 'supported') {
    return { valid: false, value: rawValue, defaultValue: undefined };
  }

  const coercedValue = coerceUiRuntimeValue(definition, rawValue);
  return {
    valid: isUiRuntimeValueValid(definition, coercedValue),
    value: coercedValue,
    defaultValue: definition.runtime?.default,
  };
}

function createUiSettingsSchema(): Record<string, unknown> {
  return createClosedObjectSchema('UI Settings', UI_SETTINGS_FIELD_REGISTRY);
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

function createVideoSessionSchema(): Record<string, unknown> {
  return createClosedObjectSchema('Video Session', VIDEO_SESSION_FIELD_REGISTRY);
}

function createUnitSchema(title = 'Unit'): Record<string, unknown> {
  const schema = createClosedObjectSchema(title, UNIT_FIELD_REGISTRY);
  (schema.properties as Record<string, unknown>).deliveryparams = createDeliveryParamSchema();
  (schema.properties as Record<string, unknown>).uiSettings = createUiSettingsSchema();
  (schema.properties as Record<string, unknown>).learningsession = createLearningSessionSchema();
  (schema.properties as Record<string, unknown>).assessmentsession = createAssessmentSessionSchema();
  (schema.properties as Record<string, unknown>).videosession = createVideoSessionSchema();
  return schema;
}

function createSetspecSchema(): Record<string, unknown> {
  const schema = createClosedObjectSchema('Setspec', SETSPEC_FIELD_REGISTRY, ['lessonname', 'stimulusfile']);
  (schema.properties as Record<string, unknown>).uiSettings = createUiSettingsSchema();
  (schema.properties as Record<string, unknown>).unitTemplate = {
    type: 'array',
    title: 'Unit Templates',
    items: createUnitSchema('Unit Template'),
  };
  return schema;
}

export function createTdfSchemaFromRegistry(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'MoFaCTS TDF Schema',
    description: 'Registry-backed TDF schema.',
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
          deliveryparams: createDeliveryParamSchema(),
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
    description: 'Registry-backed stimulus schema.',
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
    ...createTooltipMapForRegistry(UI_SETTINGS_FIELD_REGISTRY, [
      'setspec.uiSettings',
      'unit[].uiSettings',
      'setspec.unitTemplate[].uiSettings',
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
    ...createValidatorMapForRegistry(UI_SETTINGS_FIELD_REGISTRY, [
      'setspec.uiSettings',
      'unit[].uiSettings',
      'setspec.unitTemplate[].uiSettings',
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
    schemaLabel: 'tutor.setspec.uiSettings',
    schemaPath: ['tutor', 'setspec', 'uiSettings'],
    tooltipPrefixes: ['setspec.uiSettings', 'unit[].uiSettings', 'setspec.unitTemplate[].uiSettings'],
    registry: UI_SETTINGS_FIELD_REGISTRY,
    directRuntimeKeys: UI_SETTINGS_SUPPORTED_KEYS,
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
  uiSettings: createValidationCoverageForRegistry(UI_SETTINGS_FIELD_REGISTRY),
  unit: createValidationCoverageForRegistry(UNIT_FIELD_REGISTRY),
  learningsession: createValidationCoverageForRegistry(LEARNING_SESSION_FIELD_REGISTRY),
  assessmentsession: createValidationCoverageForRegistry(ASSESSMENT_SESSION_FIELD_REGISTRY),
  conditiontemplatesbygroup: createValidationCoverageForRegistry(ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY),
  videosession: createValidationCoverageForRegistry(VIDEO_SESSION_FIELD_REGISTRY),
});

export const STIM_VALIDATION_COVERAGE = Object.freeze({
  cluster: createValidationCoverageForRegistry(STIM_CLUSTER_FIELD_REGISTRY),
  stim: createValidationCoverageForRegistry(STIM_FIELD_REGISTRY),
  display: createValidationCoverageForRegistry(STIM_DISPLAY_FIELD_REGISTRY),
  response: createValidationCoverageForRegistry(STIM_RESPONSE_FIELD_REGISTRY),
});
