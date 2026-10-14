import type { CanonicalHistoryRecord } from './historyEnvelope';

export type ExpectationLogitChange = { readonly clusterKC: string; readonly delta: number };
export type ExpectationHistoryScope = {
  readonly userId: string;
  readonly TDFId: string;
  readonly levelUnit: number;
  readonly pageKey: string;
};

export function assertExpectationLogitChanges(value: unknown): asserts value is readonly ExpectationLogitChange[] {
  if (!Array.isArray(value)) throw new Error('Expectation logit changes must be an array');
  const targets = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || typeof entry.clusterKC !== 'string' || !entry.clusterKC.trim()
      || typeof entry.delta !== 'number' || !Number.isFinite(entry.delta) || targets.has(entry.clusterKC)) {
      throw new Error('Expectation logit changes require unique expectation identities and finite deltas');
    }
    targets.add(entry.clusterKC);
  }
}

/** Read observational evidence without pretending dialogue records are scored practice trials. */
export function readExpectationLogitHistory(
  records: Iterable<CanonicalHistoryRecord>, scope: ExpectationHistoryScope,
): ReadonlyMap<string, readonly number[]> {
  const result = new Map<string, number[]>();
  const seen = new Map<string, string>();
  for (const record of records) {
    if (record.eventType !== 'sparc' || record.userId !== scope.userId || record.TDFId !== scope.TDFId
      || record.levelUnit !== scope.levelUnit) continue;
    const extension = record.sparc as Record<string, unknown> | undefined;
    if (extension?.pageKey !== scope.pageKey || extension.expectationLogitChanges === undefined) continue;
    assertExpectationLogitChanges(extension.expectationLogitChanges);
    const transition = extension.stateTransition as { event?: { eventId?: string } } | undefined;
    if (!transition?.event?.eventId || typeof record.sessionID !== 'string' || !record.sessionID) {
      throw new Error('Expectation history requires its source response and session identity');
    }
    for (const { clusterKC, delta } of extension.expectationLogitChanges) {
      const identity = JSON.stringify([record.sessionID, transition.event.eventId, clusterKC]);
      const payload = JSON.stringify(delta);
      if (seen.has(identity)) {
        if (seen.get(identity) !== payload) throw new Error('Conflicting expectation history for the same response');
        continue;
      }
      seen.set(identity, payload);
      const history = result.get(clusterKC) ?? [];
      history.push(delta);
      result.set(clusterKC, history);
    }
  }
  return result;
}
