import { createHash } from 'node:crypto';
import type {
  LearnerAnalyticsLessonSummary,
  LearnerAnalyticsMeasurementContract,
  LearnerAnalyticsOverview,
  LearnerLessonAnalyticsSnapshot,
  RefreshLearnerLessonAnalyticsRequest,
} from '../../common/learnerAnalytics.contracts';
import { validateConditionFamilyTutor } from '../../common/lib/tdfIdentityContract';
import {
  assertValidAnalyticsTimeZone,
  buildLearnerAnalyticsAggregates,
  type LearnerAnalyticsHistoryRow,
} from '../lib/learnerAnalyticsAggregation';
import {
  buildLearnerUnitModelSnapshots,
  consolidateLearnerModelProgress,
} from '../lib/learnerModelProgress';

const ANALYTICS_HISTORY_BATCH_SIZE = 1000;
const LEARNER_ANALYTICS_CACHE_VERSION = 1;

type LearnerAnalyticsDeps = {
  Meteor: any;
  Tdfs: any;
  Histories: any;
  StimulusCrowdStats: any;
  LearnerUnitAnalyticsCache: any;
  computePracticeTimeMs: (end: any, feedback: any) => number;
  getPracticeDashboardSnapshot: (context: any) => Promise<any>;
  getStimuliSetById: (stimuliSetId: string | number) => Promise<any[]>;
  getResponseKCMapForTdf: (tdfId: string) => Promise<Record<string, unknown>>;
  serverConsole: (...args: any[]) => void;
  redisBoundary: {
    withLock: <T>(key: string, ttlMs: number, work: () => Promise<T>) => Promise<T>;
  };
  now: () => number;
};

function measurementContract(lesson: any): LearnerAnalyticsMeasurementContract {
  if (lesson.firstContentUnitType === 'autotutor') return 'autotutor';
  if (lesson.firstContentUnitType === 'learning' || lesson.firstContentUnitType === 'sparc') {
    return 'retrieval-model';
  }
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
  practiced.sort((left, right) => (
    new Date(right.lastPracticedAt as string).getTime() - new Date(left.lastPracticedAt as string).getTime()
  ));
  return {
    version: 1,
    defaultLessonId: practiced[0]?.rootTdfId || null,
    lessons: practiced,
  };
}

async function readHistoryRows(deps: LearnerAnalyticsDeps, userId: string, tdfIds: string[]) {
  const rows: LearnerAnalyticsHistoryRow[] = [];
  let lastId: unknown = null;
  while (true) {
    const batch = await deps.Histories.find({
      userId,
      TDFId: { $in: tdfIds },
      ...(lastId === null ? {} : { _id: { $gt: lastId } }),
    }, {
      fields: {
        _id: 1,
        TDFId: 1,
        levelUnit: 1,
        levelUnitType: 1,
        modelEvidenceSource: 1,
        outcome: 1,
        recordedServerTime: 1,
        time: 1,
        problemStartTime: 1,
        CFEndLatency: 1,
        CFFeedbackLatency: 1,
        responseDuration: 1,
        practiceDurationMs: 1,
        stimuliSetId: 1,
        stimulusKC: 1,
        clusterKC: 1,
        KCCluster: 1,
        KCId: 1,
        KCDefault: 1,
        CFCorrectAnswer: 1,
        responseKey: 1,
        responseValue: 1,
        eventType: 1,
        CFItemRemoved: 1,
        sparc: 1,
      },
      sort: { _id: 1 },
      limit: ANALYTICS_HISTORY_BATCH_SIZE,
    }).fetchAsync();
    if (batch.length === 0) break;
    rows.push(...batch);
    lastId = batch[batch.length - 1]?._id ?? null;
    if (lastId === null) throw new Error('Learner analytics history row is missing _id');
    if (batch.length < ANALYTICS_HISTORY_BATCH_SIZE) break;
  }
  return rows;
}

function fingerprintModel(tdfDoc: any, learnerConfig: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({
      content: tdfDoc?.content,
      rawStimuliFile: tdfDoc?.rawStimuliFile,
      stimuliSetId: tdfDoc?.stimuliSetId,
      learnerConfig,
    }))
    .digest('hex');
}

