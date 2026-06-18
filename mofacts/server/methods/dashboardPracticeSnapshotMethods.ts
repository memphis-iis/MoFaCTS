import {
  buildLearnerTdfConfig,
  LEARNER_TDF_FIELD_DEFINITIONS,
  learnerTdfFieldAppliesToUnit,
  type LearnerTdfConfig,
} from '../../common/lib/learnerTdfConfig';
import { detectTdfUnitType } from '../../common/fieldApplicability';
import type {
  DashboardTdfStats,
  PracticeDashboardSnapshotLesson,
} from './dashboardCacheMethods.contracts';
import {
  buildDashboardStatsProjection,
  normalizeOptionalString,
  PRACTICE_DASHBOARD_SNAPSHOT_VERSION,
  resolveDashboardTdfFileName,
} from './dashboardCacheShared';
import { ADMIN_API_KEY_SETTINGS_KEY } from '../lib/apiKeyResolution';

type DashboardPracticeSnapshotDeps = {
  Meteor: any;
  Tdfs: any;
  Assignments?: any;
  Sections?: any;
  SectionUserMap?: any;
  UserDashboardCache: any;
  usersCollection: any;
  DynamicSettings: any;
  canViewDashboardTdf: (userId: unknown, tdf: any) => boolean;
};

type FirstContentUnitType = 'video' | 'autotutor' | 'assessment' | 'learning' | 'sparc' | 'conditionPool' | null;

async function resolveAssignedRootTdfIdsForUser({
  Assignments,
  Sections,
  SectionUserMap,
}: Pick<DashboardPracticeSnapshotDeps, 'Assignments' | 'Sections' | 'SectionUserMap'>, userId: string) {
  if (!Assignments || !Sections || !SectionUserMap) {
    throw new Error('Practice dashboard snapshot requires Assignments, Sections, and SectionUserMap dependencies');
  }
  const enrollmentRows = await SectionUserMap.find(
    { userId },
    { fields: { sectionId: 1 } }
  ).fetchAsync();
  const sectionIds = enrollmentRows
    .map((row: any) => normalizeOptionalString(row?.sectionId))
    .filter((id: string | null): id is string => !!id);
  if (sectionIds.length === 0) return [];

  const sections = await Sections.find(
    { _id: { $in: sectionIds } },
    { fields: { courseId: 1 } }
  ).fetchAsync();
  const courseIds = sections
    .map((section: any) => normalizeOptionalString(section?.courseId))
    .filter((id: string | null): id is string => !!id);
  if (courseIds.length === 0) return [];

  const assignmentRows = await Assignments.find(
    { courseId: { $in: [...new Set(courseIds)] } },
    { fields: { TDFId: 1 } }
  ).fetchAsync();
  return assignmentRows
    .map((row: any) => normalizeOptionalString(row?.TDFId))
    .filter((id: string | null): id is string => !!id);
}

