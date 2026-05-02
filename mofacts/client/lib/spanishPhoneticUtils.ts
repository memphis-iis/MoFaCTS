import { levenshteinDistance } from './stringUtils';

const clientConsole = (...args: unknown[]): void => {
  const maybeClientConsole = (globalThis as typeof globalThis & { clientConsole?: (...innerArgs: unknown[]) => void }).clientConsole;
  if (typeof maybeClientConsole === 'function') {
    maybeClientConsole(...args);
  }
};

type SpanishPhoneticIndexEntry = {
  word: string;
  length: number;
  primary: string | null;
  secondary: string | null;
  codes?: string[];
};

const spanishPhoneticCache = new Map<string, string[]>();

function normalizeSpanishForPhonetics(word: string, preserveHardGBeforeFrontVowels = false): string {
  let normalized = word
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñü\s]/g, ' ')
    .replace(/\s+/g, '')
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'x')
    .replace(/ll/g, 'y')
    .replace(/rr/g, 'r')
    .replace(/ñ/g, 'ny')
    .replace(/gü([ei])/g, 'gw$1')
    .replace(/gu([ei])/g, 'G$1')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/ce/g, 'se')
    .replace(/ci/g, 'si')
    .replace(/z/g, 's')
    .replace(preserveHardGBeforeFrontVowels ? /$^/g : /g([ei])/g, 'j$1')
    .replace(/G([ei])/g, 'g$1')
    .replace(/c([aou])/g, 'k$1')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/v/g, 'b')
    .replace(/h/g, '')
    .replace(/w/g, 'gu')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ü/g, 'u')
    .replace(/[^a-z]/g, '');

  if (!normalized) {
    normalized = word.toLowerCase().trim().replace(/\s+/g, '');
  }

  return normalized;
}

function generateSpanishPhoneticVariants(word: string): string[] {
  const normalizedWord = word.toLowerCase().trim();

  if (spanishPhoneticCache.has(normalizedWord)) {
    const cached = spanishPhoneticCache.get(normalizedWord);
    if (cached) {
      return cached;
    }
  }

  const variants: string[] = [];
  const seen = new Set<string>();
  const addVariant = (value: string): void => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    variants.push(normalized);
  };

  const primaryNormalized = normalizeSpanishForPhonetics(word);
  const hardGNormalized = normalizeSpanishForPhonetics(word, true);
  const normalizedForms = [primaryNormalized];
  if (hardGNormalized && hardGNormalized !== primaryNormalized) {
    normalizedForms.push(hardGNormalized);
  }

  for (const normalizedForm of normalizedForms) {
    addVariant(normalizedForm);

    // Common SR omission for words like "estar" -> "star" and "escuela" -> "scuela".
    if (/^es[^aeiou]/.test(normalizedForm)) {
      const droppedInitialE = normalizedForm.slice(1);
      addVariant(droppedInitialE);
    }

    // SR sometimes weakens a leading unstressed article-like vowel.
    if (/^[aeiou][bcdfghjklmnñpqrstvwxyz]{2,}/.test(normalizedForm)) {
      const droppedInitialVowel = normalizedForm.slice(1);
      addVariant(droppedInitialVowel);
    }
  }

  spanishPhoneticCache.set(normalizedWord, variants);
  return variants;
}

function getAllSpanishPhoneticCodes(word: string): string[] {
  return generateSpanishPhoneticVariants(word);
}

export function buildSpanishPhoneticIndex(grammarList: string[]): Map<string, SpanishPhoneticIndexEntry[]> {
  const index = new Map<string, SpanishPhoneticIndexEntry[]>();
  const startTime = performance.now();

  for (const word of grammarList) {
    const codes = getAllSpanishPhoneticCodes(word);
    const [primary, secondary] = [codes[0] || '', codes[1] || ''];
    const entry = {
      word,
      length: word.length,
      primary,
      secondary,
      codes
    };

    for (const code of codes) {
      if (!index.has(code)) {
        index.set(code, []);
      }
      index.get(code)!.push(entry);
    }
  }

  const elapsed = performance.now() - startTime;
  clientConsole(2, `[SR] [es] 📇 Built phonetic index: ${grammarList.length} words → ${index.size} codes in ${elapsed.toFixed(2)}ms`);
  return index;
}

type SpanishPhoneticCodeComparison = {
  editDistance: number;
  normalizedOverlap: number;
};

