import { Meteor } from 'meteor/meteor';
import { requireAuthenticatedUser, requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { createProlificParticipationService } from '../lib/prolificParticipation';
import { createProlificManagementService } from '../lib/prolificManagement';

type Context = { userId?: string | null; connection?: { clientAddress?: string | null } | null };
type Deps = {
  participation: ReturnType<typeof createProlificParticipationService>;
  management: ReturnType<typeof createProlificManagementService>;
  authorization: () => MethodAuthorizationDeps;
  rateLimit: (action: string, ip: string, identifier: string, config: { ipLimit: number; identifierLimit: number; windowMs: number }) => Promise<void>;
};
export function createProlificMethods(deps: Deps) {
  async function run(context: Context, access: 'public' | 'self' | 'researcher', action: string, work: (userId: string) => Promise<unknown>) {
    const userId = access === 'public' ? '' : access === 'self' ? requireAuthenticatedUser(context.userId)
      : await requireUserWithRoles(deps.authorization(), { userId: context.userId, roles: ['admin', 'teacher'] });
    await deps.rateLimit(`prolific-${action}`, context.connection?.clientAddress || 'unknown', userId || context.connection?.clientAddress || 'unknown', { ipLimit: 120, identifierLimit: 30, windowMs: 60000 });
    try { return await work(userId); } catch (error: any) {
      // Never send upstream responses, tokens, message bodies, or raw database errors to clients.
      const key = typeof error?.message === 'string' && /^prolific\.[A-Za-z]+$/.test(error.message) ? error.message : 'prolific.failed';
      throw new Meteor.Error(key, key);
    }
  }
  return {
    startProlificParticipation: function(this: Context, input: unknown) { return run(this, 'public', 'start', () => deps.participation.start(input)); },
    resumeProlificParticipation: function(this: Context, token: unknown) { return run(this, 'public', 'resume', () => deps.participation.resume(token)); },
    completeProlificParticipation: function(this: Context, retryInitialReturn = false) {
      return run(this, 'self', 'complete', id => {
        if (typeof retryInitialReturn !== 'boolean') throw new Error('prolific.invalidInput');
        return deps.participation.checkpoint(id, retryInitialReturn);
      });
    },
    prolificConnect: function(this: Context, input: unknown) { return run(this, 'researcher', 'connect', id => deps.management.connect(id, input)); },
    prolificCreateTestParticipant: function(this: Context, input: unknown) { return run(this, 'researcher', 'test-participant', id => deps.management.createTestParticipant(id, input)); },
    prolificPrepareTestStudy: function(this: Context, input: unknown) { return run(this, 'researcher', 'test-prepare', id => deps.management.prepareTestStudy(id, input)); },
    prolificExecuteTestStudy: function(this: Context, input: unknown) { return run(this, 'researcher', 'test-execute', id => deps.management.executeTestStudy(id, input)); },
    prolificTestSetupStatus: function(this: Context) { return run(this, 'researcher', 'test-status', id => deps.management.testSetupStatus(id)); },
    prolificList: function(this: Context, input: unknown) { return run(this, 'researcher', 'list', id => deps.management.list(id, input)); },
    prolificBindStudy: function(this: Context, input: unknown) { return run(this, 'researcher', 'bind', id => deps.management.bind(id, input)); },
    prolificDashboard: function(this: Context, input: unknown) { return run(this, 'researcher', 'dashboard', id => deps.management.dashboard(id, input)); },
    prolificMessages: function(this: Context, input: unknown) { return run(this, 'researcher', 'messages', id => deps.management.messages(id, input)); },
    prolificPrepareOperation: function(this: Context, input: unknown) { return run(this, 'researcher', 'prepare', id => deps.management.prepare(id, input)); },
    prolificConfirmOperation: function(this: Context, input: unknown) { return run(this, 'researcher', 'confirm', id => deps.management.confirm(id, input)); },
    prolificReviewOperation: function(this: Context, input: unknown) { return run(this, 'researcher', 'review', id => deps.management.review(id, input)); },
    prolificRetryReminder: function(this: Context, input: unknown) { return run(this, 'researcher', 'retry-reminder', id => deps.management.retryReminder(id, input)); },
  };
}