async function getDashboardVisibleTdfs(deps: DashboardPracticeSnapshotDeps, userId: string) {
  const [assignedRootIds, user, adminApiKeySettings] = await Promise.all([
    resolveAssignedRootTdfIdsForUser(deps, userId),
    deps.usersCollection.findOneAsync(
      { _id: userId },
      { fields: { accessedTDFs: 1, speechAPIKey: 1, textToSpeechAPIKey: 1, ttsAPIKey: 1 } }
    ),
    deps.DynamicSettings.findOneAsync({ key: ADMIN_API_KEY_SETTINGS_KEY })
  ]);

  const explicitDashboardIds = [
    ...new Set([
      ...assignedRootIds,
      ...(Array.isArray(user?.accessedTDFs) ? user.accessedTDFs : [])
        .map((id: unknown) => normalizeOptionalString(id))
        .filter((id: string | null): id is string => !!id)
    ])
  ];
  const visibilityTerms: any[] = [
    { ownerId: userId },
    { 'accessors.userId': userId },
    { 'content.tdfs.tutor.setspec.userselect': 'true' },
  ];
  if (explicitDashboardIds.length > 0) {
    visibilityTerms.push({ _id: { $in: explicitDashboardIds } });
  }

  const projection = {
    _id: 1,
    stimuliSetId: 1,
    ownerId: 1,
    accessors: 1,
    conditionCounts: 1,
    tdfFileName: 1,
    'content.fileName': 1,
    'content.isMultiTdf': 1,
    'content.tdfs.tutor.setspec.lessonname': 1,
    'content.tdfs.tutor.setspec.tags': 1,
    'content.tdfs.tutor.setspec.condition': 1,
    'content.tdfs.tutor.setspec.conditionTdfIds': 1,
    'content.tdfs.tutor.setspec.audioInputEnabled': 1,
    'content.tdfs.tutor.setspec.enableAudioPromptAndFeedback': 1,
    'content.tdfs.tutor.setspec.speechAPIKey': 1,
    'content.tdfs.tutor.setspec.textToSpeechAPIKey': 1,
    'content.tdfs.tutor.unit.learningsession': 1,
    'content.tdfs.tutor.unit.autotutorsession': 1,
    'content.tdfs.tutor.unit.assessmentsession': 1,
    'content.tdfs.tutor.unit.videosession': 1,
    'content.tdfs.tutor.unit.sparcsession': 1,
    'content.tdfs.tutor.unit.unitinstructions': 1,
    'content.tdfs.tutor.unit.unitinstructionsquestion': 1
  };

  const accessibleRoots = await deps.Tdfs.find(
    { $or: visibilityTerms },
    {
      fields: {
        _id: 1,
        'content.fileName': 1,
        'content.tdfs.tutor.setspec.condition': 1,
        'content.tdfs.tutor.setspec.conditionTdfIds': 1
      }
    }
  ).fetchAsync();

  const conditionFileNames = new Set<string>();
  const conditionTdfIds = new Set<string>();
  for (const root of accessibleRoots) {
    const setspec = root?.content?.tdfs?.tutor?.setspec || {};
    const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
    const resolvedIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
    for (const condition of conditions) {
      const normalized = normalizeOptionalString(condition);
      if (normalized) conditionFileNames.add(normalized);
    }
    for (const conditionTdfId of resolvedIds) {
      const normalized = normalizeOptionalString(conditionTdfId);
      if (normalized) conditionTdfIds.add(normalized);
    }
  }

  if (conditionFileNames.size > 0) {
    visibilityTerms.push({ 'content.fileName': { $in: Array.from(conditionFileNames) } });
  }
  if (conditionTdfIds.size > 0) {
    visibilityTerms.push({ _id: { $in: Array.from(conditionTdfIds) } });
  }

  const tdfs = await deps.Tdfs.find({ $or: visibilityTerms }, { fields: projection }).fetchAsync();
  return {
    tdfs,
    hasSpeechAPIKey: Boolean(user?.speechAPIKey && String(user.speechAPIKey).trim()),
    hasTTSAPIKey: Boolean(
      (user?.ttsAPIKey && String(user.ttsAPIKey).trim()) ||
      (user?.textToSpeechAPIKey && String(user.textToSpeechAPIKey).trim())
    ),
    hasAdminSpeechAPIKey: Boolean(adminApiKeySettings?.value?.googleSpeech?.keyEncrypted && String(adminApiKeySettings.value.googleSpeech.keyEncrypted).trim()),
    hasAdminTTSAPIKey: Boolean(adminApiKeySettings?.value?.googleTts?.keyEncrypted && String(adminApiKeySettings.value.googleTts.keyEncrypted).trim())
  };
}

function getTdfConfigSource(tdf: any) {
  return {
    ...(tdf?.content || {}),
    updatedAt: tdf?.updatedAt,
    lastUpdated: tdf?.lastUpdated
  };
}

function getTutorUnits(tdfObject: any): any[] {
  const units = tdfObject?.tdfs?.tutor?.unit;
  return Array.isArray(units) ? units : [];
}

function tdfSetSpecHasKey(setspec: any, key: 'speechAPIKey' | 'textToSpeechAPIKey') {
  return Boolean(setspec?.[key] && String(setspec[key]).trim());
}

function getFirstContentUnitType(units: any[]): FirstContentUnitType {
  for (const unit of units) {
    const unitType = detectTdfUnitType(unit);
    if (!unitType || unitType === 'instructions') {
      continue;
    }
    if (unitType === 'video' || unitType === 'autotutor' || unitType === 'assessment' || unitType === 'learning' || unitType === 'sparc') {
      return unitType;
    }
    return null;
  }
  return null;
}

function getDashboardFeatureUnitType(setspec: any, units: any[]): FirstContentUnitType {
  if (Array.isArray(setspec?.condition) && setspec.condition.length > 0) {
    return 'conditionPool';
  }
  return getFirstContentUnitType(units);
}

function unitHasConfigurableRuntime(unit: any): boolean {
  const unitType = detectTdfUnitType(unit);
  return unitType === 'learning' || unitType === 'autotutor' || unitType === 'sparc';
}

function unitHasLearnerConfigurableFields(unit: any): boolean {
  return LEARNER_TDF_FIELD_DEFINITIONS.some((field) => (
    field.scope === 'unit' && learnerTdfFieldAppliesToUnit(field, unit)
  ));
}