export function createLearnerAnalyticsMethods(deps: LearnerAnalyticsDeps) {
  return {
    getLearnerAnalyticsOverview: async function(this: any): Promise<LearnerAnalyticsOverview> {
      if (!this.userId) throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      return buildLearnerAnalyticsOverview(await deps.getPracticeDashboardSnapshot(this));
    },

    refreshLearnerLessonAnalytics: async function(
      this: any,
      request: RefreshLearnerLessonAnalyticsRequest,
    ): Promise<LearnerLessonAnalyticsSnapshot> {
      if (!this.userId) throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      const rootTdfId = typeof request?.rootTdfId === 'string' ? request.rootTdfId.trim() : '';
      if (!rootTdfId) throw new deps.Meteor.Error('invalid-args', 'A root TDF id is required');
      let timeZone: string;
      try {
        timeZone = assertValidAnalyticsTimeZone(request?.timeZone);
      } catch (_error) {
        throw new deps.Meteor.Error('invalid-args', 'A valid IANA time zone is required');
      }
      const userId = String(this.userId);

      return await deps.redisBoundary.withLock(
        `learner-analytics:refresh:${userId}:${rootTdfId}`,
        120_000,
        async () => {
          const practiceSnapshot = await deps.getPracticeDashboardSnapshot(this);
          const practiceLesson = (practiceSnapshot?.lessons || [])
            .find((lesson: any) => String(lesson.TDFId) === rootTdfId);
          if (!practiceLesson) {
            throw new deps.Meteor.Error('not-authorized', 'The selected study set is not available to this learner');
          }
          const tdfDoc = await deps.Tdfs.findOneAsync(
            { _id: rootTdfId },
            { fields: { _id: 1, stimuliSetId: 1, rawStimuliFile: 1, content: 1 } },
          );
          if (!tdfDoc) throw new deps.Meteor.Error('not-found', 'The selected study set no longer exists');
          const family = validateConditionFamilyTutor(tdfDoc?.content?.tdfs?.tutor, {
            requireCanonicalIds: true,
          });
          if (family.errors.length > 0) {
            throw new deps.Meteor.Error(
              'invalid-state',
              'The selected study set has an invalid condition-family identity contract',
            );
          }
          const tdfIds = [rootTdfId, ...family.conditionTdfIds];
          const nowMs = deps.now();
          const historyRows = await readHistoryRows(deps, userId, tdfIds);
          const aggregate = buildLearnerAnalyticsAggregates({
            rows: historyRows,
            nowMs,
            timeZone,
            computePracticeTimeMs: deps.computePracticeTimeMs,
          });

          let modelResult: ReturnType<typeof consolidateLearnerModelProgress> = {
            reason: 'not-supported',
          };
          try {
            const conditionTdfIds = new Set(family.conditionTdfIds);
            const latestConditionHistory = historyRows
              .filter((row) => conditionTdfIds.has(String(row.TDFId || '')))
              .sort((left, right) => (
                new Date((right.recordedServerTime ?? right.time) as any).getTime()
                - new Date((left.recordedServerTime ?? left.time) as any).getTime()
              ))[0];
            const modelTdfId = latestConditionHistory ? String(latestConditionHistory.TDFId) : rootTdfId;
            const modelTdfDoc = modelTdfId === rootTdfId
              ? tdfDoc
              : await deps.Tdfs.findOneAsync(
                  { _id: modelTdfId },
                  { fields: { _id: 1, stimuliSetId: 1, rawStimuliFile: 1, content: 1 } },
                );
            if (!modelTdfDoc) {
              throw new Error(`Learning analytics cannot resolve practiced condition TDF ${modelTdfId}`);
            }
            const flatStimuli = modelTdfDoc.stimuliSetId === null || modelTdfDoc.stimuliSetId === undefined
              ? []
              : await deps.getStimuliSetById(modelTdfDoc.stimuliSetId);
            const [responseKCMap, crowdStats] = await Promise.all([
              deps.getResponseKCMapForTdf(modelTdfId),
              deps.StimulusCrowdStats.find(
                { stimuliSetId: modelTdfDoc.stimuliSetId },
                { fields: { _id: 0, stimulusKC: 1, correctCount: 1, incorrectCount: 1, totalCount: 1 } },
              ).fetchAsync(),
            ]);
            const unitSnapshots = buildLearnerUnitModelSnapshots({
              tdfDoc: modelTdfDoc,
              flatStimuli,
              historyRows: historyRows as any[],
              learnerConfig: practiceLesson.learnerConfig,
              responseKCMap,
              crowdStats,
              nowMs,
            });
            modelResult = consolidateLearnerModelProgress(unitSnapshots);
            const modelFingerprint = fingerprintModel(modelTdfDoc, practiceLesson.learnerConfig);
            await deps.LearnerUnitAnalyticsCache.removeAsync({ userId, rootTdfId });
            for (const unitSnapshot of unitSnapshots) {
              await deps.LearnerUnitAnalyticsCache.insertAsync({
                userId,
                rootTdfId,
                unitIndex: unitSnapshot.unitIndex,
                version: LEARNER_ANALYTICS_CACHE_VERSION,
                modelFingerprint,
                calculatedAt: new Date(nowMs),
                challengeTarget: unitSnapshot.challengeTarget,
                itemProbabilities: unitSnapshot.itemProbabilities,
                lastHistoryId: historyRows.at(-1)?._id ?? null,
              });
            }
          } catch (error) {
            modelResult = { reason: 'not-ready' };
            deps.serverConsole('[LearnerAnalytics] Model progress could not be calculated', {
              userId,
              rootTdfId,
              errorType: error instanceof Error ? error.name : typeof error,
            });
          }

          const lesson = lessonSummary(practiceLesson);
          const accuracy = Object.values(aggregate.periods).some((period) => period.accuracy !== undefined);
          return {
            version: 1,
            lesson,
            calculatedAt: new Date(nowMs).toISOString(),
            timeZone,
            lastPracticedAt: aggregate.lastPracticedAt,
            periods: aggregate.periods,
            latest28Days: aggregate.latest28Days,
            ...(modelResult.progress ? { modelProgress: modelResult.progress } : {}),
            availability: {
              accuracy,
              modelProgress: Boolean(modelResult.progress),
              ...(modelResult.reason ? { modelProgressReason: modelResult.reason } : {}),
            },
          };
        },
      );
    },
  };
}