function getBestSpanishPhoneticCodeComparison(
  spokenCodes: string[],
  grammarCodes: string[]
): SpanishPhoneticCodeComparison {
  let bestComparison: SpanishPhoneticCodeComparison = {
    editDistance: Infinity,
    normalizedOverlap: -Infinity,
  };

  for (const spokenCode of spokenCodes) {
    if (!spokenCode) {
      continue;
    }
    for (const grammarCode of grammarCodes) {
      if (!grammarCode) {
        continue;
      }
      const editDistance = levenshteinDistance(spokenCode, grammarCode);
      const normalizedOverlap = 1 - (editDistance / Math.max(grammarCode.length, 1));

      if (
        editDistance < bestComparison.editDistance ||
        (editDistance === bestComparison.editDistance && normalizedOverlap > bestComparison.normalizedOverlap)
      ) {
        bestComparison = {
          editDistance,
          normalizedOverlap,
        };
      }
    }
  }

  return bestComparison;
}

export function findSpanishPhoneticConflictsWithCorrectAnswer(
  correctAnswer: string,
  grammarList: string[],
  _phoneticIndex: Map<string, SpanishPhoneticIndexEntry[]> | null = null
): string[] {
  const conflicts: string[] = [];
  const correctCodes = getAllSpanishPhoneticCodes(correctAnswer);
  const normalizedCorrectAnswer = normalizeSpanishForPhonetics(correctAnswer);

  for (const word of grammarList) {
    if (word === correctAnswer) continue;
    if (normalizeSpanishForPhonetics(word) === normalizedCorrectAnswer) continue;

    const wordCodes = getAllSpanishPhoneticCodes(word);
    const bestComparison = getBestSpanishPhoneticCodeComparison(
      correctCodes,
      wordCodes
    );

    if (bestComparison.editDistance === 0 || bestComparison.editDistance === 1) {
      conflicts.push(word);
    }
  }

  if (conflicts.length > 0) {
    clientConsole(2, `[SR] [es] 🚫 Found ${conflicts.length} phonetic conflict(s) with "${correctAnswer}": [${conflicts.join(', ')}]`);
  }

  return conflicts;
}

function filterSpanishPhoneticConflicts(spokenWord: string, grammarList: string[]): string[] {
  const spokenCodes = getAllSpanishPhoneticCodes(spokenWord);
  const spokenLength = spokenWord.length;
  const phoneticGroups = new Map<string, Array<{ word: string; length: number }>>();

  for (const word of grammarList) {
    const codes = getAllSpanishPhoneticCodes(word);
    for (const code of codes) {
      if (!phoneticGroups.has(code)) {
        phoneticGroups.set(code, []);
      }
      phoneticGroups.get(code)!.push({ word, length: word.length });
    }
  }

  let conflicts: Array<{ word: string; length: number }> = [];
  for (const code of spokenCodes) {
    if (phoneticGroups.has(code)) {
      conflicts.push(...(phoneticGroups.get(code) || []));
    }
  }

  if (conflicts.length <= 1) {
    return grammarList;
  }

  conflicts.sort((a, b) => {
    const diffA = Math.abs(a.length - spokenLength);
    const diffB = Math.abs(b.length - spokenLength);
    return diffA - diffB;
  });

  const firstConflict = conflicts[0];
  if (!firstConflict) {
    return grammarList;
  }

  const closestDiff = Math.abs(firstConflict.length - spokenLength);
  const closestMatches = conflicts.filter((conflict) => Math.abs(conflict.length - spokenLength) === closestDiff);
  const preferShorter = closestMatches.filter((conflict) => conflict.length <= spokenLength);
  const finalCandidates = preferShorter.length > 0 ? preferShorter : closestMatches;

  const keepWords = new Set(
    finalCandidates
      .slice(0, 2)
      .map((conflict) => conflict.word)
  );

  return grammarList.filter((word) => {
    const shouldKeep = !conflicts.some((conflict) => conflict.word === word) || keepWords.has(word);
    return shouldKeep;
  });
}

function generateSpanishSpokenWordVariants(spokenWord: string): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();
  const addVariant = (value: string): void => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    variants.push(normalized);
  };

  addVariant(spokenWord);

  if (spokenWord.includes(' ')) {
    addVariant(spokenWord.replace(/\s+/g, ''));
  }

  return variants;
}

