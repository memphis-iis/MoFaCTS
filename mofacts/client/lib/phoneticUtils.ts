/**
 * Phonetic Matching Utilities
 *
 * Functions for phonetic matching using Double Metaphone algorithm.
 * Used primarily for speech recognition to fuzzy-match spoken words to correct answers.
 * Extracted from card.js as part of C1.3 refactoring.
 *
 * @module client/lib/phoneticUtils
 */

import { doubleMetaphone } from 'double-metaphone';
import { levenshteinDistance } from './stringUtils';

const clientConsole = (...args: unknown[]): void => {
  const maybeClientConsole = (globalThis as typeof globalThis & { clientConsole?: (...innerArgs: unknown[]) => void }).clientConsole;
  if (typeof maybeClientConsole === 'function') {
    maybeClientConsole(...args);
  }
};

// Module-level cache for phonetic codes to avoid redundant computation
const phoneticCache = new Map<string, [string, string]>();

/**
 * Get phonetic codes for a word using Double Metaphone
 *
 * Returns [primary, secondary] phonetic codes. Uses module-level cache for performance.
 *
 * @param {string} word - Word to get phonetic codes for
 * @returns {string[]} Array of [primary, secondary] phonetic codes
 *
 * @example
 * getPhoneticCodes('mali')      // Returns: ['ML', '']
 * getPhoneticCodes('cameron')   // Returns: ['KMRN', '']
 */
function getPhoneticCodes(word: string): [string, string] {
  const normalizedWord = word.toLowerCase().trim();

  // Check cache first
  if (phoneticCache.has(normalizedWord)) {
    const cached = phoneticCache.get(normalizedWord);
    if (cached) {
      return cached;
    }
  }

  // Compute and cache
  const rawCodes = doubleMetaphone(normalizedWord);
  const codes: [string, string] = [rawCodes[0] ?? '', rawCodes[1] ?? ''];
  phoneticCache.set(normalizedWord, codes);
  return codes; // [primary, secondary]
}

/**
 * Pre-compute phonetic index for O(1) lookup instead of O(n) search
 *
 * Creates a Map from phonetic codes to word entries for fast lookup.
 *
 * @param {string[]} grammarList - List of words to index
 * @returns {Map<string, Array>} Map of phonetic code → [{word, length, primary, secondary}]
 *
 * @example
 * const index = buildPhoneticIndex(['mali', 'malawi', 'peru']);
 * // index.get('ML') → [{word: 'mali', length: 4, primary: 'ML', secondary: ''}]
 */
type PhoneticIndexEntry = {
  word: string;
  length: number;
  primary: string | null;
  secondary: string | null;
};

export function buildPhoneticIndex(grammarList: string[]): Map<string, PhoneticIndexEntry[]> {
  const index = new Map<string, PhoneticIndexEntry[]>();
  const startTime = performance.now();

  for (const word of grammarList) {
    // Use cached phonetic codes
    const [primary, secondary] = getPhoneticCodes(word);
    const entry = {
      word: word,
      length: word.length,
      primary: primary,
      secondary: secondary
    };

    // Index by primary code
    if (primary) {
      if (!index.has(primary)) {
        index.set(primary, []);
      }
      index.get(primary)!.push(entry);
    }

    // Index by secondary code
    if (secondary && secondary !== primary) {
      if (!index.has(secondary)) {
        index.set(secondary, []);
      }
      index.get(secondary)!.push(entry);
    }
  }

  const elapsed = performance.now() - startTime;
  clientConsole(2, `[SR] 📇 Built phonetic index: ${grammarList.length} words → ${index.size} codes in ${elapsed.toFixed(2)}ms`);
  return index;
}

/**
 * Find words in grammar that have phonetic conflicts with the correct answer
 *
 * These should be removed from phrase hints and answer grammar to prevent false matches.
 * Uses SAME matching logic as Tier 2 (exact) and Tier 3 (fuzzy) phonetic matching.
 *
 * @param {string} correctAnswer - The correct answer to check against
 * @param {string[]} grammarList - List of words to search for conflicts
 * @param {Map} [phoneticIndex=null] - Optional pre-computed phonetic index
 * @returns {string[]} Array of conflicting words
 *
 * @example
 * findPhoneticConflictsWithCorrectAnswer('anguilla', ['angola', 'peru'])
 * // Returns: ['angola']  (ANKL = ANKL, exact match)
 */
