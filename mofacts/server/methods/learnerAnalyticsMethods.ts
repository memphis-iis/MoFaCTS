import type {
  GetLearnerLessonAnalyticsHistoryPageRequest,
  GetLearnerLessonAnalyticsSourceRequest,
  LearnerAnalyticsHistoryPage,
  LearnerAnalyticsHistoryRow,
  LearnerAnalyticsLessonSummary,
  LearnerAnalyticsMeasurementContract,
  LearnerAnalyticsModelInput,
  LearnerAnalyticsOverview,
  LearnerLessonAnalyticsSource,
} from '../../common/learnerAnalytics.contracts';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';

const ANALYTICS_HISTORY_PAGE_SIZE = 1000;

type LearnerAnalyticsDeps = {
  Meteor: any;
  Tdfs: any;
  Histories: any;
  StimulusCrowdStats: any;
  getPracticeDashboardSnapshot: (context: any) => Promise<any>;
  getStimuliSetById: (stimuliSetId: string | number) => Promise<any[]>;
  getResponseKCMapForTdf: (tdfId: string) => Promise<Record<string, unknown>>;
  now: () => number;
};

type AuthorizedLessonContext = {
  practiceLesson: any;
  rootTdfDoc: any;
  tdfIds: string[];
};

type HistoryCursor = {
  version: 1;
  rootTdfId: string;
  tdfIds: string[];
  upperId: string;
  afterId: string;
};

const HISTORY_FIELDS = {
  _id: 1, TDFId: 1, levelUnit: 1, levelUnitType: 1, modelEvidenceSource: 1,
  outcome: 1, recordedServerTime: 1, time: 1, problemStartTime: 1,
  CFEndLatency: 1, CFFeedbackLatency: 1, responseDuration: 1, practiceDurationMs: 1,
  stimuliSetId: 1, stimulusKC: 1, clusterKC: 1, KCCluster: 1, KCId: 1, KCDefault: 1,
  CFCorrectAnswer: 1, responseKey: 1, responseValue: 1, eventType: 1, CFItemRemoved: 1, sparc: 1,
};

function measurementContract(lesson: any): LearnerAnalyticsMeasurementContract {
  if (lesson.firstContentUnitType === 'autotutor') return 'autotutor';
  if (lesson.firstContentUnitType === 'learning' || lesson.firstContentUnitType === 'sparc') return 'retrieval-model';
  return 'retrieval';
}

function asIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function lessonSummary(lesson: any): LearnerAnalyticsLessonSummary {
  return {
    rootTdfId: String(lesson.TDFId),
    title: String(lesson.displayName || lesson.TDFId),
    measurementContract: measurementContract(lesson),
    lastPracticedAt: asIsoDate(lesson.progress?.lastPracticed),
    launch: {
      rootTdfId: String(lesson.TDFId),
      lessonName: String(lesson.displayName || lesson.TDFId),
      currentStimuliSetId: lesson.currentStimuliSetId ?? null,
      isMultiTdf: lesson.isMultiTdf === true,
    },
  };
}

export function buildLearnerAnalyticsOverview(snapshot: any): LearnerAnalyticsOverview {
  const practiced: LearnerAnalyticsLessonSummary[] = (snapshot?.lessons || [])
    .map(lessonSummary)
    .filter((lesson: LearnerAnalyticsLessonSummary) => lesson.lastPracticedAt !== null);
  practiced.sort((left, right) => new Date(right.lastPracticedAt as string).getTime() - new Date(left.lastPracticedAt as string).getTime());
  return { version: 1, defaultLessonId: practiced[0]?.rootTdfId || null, lessons: practiced };
}

function requireRootTdfId(value: unknown, MeteorApi: any): string {
  const rootTdfId = typeof value === 'string' ? value.trim() : '';
  if (!rootTdfId) throw new MeteorApi.Error('invalid-args', 'A root TDF id is required');
  return rootTdfId;
}

