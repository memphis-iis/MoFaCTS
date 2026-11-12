import { Meteor } from 'meteor/meteor';
import { approvedSimulationBuild } from '../../common/simulationBuildCatalog';
import { requireAuthenticatedUser, requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { requireSparcLessonAccess } from '../lib/sparcLessonAccess';
import { validateSimulationScope, startSimulationAttempt, interruptSimulationScope, ingestSimulationBatch, endSimulationAttempt, exportSimulationTrace, type SimulationHistoryWriter } from '../lib/simulationTelemetry';

type Context = { userId?: string | null };
export function createSimulationTelemetryMethods(deps: { getMethodAuthorizationDeps(): MethodAuthorizationDeps; writeHistory: SimulationHistoryWriter }) {
  const authorizeScope = async (context: Context, input: unknown) => {
    const userId = requireAuthenticatedUser(context.userId);
    const scope = validateSimulationScope(input);
    await requireSparcLessonAccess(deps.getMethodAuthorizationDeps(), userId, scope.tdfId);
    approvedSimulationBuild(Meteor.settings.public?.simulationBuilds, scope.buildId);
    return { userId, scope };
  };
  return {
    async startSimulationResearchAttempt(this: Context, input: unknown) {
      const { userId, scope } = await authorizeScope(this, input);
      return startSimulationAttempt(userId, scope, deps.writeHistory);
    },
    async interruptSimulationResearchActivity(this: Context, input: unknown) {
      const { userId, scope } = await authorizeScope(this, input);
      await interruptSimulationScope(userId, scope, deps.writeHistory);
    },
    async ingestSimulationResearchBatch(this: Context, attemptId: string, input: unknown, initialValues?: Record<string, unknown>) {
      return ingestSimulationBatch(requireAuthenticatedUser(this.userId), attemptId, input, initialValues);
    },
    async endSimulationResearchAttempt(this: Context, attemptId: string, reason: string) {
      await endSimulationAttempt(requireAuthenticatedUser(this.userId), attemptId, reason, deps.writeHistory);
    },
    async exportSimulationResearchTrace(this: Context, attemptId: string, afterSequence: number) {
      await requireUserWithRoles(deps.getMethodAuthorizationDeps(), { userId: this.userId, roles: ['admin'] });
      return exportSimulationTrace(attemptId, afterSequence);
    },
  };
}