export function findPhoneticConflictsWithCorrectAnswer(correctAnswer: string, grammarList: string[], _phoneticIndex: Map<string, PhoneticIndexEntry[]> | null = null): string[] {
  const conflicts: string[] = [];

  // Get phonetic codes for the correct answer
  const [correctPrimary, correctSecondary] = getPhoneticCodes(correctAnswer);

  // Search through grammar with SAME logic as Tier 2 + Tier 3
  for (const word of grammarList) {
    if (word === correctAnswer) continue; // Skip the correct answer itself

    const [wordPrimary, wordSecondary] = getPhoneticCodes(word);

    // Tier 2: Check if ANY codes match exactly (primary-to-primary, primary-to-secondary, etc.)
    const exactMatch =
      (correctPrimary && (correctPrimary === wordPrimary || correctPrimary === wordSecondary)) ||
      (correctSecondary && (correctSecondary === wordPrimary || correctSecondary === wordSecondary));

    if (exactMatch) {
      conflicts.push(word);
      continue;
    }

    // Fuzzy phonetic matching - edit distance = 1 on phonetic codes
    // No minimum code length constraint - works for all countries including short ones like "mali" (ML)
    const phoneticEditDist = Math.min(
      levenshteinDistance(correctPrimary, wordPrimary),
      correctSecondary ? levenshteinDistance(correctSecondary, wordPrimary) : Infinity,
      wordSecondary ? levenshteinDistance(correctPrimary, wordSecondary) : Infinity,
      (correctSecondary && wordSecondary) ? levenshteinDistance(correctSecondary, wordSecondary) : Infinity
    );

    // If phonetic codes are within edit distance of 1, it's a conflict
    if (phoneticEditDist === 1) {
      conflicts.push(word);
    }
  }

  if (conflicts.length > 0) {
    clientConsole(2, `[SR] 🚫 Found ${conflicts.length} phonetic conflict(s) with "${correctAnswer}": [${conflicts.join(', ')}]`);
  }

  return conflicts;
}

/**
 * Filter out phonetically ambiguous words from grammar
 *
 * For example, if spoken word is "molly", exclude "malawi" from candidates since it
 * phonetically matches "mali" which is closer in length to "molly".
 *
 * @param {string} spokenWord - The word that was spoken
 * @param {string[]} grammarList - List of candidate words
 * @returns {string[]} Filtered grammar list
 *
 * @example
 * filterPhoneticConflicts('molly', ['mali', 'malawi', 'peru'])
 * // Returns: ['mali', 'peru']  (malawi removed due to conflict with mali)
 */
function filterPhoneticConflicts(spokenWord: string, grammarList: string[]): string[] {
  // Use cached phonetic codes
  const [spokenPrimary, spokenSecondary] = getPhoneticCodes(spokenWord);
  const spokenLength = spokenWord.length;

  // Build a map of phonetic codes to words with their lengths
  const phoneticGroups = new Map<string, Array<{ word: string; length: number }>>();

  for (const word of grammarList) {
    // Use cached phonetic codes
    const [primary, secondary] = getPhoneticCodes(word);
    const codes = [primary];
    if (secondary && secondary !== primary) {
      codes.push(secondary);
    }

    for (const code of codes) {
      if (!phoneticGroups.has(code)) {
        phoneticGroups.set(code, []);
      }
      phoneticGroups.get(code)!.push({ word, length: word.length });
    }
  }

  // Find all words that share phonetic codes with spoken word
  const relevantCodes = [spokenPrimary];
  if (spokenSecondary && spokenSecondary !== spokenPrimary) {
    relevantCodes.push(spokenSecondary);
  }

  let conflicts: Array<{ word: string; length: number }> = [];
  for (const code of relevantCodes) {
    if (phoneticGroups.has(code)) {
      conflicts.push(...(phoneticGroups.get(code) || []));
    }
  }

  if (conflicts.length <= 1) {
    // No conflicts, return original list
    return grammarList;
  }

  // Sort conflicts by length difference from spoken word (closest first)
  conflicts.sort((a, b) => {
    const diffA = Math.abs(a.length - spokenLength);
    const diffB = Math.abs(b.length - spokenLength);
    return diffA - diffB;
  });

  // Keep ONLY the words with the exact closest length match
  // If "molly"(5) has conflicts with "mali"(4, diff=1) and "malawi"(6, diff=1),
  // we need a tie-breaker: prefer SHORTER words (homophones are usually not longer)
  const firstConflict = conflicts[0];
  if (!firstConflict) {
    return grammarList;
  }
  const closestDiff = Math.abs(firstConflict.length - spokenLength);
  const closestMatches = conflicts.filter(c => Math.abs(c.length - spokenLength) === closestDiff);

  // Tie-breaker: prefer shorter words when multiple have same length diff
  const preferShorter = closestMatches.filter(c => c.length <= spokenLength);
  const finalCandidates = preferShorter.length > 0 ? preferShorter : closestMatches;

  const keepWords = new Set(
    finalCandidates
      .slice(0, 2) // Keep at most 2 to avoid ambiguity
      .map(c => c.word)
  );

  const filtered = grammarList.filter(word => {
    const shouldKeep = !conflicts.some(c => c.word === word) || keepWords.has(word);
    return shouldKeep;
  });

  return filtered;
}

