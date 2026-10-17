import type { SparcWorkingMemoryFact } from '../units/sparcsession/sparcSessionContracts';

/** A generated path belongs to a page's complete expectation set and one fixed start. */
export function validateClusterKcChain(ids: readonly string[], startingKC: string, order: unknown): string[] {
  if (!ids.length || new Set(ids).size !== ids.length || !ids.includes(startingKC)) {
    throw new Error('KC chain requires unique expectations and a startingKC in that set');
  }
  if (!Array.isArray(order) || order.length !== ids.length || order[0] !== startingKC
    || new Set(order).size !== ids.length || order.some(id => typeof id !== 'string' || !ids.includes(id))) {
    throw new Error('Generated KC chain must start at startingKC and visit every expectation exactly once');
  }
  return [...order];
}

export function resolveClusterKcChain(facts: readonly SparcWorkingMemoryFact[], ids: readonly string[], startingKC: string): string[] {
  const matches = facts.filter(fact => fact.factType === 'kcGraph.chain' && fact.slots?.startingKC === startingKC);
  if (matches.length !== 1) throw new Error(`Expected one generated KC chain for startingKC "${startingKC}"; upload the lesson to generate it`);
  return validateClusterKcChain(ids, startingKC, matches[0]!.slots?.order);
}
