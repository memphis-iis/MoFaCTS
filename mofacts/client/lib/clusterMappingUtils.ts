import { legacyInt, legacyTrim } from '../../common/underscoreCompat';

function extractDelimFields(src: unknown, dest: string[]) {
  if (!src) {
    return;
  }
  const fields = legacyTrim(String(src)).split(/\s/);
  for (let i = 0; i < fields.length; ++i) {
    const fld = legacyTrim(fields[i] ?? '');
    if (fld && fld.length > 0) {
      dest.push(fld);
    }
  }
}

function rangeVal(src: unknown): number[] {
  const srcText = legacyTrim(String(src));
  const idx = srcText.indexOf('-');
  if (idx < 1) {
    return [];
  }

  const first = legacyInt(srcText.substring(0, idx));
  const last = legacyInt(srcText.substring(idx + 1));
  if (last < first) {
    return [];
  }

  const range: number[] = [];
  for (let r = first; r <= last; ++r) {
    range.push(r);
  }

  return range;
}

function shuffle<T>(array: T[]): T[] {
  if (!array || !array.length) {
    return array;
  }

  let currentIndex = array.length;
  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    const tmp = array[currentIndex];
    const randomValue = array[randomIndex];
    if (tmp !== undefined && randomValue !== undefined) {
      array[currentIndex] = randomValue;
      array[randomIndex] = tmp;
    }
  }

  return array;
}

function performClusterShuffle(stimCount: number, shuffleclusters: unknown, mapping: number[]) {
  if (stimCount < 1) {
    return [];
  }

  if (!shuffleclusters) {
    return mapping;
  }

  const shuffleRanges: string[] = [];
  extractDelimFields(shuffleclusters, shuffleRanges);

  const shuffled = mapping.slice();
  for (const rng of shuffleRanges) {
    const targetIndexes = rangeVal(rng);
    const randPerm = targetIndexes.slice();
    shuffle(randPerm);

    for (let j = 0; j < targetIndexes.length; ++j) {
      const targetIndex = targetIndexes[j];
      const randomIndex = randPerm[j];
      const mappedValue = randomIndex !== undefined ? mapping[randomIndex] : undefined;
      if (targetIndex !== undefined && mappedValue !== undefined) {
        shuffled[targetIndex] = mappedValue;
      }
    }
  }

  return shuffled.slice();
}

function performClusterSwap(swapclusters: unknown, mapping: number[]) {
  if (!swapclusters) {
    return mapping;
  }

  const swapList = Array.isArray(swapclusters) ? swapclusters : [swapclusters];
  const swapChunks = swapList.map((item) => rangeVal(item));
  const sortChunks = swapList.map((item) => rangeVal(item));

  sortChunks.sort((lhs, rhs) => {
    const lv = lhs[0] ?? -1;
    const rv = rhs[0] ?? -1;
    if (lv < rv) return -1;
    if (lv > rv) return 1;
    return 0;
  });

  shuffle(swapChunks);

  const swapped: number[] = [];
  let i = 0;
  while (i < mapping.length) {
    const firstSortChunk = sortChunks[0];
    if (firstSortChunk && i === firstSortChunk[0]) {
      const chunk = swapChunks.shift();
      if (!chunk) {
        i += (sortChunks.shift() || []).length;
        continue;
      }
      for (let chunkIdx = 0; chunkIdx < chunk.length; ++chunkIdx) {
        const mappedIndex = chunk[chunkIdx];
        if (mappedIndex !== undefined) {
          const mappedValue = mapping[mappedIndex];
          if (mappedValue !== undefined) {
            swapped.push(mappedValue);
          }
        }
      }
      i += (sortChunks.shift() || []).length;
    } else {
      const currentValue = mapping[i];
      if (currentValue !== undefined) {
        swapped.push(currentValue);
      }
      i++;
    }
  }

  return swapped.slice();
}

function collectRangeIndexes(rangeSpec: unknown, stimCount: number) {
  const indexes = new Set<number>();
  if (!rangeSpec) {
    return indexes;
  }

  const raw = Array.isArray(rangeSpec) ? rangeSpec.join(' ') : String(rangeSpec);
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => legacyTrim(token))
    .filter(Boolean);

  for (const token of tokens) {
    const rangeValues = rangeVal(token);
    if (rangeValues.length > 0) {
      for (const idx of rangeValues) {
        if (idx >= 0 && idx < stimCount) {
          indexes.add(idx);
        }
      }
      continue;
    }

    const parsed = parseInt(token, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < stimCount) {
      indexes.add(parsed);
    }
  }

  return indexes;
}

function isValidClusterPermutation(clusterMapping: unknown, stimCount: number) {
  if (!Array.isArray(clusterMapping) || clusterMapping.length !== stimCount) {
    return false;
  }

  const seen = new Set();
  for (let i = 0; i < stimCount; i++) {
    const value = clusterMapping[i];
    if (!Number.isInteger(value) || value < 0 || value >= stimCount || seen.has(value)) {
      return false;
    }
    seen.add(value);
  }

  return seen.size === stimCount;
}

export function createStimClusterMapping(
  stimCount: number,
  shuffleclusters: unknown,
  swapclusters: unknown,
  startMapping: number[] | null | undefined
) {
  let mapping = (startMapping || []).slice();
  while (mapping.length < stimCount) {
    mapping.push(mapping.length);
  }

  const shuffleList = Array.isArray(shuffleclusters) ? shuffleclusters : [];
  for (const shuffle of shuffleList) {
    mapping = performClusterShuffle(stimCount, shuffle, mapping);
  }
  mapping = performClusterSwap(swapclusters, mapping);

  return mapping;
}

export function isClusterMappingCompatibleWithSetSpec(
  clusterMapping: unknown,
  stimCount: number,
  setSpec: { shuffleclusters?: unknown; swapclusters?: unknown } = {}
) {
  if (!isValidClusterPermutation(clusterMapping, stimCount)) {
    return false;
  }
  const mapping = clusterMapping as number[];

  const touched = new Set<number>();
  const shuffledIndexes = collectRangeIndexes(setSpec.shuffleclusters, stimCount);
  const swappedIndexes = collectRangeIndexes(setSpec.swapclusters, stimCount);

  for (const idx of shuffledIndexes) {
    touched.add(idx);
  }
  for (const idx of swappedIndexes) {
    touched.add(idx);
  }

  if (touched.size === 0) {
    for (let i = 0; i < stimCount; i++) {
      if (mapping[i] !== i) {
        return false;
      }
    }
    return true;
  }

  for (let i = 0; i < stimCount; i++) {
    if (!touched.has(i) && mapping[i] !== i) {
      return false;
    }
  }

  return true;
}
