type RawStimResponseLike = {
  correctResponse?: unknown;
  incorrectResponses?: unknown;
};

type RawStimLike = {
  response?: RawStimResponseLike;
};

type RawClusterLike = {
  stims?: RawStimLike[];
};

type RawStimuliFileLike = {
  setspec?: {
    clusters?: RawClusterLike[];
  };
};

const NON_BREAKING_SPACES_REGEX = /[\u00A0\u202F]/g;

function isInvisibleUnicodeCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (typeof codePoint !== 'number') {
    return false;
  }

  return (
    (codePoint >= 0x0000 && codePoint <= 0x0008) ||
    codePoint === 0x000b ||
    codePoint === 0x000c ||
    (codePoint >= 0x000e && codePoint <= 0x001f) ||
    codePoint === 0x007f ||
    codePoint === 0x00ad ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

export function removeInvisibleUnicode(value: unknown): unknown {
  if (value === null || value === '') {
    return value;
  }

  const text = String(value);
  return Array.from(text.replace(NON_BREAKING_SPACES_REGEX, ' '))
    .filter((character) => !isInvisibleUnicodeCharacter(character))
    .join('');
}

function flattenRawStimuli(rawStimuliFile: unknown): RawStimLike[] {
  const candidate = rawStimuliFile as RawStimuliFileLike | null | undefined;
  const clusters = candidate?.setspec?.clusters;
  if (!Array.isArray(clusters)) {
    return [];
  }

  const flattened: RawStimLike[] = [];
  for (const cluster of clusters) {
    if (!Array.isArray(cluster?.stims)) {
      continue;
    }
    flattened.push(...cluster.stims);
  }
  return flattened;
}

function normalizeIncorrectResponses(value: unknown): unknown[] | undefined {
  if (value === null || typeof value === 'undefined') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => removeInvisibleUnicode(entry));
  }

  if (typeof value === 'string') {
    return value.split(',').map((entry) => removeInvisibleUnicode(entry));
  }

  return undefined;
}

function areArraysShallowEqual(left: unknown[] | undefined, right: unknown[] | undefined): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function repairFormattedStimuliResponsesFromRaw<T extends Record<string, unknown>>(
  formattedStimuli: T[] | null | undefined,
  rawStimuliFile: unknown
): T[] | null | undefined {
  if (!Array.isArray(formattedStimuli) || formattedStimuli.length === 0) {
    return formattedStimuli;
  }

  const rawStims = flattenRawStimuli(rawStimuliFile);
  if (rawStims.length !== formattedStimuli.length) {
    return formattedStimuli;
  }

  let changed = false;
  const repaired = formattedStimuli.map((stimulus, index) => {
    const rawResponse = rawStims[index]?.response;
    if (!rawResponse || !Object.prototype.hasOwnProperty.call(rawResponse, 'correctResponse')) {
      return stimulus;
    }

    const repairedCorrectResponse = removeInvisibleUnicode(rawResponse.correctResponse);
    const repairedIncorrectResponses = normalizeIncorrectResponses(rawResponse.incorrectResponses);
    const existingIncorrectResponses = Array.isArray(stimulus.incorrectResponses)
      ? stimulus.incorrectResponses
      : undefined;

    const correctChanged = stimulus.correctResponse !== repairedCorrectResponse;
    const incorrectChanged = !areArraysShallowEqual(existingIncorrectResponses, repairedIncorrectResponses);
    if (!correctChanged && !incorrectChanged) {
      return stimulus;
    }

    changed = true;
    return {
      ...stimulus,
      correctResponse: repairedCorrectResponse,
      incorrectResponses: repairedIncorrectResponses,
    };
  });

  return changed ? repaired : formattedStimuli;
}
