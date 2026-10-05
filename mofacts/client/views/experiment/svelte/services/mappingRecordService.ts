import { Session } from 'meteor/session';
import { createStimClusterMapping, isValidClusterPermutation } from '../../../../../../learning-components/content/tdf/clusterMapping';

type MappingRecord = { mappingTable: number[]; createdAt: number };
type ExperimentStateLike = { clusterMapping?: unknown; [key: string]: unknown } | null | undefined;

function asMappingTable(value: unknown): number[] | null {
  return Array.isArray(value) ? value as number[] : null;
}

export function loadMappingRecord(experimentState: ExperimentStateLike): MappingRecord | null {
  // An existing attempt owns its mapping; a missing persisted mapping cannot be supplied by another session.
  const mappingTable = asMappingTable(experimentState == null
    ? Session.get('clusterMapping') : experimentState.clusterMapping);
  return mappingTable?.length ? { mappingTable, createdAt: Date.now() } : null;
}

export function loadSessionMappingRecord(): MappingRecord | null {
  return loadMappingRecord(null);
}

export function createMappingRecord(params: { stimCount: number; shuffles: unknown; swaps: unknown }): MappingRecord {
  return { mappingTable: createStimClusterMapping(params.stimCount, params.shuffles, params.swaps, []), createdAt: Date.now() };
}

export function validateMappingRecord(record: MappingRecord | null, stimCount: number): boolean {
  return !!record && record.mappingTable.length > 0 && isValidClusterPermutation(record.mappingTable, stimCount);
}

export function resolveOriginalClusterIndex(shuffledClusterIndex: number, record: MappingRecord | null): number | null {
  if (!record) return null;
  const mapped = record.mappingTable[shuffledClusterIndex];
  return typeof mapped === 'number' && Number.isInteger(mapped) && mapped >= 0 && mapped < record.mappingTable.length ? mapped : null;
}

export function applyMappingRecordToSession(record: MappingRecord): void {
  Session.set('clusterMapping', record.mappingTable);
}

export function clearMappingRecordFromSession(): void {
  Session.set('clusterMapping', '');
}
