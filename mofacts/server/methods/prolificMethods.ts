import { Meteor } from 'meteor/meteor';
import { requireAuthenticatedUser, requireUserWithRoles, type MethodAuthorizationDeps } from '../lib/methodAuthorization';
import { createProlificParticipationService } from '../lib/prolificParticipation';
import { createProlificManagementService } from '../lib/prolificManagement';
import { PROLIFIC_METHOD_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';

type Context = { userId?: string | null; connection?: { clientAddress?: string | null } | null };
type Deps = {
  participation: ReturnType<typeof createProlificParticipationService>;
  management: ReturnType<typeof createProlificManagementService>;
  authorization: () => MethodAuthorizationDeps;
  rateLimit: (action: string, ip: string, identifier: string, config: { ipLimit: number; identifierLimit: number; windowMs: number }) => Promise<void>;
};
export function createProlificMethodRegistration(deps: Deps) {
  const entry = Object.freeze({ kind: 'prolific', operation: 'participant-entry',
    authorize: (input: unknown) => deps.participation.start(input) } as const);
  const resume = Object.freeze({ kind: 'prolific', operation: 'participant-resume',
    authorize: (token: unknown) => deps.participation.resume(token) } as const);
  const completion = Object.freeze({ kind: 'prolific', operation: 'own-completion',
    authorize: requireAuthenticatedUser } as const);
  const researcherRoles = Object.freeze(['admin', 'teacher'] as const);
  const researcherRateLimit = Object.freeze({ ipLimit: 120, identifierLimit: 30, windowMs: 60000 });
  const researcher = Object.freeze({
    kind: 'prolific', operation: 'researcher', roles: researcherRoles, rateLimit: researcherRateLimit,
    async authorize(context: Context, action: string) {
      const userId = await requireUserWithRoles(deps.authorization(), { userId: context.userId, roles: [...researcherRoles] });
      await deps.rateLimit(`prolific-${action}`, context.connection?.clientAddress || 'unknown',
        userId || context.connection?.clientAddress || 'unknown', researcherRateLimit);
      return userId;
    },
  } as const);
  async function sanitize(work: () => Promise<unknown>) {
    try { return await work(); } catch (error: any) {
      // Never send upstream responses, tokens, message bodies, or raw database errors to clients.
      const key = typeof error?.message === 'string' && /^prolific\.[A-Za-z]+$/.test(error.message) ? error.message : 'prolific.failed';
      throw new Meteor.Error(key, key);
    }
  }
  const methodBindings: MeteorMethodBinding[] = [];
  function bind<H extends MeteorMethodBinding['handler']>(name: keyof typeof PROLIFIC_METHOD_VERIFICATIONS,
    policy: typeof entry | typeof resume | typeof completion | typeof researcher, dataEgress: MeteorMethodBinding['dataEgress'], handler: H) {
    methodBindings.push(Object.freeze({ handler, verification: PROLIFIC_METHOD_VERIFICATIONS[name], policy, dataEgress }));
    return handler;
  }
  function researcherMethod(name: keyof typeof PROLIFIC_METHOD_VERIFICATIONS, action: string,
    work: (id: string, input: unknown) => Promise<unknown>) {
    return bind(name, researcher, 'prolific-researcher-result', async function(this: Context, input: unknown) {
      const id = await researcher.authorize(this, action);
      return sanitize(() => work(id, input));
    });
  }
  const methods = {
    startProlificParticipation: bind('startProlificParticipation', entry, 'prolific-participant-entry',
      function(this: Context, input: unknown) { return sanitize(() => entry.authorize(input)); }),
    resumeProlificParticipation: bind('resumeProlificParticipation', resume, 'prolific-participant-entry',
      function(this: Context, token: unknown) { return sanitize(() => resume.authorize(token)); }),
    completeProlificParticipation: bind('completeProlificParticipation', completion, 'prolific-completion',
      async function(this: Context, retryInitialReturn = false) {
        const id = completion.authorize(this.userId);
        return sanitize(() => {
          if (typeof retryInitialReturn !== 'boolean') throw new Error('prolific.invalidInput');
          return deps.participation.checkpoint(id, retryInitialReturn);
        });
      }),
    prolificConnect: researcherMethod('prolificConnect', 'connect', (id, input) => deps.management.connect(id, input)),
    prolificCreateTestParticipant: researcherMethod('prolificCreateTestParticipant', 'test-participant', (id, input) => deps.management.createTestParticipant(id, input)),
    prolificPrepareTestStudy: researcherMethod('prolificPrepareTestStudy', 'test-prepare', (id, input) => deps.management.prepareTestStudy(id, input)),
    prolificExecuteTestStudy: researcherMethod('prolificExecuteTestStudy', 'test-execute', (id, input) => deps.management.executeTestStudy(id, input)),
    prolificTestSetupStatus: bind('prolificTestSetupStatus', researcher, 'prolific-researcher-result', async function(this: Context) {
      const id = await researcher.authorize(this, 'test-status');
      return sanitize(() => deps.management.testSetupStatus(id));
    }),
    prolificList: researcherMethod('prolificList', 'list', (id, input) => deps.management.list(id, input)),
    prolificBindStudy: researcherMethod('prolificBindStudy', 'bind', (id, input) => deps.management.bind(id, input)),
    prolificDashboard: researcherMethod('prolificDashboard', 'dashboard', (id, input) => deps.management.dashboard(id, input)),
    prolificMessages: researcherMethod('prolificMessages', 'messages', (id, input) => deps.management.messages(id, input)),
    prolificPrepareOperation: researcherMethod('prolificPrepareOperation', 'prepare', (id, input) => deps.management.prepare(id, input)),
    prolificConfirmOperation: researcherMethod('prolificConfirmOperation', 'confirm', (id, input) => deps.management.confirm(id, input)),
    prolificReviewOperation: researcherMethod('prolificReviewOperation', 'review', (id, input) => deps.management.review(id, input)),
    prolificRetryReminder: researcherMethod('prolificRetryReminder', 'retry-reminder', (id, input) => deps.management.retryReminder(id, input)),
  };
  return { methods, methodBindings: Object.freeze(methodBindings) };
}