/**
 * Find phonetically matching word from grammar list using Double Metaphone
 *
 * Two-tier matching: Tier 1 (exact string) + Tier 2 (exact phonetic code).
 * Fuzzy phonetic conflicts are filtered out BEFORE calling this function.
 *
 * @param {string} spokenWord - The word that was spoken
 * @param {string[]} grammarList - List of candidate words
 * @param {Map} [phoneticIndex=null] - Optional pre-computed phonetic index for O(1) lookup
 * @returns {string|null} Best matching word or null if no match found
 *
 * @example
 * findPhoneticMatch('molly', ['mali', 'peru'], index)
 * // Returns: 'mali' (phonetic match)
 */
export function findPhoneticMatch(spokenWord: string, grammarList: string[], phoneticIndex: Map<string, PhoneticIndexEntry[]> | null = null): string | null {
  // First, filter out phonetically conflicting words (e.g., "malawi" when looking for "mali")
  const filteredGrammar = filterPhoneticConflicts(spokenWord, grammarList);

  // Rebuild index if we filtered the grammar
  if (phoneticIndex && filteredGrammar.length < grammarList.length) {
    phoneticIndex = buildPhoneticIndex(filteredGrammar);
  }

  for (const variant of generateSpokenWordVariants(spokenWord)) {
    if (variant !== spokenWord) {
      clientConsole(2, `[SR] Retrying phonetic match with variant: "${variant}"`);
    }
    const result = tryPhoneticMatch(variant, filteredGrammar, phoneticIndex);
    if (result) {
      return result;
    }
  }

  return null;
}

function generateSpokenWordVariants(spokenWord: string): string[] {
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

  if (!spokenWord.includes(' ')) {
    return variants;
  }

  const noSpaces = spokenWord.replace(/\s+/g, '');
  addVariant(noSpaces);

  return variants;
}

type PhoneticCodeComparison = {
  editDistance: number;
  normalizedOverlap: number;
};

