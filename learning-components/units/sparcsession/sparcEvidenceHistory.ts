import type { SparcWorkingMemoryFact } from './sparcSessionContracts';

/** Descriptions of authored requirements, not new KCs or additional scores. */
export type SparcEvidenceSummary = {
  demonstrated: string[]; incorrect: string[]; unresolved: string[];
};
export type SparcRetainedEvidence = SparcEvidenceSummary & {
  kind: 'expectation' | 'misconception'; id: string;
  citations: { responseId: string; start: number; end: number }[];
};

/** Shared provider context projection; saved KC evidence may still contain the storage field. */
export function sparcEvidenceContext(record: Readonly<Record<string, unknown>>) {
  const { incorrect, ...evidence } = record;
  return evidence.kind === 'expectation' ? evidence : { ...evidence, incorrect };
}

export function parseSparcEvidenceSummary(value: unknown): SparcEvidenceSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Assessment requires an evidence summary');
  const record = value as Record<string, unknown>;
  const read = (key: string) => {
    const items = record[key];
    if (!Array.isArray(items) || items.length > 6 || items.some(x => typeof x !== 'string' || !x.trim() || x.length > 240)) {
      throw new Error(`Invalid assessment ${key} requirements`);
    }
    return [...new Set(items as string[])];
  };
  return { demonstrated: read('demonstrated'), incorrect: read('incorrect'), unresolved: read('unresolved') };
}

export function retainedEvidenceFacts(facts: readonly SparcWorkingMemoryFact[], evidence: readonly SparcRetainedEvidence[]): SparcWorkingMemoryFact[] {
  const ids = new Set<string>();
  return evidence.map(entry => {
    const type = entry.kind === 'expectation' ? 'autotutor.expectation' : 'autotutor.misconception';
    const slot = entry.kind === 'expectation' ? 'clusterKC' : 'id';
    const identity = `${entry.kind}:${entry.id}`;
    if (ids.has(identity) || !facts.some(f => f.factType === type && f.slots?.[slot] === entry.id)) throw new Error('Invalid retained evidence target');
    ids.add(identity);
    if (!Array.isArray(entry.citations) || entry.citations.length > 24 || entry.citations.some(c => typeof c.responseId !== 'string' || !c.responseId || c.responseId.length > 600 || !Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start < 0 || c.end <= c.start)) {
      throw new Error('Invalid retained learner citations');
    }
    if (new TextEncoder().encode(JSON.stringify(entry)).length > 10000) throw new Error('Retained evidence exceeds the per-target history budget');
    return { factType: 'instructional.evidence', factId: identity, slots: {
      kind: entry.kind, id: entry.id, ...parseSparcEvidenceSummary(entry), citations: entry.citations,
    } };
  });
}
