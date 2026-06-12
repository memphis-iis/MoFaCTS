import type {
  SparcDocumentAddress,
  SparcStateWrite,
  SparcWorkingMemoryFact,
} from './sparcSessionContracts';

export const SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX = 'workingMemoryFact:';

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(',')}}`;
}

function requireNonBlank(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function factStateKey(fact: SparcWorkingMemoryFact): string {
  return `${SPARC_WORKING_MEMORY_FACT_STATE_KEY_PREFIX}${stableStringify({
    factId: fact.factId ?? null,
    factType: fact.factType,
    slots: fact.slots ?? {},
  })}`;
}

export function createSparcWorkingMemoryFactStateWrite(params: {
  readonly target: SparcDocumentAddress;
  readonly fact: SparcWorkingMemoryFact;
}): SparcStateWrite {
  return {
    target: params.target,
    key: factStateKey(params.fact),
    value: params.fact,
  };
}

export function stateValueToSparcWorkingMemoryFact(
  value: unknown,
): SparcWorkingMemoryFact | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const factType = requireNonBlank(record.factType, 'SPARC replayed working-memory fact factType');
  const fact: SparcWorkingMemoryFact = {
    factType,
  };
  if (typeof record.factId === 'string' && record.factId.trim()) {
    return {
      ...fact,
      factId: record.factId,
      ...(record.slots && typeof record.slots === 'object' && !Array.isArray(record.slots)
        ? { slots: record.slots as Readonly<Record<string, unknown>> }
        : {}),
    };
  }
  return {
    ...fact,
    ...(record.slots && typeof record.slots === 'object' && !Array.isArray(record.slots)
      ? { slots: record.slots as Readonly<Record<string, unknown>> }
      : {}),
  };
}
