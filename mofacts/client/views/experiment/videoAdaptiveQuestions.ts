export interface AdaptiveVideoCheckpoint {
  time?: unknown;
}

export interface AdaptiveVideoQuestionScheduleItem {
  clusterIndex?: unknown;
}

export interface AdaptiveVideoSession {
  questions?: unknown;
  questiontimes?: unknown;
  checkpointBehavior?: unknown;
  checkpoints?: AdaptiveVideoCheckpoint[];
}

export interface AdaptiveVideoUnit {
  unitname?: unknown;
  videosession?: AdaptiveVideoSession;
}

export function requireAdaptiveVideoSession(unit: AdaptiveVideoUnit | null | undefined): AdaptiveVideoSession {
  if (!unit) {
    throw new Error('Adaptive modifyUnit target unit is missing');
  }
  if (!unit.videosession) {
    const unitName = typeof unit.unitname === 'string' ? unit.unitname : '';
    throw new Error(`Adaptive modifyUnit only supports video-session targets; unit "${unitName}" has no videosession`);
  }
  return unit.videosession;
}

function ensureAdaptiveVideoQuestionArrays(videoSession: AdaptiveVideoSession) {
  if (!Array.isArray(videoSession.questions)) {
    videoSession.questions = [];
  }
  if (!Array.isArray(videoSession.questiontimes)) {
    videoSession.questiontimes = [];
  }
}

export function appendAdaptiveVideoCheckpoints(
  videoSession: AdaptiveVideoSession,
  checkpoints: AdaptiveVideoCheckpoint[],
) {
  if (videoSession.checkpointBehavior !== 'adaptive' || checkpoints.length === 0) {
    return;
  }
  if (!Array.isArray(videoSession.checkpoints)) {
    videoSession.checkpoints = [];
  }
  for (const checkpoint of checkpoints) {
    const checkpointTime = Number(checkpoint?.time);
    if (!Number.isFinite(checkpointTime)) {
      throw new Error('Adaptive checkpoint is missing a valid time');
    }
    const exists = videoSession.checkpoints.some((existing) =>
      Number(existing?.time) === checkpointTime
    );
    if (!exists) {
      videoSession.checkpoints.push({ time: checkpointTime });
    }
  }
  videoSession.checkpoints.sort((a, b) => Number(a.time) - Number(b.time));
}

export function appendAdaptiveVideoQuestions(
  videoSession: AdaptiveVideoSession,
  questions: unknown[],
  when: unknown,
  ruleLabel: string,
) {
  ensureAdaptiveVideoQuestionArrays(videoSession);
  if (questions.length > 0 && (when === null || when === undefined || !Number.isFinite(Number(when)))) {
    throw new Error(`Adaptive video rule "${ruleLabel}" produced questions without a valid AT time`);
  }
  for (const question of questions) {
    const clusterIndex = Number(question);
    if (!Number.isInteger(clusterIndex)) {
      throw new Error(`Adaptive video rule "${ruleLabel}" produced an invalid question index`);
    }
    (videoSession.questions as number[]).push(clusterIndex);
    (videoSession.questiontimes as number[]).push(Number(when));
  }
}

export function applyAdaptiveVideoTemplateSchedule(options: {
  unit: AdaptiveVideoUnit;
  schedule: AdaptiveVideoQuestionScheduleItem[];
  adaptiveQuestionTimes: unknown[];
  adaptiveQuestions?: unknown[] | null;
  adaptiveCheckpoints?: AdaptiveVideoCheckpoint[] | null;
}) {
  const videoSession = options.unit.videosession;
  if (!videoSession) {
    return false;
  }
  if (!Array.isArray(videoSession.questiontimes)) {
    throw new Error('Adaptive video template requires videosession.questiontimes before scheduling');
  }

  const sortedSchedule = [...options.schedule].sort((a, b) =>
    Number((videoSession.questiontimes as unknown[])[Number(a.clusterIndex)]) -
    Number((videoSession.questiontimes as unknown[])[Number(b.clusterIndex)])
  );

  ensureAdaptiveVideoQuestionArrays(videoSession);
  if (options.adaptiveQuestions) {
    (videoSession.questions as unknown[]).push(...options.adaptiveQuestions);
  } else {
    for (const item of sortedSchedule) {
      (videoSession.questions as unknown[]).push(item.clusterIndex);
    }
  }
  (videoSession.questiontimes as unknown[]).push(...options.adaptiveQuestionTimes);
  appendAdaptiveVideoCheckpoints(videoSession, options.adaptiveCheckpoints || []);
  return true;
}
