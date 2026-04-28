type FieldLifecycleStatus = 'supported' | 'deprecated' | 'ignored';
type DeliveryParamValue = string | number | boolean | undefined;
type DeliveryParamAuthoringType = 'booleanString' | 'integer' | 'number' | 'string';
type DeliveryParamNormalizerKind =
  | 'boolean'
  | 'integer'
  | 'lowercaseString'
  | 'number'
  | 'string'
  | 'studyFirst';
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
  const trimmed = toTrimmedString(value);
  if (!trimmed.length) {
    return 0;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'true') {
    return 1;
  }
  if (lowered === 'false') {
    return 0;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, parsed));
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
    case 'string':
      return normalizeStringValue(value);
    case 'studyFirst':
      return normalizeStudyFirstValue(value);
    default:
      return value as DeliveryParamValue;
  }
}

export const DELIVERY_PARAM_FIELD_REGISTRY: DeliveryParamRegistry = {
  showhistory: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Show scrolling response history.',
      verbose: 'When "true", enables the scrolling history display during practice so prior responses remain visible.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  forceCorrection: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Require correct answer entry before advancing.',
      verbose: 'When "true", the learner must type the correct answer after feedback before the card can advance.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  scoringEnabled: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'true', editor: { gridColumns: 4 } },
    runtime: { default: true, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable score tracking during the unit.',
      verbose: 'Turns scoring on or off for the current unit. Learning sessions default to scoring unless this is explicitly disabled.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  purestudy: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Study-trial duration in milliseconds.',
      verbose: 'How long study-only cards remain visible before advancing. A value of 0 means there is no configured study timeout.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  initialview: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Initial first-part display duration in milliseconds.',
      verbose: 'Milliseconds to show the first part of a two-part stimulus before the second part is revealed.'
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
      verbose: 'Milliseconds before a drill/test response times out. The timer resets on keypress activity where applicable.'
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
      verbose: 'How long incorrect-answer review feedback remains visible before the unit advances.'
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
      verbose: 'Milliseconds to show correct-answer feedback before the next card is selected.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  skipstudy: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Allow study trials to be skipped.',
      verbose: 'When "true", study cards can be skipped from the learner interface instead of waiting for the study duration to finish.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  lockoutminutes: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Lockout length in minutes before the next unit.',
      verbose: 'Minutes a learner must wait before the next unit becomes available. Used for retention-interval scheduling.'
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
      verbose: 'Font size used for card content. The current Svelte card interprets this as a numeric size for the rendered card text.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  numButtonListImageColumns: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 2, editor: { gridColumns: 4 } },
    runtime: { default: 2, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Preferred column count for image-button layouts.',
      verbose: 'Controls the desired number of columns when button responses are displayed with images.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  correctscore: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 1, editor: { gridColumns: 4 } },
    runtime: { default: 1, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Points awarded for a correct response.',
      verbose: 'Score added when a learner answers correctly.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  incorrectscore: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Points applied for an incorrect response.',
      verbose: 'Score adjustment applied when the learner answers incorrectly.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  practiceseconds: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Practice duration limit in seconds.',
      verbose: 'Total number of seconds allowed for the learning session. A value of 0 means no configured duration limit.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  autostopTimeoutThreshold: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Auto-stop after this many consecutive timeouts.',
      verbose: 'Number of consecutive timeouts that triggers automatic unit termination. A value of 0 disables the threshold.'
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
      verbose: 'Milliseconds to wait before playing question audio or prompt TTS.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  timeuntilaudiofeedback: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Delay before feedback audio in milliseconds.',
      verbose: 'Milliseconds to wait before playing feedback audio after an answer is evaluated.'
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
      verbose: 'Custom message shown when the learner must type the correct answer before continuing.'
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
  studyFirst: {
    section: 'deliveryparams',
    authoring: { type: 'number', default: 0, editor: { gridColumns: 4 } },
    runtime: { default: 0, normalize: 'studyFirst' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Probability of showing study first for a new card.',
      verbose: 'Values between 0 and 1 control the probability that a new card begins with a study trial before the first drill/test attempt.'
    },
    validation: { kind: 'range', severity: 'error', message: 'Must be between 0 and 1', min: 0, max: 1 }
  },
  enhancedFeedback: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Legacy enhanced-feedback compatibility flag.',
      verbose: 'Compatibility flag preserved in delivery params for lessons that still author this setting.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  checkOtherAnswers: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Reject near-matches that equal another item’s answer.',
      verbose: 'When enabled, edit-distance matching will not accept an answer that exactly matches a different current stimulus answer.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  feedbackType: {
    section: 'deliveryparams',
    authoring: { type: 'string', default: '', editor: { gridColumns: 4 } },
    runtime: { default: '', normalize: 'lowercaseString' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Feedback mode label.',
      verbose: 'Legacy feedback mode string preserved for compatibility and logging. The current Svelte runtime does not branch authoring behavior from this field.'
    },
    validation: { kind: 'none' }
  },
  falseAnswerLimit: {
    section: 'deliveryparams',
    authoring: { type: 'integer', editor: { gridColumns: 4 } },
    runtime: { default: undefined, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Maximum incorrect attempts allowed for a button trial.',
      verbose: 'Caps the number of incorrect responses allowed during button-based trials before the item advances.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  allowstimulusdropping: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Legacy stimulus-dropping compatibility flag.',
      verbose: 'Compatibility flag preserved in delivery params for lesson files that still author this setting.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  allowPhoneticMatching: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enable phonetic answer matching.',
      verbose: 'When "true", phonetic matching is used as a fallback during answer evaluation after exact/edit-distance checks fail.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  useSpellingCorrection: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Deprecated spelling-correction toggle.',
      verbose: 'Historical compatibility flag retained for legacy authored content. Prefer lfparameter or allowPhoneticMatching in new content.'
    },
    validation: { kind: 'enum', severity: 'warning', message: 'Must be "true" or "false"', values: ['true', 'false'] },
    migration: {
      note: 'Prefer lfparameter or allowPhoneticMatching in new content.'
    }
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
  editDistance: {
    section: 'deliveryparams',
    authoring: { type: 'integer', default: 1, editor: { gridColumns: 4 } },
    runtime: { default: 1, normalize: 'integer' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Legacy edit-distance parameter.',
      verbose: 'Compatibility field preserved for lesson metadata. Current answer evaluation uses lfparameter rather than this direct threshold.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  optimalThreshold: {
    section: 'deliveryparams',
    authoring: { type: 'number', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'number' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Override the learning model’s optimal probability.',
      verbose: 'Overrides item-level optimum values with a lesson-wide threshold between 0 and 1 for model-based selection.'
    },
    validation: { kind: 'range', severity: 'error', message: 'Must be between 0 and 1', min: 0, max: 1 }
  },
  resetStudentPerformance: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Reset displayed progress for the unit.',
      verbose: 'When enabled, the learner’s displayed progress for the unit is reset without deleting the underlying history records.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  practicetimer: {
    section: 'deliveryparams',
    authoring: {
      type: 'string',
      default: 'query-based',
      enum: ['query-based', 'clock-based'],
      editor: { gridColumns: 4 }
    },
    runtime: { default: 'query-based', normalize: 'lowercaseString' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'How practice duration is measured.',
      verbose: 'Controls whether practice duration is measured from question count/query timing or from the running clock-based student performance total.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be one of the supported timer modes', values: ['query-based', 'clock-based'] }
  },
  readyPromptString: {
    section: 'deliveryparams',
    authoring: { type: 'string', default: '', editor: { gridColumns: 12 } },
    runtime: { default: '', normalize: 'lowercaseString' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Prompt text shown between trials.',
      verbose: 'Text displayed during the ready-prompt phase before the next trial begins.'
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
      verbose: 'Milliseconds to display the ready-prompt text between trials.'
    },
    validation: { kind: 'nonNegativeInteger', severity: 'error', message: 'Must be a non-negative integer' }
  },
  forceSpacing: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'true', editor: { gridColumns: 4 } },
    runtime: { default: true, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Enforce minimum spacing between repeated stimuli.',
      verbose: 'When "true", the learning model enforces minimum spacing constraints even when the item pool is tight.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] }
  },
  allowRevistUnit: {
    section: 'deliveryparams',
    authoring: { type: 'booleanString', default: 'false', editor: { gridColumns: 4 } },
    runtime: { default: false, normalize: 'boolean' },
    lifecycle: { status: 'supported' },
    tooltip: {
      brief: 'Allow revisiting the previous unit/instructions flow.',
      verbose: 'Misspelled historical field that allows the learner to return to the previous unit or instructions flow when supported by the lesson.'
    },
    validation: { kind: 'enum', severity: 'error', message: 'Must be "true" or "false"', values: ['true', 'false'] },
    aliases: ['allowRevisitUnit']
  },
  studyOnlyFields: {
    section: 'deliveryparams',
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
  'allowPhoneticMatching',
  'allowRevistUnit',
  'autostopTranscriptionAttemptLimit',
  'branchingEnabled',
  'checkOtherAnswers',
  'correctprompt',
  'drillFields',
  'drill',
  'forceCorrection',
  'forceSpacing',
  'forcecorrectprompt',
  'forcecorrecttimeout',
  'optimalThreshold',
  'practicetimer',
  'prestimulusdisplaytime',
  'purestudy',
  'readyPromptStringDisplayTime',
  'resetStudentPerformance',
  'reviewstudy',
  'scoringEnabled',
  'showhistory',
  'studyOnlyFields',
  'studyFirst',
  'timeuntilaudio',
  'timeuntilaudiofeedback'
]);

export const DELIVERY_PARAM_RUNTIME_INVENTORY = Object.freeze({
  canonicalKeys: DELIVERY_PARAM_CANONICAL_KEYS,
  supportedKeys: DELIVERY_PARAM_SUPPORTED_KEYS,
  aliasToCanonical: DELIVERY_PARAM_ALIAS_TO_CANONICAL,
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
  const schema: Record<string, unknown> = {};
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

  return schema;
}

export function createDeliveryParamSchema(): Record<string, unknown> {
  const properties = Object.fromEntries(
    DELIVERY_PARAM_SUPPORTED_KEYS.map((key) => {
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