function trySpanishPhoneticMatch(
  spokenWord: string,
  grammarList: string[],
  phoneticIndex: Map<string, SpanishPhoneticIndexEntry[]> | null = null
): string | null {
  const spokenCodes = getAllSpanishPhoneticCodes(spokenWord);

  clientConsole(2, `[SR] [es] Looking for phonetic match for "${spokenWord}"...`);

  const spokenLength = spokenWord.length;
  let bestMatch: string | null = null;
  let bestEditDistance = Infinity;
  let bestNormalizedOverlap = -Infinity;
  let bestLengthDiff = Infinity;

  const isBetterCandidate = (
    editDistance: number,
    normalizedOverlap: number,
    lengthDiff: number
  ): boolean => (
    editDistance < bestEditDistance ||
    (editDistance === bestEditDistance && normalizedOverlap > bestNormalizedOverlap) ||
    (editDistance === bestEditDistance && normalizedOverlap === bestNormalizedOverlap && lengthDiff < bestLengthDiff)
  );

  const processCandidateEntries = (candidateEntries: SpanishPhoneticIndexEntry[]): void => {
    for (const entry of candidateEntries) {
      const grammarWord = entry.word;
      const grammarLength = entry.length;
      const lengthDiff = Math.abs(spokenLength - grammarLength);
      const shorterLength = Math.min(spokenLength, grammarLength);
      const isLongFormCandidate = shorterLength >= 12;
      const maxAbsoluteDiff = isLongFormCandidate ? 4 : 2;
      const maxProportionalDiff = isLongFormCandidate ? 0.35 : 0.30;
      const proportionalDiff = lengthDiff / shorterLength;

      if (lengthDiff > maxAbsoluteDiff || proportionalDiff > maxProportionalDiff) {
        continue;
      }

      const grammarCodes = entry.codes && entry.codes.length > 0
        ? entry.codes
        : getAllSpanishPhoneticCodes(grammarWord);

      const bestComparison = getBestSpanishPhoneticCodeComparison(
        spokenCodes,
        grammarCodes
      );

      if (bestComparison.editDistance === 0) {
        if (isBetterCandidate(0, 1, lengthDiff)) {
          bestMatch = grammarWord;
          bestEditDistance = 0;
          bestNormalizedOverlap = 1;
          bestLengthDiff = lengthDiff;
        }
        if (lengthDiff <= 1) {
          bestMatch = grammarWord;
          bestEditDistance = 0;
          bestNormalizedOverlap = 1;
          bestLengthDiff = lengthDiff;
          return;
        }
      } else if (bestComparison.editDistance === 1) {
        if (isBetterCandidate(1, bestComparison.normalizedOverlap, lengthDiff)) {
          bestMatch = grammarWord;
          bestEditDistance = 1;
          bestNormalizedOverlap = bestComparison.normalizedOverlap;
          bestLengthDiff = lengthDiff;
        }
      }
    }
  };

  if (phoneticIndex) {
    clientConsole(2, '[SR] [es] Using pre-computed phonetic index (O(1) lookup)');
    const exactCandidatesMap = new Map<string, SpanishPhoneticIndexEntry>();
    for (const code of spokenCodes) {
      const matches = phoneticIndex.get(code) || [];
      for (const entry of matches) {
        exactCandidatesMap.set(entry.word, entry);
      }
    }
    const exactCandidates = Array.from(exactCandidatesMap.values());

    clientConsole(2, `[SR] [es] Found ${exactCandidates.length} candidate entries from phonetic index`);
    processCandidateEntries(exactCandidates);

    if (!bestMatch) {
      clientConsole(2, '[SR] [es] No exact-code indexed candidate matched; falling back to full fuzzy scan');
      processCandidateEntries(grammarList.map((word) => ({
        word,
        length: word.length,
        primary: null,
        secondary: null,
        codes: []
      })));
    }
  } else {
    clientConsole(2, '[SR] [es] No phonetic index, using O(n) search');
    processCandidateEntries(grammarList.map((word) => ({
      word,
      length: word.length,
      primary: null,
      secondary: null,
      codes: []
    })));
  }

  if (bestMatch) {
    clientConsole(2, `[SR] [es] ✅ Best phonetic match: "${spokenWord}" → "${bestMatch}"`);
    return bestMatch;
  }

  clientConsole(2, '[SR] [es] No phonetic match found');
  return null;
}

export function findSpanishPhoneticMatch(
  spokenWord: string,
  grammarList: string[],
  phoneticIndex: Map<string, SpanishPhoneticIndexEntry[]> | null = null
): string | null {
  const filteredGrammar = filterSpanishPhoneticConflicts(spokenWord, grammarList);

  if (phoneticIndex && filteredGrammar.length < grammarList.length) {
    phoneticIndex = buildSpanishPhoneticIndex(filteredGrammar);
  }

  for (const variant of generateSpanishSpokenWordVariants(spokenWord)) {
    if (variant !== spokenWord) {
      clientConsole(2, `[SR] [es] Retrying phonetic match with variant: "${variant}"`);
    }
    const result = trySpanishPhoneticMatch(variant, filteredGrammar, phoneticIndex);
    if (result) {
      return result;
    }
  }

  return null;
}
