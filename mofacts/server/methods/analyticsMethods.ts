import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  requireAuthenticatedUser,
  requireUserMatchesOrHasRole,
  type MethodAuthorizationDeps,
} from '../lib/methodAuthorization';

type UnknownRecord = Record<string, unknown>;
type Logger = (...args: unknown[]) => void;
type MethodContext = {
  userId?: string | null;
  unblock?: () => void;
  connection?: { id?: string; clientAddress?: string | null } | null;
};

type AnalyticsMethodsDeps = {
  serverConsole: Logger;
  Histories: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]>; countAsync: () => Promise<number> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
    rawCollection: () => { aggregate: (pipeline: unknown[]) => { toArray: () => Promise<any[]> } };
  };
  GlobalExperimentStates: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
    insertAsync: (document: UnknownRecord) => Promise<unknown>;
  };
  Tdfs: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
    updateAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  };
  Courses: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  Sections: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  SectionUserMap: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
  };
  usersCollection: {
    find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<any[]> };
    findOneAsync: (selector: UnknownRecord, options?: UnknownRecord) => Promise<any>;
  };
  getMethodAuthorizationDeps: () => MethodAuthorizationDeps;
  normalizeCanonicalId: (value: unknown) => string | null;
  normalizeOptionalString: (value: unknown) => string | null;
  canViewDashboardTdf: (userId: string, tdf: any) => boolean | Promise<boolean>;
  resolveAssignedRootTdfIdsForUser: (userId: string) => Promise<string[]>;
  allocateNextEventId: () => number;
  syncUsernameCaches: (userId: string, nextUsername: string, previousUsername?: string) => void;
  createExperimentExport: (keys: unknown[], userId: string) => Promise<string>;
  createExperimentExportByTdfIds: (tdfIds: string[], userId: string) => Promise<string>;
  getTdfNamesByOwnerId: (ownerId: string) => Promise<string[] | null>;
  assertUserOwnsTdfs: (userId: string, keys: unknown[]) => Promise<unknown>;
  canDownloadOwnedTdfData: (userId: string, tdf: any) => boolean;
  resolveConditionTdfIds: (setspec?: { condition?: string[] }) => Promise<Array<string | null>>;
  getClassPerformanceByTdfWorkflow: (
    classId: string,
    tdfId: string,
    date: number | false,
    deps: any
  ) => Promise<unknown>;
  getStimuliSetById: (stimuliSetId: string | number) => Promise<Array<{ clusterKC?: string | number; stimulusKC?: string | number }>>;
  hasMeaningfulProgressSignal: (experimentState: unknown) => boolean;
};

function getExperimentStateTimestamp(stateDoc: { experimentState?: { lastActionTimeStamp?: unknown } } | null | undefined): number {
  const candidate = Number((stateDoc as any)?.experimentState?.lastActionTimeStamp);
  return Number.isFinite(candidate) ? candidate : 0;
}

function buildLearningHistoryScopeMatch(
  userId: string,
  TDFId: string,
  levelUnit: number,
  unitScopedOnly = false
) {
  const normalizedUnit = Number(levelUnit);
  return {
    userId,
    TDFId,
    levelUnitType: 'model',
    levelUnit: unitScopedOnly ? normalizedUnit : { $lte: normalizedUnit },
  };
}

