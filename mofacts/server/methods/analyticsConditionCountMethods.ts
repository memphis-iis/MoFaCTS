import { Meteor } from 'meteor/meteor';
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

export function createAnalyticsConditionCountMethods(
  deps: AnalyticsConditionCountDeps,
  callbacks: AnalyticsConditionCountCallbacks
) {
  return {
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
        { fields: { 'content.tdfs.tutor.setspec.condition': 1 } }
      );
      const conditions = Array.isArray(tdf?.content?.tdfs?.tutor?.setspec?.condition)
        ? tdf.content.tdfs.tutor.setspec.condition
        : [];
      if (conditions.length !== conditionCounts.length) {
        throw new Meteor.Error(400, 'Condition counts length does not match root TDF conditions');
      }
      await callbacks.validateExperimentStateMutation(
        this.userId,
        normalizedTdfId,
        { currentTdfId: normalizedTdfId },
        'methods.updateTdfConditionCounts'
      );
      await deps.Tdfs.updateAsync({ _id: normalizedTdfId }, { $set: { conditionCounts } });
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
        { fields: { conditionCounts: 1, 'content.tdfs.tutor.setspec.condition': 1 } }
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
      await callbacks.validateExperimentStateMutation(
        this.userId,
        normalizedTdfId,
        { currentTdfId: normalizedTdfId },
        'methods.incrementTdfConditionCount'
      );
      await deps.Tdfs.updateAsync(
        { _id: normalizedTdfId },
        { $inc: { [`conditionCounts.${conditionIndex}`]: 1 } }
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
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: tdf.ownerId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Only owner or admin can reset condition counts',
        forbiddenCode: 403,
      });
      const setspec = tdf?.content?.tdfs?.tutor?.setspec;
      const conditions = Array.isArray(setspec?.condition) ? setspec.condition : [];
      const conditionCounts = new Array(conditions.length).fill(0);
      await deps.Tdfs.updateAsync({ _id: normalizedTdfId }, { $set: { conditionCounts } });
    },
  };
}
