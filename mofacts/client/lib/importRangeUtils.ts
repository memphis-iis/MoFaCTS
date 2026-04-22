type ParsedImportIndexSpec = {
  valid: boolean;
  indexes: number[] | null;
  errorMessage?: string;
  normalizedSpec: string;
};

function parseToken(token: string): number[] | null {
  if (/^\d+$/.test(token)) {
    return [Number(token)];
  }

  const match = token.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const indexes: number[] = [];
  for (let idx = start; idx <= end; idx += 1) {
    indexes.push(idx);
  }
  return indexes;
}

export function parseImportIndexSpec(spec: unknown, totalCount?: number): ParsedImportIndexSpec {
  const normalizedSpec = String(spec || '').trim().replace(/\s+/g, ' ');
  if (!normalizedSpec) {
    return {
      valid: true,
      indexes: null,
      normalizedSpec: ''
    };
  }

  const tokens = normalizedSpec
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = new Set<number>();
  for (const token of tokens) {
    const parsed = parseToken(token);
    if (!parsed || parsed.length === 0) {
      return {
        valid: false,
        indexes: [],
        normalizedSpec,
        errorMessage: 'Use note numbers like "0-999" or "0-99 200-299".'
      };
    }

    for (const index of parsed) {
      if (typeof totalCount === 'number' && (index < 0 || index >= totalCount)) {
        return {
          valid: false,
          indexes: [],
          normalizedSpec,
          errorMessage: `Note index ${index} is out of bounds (0-${Math.max(totalCount - 1, 0)}).`
        };
      }
      unique.add(index);
    }
  }

  return {
    valid: true,
    indexes: Array.from(unique).sort((a, b) => a - b),
    normalizedSpec
  };
}

export function getImportIndexSelectionCount(spec: unknown, totalCount: number) {
  const parsed = parseImportIndexSpec(spec, totalCount);
  if (!parsed.valid) {
    return 0;
  }
  return parsed.indexes ? parsed.indexes.length : totalCount;
}
