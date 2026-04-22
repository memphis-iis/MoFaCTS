// Owner: Learning Runtime Team
// Observe-only mapping identity signature utilities (Stage 1).

type UnknownRecord = Record<string, any>;

type MappingSignatureInput = {
  rootTdfId: string | null;
  conditionTdfId: string | null;
  stimuliSetId: string | null;
  setSpec: {
    shuffleclusters: string[];
    swapclusters: string[];
  };
  stimuliStructure: {
    stimCount: number;
    clusterCount: number;
    orderedClusterIds: Array<string | number>;
  };
  unitTopology: {
    orderedUnitIds: string[];
    unitClusterRefs: Array<{
      unitId: string;
      scheduleClusterRefs: Array<string | number>;
      checkpointClusterRefs: Array<string | number>;
    }>;
  };
};

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeNullableId(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length ? normalized : null;
}

function normalizeRefList(value: unknown): Array<string | number> {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry === null || entry === undefined) return null;
        if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
        const normalized = normalizeString(entry);
        if (!normalized.length) return null;
        const asNum = Number(normalized);
        return Number.isFinite(asNum) && String(asNum) === normalized ? asNum : normalized;
      })
      .filter((entry): entry is string | number => entry !== null);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value !== 'string') {
    return [];
  }

  const refs: Array<string | number> = [];
  const tokens = value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const rangeMatch = token.match(/^(-?\d+)-(-?\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const step = start <= end ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          refs.push(i);
        }
        continue;
      }
    }

    const asNum = Number(token);
    refs.push(Number.isFinite(asNum) ? asNum : token);
  }

  return refs;
}

function stableCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCanonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const source = value as UnknownRecord;
    const keys = Object.keys(source).sort();
    const target: UnknownRecord = {};
    for (const key of keys) {
      const raw = source[key];
      const normalized = raw === undefined ? null : stableCanonicalize(raw);
      target[key] = normalized;
    }
    return target;
  }
  return value === undefined ? null : value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableCanonicalize(value));
}

function rotr(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  const bitLenHigh = Math.floor(bitLen / 0x100000000);
  const bitLenLow = bitLen >>> 0;
  bytes.push((bitLenHigh >>> 24) & 0xff, (bitLenHigh >>> 16) & 0xff, (bitLenHigh >>> 8) & 0xff, bitLenHigh & 0xff);
  bytes.push((bitLenLow >>> 24) & 0xff, (bitLenLow >>> 16) & 0xff, (bitLenLow >>> 8) & 0xff, bitLenLow & 0xff);

  const w = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((bytes[j]! << 24) | (bytes[j + 1]! << 16) | (bytes[j + 2]! << 8) | bytes[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  return H.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function getOrderedClusterIds(stimuliSet: unknown, stimCount: number): Array<string | number> {
  if (!Array.isArray(stimuliSet)) {
    return [];
  }

  const ids: Array<string | number> = [];
  const seen = new Set<string>();

  for (let i = 0; i < stimuliSet.length; i++) {
    const stim = stimuliSet[i] as UnknownRecord;
    const candidate =
      stim?.clusterKC ??
      stim?.clusterkc ??
      stim?.clusterId ??
      stim?.cluster ??
      stim?.clusterIndex ??
      null;

    const normalized = candidate === null || candidate === undefined ? `__cluster_${i}` : candidate;
    const key = String(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(normalized);
  }

  if (!ids.length && stimCount > 0) {
    return Array.from({ length: stimCount }, (_, idx) => idx);
  }

  return ids;
}

function normalizeSetSpecField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter((entry) => entry.length > 0);
  }
  const normalized = normalizeString(value);
  return normalized.length ? normalized.split(/\s+/g) : [];
}

function getScheduleRefs(unit: UnknownRecord): Array<string | number> {
  const assess = (unit?.assessmentsession || {}) as UnknownRecord;
  const candidates = [
    assess.clusterlist,
    assess.clusterList,
    assess.clusterNumbers,
    assess.clusters,
    assess.questions,
    assess.questionClusters,
  ];
  for (const candidate of candidates) {
    const refs = normalizeRefList(candidate);
    if (refs.length) return refs;
  }
  return [];
}

function getCheckpointRefs(unit: UnknownRecord): Array<string | number> {
  const video = (unit?.videosession || {}) as UnknownRecord;
  const refs = [
    ...normalizeRefList(video.questions),
    ...normalizeRefList(video.checkpointQuestions),
  ];
  return refs;
}

function createMappingSignatureInput(params: {
  tdfFile: unknown;
  rootTdfId: unknown;
  conditionTdfId: unknown;
  stimuliSetId: unknown;
  stimuliSet: unknown;
  stimCount: number;
}): MappingSignatureInput {
  const tdfFile = (params.tdfFile || {}) as UnknownRecord;
  const tutor = (tdfFile?.tdfs?.tutor || {}) as UnknownRecord;
  const setSpec = (tutor?.setspec || {}) as UnknownRecord;
  const units = Array.isArray(tutor?.unit) ? (tutor.unit as UnknownRecord[]) : [];
  const orderedClusterIds = getOrderedClusterIds(params.stimuliSet, params.stimCount);

  const orderedUnitIds: string[] = [];
  const unitClusterRefs: MappingSignatureInput['unitTopology']['unitClusterRefs'] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i] || {};
    const unitId = normalizeString(unit.unitname || unit.name || unit.id || `unit-${i}`) || `unit-${i}`;
    orderedUnitIds.push(unitId);
    unitClusterRefs.push({
      unitId,
      scheduleClusterRefs: getScheduleRefs(unit),
      checkpointClusterRefs: getCheckpointRefs(unit),
    });
  }

  return {
    rootTdfId: normalizeNullableId(params.rootTdfId),
    conditionTdfId: normalizeNullableId(params.conditionTdfId),
    stimuliSetId: normalizeNullableId(params.stimuliSetId),
    setSpec: {
      shuffleclusters: normalizeSetSpecField(setSpec.shuffleclusters),
      swapclusters: normalizeSetSpecField(setSpec.swapclusters),
    },
    stimuliStructure: {
      stimCount: Number.isFinite(params.stimCount) ? Number(params.stimCount) : 0,
      clusterCount: orderedClusterIds.length,
      orderedClusterIds,
    },
    unitTopology: {
      orderedUnitIds,
      unitClusterRefs,
    },
  };
}

export function createMappingSignature(params: {
  tdfFile: unknown;
  rootTdfId: unknown;
  conditionTdfId: unknown;
  stimuliSetId: unknown;
  stimuliSet: unknown;
  stimCount: number;
}): { signature: string; input: MappingSignatureInput } {
  const input = createMappingSignatureInput(params);
  const canonical = stableStringify(input);
  return {
    signature: `msig_v2_${sha256Hex(canonical)}`,
    input,
  };
}
