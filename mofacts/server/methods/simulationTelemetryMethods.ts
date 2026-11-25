import { requirePackagedSimulation } from '../../common/simulationPackage';
import { SIMULATION_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import { requireAuthenticatedUser, requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { requireSparcLessonAccess } from '../lib/sparcLessonAccess';
import { validateSimulationScope, startSimulationAttempt, interruptSimulationScope, ingestSimulationBatch, endSimulationAttempt, exportSimulationTrace, type SimulationHistoryWriter } from '../lib/simulationTelemetry';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';

type Context = { userId?: string | null };
export function createSimulationTelemetryRegistration(deps: { getMethodAuthorizationDeps(): MethodAuthorizationDeps; writeHistory: SimulationHistoryWriter; loadLesson(tdfId: string): Promise<unknown> }) {
  const lesson = Object.freeze({
    kind: 'diagnostic-telemetry', operation: 'lesson-package',
    async authorize(context: Context, input: unknown) {
      const userId = requireAuthenticatedUser(context.userId);
      const scope = validateSimulationScope(input);
      await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), userId, scope.tdfId);
      requirePackagedSimulation(await deps.loadLesson(scope.tdfId), scope);
      return { userId, scope };
    },
  } as const);
  // The ingestion and ending services retain attempt ownership inside their
  // existing reads and writes. A preliminary lookup would duplicate that gate.
  const attempt = Object.freeze({
    kind: 'diagnostic-telemetry', operation: 'owned-attempt', authorize: requireAuthenticatedUser,
  } as const);
  const trace = Object.freeze({
    kind: 'role', role: 'admin',
    async authorize(userId: Context['userId']) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId, roles: ['admin'] });
    },
  } as const);
  const methods = {
    async startSimulationResearchAttempt(this: Context, input: unknown) {
      const { userId, scope } = await lesson.authorize(this, input);
      return startSimulationAttempt(userId, scope, deps.writeHistory);
    },
    async interruptSimulationResearchActivity(this: Context, input: unknown) {
      const { userId, scope } = await lesson.authorize(this, input);
      await interruptSimulationScope(userId, scope, deps.writeHistory);
    },
    async ingestSimulationResearchBatch(this: Context, attemptId: string, input: unknown, initialValues?: Record<string, unknown>) {
      return ingestSimulationBatch(attempt.authorize(this.userId), attemptId, input, initialValues);
    },
    async endSimulationResearchAttempt(this: Context, attemptId: string, reason: string) {
      await endSimulationAttempt(attempt.authorize(this.userId), attemptId, reason, deps.writeHistory);
    },
    async exportSimulationResearchTrace(this: Context, attemptId: string, afterSequence: number) {
      await trace.authorize(this.userId);
      return exportSimulationTrace(attemptId, afterSequence);
    },
  };
  function bind(name: keyof typeof methods, policy: typeof lesson | typeof attempt | typeof trace, dataEgress: MeteorMethodBinding['dataEgress']): MeteorMethodBinding {
    return Object.freeze({ handler: methods[name], verification: SIMULATION_METHOD_VERIFICATIONS[name], policy, dataEgress });
  }
  return { methods, methodBindings: Object.freeze([
    bind('startSimulationResearchAttempt', lesson, 'simulation-attempt-id'),
    bind('interruptSimulationResearchActivity', lesson, 'none'),
    bind('ingestSimulationResearchBatch', attempt, 'simulation-batch-status'),
    bind('endSimulationResearchAttempt', attempt, 'none'),
    bind('exportSimulationResearchTrace', trace, 'simulation-trace-page'),
  ]) };
}