function buildPracticeDashboardLesson(
  userId: string,
  tdf: any,
  stats: DashboardTdfStats | undefined,
  learnerConfig: LearnerTdfConfig | null,
  hasSpeechAPIKey: boolean,
  hasTTSAPIKey: boolean,
  hasAdminSpeechAPIKey: boolean,
  hasAdminTTSAPIKey: boolean
): PracticeDashboardSnapshotLesson | null {
  const TDFId = normalizeOptionalString(tdf?._id);
  const tdfObject = tdf?.content;
  const setspec = tdfObject?.tdfs?.tutor?.setspec;
  if (!TDFId || !setspec) return null;
  const units = getTutorUnits(tdfObject);

  const fileName = resolveDashboardTdfFileName(tdf);
  const displayName = normalizeOptionalString(setspec.lessonname) || fileName || TDFId;
  const totalPracticeItems = null;
  const statsProjection = buildDashboardStatsProjection(stats, totalPracticeItems);
  const conditions = tdf.ownerId === userId && Array.isArray(setspec.condition) && setspec.condition.length > 0
    ? (setspec.condition as string[]).map((conditionFileName: string, index: number) => ({
        fileName: conditionFileName,
        tdfId: Array.isArray(setspec.conditionTdfIds) && typeof setspec.conditionTdfIds[index] === 'string'
          ? setspec.conditionTdfIds[index]
          : null,
        count: Array.isArray(tdf.conditionCounts) && typeof tdf.conditionCounts[index] === 'number'
          ? tdf.conditionCounts[index]
          : 0
      }))
    : null;

  return {
    TDFId,
    displayName,
    fileName: fileName || '',
    tags: Array.isArray(setspec.tags) ? setspec.tags : [],
    availability: 'available',
    currentStimuliSetId: tdf.stimuliSetId ?? null,
    learnerConfig,
    completed: false,
    locked: false,
    hidden: false,
    audioInputEnabled: String(setspec.audioInputEnabled || '').toLowerCase() === 'true',
    enableAudioPromptAndFeedback: String(setspec.enableAudioPromptAndFeedback || '').toLowerCase() === 'true',
    hasSpeechAPIKey: hasSpeechAPIKey || hasAdminSpeechAPIKey || tdfSetSpecHasKey(setspec, 'speechAPIKey'),
    hasTTSAPIKey: hasTTSAPIKey || hasAdminTTSAPIKey || tdfSetSpecHasKey(setspec, 'textToSpeechAPIKey'),
    firstContentUnitType: getDashboardFeatureUnitType(setspec, units),
    hasConfigurableSettings: units.some(unitHasConfigurableRuntime),
    hasLearnerConfigurableSettings: units.some(unitHasLearnerConfigurableFields),
    isMultiTdf: Boolean(tdfObject.isMultiTdf),
    isOwner: tdf.ownerId === userId,
    conditions,
    ...statsProjection
  };
}

export function createDashboardPracticeSnapshotMethods(deps: DashboardPracticeSnapshotDeps) {
  return {
    getPracticeDashboardSnapshot: async function(this: any) {
      if (!this.userId) {
        throw new deps.Meteor.Error('not-authorized', 'Must be logged in');
      }

      const userId = this.userId;
      const [{ tdfs, hasSpeechAPIKey, hasTTSAPIKey, hasAdminSpeechAPIKey, hasAdminTTSAPIKey }, cache] = await Promise.all([
        getDashboardVisibleTdfs(deps, userId),
        deps.UserDashboardCache.findOneAsync({ userId })
      ]);

      const conditionChildFileNames = new Set<string>();
      const conditionChildIds = new Set<string>();
      for (const tdf of tdfs) {
        const setspec = tdf?.content?.tdfs?.tutor?.setspec || {};
        const conditions = Array.isArray(setspec.condition) ? setspec.condition : [];
        const conditionTdfIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
        for (const condition of conditions) {
          const normalized = normalizeOptionalString(condition);
          if (normalized) conditionChildFileNames.add(normalized);
        }
        for (const conditionTdfId of conditionTdfIds) {
          const normalized = normalizeOptionalString(conditionTdfId);
          if (normalized) conditionChildIds.add(normalized);
        }
      }

      const lessons: PracticeDashboardSnapshotLesson[] = [];
      for (const tdf of tdfs) {
        const TDFId = normalizeOptionalString(tdf?._id);
        const fileName = resolveDashboardTdfFileName(tdf);
        if (!TDFId) continue;
        if (conditionChildIds.has(TDFId) || (fileName && conditionChildFileNames.has(fileName))) {
          continue;
        }
        const lesson = buildPracticeDashboardLesson(
          userId,
          tdf,
          cache?.tdfStats?.[TDFId],
          cache?.learnerTdfConfigs?.[TDFId] || null,
          hasSpeechAPIKey,
          hasTTSAPIKey,
          hasAdminSpeechAPIKey,
          hasAdminTTSAPIKey
        );
        if (lesson && !lesson.hidden) {
          lessons.push(lesson);
        }
      }

      return {
        version: PRACTICE_DASHBOARD_SNAPSHOT_VERSION,
        userId,
        generatedAt: Date.now(),
        lessons
      };
    }
  };
}

export function buildLearnerTdfConfigForDashboard(tdf: any, tdfId: string, configPatch: any) {
  return buildLearnerTdfConfig(getTdfConfigSource(tdf), tdfId, configPatch);
}

export function getDashboardTdfConfigSource(tdf: any) {
  return getTdfConfigSource(tdf);
}
