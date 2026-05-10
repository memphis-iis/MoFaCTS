import {
  INTERACTIVE_TDF_UNIT_TYPES,
  type TdfUnitType,
} from './fieldApplicability.ts';

type FieldLifecycleStatus = 'supported' | 'deprecated' | 'ignored';
type DeliveryParamValue = string | number | boolean | undefined;
type DeliveryParamAuthoringType = 'booleanString' | 'integer' | 'number' | 'string';
type DeliveryParamNormalizerKind =
  | 'boolean'
  | 'integer'
  | 'lowercaseString'
  | 'number'
  | 'studyFirst'
  | 'string';
type DeliveryParamValidationKind = 'enum' | 'none' | 'nonNegativeInteger' | 'range';
type ValidatorSeverity = 'error' | 'warning';

type DeliveryParamValidationDefinition = {
  kind: DeliveryParamValidationKind;
  severity?: ValidatorSeverity;
  message?: string;
  min?: number;
  max?: number;
  values?: readonly string[];
};

type DeliveryParamFieldDefinition = {
  section: 'deliveryparams';
  surfaces?: {
    schema?: boolean;
    editor?: boolean;
    learnerConfig?: boolean;
    runtime?: boolean;
  };
  appliesToUnitTypes?: readonly TdfUnitType[];
  authoring: {
    type: DeliveryParamAuthoringType;
    default?: string | number;
    enum?: readonly string[];
    editor?: {
      gridColumns?: number;
    };
  };
  runtime: {
    default: DeliveryParamValue;
    normalize: DeliveryParamNormalizerKind;
  };
  lifecycle: {
    status: FieldLifecycleStatus;
  };
  tooltip: {
    brief: string;
    verbose: string;
  };
  validation: DeliveryParamValidationDefinition;
  aliases?: readonly string[];
  migration?: {
    replacement?: string;
    note?: string;
  };
};

type DeliveryParamValidatorConfig = {
  validators: Array<Record<string, unknown>>;
  severity: ValidatorSeverity;
  breaking?: boolean;
};

type DeliveryParamRegistry = Record<string, DeliveryParamFieldDefinition>;

function toTrimmedString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function normalizeBooleanValue(value: unknown): boolean {
  const trimmed = toTrimmedString(value).toLowerCase();
  if (!trimmed) {
    return false;
  }
  return trimmed === 'true';
}

