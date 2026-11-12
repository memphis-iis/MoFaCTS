/** Portable history contract. Runtime identities and values never belong in authored stimuli. */
export type SimulationActivityHistory = {
  version: 1;
  recordRole: 'activity' | 'internal';
  buildId: string;
  attemptId: string;
  sourceEventId: string;
  origin: 'input' | 'observation' | 'lifecycle';
  eventName: string;
  values: Record<string, unknown>;
  evidence?: { firstSequence: number; lastSequence: number; checkpointSequence: number; sourceSequence: number };
  reason?: string;
  completed?: boolean;
};

export function simulationHistoryContext(event: { eventId: string; payload?: Record<string, unknown> }, role: 'activity' | 'internal'): SimulationActivityHistory | undefined {
  const context = event.payload?.simulationActivity;
  if (context === undefined) return undefined;
  assertSimulationActivityHistory(context);
  return { ...context, sourceEventId: event.eventId, recordRole: role };
}

/** A host action after reload refers to the last recorded observation, never restored physics. */
export function resumeSimulationHostAction(
  buildId: string, contexts: readonly unknown[], sourceEventId: string,
): SimulationActivityHistory | undefined {
  for (let index = contexts.length - 1; index >= 0; index--) {
    const context = contexts[index];
    if (context === undefined) continue;
    assertSimulationActivityHistory(context);
    if (context.buildId !== buildId || context.origin === 'lifecycle') continue;
    const { completed: _completed, ...previous } = context;
    return { ...previous, sourceEventId, origin: 'input', eventName: 'host-action', reason: 'last-recorded-state-after-reload' };
  }
  return undefined;
}

export function assertSimulationActivityHistory(value: unknown): asserts value is SimulationActivityHistory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid simulation history context');
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !['activity', 'internal'].includes(String(record.recordRole))
    || !['input', 'observation', 'lifecycle'].includes(String(record.origin))) throw new Error('Invalid simulation history version or origin');
  for (const key of ['buildId', 'attemptId', 'sourceEventId', 'eventName']) {
    if (typeof record[key] !== 'string' || !record[key] || record[key].length > 300) throw new Error(`Invalid simulation history ${key}`);
  }
  if (!record.values || typeof record.values !== 'object' || Array.isArray(record.values)) throw new Error('Simulation history requires selected values');
  function check(input: unknown, depth: number): void {
    if (input === null || typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number' && Number.isFinite(input)) return;
    if (depth > 8 || !input || typeof input !== 'object') throw new Error('Unsupported simulation history value');
    const prototype = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && prototype !== null && Object.getPrototypeOf(prototype) !== null) throw new Error('Simulation history requires plain values');
    Object.values(input).forEach(child => check(child, depth + 1));
  }
  check(record.values, 0);
  if (record.reason !== undefined && (typeof record.reason !== 'string' || record.reason.length > 200)) throw new Error('Invalid simulation history reason');
  if (record.completed !== undefined && typeof record.completed !== 'boolean') throw new Error('Invalid simulation completion flag');
  if (record.evidence !== undefined) {
    const e = record.evidence as Record<string, unknown>;
    if (!e || ['firstSequence', 'lastSequence', 'checkpointSequence', 'sourceSequence'].some(key => !Number.isSafeInteger(e[key]) || Number(e[key]) < 1)
      || Number(e.firstSequence) > Number(e.sourceSequence) || Number(e.sourceSequence) > Number(e.lastSequence)
      || Number(e.firstSequence) > Number(e.checkpointSequence) || Number(e.checkpointSequence) > Number(e.lastSequence)) throw new Error('Invalid simulation history evidence');
  }
  if (new TextEncoder().encode(JSON.stringify(record)).length > 8192) throw new Error('Simulation activity exceeds 8192 bytes');
}