function sanitizeFileNameSegment(value: unknown, fallback: string) {
  const rawValue = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
  return rawValue.replace(/[/\\?%*:|"<>\s]/g, '_');
}

export function createAnalyticsMethods(deps: AnalyticsMethodsDeps) {
  const validatedExperimentAccessCache = new Map<string, number>();
  const EXPERIMENT_ACCESS_CACHE_TTL = 5 * 60 * 1000;

  function experimentAccessCacheKey(userId: string, rootTdfId: string) {
    return `${userId}:${rootTdfId}`;
  }

  async function validateExperimentStateMutation(
    actorUserId: string | null | undefined,
    rootTdfId: unknown,
    state: UnknownRecord = {},
    where = 'unknown'
  ) {
    const normalizedActorUserId = deps.normalizeCanonicalId(actorUserId);
    const normalizedRootTdfId = deps.normalizeCanonicalId(rootTdfId);
    if (!normalizedActorUserId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    if (!normalizedRootTdfId) {
      throw new Meteor.Error(400, 'Invalid currentTdfId for experiment state mutation');
    }

    const cacheKey = experimentAccessCacheKey(normalizedActorUserId, normalizedRootTdfId);
    const cachedAt = validatedExperimentAccessCache.get(cacheKey);
    const conditionTdfId = deps.normalizeCanonicalId((state as any)?.conditionTdfId);
    const needsRootAccessCheck = !cachedAt || (Date.now() - cachedAt) > EXPERIMENT_ACCESS_CACHE_TTL;

    let rootTdf: any = null;
    if (needsRootAccessCheck || conditionTdfId) {
      rootTdf = await deps.Tdfs.findOneAsync(
        { _id: normalizedRootTdfId },
        { fields: { ownerId: 1, accessors: 1, 'content.tdfs.tutor.setspec': 1 } }
      );
      if (!rootTdf) {
        throw new Meteor.Error(404, 'Root TDF not found');
      }
    }

    if (needsRootAccessCheck) {
      const userDoc = await deps.usersCollection.findOneAsync(
        { _id: normalizedActorUserId },
        { fields: { profile: 1, loginParams: 1 } }
      );
      const assignedTdfIds = await deps.resolveAssignedRootTdfIdsForUser(normalizedActorUserId);
      const hasAssignedRootTdf = assignedTdfIds.includes(normalizedRootTdfId);
      const rootUserSelect = deps.normalizeOptionalString((rootTdf as any)?.content?.tdfs?.tutor?.setspec?.userselect);
      const rootIsSelfSelectable = rootUserSelect === 'true';
      const rootExperimentTarget = deps.normalizeOptionalString((rootTdf as any)?.content?.tdfs?.tutor?.setspec?.experimentTarget);
      const userExperimentTarget = deps.normalizeOptionalString((userDoc as any)?.profile?.experimentTarget);
      const stateExperimentTarget = deps.normalizeOptionalString((state as any)?.experimentTarget);
      const userLoginMode = deps.normalizeOptionalString((userDoc as any)?.loginParams?.loginMode);
      const experimentModeTargetMatch =
        userLoginMode === 'experiment' && !!rootExperimentTarget && (
          (userExperimentTarget === rootExperimentTarget) ||
          (stateExperimentTarget === rootExperimentTarget)
        );
      const existingStateForRoot = await deps.GlobalExperimentStates.findOneAsync(
        { userId: normalizedActorUserId, TDFId: normalizedRootTdfId },
        { fields: { _id: 1 } }
      );
      const canAccessRoot = await deps.canViewDashboardTdf(normalizedActorUserId, rootTdf)
        || hasAssignedRootTdf
        || rootIsSelfSelectable
        || (!!rootExperimentTarget && !!userExperimentTarget && rootExperimentTarget === userExperimentTarget)
        || experimentModeTargetMatch
        || !!existingStateForRoot;
      if (!canAccessRoot) {
        deps.serverConsole('validateExperimentStateMutation DENY root access', {
          where,
          userId: normalizedActorUserId,
          rootTdfId: normalizedRootTdfId,
          rootExperimentTarget: rootExperimentTarget || null,
          userExperimentTarget: userExperimentTarget || null,
          stateExperimentTarget: stateExperimentTarget || null,
          userLoginMode: userLoginMode || null,
          rootIsSelfSelectable,
          assignedTdfCount: assignedTdfIds.length,
          hasAssignedRootTdf,
          hasExistingStateForRoot: !!existingStateForRoot,
        });
        throw new Meteor.Error(403, 'Not authorized to mutate experiment state for this root TDF');
      }

      validatedExperimentAccessCache.set(cacheKey, Date.now());
    }

    if (conditionTdfId) {
      const conditionRefs = Array.isArray((rootTdf as any)?.content?.tdfs?.tutor?.setspec?.condition)
        ? (rootTdf as any).content.tdfs.tutor.setspec.condition
        : [];
      const normalizedConditionRefs = conditionRefs
        .map((ref: unknown) => deps.normalizeCanonicalId(ref))
        .filter((ref: string | null): ref is string => typeof ref === 'string');
      const normalizedResolvedConditionIds = Array.isArray((rootTdf as any)?.content?.tdfs?.tutor?.setspec?.conditionTdfIds)
        ? (rootTdf as any).content.tdfs.tutor.setspec.conditionTdfIds
          .map((ref: unknown) => deps.normalizeCanonicalId(ref))
          .filter((ref: string | null): ref is string => typeof ref === 'string')
        : [];
      const conditionDoc = await deps.Tdfs.findOneAsync(
        { _id: conditionTdfId },
        { fields: { _id: 1, 'content.fileName': 1 } }
      );
      const isAllowedCondition = !!conditionDoc && (
        normalizedConditionRefs.includes(conditionTdfId) ||
        normalizedConditionRefs.includes(deps.normalizeCanonicalId((conditionDoc as any)?.content?.fileName)) ||
        normalizedResolvedConditionIds.includes(conditionTdfId)
      );
      if (!isAllowedCondition) {
        deps.serverConsole('validateExperimentStateMutation DENY condition', {
          where,
          userId: normalizedActorUserId,
          rootTdfId: normalizedRootTdfId,
          conditionTdfId,
          normalizedConditionRefs,
          normalizedResolvedConditionIds,
          conditionFileName: deps.normalizeCanonicalId((conditionDoc as any)?.content?.fileName),
        });
        throw new Meteor.Error(403, 'conditionTdfId is not valid for current root TDF');
      }
    }

    deps.serverConsole('validateExperimentStateMutation', where, {
      userId: normalizedActorUserId,
      currentTdfId: normalizedRootTdfId,
      currentStimuliSetId: deps.normalizeCanonicalId((state as any)?.currentStimuliSetId),
      conditionTdfId: conditionTdfId || null,
      experimentTarget: deps.normalizeOptionalString((state as any)?.experimentTarget) || null,
    });
  }

  async function getExperimentState(userId: string, TDFId: string) {
    const experimentStateRet = await deps.GlobalExperimentStates.find({ userId, TDFId }).fetchAsync();
    if (experimentStateRet.length <= 1) {
      const doc = experimentStateRet[0];
      const state = doc?.experimentState || {};
      state.id = doc?._id || null;
      return state;
    }

    const sortedExperimentStates = [...experimentStateRet].sort((a: any, b: any) => {
      const tsDiff = getExperimentStateTimestamp(a) - getExperimentStateTimestamp(b);
      if (tsDiff !== 0) {
        return tsDiff;
      }
      return String(a?._id || '').localeCompare(String(b?._id || ''));
    });
    const mergedExperimentState: { experimentState?: UnknownRecord } = {};
    for (const experimentState of sortedExperimentStates) {
      mergedExperimentState.experimentState = Object.assign({}, mergedExperimentState.experimentState, experimentState.experimentState);
    }
    const experimentState = mergedExperimentState && mergedExperimentState.experimentState ? mergedExperimentState.experimentState : {};
    const newestDoc = sortedExperimentStates.length > 0
      ? sortedExperimentStates[sortedExperimentStates.length - 1]
      : null;
    experimentState.id = newestDoc ? newestDoc._id : null;
    return experimentState;
  }

  async function setExperimentState(
    userId: string,
    TDFId: string,
    experimentStateId: string,
    newExperimentState: UnknownRecord,
    where: string
  ) {
    await validateExperimentStateMutation(userId, TDFId, newExperimentState, where || 'setExperimentState');
    deps.serverConsole('setExperimentState:', where, {
      userId,
      currentTdfId: TDFId,
      currentStimuliSetId: (newExperimentState as any)?.currentStimuliSetId ?? null,
      conditionTdfId: (newExperimentState as any)?.conditionTdfId ?? null,
      experimentTarget: (newExperimentState as any)?.experimentTarget ?? null,
    });
    const experimentStateRet = await deps.GlobalExperimentStates.findOneAsync({ _id: experimentStateId });
    if (experimentStateRet != null) {
      const updatedExperimentState = Object.assign(experimentStateRet.experimentState, newExperimentState);
      await deps.GlobalExperimentStates.updateAsync({ _id: experimentStateId }, { $set: { experimentState: updatedExperimentState } });
      return updatedExperimentState;
    }
    await deps.GlobalExperimentStates.insertAsync({ userId, TDFId, experimentState: newExperimentState });

    return TDFId;
  }

  async function createExperimentState(
    this: MethodContext | undefined,
    curExperimentState: UnknownRecord & { currentRootTdfId?: string; currentTdfId?: string },
    actorUserId: string | null = null
  ) {
    const resolvedUserId = actorUserId || this?.userId || Meteor.userId();
    const rootTdfId = deps.normalizeCanonicalId((curExperimentState as any)?.currentRootTdfId)
      || deps.normalizeCanonicalId(curExperimentState.currentTdfId);
    if (!rootTdfId) {
      throw new Meteor.Error(400, 'createExperimentState requires currentRootTdfId/currentTdfId');
    }
    await validateExperimentStateMutation(resolvedUserId, rootTdfId, curExperimentState, 'createExperimentState');
    deps.serverConsole('createExperimentState', {
      userId: resolvedUserId,
      currentTdfId: rootTdfId,
      currentStimuliSetId: (curExperimentState as any)?.currentStimuliSetId ?? null,
      conditionTdfId: (curExperimentState as any)?.conditionTdfId ?? null,
      experimentTarget: (curExperimentState as any)?.experimentTarget ?? null,
    });
    const existingDoc = await deps.GlobalExperimentStates.findOneAsync({
      userId: resolvedUserId,
      TDFId: rootTdfId,
    });

    if (existingDoc?._id) {
      const nextExperimentState = Object.assign({}, existingDoc.experimentState || {}, curExperimentState);
      await deps.GlobalExperimentStates.updateAsync(
        { _id: existingDoc._id },
        { $set: { experimentState: nextExperimentState } }
      );
      return Object.assign({}, nextExperimentState, { id: existingDoc._id });
    }

    try {
      const insertedId = await deps.GlobalExperimentStates.insertAsync({
        userId: resolvedUserId,
        TDFId: rootTdfId,
        experimentState: curExperimentState,
      });
      return Object.assign({}, curExperimentState, { id: insertedId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/E11000|duplicate key/i.test(message)) {
        throw error;
      }

      const concurrentDoc = await deps.GlobalExperimentStates.findOneAsync({
        userId: resolvedUserId,
        TDFId: rootTdfId,
      });
      if (!concurrentDoc?._id) {
        throw error;
      }

      const nextExperimentState = Object.assign({}, concurrentDoc.experimentState || {}, curExperimentState);
      await deps.GlobalExperimentStates.updateAsync(
        { _id: concurrentDoc._id },
        { $set: { experimentState: nextExperimentState } }
      );
      return Object.assign({}, nextExperimentState, { id: concurrentDoc._id });
    }
  }

  async function getUserLastFeedbackTypeFromHistory(tdfID: string) {
    const userHistory = await deps.Histories.findOneAsync(
      { TDFId: tdfID, userId: (Meteor as any).userId },
      { sort: { time: -1 } }
    );
    let feedbackType = 'undefined';
    if (userHistory && userHistory.feedbackType) {
      feedbackType = userHistory.feedbackType;
    }
    return feedbackType;
  }

  async function insertHistory(this: MethodContext, historyRecord: UnknownRecord) {
    const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
    if (!historyRecord || typeof historyRecord !== 'object' || Array.isArray(historyRecord)) {
      throw new Meteor.Error(400, 'Invalid history record');
    }
    const requestedUserId = deps.normalizeCanonicalId(historyRecord.userId);
    if (requestedUserId && requestedUserId !== actingUserId) {
      throw new Meteor.Error(403, 'Can only insert history for the current user');
    }
    const tdfId = deps.normalizeCanonicalId(historyRecord.TDFId);
    if (!tdfId) {
      throw new Meteor.Error(400, 'History record requires a TDFId');
    }

    await validateExperimentStateMutation(
      actingUserId,
      tdfId,
      {
        currentTdfId: tdfId,
        conditionTdfId: deps.normalizeCanonicalId((historyRecord as any).conditionTdfId),
        experimentTarget: deps.normalizeOptionalString((historyRecord as any).experimentTarget),
      },
      'methods.insertHistory'
    );

    const sanitizedHistoryRecord = Object.assign({}, historyRecord, {
      userId: actingUserId,
      TDFId: tdfId,
      eventId: deps.allocateNextEventId(),
      dynamicTagFields: [],
      recordedServerTime: (new Date()).getTime(),
    });
    await deps.Histories.insertAsync(sanitizedHistoryRecord);
  }

  async function getLastTDFAccessed(userId: string) {
    const lastExperimentStateUpdated = await deps.GlobalExperimentStates.findOneAsync(
      { userId },
      { sort: { 'experimentState.lastActionTimeStamp': -1 }, limit: 1 }
    );
    if (!lastExperimentStateUpdated?.TDFId) {
      return null;
    }
    return lastExperimentStateUpdated.TDFId;
  }

  async function getHistoryByTDFID(TDFId: string) {
    return await deps.Histories.find({ TDFId }).fetchAsync();
  }

  async function getUserRecentTDFs(userId: string) {
    const history = await deps.Histories.find({ userId }, { sort: { time: -1 }, limit: 5 }).fetchAsync();
    const recentTdfIds = history
      .map((historyRecord: any) => deps.normalizeCanonicalId(historyRecord?.TDFId))
      .filter((tdfId: string | null): tdfId is string => typeof tdfId === 'string');
    if (recentTdfIds.length === 0) {
      return [];
    }

    const recentTdfDocs = await deps.Tdfs.find({ _id: { $in: [...new Set(recentTdfIds)] } }).fetchAsync();
    const recentTdfById = new Map(
      recentTdfDocs.map((tdf: any) => [String(tdf?._id || ''), tdf])
    );
    return recentTdfIds.map((tdfId: string) => recentTdfById.get(tdfId));
  }

  async function getClassPerformanceByTDF(this: MethodContext, classId: string, tdfId: string, date: number | false = false) {
    if (!this.userId) {
      throw new Meteor.Error(401, 'Must be logged in');
    }
    const course = (await deps.Courses.find(
      { _id: classId },
      { fields: { teacherUserId: 1 } }
    ).fetchAsync())[0];
    if (!course) {
      throw new Meteor.Error(404, 'Course not found');
    }
    await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
      actingUserId: this.userId,
      subjectUserId: course.teacherUserId,
      roles: ['admin'],
      notLoggedInMessage: 'Must be logged in',
      notLoggedInCode: 401,
      forbiddenMessage: 'Can only access performance for your own course',
      forbiddenCode: 403,
    });
    return deps.getClassPerformanceByTdfWorkflow(classId, tdfId, date, {
      serverConsole: deps.serverConsole,
      Sections: deps.Sections,
      SectionUserMap: deps.SectionUserMap,
      Histories: deps.Histories,
      findUsersByIds: (userIds: string[]) => deps.usersCollection.find(
        { _id: { $in: userIds } },
        { fields: { _id: 1, username: 1, dueDateExceptions: 1 } }
      ).fetchAsync(),
    });
  }

  async function getStimSetFromLearningSessionByClusterList(stimuliSetId: string | number, clusterList: Array<string | number>) {
    deps.serverConsole('getStimSetFromLearningSessionByClusterList', stimuliSetId, clusterList);
    const itemRet = await deps.getStimuliSetById(stimuliSetId);
    const learningSessionItem: Array<string | number> = [];
    for (const item of itemRet) {
      const clusterKC = item.clusterKC;
      const stimulusKC = item.stimulusKC;
      if (
        typeof clusterKC !== 'undefined' &&
        typeof stimulusKC !== 'undefined' &&
        clusterList.includes(clusterKC) &&
        learningSessionItem.includes(stimulusKC) === false
      ) {
        learningSessionItem.push(stimulusKC);
      }
    }
    return learningSessionItem;
  }

  async function getStudentPerformanceByIdAndTDFIdFromHistory(userId: string, TDFId: string, returnRows: number | null = null) {
    const query: unknown[] = [
      {
        $match: { userId, TDFId, levelUnitType: 'model' },
      },
      {
        $addFields: {
          correct: {
            $cond: {
              if: { $eq: ['$outcome', 'correct'] },
              then: 1,
              else: 0,
            },
          },
          incorrect: {
            $cond: {
              if: { $eq: ['$outcome', 'incorrect'] },
              then: 1,
              else: 0,
            },
          },
          practiceDuration: { $sum: ['$CFFeedbackLatency', '$CFEndLatency'] },
        },
      },
      {
        $group: {
          _id: '$KCId',
          numCorrect: { $sum: '$correct' },
          numIncorrect: { $sum: '$incorrect' },
          practiceDuration: { $sum: '$practiceDuration' },
        },
      },
      {
        $addFields: {
          introduced: 1,
        },
      },
      {
        $group: {
          _id: null,
          numCorrect: { $sum: '$numCorrect' },
          numIncorrect: { $sum: '$numIncorrect' },
          stimsIntroduced: { $sum: '$introduced' },
          practiceDuration: { $sum: '$practiceDuration' },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
    ];

    if (returnRows) {
      query.splice(1, 0, { $limit: returnRows });
      query.splice(1, 0, { $sort: { time: -1 } });
    }
    const studentPerformance = await deps.Histories.rawCollection().aggregate(query).toArray();
    if (!studentPerformance[0]) {
      return null;
    }

    const tdf = await deps.Tdfs.findOneAsync({ _id: TDFId }, { fields: { stimuli: 1 } });
    studentPerformance[0].totalStimCount = Array.isArray(tdf?.stimuli) ? tdf.stimuli.length : 0;
    return studentPerformance[0];
  }

  async function getStudentPerformanceForUnitFromHistory(
    userId: string,
    TDFId: string,
    levelUnit: number,
    unitScopedOnly = false
  ) {
    const query: unknown[] = [
      {
        $match: buildLearningHistoryScopeMatch(userId, TDFId, levelUnit, unitScopedOnly),
      },
      {
        $addFields: {
          correct: {
            $cond: {
              if: { $eq: ['$outcome', 'correct'] },
              then: 1,
              else: 0,
            },
          },
          incorrect: {
            $cond: {
              if: { $eq: ['$outcome', 'incorrect'] },
              then: 1,
              else: 0,
            },
          },
          practiceDuration: { $sum: ['$CFFeedbackLatency', '$CFEndLatency'] },
        },
      },
      {
        $group: {
          _id: '$KCId',
          numCorrect: { $sum: '$correct' },
          numIncorrect: { $sum: '$incorrect' },
          totalPracticeDuration: { $sum: '$practiceDuration' },
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          introduced: {
            $cond: {
              if: {
                $gt: [
                  { $add: ['$numCorrect', '$numIncorrect'] },
                  0,
                ],
              },
              then: 1,
              else: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          numCorrect: { $sum: '$numCorrect' },
          numIncorrect: { $sum: '$numIncorrect' },
          totalPracticeDuration: { $sum: '$totalPracticeDuration' },
          stimsIntroduced: { $sum: '$introduced' },
          count: { $sum: '$count' },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
    ];

    const performance = await deps.Histories.rawCollection().aggregate(query).toArray();
    const current = performance[0];
    if (!current) {
      return {
        numCorrect: 0,
        numIncorrect: 0,
        totalPracticeDuration: 0,
        allTimeNumCorrect: 0,
        allTimeNumIncorrect: 0,
        allTimePracticeDuration: 0,
        stimsIntroduced: 0,
        count: 0,
      };
    }

    return {
      ...current,
      allTimeNumCorrect: current.numCorrect || 0,
      allTimeNumIncorrect: current.numIncorrect || 0,
      allTimePracticeDuration: current.totalPracticeDuration || 0,
    };
  }

  async function getAssessmentCompletedTrialCountFromHistory(
    userId: string,
    TDFId: string,
    levelUnit: number
  ) {
    return await deps.Histories.find({
      userId,
      TDFId,
      levelUnitType: 'schedule',
      levelUnit: Number(levelUnit),
      studentResponseType: 'ATTEMPT',
      outcome: { $in: ['correct', 'incorrect'] },
    }).countAsync();
  }

  async function getVideoCompletedCheckpointQuestionCountFromHistory(
    userId: string,
    TDFId: string,
    levelUnit: number
  ) {
    return await deps.Histories.find({
      userId,
      TDFId,
      levelUnitType: 'video',
      levelUnit: Number(levelUnit),
      studentResponseType: 'ATTEMPT',
      outcome: { $in: ['correct', 'incorrect'] },
    }).countAsync();
  }

  async function getLearningHistoryForUnit(
    userId: string,
    TDFId: string,
    levelUnit: number,
    unitScopedOnly = false
  ) {
    return await deps.Histories.find(buildLearningHistoryScopeMatch(userId, TDFId, levelUnit, unitScopedOnly), {
      fields: {
        time: 1,
        outcome: 1,
        KCCluster: 1,
        KCId: 1,
        CFCorrectAnswer: 1,
        CFEndLatency: 1,
        CFFeedbackLatency: 1,
        instructionQuestionResult: 1,
      },
      sort: { time: 1 },
    }).fetchAsync();
  }

  async function getHiddenStimulusKCsFromHistory(userId: string, TDFId: string) {
    const rows = await deps.Histories.find({
      userId,
      TDFId,
      levelUnitType: 'model',
      CFItemRemoved: true,
    }, {
      fields: {
        KCId: 1,
        time: 1,
      },
      sort: { time: 1 },
    }).fetchAsync();

    const hiddenStimulusKCs: Array<string | number> = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const kcId = row?.KCId;
      if (kcId === null || kcId === undefined || kcId === '') {
        continue;
      }
      const key = String(kcId);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hiddenStimulusKCs.push(kcId);
    }

    return hiddenStimulusKCs;
  }

  async function getNumDroppedItemsByUserIDAndTDFId(userId: string, TDFId: string) {
    deps.serverConsole('getNumDroppedItemsByUserIDAndTDFId', userId, TDFId);
    return await deps.Histories.find({ userId, TDFId, CFItemRemoved: true, levelUnitType: 'model' }).countAsync();
  }

  async function getStudentPerformanceForClassAndTdfId(instructorId: string, date: number | null = null) {
    const courses = await deps.Courses.find({ teacherUserId: instructorId }).fetchAsync();
    if (courses.length === 0) {
      return [{}, {}];
    }
    const courseIds = courses.map((course: { _id: string }) => course._id);

    const sections = await deps.Sections.find({ courseId: { $in: courseIds } }).fetchAsync();
    if (sections.length === 0) {
      return [{}, {}];
    }
    const sectionIds = sections.map((section: { _id: string }) => section._id);
    const sectionToCourse: Record<string, string> = {};
    for (const section of sections) {
      sectionToCourse[section._id] = section.courseId;
    }

    const enrollments = await deps.SectionUserMap.find({ sectionId: { $in: sectionIds } }).fetchAsync();
    if (enrollments.length === 0) {
      return [{}, {}];
    }
    const enrolledUserIds = [...new Set(enrollments.map((enrollment: { userId: string }) => enrollment.userId))];
    const userSectionMap: Record<string, Array<{ sectionId: string; courseId: string }>> = {};
    for (const enrollment of enrollments) {
      const courseId = sectionToCourse[enrollment.sectionId];
      if (!courseId) {
        continue;
      }
      if (!userSectionMap[enrollment.userId]) {
        userSectionMap[enrollment.userId] = [];
      }
      userSectionMap[enrollment.userId]!.push({ sectionId: enrollment.sectionId, courseId });
    }

    const histMatch: Record<string, unknown> = {
      levelUnitType: 'model',
      userId: { $in: enrolledUserIds },
    };
    if (date) {
      histMatch.recordedServerTime = { $lt: date };
    }

    const pipeline = [
      { $match: histMatch },
      {
        $group: {
          _id: { userId: '$userId', TDFId: '$TDFId' },
          correct: { $sum: { $cond: [{ $eq: ['$outcome', 'correct'] }, 1, 0] } },
          incorrect: { $sum: { $cond: [{ $ne: ['$outcome', 'correct'] }, 1, 0] } },
          totalPracticeDuration: { $sum: { $add: [{ $ifNull: ['$CFEndLatency', 0] }, { $ifNull: ['$CFFeedbackLatency', 0] }] } },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.userId',
          foreignField: '_id',
          as: '_user',
        },
      },
      {
        $addFields: {
          username: { $ifNull: [{ $arrayElemAt: ['$_user.username', 0] }, ''] },
        },
      },
      { $project: { _user: 0 } },
    ];

    const aggResults: Array<{
      _id: { userId: string; TDFId: string };
      correct: number;
      incorrect: number;
      totalPracticeDuration: number;
      username: string;
    }> = await deps.Histories.rawCollection().aggregate(pipeline).toArray();

    type ClassTotal = { count: number; totalTime: number; numCorrect: number; percentCorrect?: string; totalTimeDisplay?: string };
    type StudentTotal = ClassTotal & { username: string; userId: string };
    const studentPerformanceForClass: Record<string, Record<string, ClassTotal>> = {};
    const studentPerformanceForClassAndTdfIdMap: Record<string, Record<string, Record<string, StudentTotal>>> = {};

    for (const row of aggResults) {
      const userId = row._id.userId;
      const TDFId = row._id.TDFId;
      const correct = Number(row.correct);
      const incorrect = Number(row.incorrect);
      const totalPracticeDuration = Number(row.totalPracticeDuration);
      const count = correct + incorrect;
      const studentUsername = row.username || '';

      if (studentUsername) {
        deps.syncUsernameCaches(String(userId), studentUsername);
      }

      const userSections = userSectionMap[userId];
      if (!userSections) {
        continue;
      }

      for (const { courseId } of userSections) {
        if (!studentPerformanceForClass[courseId]) {
          studentPerformanceForClass[courseId] = {};
        }
        if (!studentPerformanceForClass[courseId][TDFId]) {
          studentPerformanceForClass[courseId][TDFId] = { count: 0, totalTime: 0, numCorrect: 0 };
        }
        const classTdf = studentPerformanceForClass[courseId][TDFId];
        if (classTdf) {
          classTdf.numCorrect += correct;
          classTdf.count += count;
          classTdf.totalTime += totalPracticeDuration;
        }

        if (!studentPerformanceForClassAndTdfIdMap[courseId]) {
          studentPerformanceForClassAndTdfIdMap[courseId] = {};
        }
        if (!studentPerformanceForClassAndTdfIdMap[courseId][TDFId]) {
          studentPerformanceForClassAndTdfIdMap[courseId][TDFId] = {};
        }
        if (!studentPerformanceForClassAndTdfIdMap[courseId][TDFId][userId]) {
          studentPerformanceForClassAndTdfIdMap[courseId][TDFId][userId] = {
            count: 0,
            totalTime: 0,
            numCorrect: 0,
            username: studentUsername,
            userId,
          };
        }
        const studentEntry = studentPerformanceForClassAndTdfIdMap[courseId][TDFId][userId];
        if (studentEntry) {
          studentEntry.numCorrect += correct;
          studentEntry.count += count;
          studentEntry.totalTime += totalPracticeDuration;
        }
      }
    }

    for (const courseId of Object.keys(studentPerformanceForClass)) {
      const courseTotals = studentPerformanceForClass[courseId];
      if (!courseTotals) {
        continue;
      }
      for (const tdfId of Object.keys(courseTotals)) {
        const tdfTotal = courseTotals[tdfId];
        if (!tdfTotal) {
          continue;
        }
        tdfTotal.percentCorrect = ((tdfTotal.numCorrect / tdfTotal.count) * 100).toFixed(2) + '%';
        tdfTotal.totalTimeDisplay = (tdfTotal.totalTime / (60 * 1000)).toFixed(1);
      }
    }
    for (const courseId of Object.keys(studentPerformanceForClassAndTdfIdMap)) {
      const courseTotals = studentPerformanceForClassAndTdfIdMap[courseId];
      if (!courseTotals) {
        continue;
      }
      for (const tdfId of Object.keys(courseTotals)) {
        const tdfTotals = courseTotals[tdfId];
        if (!tdfTotals) {
          continue;
        }
        for (const studentTotal of Object.values(tdfTotals)) {
          studentTotal.percentCorrect = ((studentTotal.numCorrect / studentTotal.count) * 100).toFixed(2) + '%';
          studentTotal.totalTimeDisplay = (studentTotal.totalTime / (60 * 1000)).toFixed(1);
        }
      }
    }
    return [studentPerformanceForClass, studentPerformanceForClassAndTdfIdMap];
  }

  function requireSelfScopedUserId(
    thisArg: MethodContext | undefined,
    requestedUserId: unknown,
    forbiddenMessage = 'Can only read learner data for the current user'
  ) {
    const actingUserId = requireAuthenticatedUser(thisArg?.userId, 'Must be logged in', 401);
    const normalizedRequestedUserId = deps.normalizeCanonicalId(requestedUserId) || actingUserId;
    if (normalizedRequestedUserId !== actingUserId) {
      throw new Meteor.Error(403, forbiddenMessage);
    }
    return actingUserId;
  }

  function requireNormalizedTdfId(TDFId: unknown) {
    const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
    if (!normalizedTdfId) {
      throw new Meteor.Error(400, 'Invalid TDF');
    }
    return normalizedTdfId;
  }

  return {
    createExperimentState: async function(
      this: MethodContext,
      curExperimentState: UnknownRecord & { currentRootTdfId?: string; currentTdfId?: string }
    ) {
      return await createExperimentState.call(this, curExperimentState, this.userId || null);
    },
    getClassPerformanceByTDF,
    getStudentPerformanceByIdAndTDFIdFromHistory: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      returnRows: number | null = null
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getStudentPerformanceByIdAndTDFIdFromHistory(scopedUserId, requireNormalizedTdfId(TDFId), returnRows);
    },
    getStudentPerformanceForUnitFromHistory: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      levelUnit: number,
      unitScopedOnly = false
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getStudentPerformanceForUnitFromHistory(scopedUserId, requireNormalizedTdfId(TDFId), levelUnit, unitScopedOnly);
    },
    getAssessmentCompletedTrialCountFromHistory: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      levelUnit: number
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getAssessmentCompletedTrialCountFromHistory(scopedUserId, requireNormalizedTdfId(TDFId), levelUnit);
    },
    getVideoCompletedCheckpointQuestionCountFromHistory: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      levelUnit: number
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getVideoCompletedCheckpointQuestionCountFromHistory(scopedUserId, requireNormalizedTdfId(TDFId), levelUnit);
    },
    getLearningHistoryForUnit: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      levelUnit: number,
      unitScopedOnly = false
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getLearningHistoryForUnit(scopedUserId, requireNormalizedTdfId(TDFId), levelUnit, unitScopedOnly);
    },
    getHiddenStimulusKCsFromHistory: async function(this: MethodContext, userId: string, TDFId: string) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getHiddenStimulusKCsFromHistory(scopedUserId, requireNormalizedTdfId(TDFId));
    },
    getNumDroppedItemsByUserIDAndTDFId: async function(this: MethodContext, userId: string, TDFId: string) {
      const scopedUserId = requireSelfScopedUserId(this, userId);
      return await getNumDroppedItemsByUserIDAndTDFId(scopedUserId, requireNormalizedTdfId(TDFId));
    },
    getStudentPerformanceForClassAndTdfId: async function(this: MethodContext, instructorId: string, date: number | null = null) {
      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      const requestedInstructorId = deps.normalizeCanonicalId(instructorId) || this.userId;
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: requestedInstructorId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only access your own instructor performance data',
        forbiddenCode: 403,
      });
      return await getStudentPerformanceForClassAndTdfId(requestedInstructorId, date);
    },
    getStimSetFromLearningSessionByClusterList,
    getExperimentState: async function(this: MethodContext, userId: string, TDFId: string) {
      const scopedUserId = requireSelfScopedUserId(this, userId, 'Can only read experiment state for the current user');
      return await getExperimentState(scopedUserId, requireNormalizedTdfId(TDFId));
    },
    setExperimentState: async function(
      this: MethodContext,
      userId: string,
      TDFId: string,
      experimentStateId: string,
      newExperimentState: UnknownRecord,
      where: string
    ) {
      const scopedUserId = requireSelfScopedUserId(this, userId, 'Can only mutate experiment state for the current user');
      return await setExperimentState(
        scopedUserId,
        requireNormalizedTdfId(TDFId),
        experimentStateId,
        newExperimentState,
        where || 'methods.setExperimentState'
      );
    },
    getLastTDFAccessed: async function(this: MethodContext, userId: string | null = null) {
      const scopedUserId = requireSelfScopedUserId(this, userId, 'Can only read recent TDFs for the current user');
      return await getLastTDFAccessed(scopedUserId);
    },
    insertHistory,
    getHistoryByTDFID,
    getUserRecentTDFs: async function(this: MethodContext, userId: string | null = null) {
      const scopedUserId = requireSelfScopedUserId(this, userId, 'Can only read recent TDFs for the current user');
      return await getUserRecentTDFs(scopedUserId);
    },
    getUserLastFeedbackTypeFromHistory,

    getLearnerProgressSignals: async function(this: MethodContext, targetUserId?: string) {
      const currentUserId = this.userId;
      if (!currentUserId) {
        throw new Meteor.Error('not-authorized', 'Must be logged in');
      }

      const requestedUserId = typeof targetUserId === 'string' && targetUserId.trim().length
        ? targetUserId.trim()
        : currentUserId;
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: currentUserId,
        subjectUserId: requestedUserId,
        roles: ['admin', 'teacher'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 'not-authorized',
        forbiddenMessage: 'Insufficient privileges to inspect another learner',
        forbiddenCode: 'not-authorized',
      });

      const docs = await deps.GlobalExperimentStates.find(
        { userId: requestedUserId },
        { fields: { TDFId: 1, experimentState: 1 } }
      ).fetchAsync();

      const attempted = new Set<string>();
      const meaningful = new Set<string>();
      for (const doc of docs) {
        const tdfId = typeof doc?.TDFId === 'string' ? doc.TDFId : null;
        if (!tdfId) {
          continue;
        }
        attempted.add(tdfId);
        if (deps.hasMeaningfulProgressSignal(doc?.experimentState)) {
          meaningful.add(tdfId);
        }
      }

      return {
        attemptedTdfIds: Array.from(attempted),
        meaningfulProgressTdfIds: Array.from(meaningful),
      };
    },

    updateExperimentState: async function(
      this: MethodContext,
      curExperimentState: UnknownRecord & { currentRootTdfId?: string; currentTdfId?: string },
      experimentId: string | null = null
    ) {
      let existingExperimentDoc: { userId?: string; TDFId?: string } | null = null;
      if (experimentId) {
        existingExperimentDoc = await deps.GlobalExperimentStates.findOneAsync(
          { _id: experimentId },
          { fields: { userId: 1, TDFId: 1 } }
        );
        if (!existingExperimentDoc) {
          throw new Meteor.Error(403, 'Not authorized to mutate this experiment state record');
        }
        await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
          actingUserId: this.userId,
          subjectUserId: existingExperimentDoc.userId,
          forbiddenMessage: 'Not authorized to mutate this experiment state record',
          forbiddenCode: 403,
        });
      }
      const rootTdfId = deps.normalizeCanonicalId(existingExperimentDoc?.TDFId)
        || deps.normalizeCanonicalId((curExperimentState as any)?.currentRootTdfId)
        || deps.normalizeCanonicalId(curExperimentState?.currentTdfId);
      if (!rootTdfId) {
        throw new Meteor.Error(400, 'updateExperimentState requires a canonical root TDF context');
      }
      const conditionTdfId = deps.normalizeCanonicalId((curExperimentState as any)?.conditionTdfId);
      await validateExperimentStateMutation(this.userId, rootTdfId, curExperimentState, 'methods.updateExperimentState');
      deps.serverConsole('updateExperimentState', {
        userId: this.userId || null,
        rootTdfId,
        currentTdfId: deps.normalizeCanonicalId((curExperimentState as any)?.currentTdfId),
        currentStimuliSetId: deps.normalizeCanonicalId((curExperimentState as any)?.currentStimuliSetId),
        conditionTdfId: conditionTdfId || null,
        experimentTarget: deps.normalizeOptionalString((curExperimentState as any)?.experimentTarget),
      });
      if (experimentId) {
        return await setExperimentState(
          this.userId as string,
          rootTdfId,
          experimentId,
          curExperimentState,
          'methods.updateExperimentState'
        );
      }
      return await createExperimentState.call(this, curExperimentState, this.userId || null);
    },

    getOutcomesForAdaptiveLearning: async function(this: MethodContext, userId: string, TDFId: string) {
      const actingUserId = requireAuthenticatedUser(this.userId, 'Must be logged in', 401);
      const requestedUserId = deps.normalizeCanonicalId(userId) || actingUserId;
      const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
      if (!normalizedTdfId) {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId,
        subjectUserId: requestedUserId,
        roles: ['admin'],
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Can only read adaptive outcomes for the current user',
        forbiddenCode: 403,
      });
      if (requestedUserId === actingUserId) {
        await validateExperimentStateMutation(
          actingUserId,
          normalizedTdfId,
          { currentTdfId: normalizedTdfId },
          'methods.getOutcomesForAdaptiveLearning'
        );
      }
      const history = await deps.Histories.find(
        { userId: requestedUserId, TDFId: normalizedTdfId },
        { fields: { KCId: 1, outcome: 1 }, $sort: { recordedServerTime: -1 } }
      ).fetchAsync();
      const outcomes: Record<string, boolean> = {};
      for (const historyRow of history as Array<{ KCId?: number; outcome?: string }>) {
        if (historyRow.KCId) {
          outcomes[historyRow.KCId % 1000] = historyRow.outcome === 'correct';
        }
      }
      const tdf = await deps.Tdfs.findOneAsync({ _id: normalizedTdfId });
      const stimSet = Array.isArray(tdf?.stimuli) ? tdf.stimuli : [];
      const clusterStimSet: Record<string, unknown> = {};
      for (const stim of stimSet as Array<{ clusterKC: number }>) {
        clusterStimSet[stim.clusterKC % 1000] = stim;
      }

      for (const cluster of Object.keys(clusterStimSet)) {
        if (!outcomes[cluster]) {
          outcomes[cluster] = false;
        }
      }

      return outcomes;
    },

    downloadDataByTeacher: async function(this: MethodContext, targetUserId: string) {
      check(targetUserId, String);

      await requireUserMatchesOrHasRole(deps.getMethodAuthorizationDeps(), {
        actingUserId: this.userId,
        subjectUserId: targetUserId,
        notLoggedInMessage: 'Must be logged in',
        notLoggedInCode: 401,
        forbiddenMessage: 'Permission denied',
        forbiddenCode: 403,
      });

      const ownedTdfs = await deps.getTdfNamesByOwnerId(targetUserId);
      if (!ownedTdfs) {
        throw new Meteor.Error(500, 'Failed to resolve owned TDFs for download');
      }
      const uniqueTdfs = ownedTdfs.filter((value: string, index: number, allValues: string[]) => allValues.indexOf(value) === index);

      if (uniqueTdfs.length === 0) {
        throw new Meteor.Error(404, 'No owned TDFs found for current user');
      }
      await deps.assertUserOwnsTdfs(targetUserId, uniqueTdfs);

      const user = await deps.usersCollection.findOneAsync({ _id: targetUserId }, { fields: { username: 1, emails: 1 } });
      if (!user) {
        throw new Meteor.Error(404, 'User not found');
      }
      const userName = sanitizeFileNameSegment(user.username || user.emails?.[0]?.address || targetUserId, targetUserId);
      const fileName = `mofacts_${userName}_all_tdf_data.tsv`;

      const tsvContent = await deps.createExperimentExport(uniqueTdfs, targetUserId);
      return { fileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },

    downloadDataByClass: async function(this: MethodContext, classId: string) {
      check(classId, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      throw new Meteor.Error(403, 'Class-based data download is not allowed in this flow');
    },

    downloadDataByFile: async function(this: MethodContext, fileName: string) {
      check(fileName, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }
      if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new Meteor.Error(400, 'Invalid file name');
      }

      const downloadFileName = fileName.split('.json')[0] + '-data.tsv';
      const tdf = await deps.Tdfs.findOneAsync({ 'content.fileName': fileName });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canDownloadOwnedTdfData(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download data for this TDF');
      }
      const exportTdfIds = new Set<string>([String(tdf._id)]);
      const setspec = tdf.content?.tdfs?.tutor?.setspec;
      if (Array.isArray(setspec?.condition) && setspec.condition.length > 0) {
        const conditionIds = await deps.resolveConditionTdfIds(setspec);
        if (conditionIds.length > 0) {
          const ownedConditionDocs = await deps.Tdfs.find(
            { _id: { $in: conditionIds }, ownerId: this.userId },
            { fields: { _id: 1 } }
          ).fetchAsync();
          for (const ownedCondition of ownedConditionDocs) {
            exportTdfIds.add(String(ownedCondition._id));
          }
        }
      }

      const tsvContent = await deps.createExperimentExportByTdfIds(Array.from(exportTdfIds), this.userId);

      return { fileName: downloadFileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },

    downloadDataById: async function(this: MethodContext, tdfId: string) {
      check(tdfId, String);

      if (!this.userId) {
        throw new Meteor.Error(401, 'Must be logged in');
      }

      const tdf = await deps.Tdfs.findOneAsync({ _id: tdfId });
      if (!tdf) {
        throw new Meteor.Error(404, 'TDF not found');
      }
      if (!deps.canDownloadOwnedTdfData(this.userId, tdf)) {
        throw new Meteor.Error(403, 'Not authorized to download data for this TDF');
      }

      const lessonName = tdf.content?.tdfs?.tutor?.setspec?.lessonname || `tdf-${tdfId}`;
      const fileName = `${sanitizeFileNameSegment(lessonName, `tdf-${tdfId}`)}-data.tsv`;

      const tsvContent = await deps.createExperimentExportByTdfIds([tdfId], this.userId);
      return { fileName, contentType: 'text/tab-separated-values', content: tsvContent };
    },

    updateTdfConditionCounts: async function(this: MethodContext, TDFId: string, conditionCounts: number[]) {
      deps.serverConsole('updateTdfConditionCounts', TDFId, conditionCounts);
      const normalizedTdfId = deps.normalizeCanonicalId(TDFId);
      if (!normalizedTdfId) {
        throw new Meteor.Error(400, 'Invalid TDF');
      }
      if (!Array.isArray(conditionCounts) || conditionCounts.some((count) => !Number.isFinite(Number(count)) || Number(count) < 0)) {
        throw new Meteor.Error(400, 'Invalid condition counts');
      }
      await validateExperimentStateMutation(
        this.userId,
        normalizedTdfId,
        { currentTdfId: normalizedTdfId },
        'methods.updateTdfConditionCounts'
      );
      await deps.Tdfs.updateAsync({ _id: normalizedTdfId }, { $set: { conditionCounts } });
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
