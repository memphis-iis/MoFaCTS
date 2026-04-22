import { Session } from 'meteor/session';
import { createStimClusterMapping, isClusterMappingCompatibleWithSetSpec } from '../../../../lib/clusterMappingUtils';

type MappingRecord = {
  mappingTable: number[];
  mappingSignature: string | null;
  createdAt: number;
};

type SetSpecLike = { shuffleclusters?: unknown; swapclusters?: unknown };
type ExperimentStateLike = {
  clusterMapping?: unknown;
  mappingSignature?: unknown;
} | null | undefined;

function asMappingTable(value: unknown): number[] | null {
  return Array.isArray(value) ? (value as number[]) : null;
}

export function loadMappingRecord(experimentState: ExperimentStateLike): MappingRecord | null {
  const sessionMapping = asMappingTable(Session.get('clusterMapping'));
  const persistedMapping = asMappingTable(experimentState?.clusterMapping);
  // Persisted record is authoritative; session is only a cache fallback.
  const mappingTable = persistedMapping && persistedMapping.length ? persistedMapping : sessionMapping;
  if (!mappingTable || !mappingTable.length) {
    return null;
  }
  const signature = typeof experimentState?.mappingSignature === 'string'
    ? experimentState.mappingSignature
    : (typeof Session.get('mappingSignature') === 'string' ? String(Session.get('mappingSignature')) : null);
  return {
    mappingTable,
    mappingSignature: signature,
    createdAt: Date.now(),
  };
}

export function loadSessionMappingRecord(): MappingRecord | null {
  const mappingTable = asMappingTable(Session.get('clusterMapping'));
  if (!mappingTable || !mappingTable.length) {
    return null;
  }
  const signature = typeof Session.get('mappingSignature') === 'string'
    ? String(Session.get('mappingSignature'))
    : null;
  return {
    mappingTable,
    mappingSignature: signature,
    createdAt: Date.now(),
  };
}

export function createMappingRecord(params: {
  stimCount: number;
  shuffles: unknown;
  swaps: unknown;
  mappingSignature?: string | null;
}): MappingRecord {
  const mappingTable = createStimClusterMapping(params.stimCount, params.shuffles, params.swaps, []);
  return {
    mappingTable,
    mappingSignature: params.mappingSignature || null,
    createdAt: Date.now(),
  };
}

export function validateMappingRecord(record: MappingRecord | null, stimCount: number, setSpec: SetSpecLike): boolean {
  if (!record || !Array.isArray(record.mappingTable) || !record.mappingTable.length) {
    return false;
  }
  return isClusterMappingCompatibleWithSetSpec(record.mappingTable, stimCount, setSpec);
}

export function resolveOriginalClusterIndex(shuffledClusterIndex: number, record: MappingRecord | null): number | null {
  if (!record || !Array.isArray(record.mappingTable)) {
    return null;
  }
  const mapped = record.mappingTable[shuffledClusterIndex];
  if (typeof mapped !== 'number' || !Number.isInteger(mapped)) {
    return null;
  }
  if (mapped < 0 || mapped >= record.mappingTable.length) {
    return null;
  }
  return mapped;
}

export function applyMappingRecordToSession(record: MappingRecord): void {
  Session.set('clusterMapping', record.mappingTable);
  Session.set('mappingSignature', record.mappingSignature || null);
}

export function clearMappingRecordFromSession(): void {
  Session.set('clusterMapping', '');
  Session.set('mappingSignature', null);
}