function normalizeIntegerValue(value: unknown): number {
  const parsed = Number.parseInt(toTrimmedString(value), 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function normalizeNumberValue(value: unknown): number {
  const parsed = Number.parseFloat(toTrimmedString(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

function normalizeLowercaseStringValue(value: unknown): string {
  return toTrimmedString(value).toLowerCase();
}

function normalizeStringValue(value: unknown): string {
  return toTrimmedString(value);
}

function normalizeStudyFirstValue(value: unknown): number {
  const trimmed = toTrimmedString(value).toLowerCase();
  if (!trimmed || trimmed === 'false') {
    return 0;
  }
  if (trimmed === 'true') {
    return 1;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeDeliveryParamValueByKind(
  kind: DeliveryParamNormalizerKind,
  value: unknown
): DeliveryParamValue {
  switch (kind) {
    case 'boolean':
      return normalizeBooleanValue(value);
    case 'integer':
      return normalizeIntegerValue(value);
    case 'lowercaseString':
      return normalizeLowercaseStringValue(value);
    case 'number':
      return normalizeNumberValue(value);
    case 'studyFirst':
      return normalizeStudyFirstValue(value);
    case 'string':
      return normalizeStringValue(value);
    default:
      return value as DeliveryParamValue;
  }
}

export const DELIVERY_PARAM_FIELD_REGISTRY: DeliveryParamRegistry = {
  forceCorrection: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Require correct answer entry before advancing.',
      verbose: 'When "true", forces the learner to type the correct response after feedback before proceeding.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  scoringEnabled: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'booleanString', default: 'true', editor: { gridColumns: 4 } },
    runtime: { default: true, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable score tracking during the unit.',
      verbose: 'Turns scoring on or off for the current unit. Learning sessions default to scoring unless this is explicitly disabled.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  forceSpacing: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Prevent immediate repeats in adaptive scheduling.',
      verbose: 'When "true", the adaptive scheduler requires at least one intervening trial before the same item can be selected again.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  optimalThreshold: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'number', default: 0.9, editor: { gridColumns: 4 } },
    runtime: { default: 0.9, normalize: 'number' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Target recall probability for adaptive scheduling.',
      verbose: 'Probability threshold used by the adaptive scheduler when selecting the next item; values should be between 0 and 1.'
    },
    validation: { kind: 'range', severity: 'error', min: 0, max: 1, message: 'Must be between 0 and 1' }
  },
  studyFirst: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'number', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'studyFirst' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Probability of showing study before first drill.',
      verbose: 'Controls whether an item is first presented as study before drill/test; 0 disables it, 1 always shows study first, and values between 0 and 1 apply probabilistically.'
    },
    validation: { kind: 'range', severity: 'error', min: 0, max: 1, message: 'Must be between 0 and 1' }
  },
  purestudy: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'assessment'],
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Study-trial duration in milliseconds.',
      verbose: 'Milliseconds to display an item during study-only trials. Example: 16000 = 16 seconds. A value of 0 means no study timeout.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  drill: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Answer timeout in milliseconds.',
      verbose: 'Milliseconds before a drill/test response times out. The timer resets on each keypress where applicable. Example: 30000 = 30 seconds; 0 = no timeout.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  practicetimer: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'string', default: '', enum: ['', 'clock-based'], editor: { gridColumns: 4 } },
    runtime: { default: '', normalize: 'string' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Practice timer mode.',
      verbose: 'Selects the practice timing mode; "clock-based" uses elapsed seconds from practiceseconds to end practice.'
    },
    validation: {
      kind: 'enum',
      severity: 'error',
      message: 'Must be blank or "clock-based"',
      values: ['', 'clock-based']
    }
  },
  practiceseconds: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning'],
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Practice duration in seconds.',
      verbose: 'Number of elapsed seconds used by clock-based practice timing before the unit advances.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  displayMinSeconds: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'video'],
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Minimum display time in seconds.',
      verbose: 'Minimum elapsed seconds before the learner can continue from a variable-length display unit.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  displayMaxSeconds: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'video'],
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Maximum display time in seconds.',
      verbose: 'Maximum elapsed seconds before a variable-length display unit can advance automatically.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  reviewstudy: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0.001, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Incorrect-review duration in milliseconds.',
      verbose: 'Milliseconds to display the item after an incorrect response for review. Example: 6000 = 6 seconds.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  correctprompt: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Correct-feedback duration in milliseconds.',
      verbose: 'Milliseconds to display correct-answer feedback before advancing. Example: 750 = 0.75 seconds.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  skipstudy: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'assessment'],
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Allow study trials to be skipped.',
      verbose: 'When "true", study trials can be skipped from the learner interface instead of waiting for the study duration to finish.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  lockoutminutes: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'assessment', 'video', 'instructions'],
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Lockout length in minutes before the next unit.',
      verbose: 'Minutes a learner must wait before proceeding to the next unit. Used for spaced retention intervals.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  fontsize: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 24, editor: { gridColumns: 4 } },
    runtime: { default: 24, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Stimulus font size.',
      verbose: 'CSS font size used for stimulus display. The current Svelte card interprets this as a numeric pixel size; default is 24.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  autostopTranscriptionAttemptLimit: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 3, editor: { gridColumns: 4 } },
    runtime: { default: 3, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Maximum speech-recognition retry attempts.',
      verbose: 'Upper limit on speech-recognition attempts before the session stops retrying transcription for the card.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  timeuntilaudio: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Delay before question audio in milliseconds.',
      verbose: 'Milliseconds to wait before playing question audio or prompt text-to-speech. Default: 0.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  prestimulusdisplaytime: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Prestimulus prompt duration in milliseconds.',
      verbose: 'Milliseconds to display the prestimulus prompt before the question appears.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  forcecorrectprompt: {
    section: 'deliveryparams',
    authoring: { type: 'string', default: '', editor: { gridColumns: 12 } },
    runtime: { default: '', normalize: 'lowercaseString' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Prompt shown during force-correction.',
      verbose: 'Custom message shown when the learner must type the correct answer before continuing after feedback.'
    },
    validation: { kind: 'none' }
  },
  forcecorrecttimeout: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Force-correction timeout in milliseconds.',
      verbose: 'Milliseconds to wait during the force-correction phase before timing out that state.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  checkOtherAnswers: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Reject near-matches that equal another item’s answer.',
      verbose: 'When enabled, edit-distance matching will not accept a near-match that exactly matches another current stimulus answer.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  falseAnswerLimit: {
    section: 'deliveryparams',
    authoring: { type: 'integer', editor: { gridColumns: 4 } },
    runtime: { default: undefined, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Maximum incorrect attempts allowed for a button trial.',
      verbose: 'Maximum incorrect responses allowed for each button trial before moving on. Leave blank for no configured limit.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  allowPhoneticMatching: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable phonetic answer matching.',
      verbose: 'When "true", enables Double Metaphone phonetic matching as a fallback during answer evaluation after exact and edit-distance checks fail.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  branchingEnabled: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable branched-answer parsing.',
      verbose: 'Allows semicolon-separated branched answer definitions to be treated as branching responses during answer evaluation.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  resetStudentPerformance: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Reset displayed progress for the unit.',
      verbose: 'When "true", resets the learner’s displayed progress for the unit. Historical data is preserved; only the displayed progress is reset.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  allowRevistUnit: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'assessment', 'video', 'instructions'],
    aliases: ['allowRevisitUnit'],
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Allow revisiting the current unit from instructions.',
      verbose: 'When "true", instruction screens expose the current-unit revisit path so a learner can return to the unit instead of only continuing forward.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  allowFeedbackTypeSelect: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable selectable feedback display mode.',
      verbose: 'When "true", the resume flow initializes the card state to display feedback when the feedback state has not already been set.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  feedbackType: {
    section: 'deliveryparams',
    surfaces: { learnerConfig: false },
    authoring: { type: 'string', default: '', editor: { gridColumns: 4 } },
    runtime: { default: '', normalize: 'string' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Feedback type metadata.',
      verbose: 'Legacy feedback classification copied to history records for reporting and exports. It does not control feedback display behavior.'
    },
    validation: { kind: 'none' }
  },
  readyPromptStringDisplayTime: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Ready-prompt duration in milliseconds.',
      verbose: 'Milliseconds to wait during the ready-prompt phase between trials before the next display/input phase begins.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  studyOnlyFields: {
    section: 'deliveryparams',
    appliesToUnitTypes: ['learning', 'assessment'],
    authoring: { type: 'string', default: '', editor: { gridColumns: 6 } },
    runtime: { default: '', normalize: 'string' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Display fields for study-only trials.',
      verbose: 'Comma-delimited stimulus display fields shown on study-only trials, such as "imgSrc,audioSrc". Leave blank to show the full display.'
    },
    validation: { kind: 'none' }
  },
  drillFields: {
    section: 'deliveryparams',
    authoring: { type: 'string', default: '', editor: { gridColumns: 6 } },
    runtime: { default: '', normalize: 'string' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Display fields for drill/test trials.',
      verbose: 'Comma-delimited stimulus display fields shown on drill/test trials and their review feedback, such as "text,audioSrc". Leave blank to show the full display.'
    },
    validation: { kind: 'none' }
  }
};

const DELIVERY_PARAM_CANONICAL_KEYS = Object.freeze(Object.keys(DELIVERY_PARAM_FIELD_REGISTRY));

export const DELIVERY_PARAM_SUPPORTED_KEYS = Object.freeze(
  DELIVERY_PARAM_CANONICAL_KEYS.filter(
    (key) => DELIVERY_PARAM_FIELD_REGISTRY[key]?.lifecycle.status === 'supported'
  )
);

export const DELIVERY_PARAM_LEARNER_CONFIGURABLE_KEYS = Object.freeze(
  DELIVERY_PARAM_SUPPORTED_KEYS.filter(
    (key) => DELIVERY_PARAM_FIELD_REGISTRY[key]?.surfaces?.learnerConfig !== false
  )
);

export const DELIVERY_PARAM_APPLICABILITY = Object.freeze(
  Object.fromEntries(
    DELIVERY_PARAM_SUPPORTED_KEYS.map((key) => [
      key,
      [...(DELIVERY_PARAM_FIELD_REGISTRY[key]?.appliesToUnitTypes || INTERACTIVE_TDF_UNIT_TYPES)],
    ])
  ) as Record<string, readonly TdfUnitType[]>
);

export const DELIVERY_PARAM_ALIAS_TO_CANONICAL = Object.freeze(
  Object.fromEntries(
    DELIVERY_PARAM_CANONICAL_KEYS.flatMap((canonicalKey) =>
      (DELIVERY_PARAM_FIELD_REGISTRY[canonicalKey]?.aliases || []).map((alias) => [alias, canonicalKey])
    )
  ) as Record<string, string>
);

export const DELIVERY_PARAM_DEFAULTS = Object.freeze(
  Object.fromEntries(
    DELIVERY_PARAM_CANONICAL_KEYS.map((key) => {
      const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
      return [key, field ? field.runtime.default : undefined];
    })
  ) as Record<string, DeliveryParamValue>
);

const DELIVERY_PARAM_DIRECT_RUNTIME_KEYS = Object.freeze([
  'allowFeedbackTypeSelect',
  'allowPhoneticMatching',
  'allowRevistUnit',
  'autostopTranscriptionAttemptLimit',
  'branchingEnabled',
  'checkOtherAnswers',
  'correctprompt',
  'displayMaxSeconds',
  'displayMinSeconds',
  'drillFields',
  'drill',
  'falseAnswerLimit',
  'forceSpacing',
  'forceCorrection',
  'forcecorrectprompt',
  'forcecorrecttimeout',
  'fontsize',
  'lockoutminutes',
  'optimalThreshold',
  'prestimulusdisplaytime',
  'practiceseconds',
  'practicetimer',
  'purestudy',
  'readyPromptStringDisplayTime',
  'resetStudentPerformance',
  'reviewstudy',
  'scoringEnabled',
  'skipstudy',
  'studyFirst',
  'studyOnlyFields',
  'timeuntilaudio'
]);

export const DELIVERY_PARAM_RUNTIME_INVENTORY = Object.freeze({
  canonicalKeys: DELIVERY_PARAM_CANONICAL_KEYS,
  supportedKeys: DELIVERY_PARAM_SUPPORTED_KEYS,
  learnerConfigurableKeys: DELIVERY_PARAM_LEARNER_CONFIGURABLE_KEYS,
  aliasToCanonical: DELIVERY_PARAM_ALIAS_TO_CANONICAL,
  applicability: DELIVERY_PARAM_APPLICABILITY,
  directRuntimeKeys: DELIVERY_PARAM_DIRECT_RUNTIME_KEYS
});

export function normalizeDeliveryParamValue(
  key: string,
  value: unknown
): DeliveryParamValue {
  const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
  if (!field) {
    return value as DeliveryParamValue;
  }
  return normalizeDeliveryParamValueByKind(field.runtime.normalize, value);
}

export function normalizeDeliveryParamSource(
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!source || typeof source !== 'object') {
    return {};
  }

  const normalizedSource: Record<string, unknown> = { ...source };
  for (const [alias, canonicalKey] of Object.entries(DELIVERY_PARAM_ALIAS_TO_CANONICAL)) {
    if (
      Object.prototype.hasOwnProperty.call(normalizedSource, alias) &&
      !Object.prototype.hasOwnProperty.call(normalizedSource, canonicalKey)
    ) {
      normalizedSource[canonicalKey] = normalizedSource[alias];
    }
  }
  return normalizedSource;
}

function schemaForAuthoringType(field: DeliveryParamFieldDefinition): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    title: field.tooltip.brief,
  };
  const gridColumns = field.authoring.editor?.gridColumns;
  if (gridColumns) {
    schema.options = { grid_columns: gridColumns };
  }

  switch (field.authoring.type) {
    case 'booleanString':
      schema.type = 'string';
      schema.enum = ['true', 'false'];
      break;
    case 'integer':
      schema.type = 'integer';
      break;
    case 'number':
      schema.type = 'number';
      break;
    case 'string':
    default:
      schema.type = 'string';
      if (field.authoring.enum?.length) {
        schema.enum = [...field.authoring.enum];
      }
      break;
  }

  if (field.authoring.default !== undefined) {
    schema.default = field.authoring.default;
  }

  schema['x-appliesToUnitTypes'] = [...(field.appliesToUnitTypes || INTERACTIVE_TDF_UNIT_TYPES)];
  if (field.surfaces?.editor === false) {
    schema['x-editor'] = false;
  }

  return schema;
}

