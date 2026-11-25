import { withCanonicalHistorySchemaVersion, assertCanonicalHistoryEnvelope } from './historyEnvelope';
import type { SimulationActivityHistory } from './simulationActivityHistory';

export type SimulationHistoryScope = { tdfId: string; pageKey: string; nodeId: string; buildId: string;
  history: { sessionID: string; levelUnit: number; levelUnitName?: string } };

export function simulationLifecycleHistory(userId: string, scope: SimulationHistoryScope, attemptId: string,
  action: 'Start' | 'Interrupted' | 'Monitoring failed', startedAt: number, time: number, reason?: string): Record<string, unknown> {
  const activity: SimulationActivityHistory = { version: 1, recordRole: 'activity', buildId: scope.buildId, attemptId,
    sourceEventId: `${attemptId}:${action}`, origin: 'lifecycle', eventName: action, values: {}, ...(reason ? { reason } : {}) };
  const sourceAddress = { pageKey: scope.pageKey, nodeId: scope.nodeId };
  const record = withCanonicalHistorySchemaVersion({ userId, TDFId: scope.tdfId, sessionID: scope.history.sessionID,
    levelUnit: scope.history.levelUnit, levelUnitName: scope.history.levelUnitName ?? '', levelUnitType: 'sparc',
    time, problemStartTime: startedAt, selection: `${scope.pageKey}:${scope.nodeId}`, action, outcome: 'unknown',
    input: reason ?? `Build ${scope.buildId}`, responseValue: '', typeOfResponse: 'sparc', displayedStimulus: sourceAddress,
    eventType: 'sparc', sparc: { pageKey: scope.pageKey, sourceAddress, simulationActivity: activity } });
  assertCanonicalHistoryEnvelope(record);
  return record;
}
