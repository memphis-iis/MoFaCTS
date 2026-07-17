/** `default` is persisted by MoFaCTS and maps to `{ reasoning: { enabled: true } }`. */
export const OPENROUTER_REASONING_LEVELS = [
  'none',
  'default',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type OpenRouterReasoningLevel = typeof OPENROUTER_REASONING_LEVELS[number];
export type OpenRouterProviderReasoningLevel = Exclude<OpenRouterReasoningLevel, 'default'>;

export type OpenRouterModelReasoningCapabilities = {
  mandatory: boolean;
  /**
   * `null` means OpenRouter accepts every gateway effort level. An omitted
   * property means the model exposes reasoning, but not an effort selector.
   */
  supportedLevels?: OpenRouterProviderReasoningLevel[] | null;
  defaultLevel: OpenRouterProviderReasoningLevel | null;
};

export type OpenRouterModelCatalogEntry = {
  id: string;
  name: string;
  reasoning: OpenRouterModelReasoningCapabilities | null;
};

const OPENROUTER_PROVIDER_EFFORT_LEVELS = OPENROUTER_REASONING_LEVELS.filter(
  (level): level is OpenRouterProviderReasoningLevel => level !== 'default',
);

const OPENROUTER_VISIBLE_OUTPUT_FRACTIONS: Record<OpenRouterReasoningLevel, number> = {
  none: 1,
  default: 0.5,
  minimal: 0.9,
  low: 0.8,
  medium: 0.5,
  high: 0.2,
  xhigh: 0.05,
  max: 0.05,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function isOpenRouterReasoningLevel(value: unknown): value is OpenRouterReasoningLevel {
  return typeof value === 'string' && (
    OPENROUTER_REASONING_LEVELS as readonly string[]
  ).includes(value);
}

/**
 * Reads a persisted reasoning level. An absent value uses the product default
 * (`none`); any supplied non-canonical value is rejected rather than coerced.
 */
export function normalizeOpenRouterReasoningLevel(
  value: unknown,
  label = 'OpenRouter reasoning level',
): OpenRouterReasoningLevel {
  if (value === undefined || value === null) {
    return 'none';
  }
  if (!isOpenRouterReasoningLevel(value)) {
    throw new TypeError(`${label} must be one of: ${OPENROUTER_REASONING_LEVELS.join(', ')}`);
  }
  return value;
}

export function getAllowedOpenRouterReasoningLevels(
  model: OpenRouterModelCatalogEntry,
): OpenRouterReasoningLevel[] {
  if (!model.reasoning) {
    return ['none'];
  }

  const allowed = new Set<OpenRouterReasoningLevel>();
  if (!model.reasoning.mandatory) {
    allowed.add('none');
  }
  allowed.add('default');

  const supportedLevels = model.reasoning.supportedLevels;
  if (supportedLevels === null) {
    for (const level of OPENROUTER_PROVIDER_EFFORT_LEVELS) {
      allowed.add(level);
    }
  } else if (supportedLevels !== undefined) {
    for (const level of supportedLevels) {
      allowed.add(level);
    }
  }

  if (model.reasoning.mandatory) {
    allowed.delete('none');
  }
  return OPENROUTER_REASONING_LEVELS.filter((level) => allowed.has(level));
}

export function getDefaultOpenRouterReasoningLevel(
  model: OpenRouterModelCatalogEntry,
): OpenRouterReasoningLevel {
  const allowed = getAllowedOpenRouterReasoningLevels(model);
  if (allowed.includes('none')) {
    return 'none';
  }
  const providerDefault = model.reasoning?.defaultLevel;
  if (providerDefault && providerDefault !== 'none' && allowed.includes(providerDefault)) {
    return providerDefault;
  }
  return 'default';
}

export function validateOpenRouterReasoningLevelForModel(
  value: unknown,
  model: OpenRouterModelCatalogEntry,
  label = 'OpenRouter reasoning level',
): OpenRouterReasoningLevel {
  const level = normalizeOpenRouterReasoningLevel(value, label);
  const allowed = getAllowedOpenRouterReasoningLevels(model);
  if (!allowed.includes(level)) {
    throw new TypeError(`${label} ${JSON.stringify(level)} is not supported by model ${JSON.stringify(model.id)}`);
  }
  return level;
}

/**
 * Expands a desired visible-output allowance into an OpenRouter completion
 * budget. OpenRouter documents approximate reasoning shares of 10%, 20%, 50%,
 * 80%, and 95% for minimal through max; this preserves the caller's visible
 * allowance after reserving that share for reasoning tokens. The corresponding
 * visible fractions are none=1, default/medium=.5, minimal=.9, low=.8,
 * high=.2, and xhigh/max=.05.
 */
export function expandOpenRouterCompletionBudget(
  visibleTokenBudget: number,
  reasoningLevel: OpenRouterReasoningLevel,
): number {
  if (!Number.isFinite(visibleTokenBudget) || visibleTokenBudget <= 0) {
    throw new TypeError('OpenRouter visible token budget must be a positive finite number');
  }
  const level = normalizeOpenRouterReasoningLevel(reasoningLevel);
  return Math.ceil(visibleTokenBudget / OPENROUTER_VISIBLE_OUTPUT_FRACTIONS[level]);
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function parseReasoningCapabilities(
  value: unknown,
  label: string,
): OpenRouterModelReasoningCapabilities | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object or null`);
  }
  if (typeof value.mandatory !== 'boolean') {
    throw new TypeError(`${label}.mandatory must be a boolean`);
  }

  let supportedLevels: OpenRouterProviderReasoningLevel[] | null | undefined;
  if (hasOwn(value, 'supportedLevels')) {
    if (value.supportedLevels === null) {
      supportedLevels = null;
    } else if (Array.isArray(value.supportedLevels)) {
      supportedLevels = value.supportedLevels.map((level, index) => {
        if (!isOpenRouterReasoningLevel(level)) {
          throw new TypeError(
            `${label}.supportedLevels[${index}] must be one of: ${OPENROUTER_REASONING_LEVELS.join(', ')}`,
          );
        }
        if (level === 'default') {
          throw new TypeError(`${label}.supportedLevels[${index}] cannot be default`);
        }
        return level;
      });
      if (new Set(supportedLevels).size !== supportedLevels.length) {
        throw new TypeError(`${label}.supportedLevels must not contain duplicates`);
      }
    } else {
      throw new TypeError(`${label}.supportedLevels must be an array, null, or omitted`);
    }
  }

  if (!hasOwn(value, 'defaultLevel')) {
    throw new TypeError(`${label}.defaultLevel is required`);
  }
  let defaultLevel: OpenRouterProviderReasoningLevel | null = null;
  if (value.defaultLevel !== null) {
    if (!isOpenRouterReasoningLevel(value.defaultLevel)) {
      throw new TypeError(
        `${label}.defaultLevel must be null or one of: ${OPENROUTER_REASONING_LEVELS.join(', ')}`,
      );
    }
    if (value.defaultLevel === 'default') {
      throw new TypeError(`${label}.defaultLevel cannot be default`);
    }
    defaultLevel = value.defaultLevel;
  }
  if (value.mandatory && defaultLevel === 'none') {
    throw new TypeError(`${label}.defaultLevel cannot be none when reasoning is mandatory`);
  }
  if (Array.isArray(supportedLevels)) {
    if (value.mandatory && supportedLevels.includes('none')) {
      throw new TypeError(`${label}.supportedLevels cannot include none when reasoning is mandatory`);
    }
    if (defaultLevel && !supportedLevels.includes(defaultLevel)) {
      throw new TypeError(`${label}.defaultLevel must be included in supportedLevels`);
    }
  }

  return {
    mandatory: value.mandatory,
    ...(supportedLevels !== undefined ? { supportedLevels } : {}),
    defaultLevel,
  };
}

/** Strictly validates the sanitized catalog returned by the server method. */
export function parseOpenRouterModelCatalog(value: unknown): OpenRouterModelCatalogEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('OpenRouter model catalog must be a non-empty array');
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const label = `OpenRouter model catalog[${index}]`;
    if (!isRecord(entry)) {
      throw new TypeError(`${label} must be an object`);
    }
    const id = readNonEmptyString(entry.id, `${label}.id`);
    if (ids.has(id)) {
      throw new TypeError(`OpenRouter model catalog contains duplicate id ${JSON.stringify(id)}`);
    }
    ids.add(id);
    const name = readNonEmptyString(entry.name, `${label}.name`);
    if (!hasOwn(entry, 'reasoning')) {
      throw new TypeError(`${label}.reasoning is required`);
    }
    return {
      id,
      name,
      reasoning: parseReasoningCapabilities(entry.reasoning, `${label}.reasoning`),
    };
  });
}