function requireStringId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Learner analytics ${label} must be a string id.`);
  return value;
}

function encodeCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): HistoryCursor {
  if (typeof value !== 'string' || !value) throw new Error('Learner analytics history cursor is required.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (_error) {
    throw new Error('Learner analytics history cursor is invalid.');
  }
  const cursor = parsed as Partial<HistoryCursor>;
  if (cursor.version !== 1 || typeof cursor.rootTdfId !== 'string' || !Array.isArray(cursor.tdfIds)
    || cursor.tdfIds.some((tdfId) => typeof tdfId !== 'string') || typeof cursor.upperId !== 'string'
    || typeof cursor.afterId !== 'string') {
    throw new Error('Learner analytics history cursor has an invalid shape.');
  }
  return cursor as HistoryCursor;
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function authorizeLesson(deps: LearnerAnalyticsDeps, context: any, rootTdfId: string): Promise<AuthorizedLessonContext> {
  const practiceSnapshot = await deps.getPracticeDashboardSnapshot(context);
  const practiceLesson = (practiceSnapshot?.lessons || []).find((lesson: any) => String(lesson.TDFId) === rootTdfId);
  if (!practiceLesson) throw new deps.Meteor.Error('not-authorized', 'The selected study set is not available to this learner');
  const rootTdfDoc = await deps.Tdfs.findOneAsync(
    { _id: rootTdfId },
    { fields: { _id: 1, stimuliSetId: 1, rawStimuliFile: 1, content: 1 } },
  );
  if (!rootTdfDoc) throw new deps.Meteor.Error('not-found', 'The selected study set no longer exists');
  const family = validateConditionFamilyTutor(rootTdfDoc?.content?.tdfs?.tutor, { requireCanonicalIds: true });
  if (family.errors.length > 0) {
    throw new deps.Meteor.Error('invalid-state', 'The selected study set has an invalid condition-family identity contract');
  }
  return { practiceLesson, rootTdfDoc, tdfIds: [rootTdfId, ...family.conditionTdfIds] };
}

async function historySnapshotBounds(
  deps: LearnerAnalyticsDeps,
  userId: string,
  tdfIds: string[],
): Promise<{ upperId: string | null; rowCount: number }> {
  const latest = (await deps.Histories.find(
    { userId, TDFId: { $in: tdfIds } },
    { fields: { _id: 1 }, sort: { _id: -1 }, limit: 1 },
  ).fetchAsync())[0];
  const upperId = latest ? requireStringId(latest._id, 'upper history') : null;
  const rowCount = upperId === null ? 0 : await deps.Histories.find({
    userId,
    TDFId: { $in: tdfIds },
    _id: { $lte: upperId },
  }).countAsync();
  return { upperId, rowCount };
}

async function readHistoryPage(params: {
  deps: LearnerAnalyticsDeps; userId: string; rootTdfId: string; tdfIds: string[];
  upperId: string | null; afterId?: string;
}): Promise<LearnerAnalyticsHistoryPage> {
  if (!params.upperId) return { version: 1, rows: [], nextCursor: null };
  const rows = await params.deps.Histories.find({
    userId: params.userId,
    TDFId: { $in: params.tdfIds },
    _id: { $lte: params.upperId, ...(params.afterId ? { $gt: params.afterId } : {}) },
  }, { fields: HISTORY_FIELDS, sort: { _id: 1 }, limit: ANALYTICS_HISTORY_PAGE_SIZE + 1 }).fetchAsync();
  const hasMore = rows.length > ANALYTICS_HISTORY_PAGE_SIZE;
  const pageRows = (hasMore ? rows.slice(0, ANALYTICS_HISTORY_PAGE_SIZE) : rows).map((row: Record<string, unknown>) => ({
    ...row,
    _id: requireStringId(row._id, 'history row'),
  })) as LearnerAnalyticsHistoryRow[];
  const lastId = pageRows.at(-1)?._id;
  if (hasMore && !lastId) throw new Error('Learner analytics history page cannot advance.');
  return {
    version: 1,
    rows: pageRows,
    nextCursor: hasMore ? encodeCursor({
      version: 1,
      rootTdfId: params.rootTdfId,
      tdfIds: params.tdfIds,
      upperId: params.upperId,
      afterId: lastId as string,
    }) : null,
  };
}

async function resolveModelInput(params: {
  deps: LearnerAnalyticsDeps; userId: string; authorized: AuthorizedLessonContext; upperId: string | null;
}): Promise<LearnerAnalyticsModelInput> {
  const conditionIds = params.authorized.tdfIds.slice(1);
  const latestCondition = conditionIds.length === 0 || !params.upperId ? null : (await params.deps.Histories.find(
    { userId: params.userId, TDFId: { $in: conditionIds }, _id: { $lte: params.upperId } },
    { fields: { TDFId: 1 }, sort: { recordedServerTime: -1, _id: -1 }, limit: 1 },
  ).fetchAsync())[0];
  const modelTdfId = latestCondition ? String(latestCondition.TDFId) : String(params.authorized.rootTdfDoc._id);
  const modelTdfDoc = modelTdfId === String(params.authorized.rootTdfDoc._id) ? params.authorized.rootTdfDoc
    : await params.deps.Tdfs.findOneAsync(
        { _id: modelTdfId },
        { fields: { _id: 1, stimuliSetId: 1, rawStimuliFile: 1, content: 1 } },
      );
  if (!modelTdfDoc) throw new params.deps.Meteor.Error('invalid-state', 'The practiced condition TDF cannot be resolved');
  const flatStimuli = modelTdfDoc.stimuliSetId === null || modelTdfDoc.stimuliSetId === undefined
    ? [] : await params.deps.getStimuliSetById(modelTdfDoc.stimuliSetId);
  const [responseKCMap, crowdStats] = await Promise.all([
    params.deps.getResponseKCMapForTdf(modelTdfId),
    params.deps.StimulusCrowdStats.find(
      { stimuliSetId: modelTdfDoc.stimuliSetId },
      { fields: { _id: 0, stimuliSetId: 1, stimulusKC: 1, correctCount: 1, incorrectCount: 1, totalCount: 1 } },
    ).fetchAsync(),
  ]);
  return {
    tdfDoc: modelTdfDoc,
    flatStimuli,
    learnerConfig: params.authorized.practiceLesson.learnerConfig || null,
    responseKCMap,
    crowdStats,
  };
}

export function createLearnerAnalyticsMethods(deps: LearnerAnalyticsDeps) {
  return {
    getLearnerAnalyticsOverview: async function(this: any): Promise<LearnerAnalyticsOverview> {
      if (!this.userId) throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      return buildLearnerAnalyticsOverview(await deps.getPracticeDashboardSnapshot(this));
    },

    getLearnerLessonAnalyticsSource: async function(
      this: any, request: GetLearnerLessonAnalyticsSourceRequest,
    ): Promise<LearnerLessonAnalyticsSource> {
      if (!this.userId) throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      const rootTdfId = requireRootTdfId(request?.rootTdfId, deps.Meteor);
      const userId = String(this.userId);
      const authorized = await authorizeLesson(deps, this, rootTdfId);
      const { upperId, rowCount } = await historySnapshotBounds(deps, userId, authorized.tdfIds);
      const [historyPage, modelInput] = await Promise.all([
        readHistoryPage({ deps, userId, rootTdfId, tdfIds: authorized.tdfIds, upperId }),
        resolveModelInput({ deps, userId, authorized, upperId }),
      ]);
      return {
        version: 1,
        lesson: lessonSummary(authorized.practiceLesson),
        calculatedAt: new Date(deps.now()).toISOString(),
        historyRowCount: rowCount,
        historyPage,
        modelInput,
      };
    },

    getLearnerLessonAnalyticsHistoryPage: async function(
      this: any, request: GetLearnerLessonAnalyticsHistoryPageRequest,
    ): Promise<LearnerAnalyticsHistoryPage> {
      if (!this.userId) throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      const rootTdfId = requireRootTdfId(request?.rootTdfId, deps.Meteor);
      let cursor: HistoryCursor;
      try {
        cursor = decodeCursor(request?.cursor);
      } catch (error) {
        throw new deps.Meteor.Error('invalid-args', error instanceof Error ? error.message : 'Invalid history cursor');
      }
      const authorized = await authorizeLesson(deps, this, rootTdfId);
      if (cursor.rootTdfId !== rootTdfId || !sameIds(cursor.tdfIds, authorized.tdfIds) || cursor.afterId > cursor.upperId) {
        throw new deps.Meteor.Error('invalid-args', 'The history cursor does not match the selected study set');
      }
      return readHistoryPage({
        deps,
        userId: String(this.userId),
        rootTdfId,
        tdfIds: authorized.tdfIds,
        upperId: cursor.upperId,
        afterId: cursor.afterId,
      });
    },
  };
}