export function createDeliveryParamSchema(): Record<string, unknown> {
  const properties = Object.fromEntries(
    DELIVERY_PARAM_SUPPORTED_KEYS
      .filter((key) => DELIVERY_PARAM_FIELD_REGISTRY[key]?.surfaces?.schema !== false)
      .map((key) => {
        const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
        return [key, field ? schemaForAuthoringType(field) : {}];
      })
  );

  return {
    type: 'object',
    title: 'Delivery Params',
    properties,
    additionalProperties: false
  };
}

export function createDeliveryParamTooltipMap(): Record<string, { brief: string; verbose: string }> {
  const tooltips: Record<string, { brief: string; verbose: string }> = {};

  for (const key of DELIVERY_PARAM_SUPPORTED_KEYS) {
    const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
    if (!field) {
      continue;
    }
    const tooltip = field.tooltip;
    tooltips[`deliveryparams.${key}`] = tooltip;
    tooltips[`unit[].deliveryparams.${key}`] = tooltip;
    tooltips[`setspec.unitTemplate[].deliveryparams.${key}`] = tooltip;
  }

  return tooltips;
}

function validatorConfigForField(
  field: DeliveryParamFieldDefinition
): DeliveryParamValidatorConfig | null {
  const { validation } = field;
  switch (validation.kind) {
    case 'nonNegativeInteger':
      return {
        validators: [
          { type: 'nonNegativeInteger', message: validation.message || 'Must be a non-negative integer' }
        ],
        severity: validation.severity || 'error'
      };
    case 'range':
      return {
        validators: [
          {
            type: 'range',
            min: validation.min,
            max: validation.max,
            message: validation.message || 'Value is out of range'
          }
        ],
        severity: validation.severity || 'error'
      };
    case 'enum':
      return {
        validators: [
          {
            type: 'enum',
            values: [...(validation.values || [])],
            message: validation.message || 'Value is not one of the supported options'
          }
        ],
        severity: validation.severity || 'error'
      };
    case 'none':
    default:
      return null;
  }
}

export function createDeliveryParamValidatorMap(): Record<string, DeliveryParamValidatorConfig> {
  const validators: Record<string, DeliveryParamValidatorConfig> = {};

  for (const key of DELIVERY_PARAM_SUPPORTED_KEYS) {
    const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
    if (!field) {
      continue;
    }
    const config = validatorConfigForField(field);
    if (!config) {
      continue;
    }
    validators[`deliveryparams.${key}`] = config;
    validators[`unit[].deliveryparams.${key}`] = config;
    validators[`setspec.unitTemplate[].deliveryparams.${key}`] = config;
  }

  return validators;
}

export function createDeliveryParamValidationCoverage(): Record<string, DeliveryParamValidationKind> {
  return Object.fromEntries(
    DELIVERY_PARAM_SUPPORTED_KEYS.map((key) => {
      const field = DELIVERY_PARAM_FIELD_REGISTRY[key];
      return [key, field ? field.validation.kind : 'none'];
    })
  );
}

export * from './fieldRegistrySections.ts';