function getBestPhoneticCodeComparison(
  spokenPrimary: string,
  spokenSecondary: string,
  grammarPrimary: string,
  grammarSecondary: string
): PhoneticCodeComparison {
  const candidatePairs: Array<[string, string]> = [];
  const addPair = (spokenCode: string, grammarCode: string): void => {
    if (!spokenCode || !grammarCode) {
      return;
    }
    candidatePairs.push([spokenCode, grammarCode]);
  };

  addPair(spokenPrimary, grammarPrimary);
  addPair(spokenSecondary, grammarPrimary);
  addPair(spokenPrimary, grammarSecondary);
  addPair(spokenSecondary, grammarSecondary);

  let bestComparison: PhoneticCodeComparison = {
    editDistance: Infinity,
    normalizedOverlap: -Infinity,
  };

  for (const [spokenCode, grammarCode] of candidatePairs) {
    const editDistance = levenshteinDistance(spokenCode, grammarCode);
    // Normalize by the candidate code length so one missing/extra sound
    // penalizes short words more than longer near-matches like STR -> ASTR.
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

  return bestComparison;
}

/**
 * Internal helper for phonetic matching
 *
 * Implements tier-based matching logic:
 * - Tier 2: Exact phonetic code match
 * - Tier 3: Fuzzy phonetic match (edit distance = 1)
 *
 * @param {string} spokenWord - The word that was spoken
 * @param {string[]} grammarList - List of candidate words
 * @param {Map} [phoneticIndex=null] - Optional pre-computed phonetic index
 * @returns {string|null} Best matching word or null
 *
 * @private
 */
function tryPhoneticMatch(spokenWord: string, grammarList: string[], phoneticIndex: Map<string, PhoneticIndexEntry[]> | null = null): string | null {
  const [spokenPrimary, spokenSecondary] = getPhoneticCodes(spokenWord);

  clientConsole(2, `[SR] Looking for phonetic match for "${spokenWord}"...`);

  // Additional validation: words must be similar in length to avoid false matches
  // (e.g., "mali" shouldn't match "malawi", "akrotiri" shouldn't match "ecuador")
  const normalizedSpokenWord = spokenWord.toLowerCase().trim();
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

  const processCandidateEntries = (candidateEntries: PhoneticIndexEntry[]): void => {
    for (const entry of candidateEntries) {
      const grammarWord = entry.word;
      const grammarLength = entry.length;
      const normalizedGrammarWord = grammarWord.toLowerCase().trim();

      // Google SR often drops the unvoiced final "th" from short standalone
      // targets ("growth" -> "grow"). Keep this narrow so fragments do not
      // become broadly acceptable for unrelated answers.
      if (
        normalizedSpokenWord.length >= 3 &&
        normalizedGrammarWord.endsWith('th') &&
        normalizedGrammarWord.slice(0, -2) === normalizedSpokenWord
      ) {
        bestMatch = grammarWord;
        bestEditDistance = 0;
        bestNormalizedOverlap = 1;
        bestLengthDiff = 2;
        return;
      }

      // Smart length guard: use BOTH absolute and proportional checks
      // This prevents "mali" (4) → "malawi" (6) while still giving longer
      // multi-syllable names a little more room for SR-inserted filler.
      const lengthDiff = Math.abs(spokenLength - grammarLength);
      const shorterLength = Math.min(spokenLength, grammarLength);
      const isLongFormCandidate = shorterLength >= 12;
      const maxAbsoluteDiff = isLongFormCandidate ? 4 : 2;
      const maxProportionalDiff = isLongFormCandidate ? 0.35 : 0.30;

      const proportionalDiff = lengthDiff / shorterLength;

      // Reject if EITHER condition fails
      if (lengthDiff > maxAbsoluteDiff || proportionalDiff > maxProportionalDiff) {
        continue;
      }

      // Get or compute phonetic codes
      let grammarPrimary: string;
      let grammarSecondary: string;
      if (entry.primary !== null) {
        // Already computed in index
        grammarPrimary = entry.primary || '';
        grammarSecondary = entry.secondary || '';
      } else {
        // Compute on demand for O(n) fallback
        [grammarPrimary, grammarSecondary] = getPhoneticCodes(grammarWord);
      }

      const bestPhoneticComparison = getBestPhoneticCodeComparison(
        spokenPrimary,
        spokenSecondary,
        grammarPrimary,
        grammarSecondary
      );

      // Check for exact phonetic code match
      const exactPhoneticMatch = bestPhoneticComparison.editDistance === 0;

      if (exactPhoneticMatch) {
        // Exact phonetic match - prefer shorter length difference
        if (isBetterCandidate(0, 1, lengthDiff)) {
          bestMatch = grammarWord;
          bestEditDistance = 0;
          bestNormalizedOverlap = 1;
          bestLengthDiff = lengthDiff;
        }
        // If length diff is 0 or 1, accept immediately (perfect homophones)
        if (lengthDiff <= 1) {
          bestMatch = grammarWord;
          bestEditDistance = 0;
          bestNormalizedOverlap = 1;
          bestLengthDiff = lengthDiff;
          return;
        }
      } else {
        // Tier 3: Fuzzy phonetic matching - edit distance = 1 on PHONETIC CODES
        // This checks if the phonetic codes are similar, not the literal words
        // Pre-filtering is just a bias, so we still need this as backup
        // Allow fuzzy match if phonetic codes differ by exactly 1 character
        // No minimum code length restriction - works for all countries
        if (bestPhoneticComparison.editDistance === 1) {
          if (isBetterCandidate(1, bestPhoneticComparison.normalizedOverlap, lengthDiff)) {
            bestMatch = grammarWord;
            bestEditDistance = 1;
            bestNormalizedOverlap = bestPhoneticComparison.normalizedOverlap;
            bestLengthDiff = lengthDiff;
          }
        }
      }
    }
  };

  if (phoneticIndex) {
    clientConsole(2, `[SR] Using pre-computed phonetic index (O(1) lookup)`);
    const primaryMatches = phoneticIndex.get(spokenPrimary) || [];
    const secondaryMatches = spokenSecondary ? (phoneticIndex.get(spokenSecondary) || []) : [];
    const exactCandidates = [...primaryMatches, ...secondaryMatches];

    clientConsole(2, `[SR] Found ${exactCandidates.length} candidate entries from phonetic index`);
    processCandidateEntries(exactCandidates);

    if (!bestMatch) {
      clientConsole(2, '[SR] No exact-code indexed candidate matched; falling back to full fuzzy scan');
      processCandidateEntries(grammarList.map((word) => ({
        word,
        length: word.length,
        primary: null,
        secondary: null
      })));
    }
  } else {
    clientConsole(2, `[SR] No phonetic index, using O(n) search`);
    processCandidateEntries(grammarList.map((word) => ({
      word,
      length: word.length,
      primary: null,
      secondary: null
    })));
  }

  if (bestMatch) {
    clientConsole(2, `[SR] ✅ Best phonetic match: "${spokenWord}" → "${bestMatch}"`);
    return bestMatch;
  }

  clientConsole(2, `[SR] No phonetic match found`);
  return null;
}







