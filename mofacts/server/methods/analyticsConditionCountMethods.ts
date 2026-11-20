import { Meteor } from 'meteor/meteor';
import { CONDITION_COUNT_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog';
import type { MeteorMethodBinding } from '../securitySurfaces/registerMeteorMethods';
import {
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type MethodContext = {
  userId?: string | null;
};

type AnalyticsConditionCountDeps = {
  serverConsole: (...args: unknown[]) => void;
  Tdfs: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  GlobalExperimentStates: {
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  normalizeCanonicalId: (value: unknown) => string | null;
};

type AnalyticsConditionCountCallbacks = {
  validateExperimentStateMutation: (
    actorUserId: string | null | undefined,
    rootTdfId: unknown,
    state: UnknownRecord,
    where: string
  ) => Promise<void>;
};

export function createAnalyticsConditionCountRegistration(
  deps: AnalyticsConditionCountDeps,
  callbacks: AnalyticsConditionCountCallbacks
) {
  const replace = Object.freeze({
    kind: 'study-condition-count',
    operation: 'replace',
    async authorize(userId: MethodContext['userId'], rootId: string, ownerId: MethodContext['userId'], blockAllocation: boolean, counts: number[]) {
      if (blockAllocation) {
        await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
          actingUserId: userId, subjectUserId: ownerId, roles: ['admin'],
          forbiddenMessage: 'Only owner or admin can replace block-allocation counts',
        });
        if (counts.some(count => !Number.isSafeInteger(count))) throw new Meteor.Error(400, 'Invalid condition counts');
      }
      await callbacks.validateExperimentStateMutation(
        userId, rootId, { currentTdfId: rootId }, 'methods.updateTdfConditionCounts'
      );
    },
  } as const);
  const increment = Object.freeze({
    kind: 'study-condition-count',
    operation: 'increment',
    async authorize(userId: MethodContext['userId'], rootId: string, index: number, spec: {
      loadbalancing?: unknown; countcompletion?: unknown; conditionTdfIds?: string[];
    } | undefined) {
      await callbacks.validateExperimentStateMutation(
        userId, rootId, { currentTdfId: rootId }, 'methods.incrementTdfConditionCount'
      );
      if (spec?.loadbalancing === 'not-max') {
        if (spec.countcompletion === 'beginning') {
          throw new Meteor.Error(400, 'Beginning counts are committed atomically with condition assignment');
        }
        const assignment = await deps.GlobalExperimentStates.findOneAsync(
          { userId, TDFId: rootId }, { fields: { 'experimentState.conditionTdfId': 1 } },
        );
        if (!assignment?.experimentState?.conditionTdfId
          || assignment.experimentState.conditionTdfId !== spec.conditionTdfIds?.[index]) {
          throw new Meteor.Error(403, 'Can only count the participant’s assigned condition');
        }
      }
    },
  } as const);
  const reset = Object.freeze({
    kind: 'study-condition-count',
    operation: 'reset',
    async authorize(userId: MethodContext['userId'], ownerId: MethodContext['userId']) {
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: userId,
        subjectUserId: ownerId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Only owner or admin can reset condition counts',
        forbiddenCode: 403,
      });
    },
  } as const);
  const methods = {
    updateTdfConditionCounts: async function(this: MethodContext, TDFId: string, conditionCounts: number[]) {
      deps.serverConsole('updateTdfConditionCounts', TDFId, conditionCounts);
      const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
      if (!normalizedTdfId) {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      if (!Array.isArray(conditionCounts) || conditionCounts.some((count) => !Number.isFinite(Number(count)) || Number(count) < 0)) {
        throw new Meteor.Error(400, 'Invalid condition counts');
      }
      const tdf = await deps.Tdfs.findOneAsync(
        { _id: normalizedTdfId },
        { fields: { ownerId: 1, 'content.tdfs.tutor.setspec.condition': 1, 'content.tdfs.tutor.setspec.loadbalancing': 1 } }
      );
      const conditions = Array.isArray(tdf?.content?.tdfs?.tutor?.setspec?.condition)
        ? tdf.content.tdfs.tutor.setspec.condition
        : [];
      if (conditions.length !== conditionCounts.length) {
        throw new Meteor.Error(400, 'Condition counts length does not match root TDF conditions');
      }
      await replace.authorize(this.userId, normalizedTdfId, tdf?.ownerId,
        tdf?.content?.tdfs?.tutor?.setspec?.loadbalancing === 'not-max', conditionCounts);
      await deps.Tdfs.updateAsync({ _id: normalizedTdfId }, { $set: { conditionCounts }, $unset: { conditionAllocation: '' }, $inc: { tdfRevision: 1 } });
    },

    incrementTdfConditionCount: async function(this: MethodContext, TDFId: string, conditionIndex: number) {
      deps.serverConsole('incrementTdfConditionCount', TDFId, conditionIndex);
      const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
      if (!normalizedTdfId) {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      if (!Number.isInteger(conditionIndex) || conditionIndex < 0) {
        throw new Meteor.Error(400, 'Invalid condition index');
      }
      const tdf = await deps.Tdfs.findOneAsync(
        { _id: normalizedTdfId },
        { fields: { conditionCounts: 1, 'content.tdfs.tutor.setspec': 1 } }
      );
      const conditions = Array.isArray(tdf?.content?.tdfs?.tutor?.setspec?.condition)
        ? tdf.content.tdfs.tutor.setspec.condition
        : [];
      if (conditionIndex >= conditions.length) {
        throw new Meteor.Error(400, 'Condition index is outside the root TDF condition array');
      }
      if (!Array.isArray(tdf?.conditionCounts) || tdf.conditionCounts.length !== conditions.length) {
        throw new Meteor.Error(400, 'Condition counts length does not match root TDF conditions');
      }
      const currentCount = tdf.conditionCounts[conditionIndex];
      if (!Number.isFinite(Number(currentCount)) || Number(currentCount) < 0) {
        throw new Meteor.Error(400, 'Invalid condition count');
      }
      await increment.authorize(this.userId, normalizedTdfId, conditionIndex, tdf?.content?.tdfs?.tutor?.setspec);
      await deps.Tdfs.updateAsync(
        { _id: normalizedTdfId },
        { $inc: { [`conditionCounts.${conditionIndex}`]: 1, tdfRevision: 1 } }
      );
    },

    resetTdfConditionCounts: async function(this: MethodContext, TDFId: string) {
      deps.serverConsole('resetTdfConditionCounts', TDFId);
      const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
      if (!normalizedTdfId) {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      const tdf = await deps.Tdfs.findOneAsync({ _id: normalizedTdfId });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      await reset.authorize(this.userId, tdf.ownerId);
      const setspec = tdf?.content?.tdfs?.tutor?.setspec;
      const conditions = Array.isArray(setspec?.condition) ? setspec.condition : [];
      const conditionCounts = new Array(conditions.length).fill(0);
      await deps.Tdfs.updateAsync({ _id: normalizedTdfId }, { $set: { conditionCounts }, $unset: { conditionAllocation: '' }, $inc: { tdfRevision: 1 } });
    },
  };
  function bind(name: keyof typeof methods, policy: typeof replace | typeof increment | typeof reset): MeteorMethodBinding {
    return Object.freeze({ handler: methods[name], verification: CONDITION_COUNT_VERIFICATIONS[name], policy, dataEgress: 'none' });
  }
  return { methods, methodBindings: Object.freeze([
    bind('updateTdfConditionCounts', replace),
    bind('incrementTdfConditionCount', increment),
    bind('resetTdfConditionCounts', reset),
  ]) };
}
