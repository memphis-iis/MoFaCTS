export type RuntimeStimulus = Record<string, any> & {
  clusterKC?: unknown;
  stimulusKC?: unknown;
};

export type RuntimeStimulusCluster = {
  shufIndex: number;
  clusterIndex: number;
  clusterKC?: unknown;
  stims: RuntimeStimulus[];
};

type RawStimulus = Record<string, any> & {
  response?: { correctResponse?: unknown; incorrectResponses?: unknown };
  display?: Record<string, unknown>;
  parameter?: unknown;
};

type RawStimulusCluster = Record<string, any> & { clusterKC?: unknown; stims?: RawStimulus[] };

export interface RuntimeStimulusSource {
  readonly tdfFile: any;
  readonly currentStimuliSet: unknown;
  readonly currentStimuliSetId: unknown;
  readonly currentTdfId?: unknown;
  readonly currentTdfDoc?: any;
  readonly findTdfDocument?: (tdfId: string) => any | null;
}

function documentClusters(document: any): RawStimulusCluster[] | null {
  const clusters = document?.rawStimuliFile?.setspec?.clusters;
  return Array.isArray(clusters) ? clusters : null;
}

function resolveRawClusters(source: RuntimeStimulusSource): RawStimulusCluster[] {
  const direct = documentClusters(source.tdfFile);
  if (direct) return direct;
  const tdfId = typeof source.currentTdfId === 'string' ? source.currentTdfId.trim() : '';
  const canonical = source.currentTdfDoc ?? (tdfId ? source.findTdfDocument?.(tdfId) : null);
  const canonicalClusters = documentClusters(canonical);
  if (canonicalClusters) return canonicalClusters;
  throw new Error(
    `[Unit Engine] Current TDF ${String(source.currentTdfId ?? '')} is missing rawStimuliFile.setspec.clusters; refusing numeric clusterKC fallback.`,
  );
}

function requireStimuliSetId(value: unknown): string | number {
  if (value === undefined || value === null || value === '') {
    throw new Error('Nested stimulus identity generation requires stimuliSetId');
  }
  return typeof value === 'number' ? value : String(value);
}

function createRuntimeStimulus(params: {
  rawCluster: RawStimulusCluster;
  rawStim: RawStimulus;
  flatStim?: RuntimeStimulus;
  stimuliSetId: unknown;
  clusterIndex: number;
  stimIndex: number;
}): RuntimeStimulus {
  const clusterKC = params.rawCluster.clusterKC ?? params.flatStim?.clusterKC;
  if (clusterKC === undefined || clusterKC === null || clusterKC === '') {
    throw new Error(`Nested stimulus cluster ${params.clusterIndex} is missing clusterKC`);
  }
  const stimuliSetId = requireStimuliSetId(params.stimuliSetId);
  const stimulusKC = params.rawStim.stimulusKC
    ?? params.flatStim?.stimulusKC
    ?? `${String(stimuliSetId)}:${params.clusterIndex}:${params.stimIndex}`;
  return {
    ...(params.flatStim ?? {}),
    stimuliSetId: params.flatStim?.stimuliSetId ?? stimuliSetId,
    stimulusKC,
    clusterKC,
    params: params.rawStim.parameter ?? params.flatStim?.params,
    correctResponse: params.rawStim.response?.correctResponse ?? params.flatStim?.correctResponse,
    incorrectResponses: params.rawStim.response?.incorrectResponses ?? params.flatStim?.incorrectResponses,
    clozeStimulus: params.rawStim.display?.clozeText ?? params.rawStim.display?.clozeStimulus ?? params.flatStim?.clozeStimulus,
    textStimulus: params.rawStim.display?.text ?? params.rawStim.display?.textStimulus ?? params.flatStim?.textStimulus ?? '',
    audioStimulus: params.rawStim.display?.audioSrc ?? params.flatStim?.audioStimulus,
    imageStimulus: params.rawStim.display?.imgSrc ?? params.flatStim?.imageStimulus,
    videoStimulus: params.rawStim.display?.videoSrc ?? params.flatStim?.videoStimulus,
    display: params.rawStim.display ?? params.flatStim?.display,
    autoTutor: params.rawStim.autoTutor ?? params.flatStim?.autoTutor,
    alternateDisplays: params.rawStim.alternateDisplays ?? params.flatStim?.alternateDisplays,
  };
}

export function interpretRuntimeStimulusClusters(source: RuntimeStimulusSource): RuntimeStimulusCluster[] {
  const rawClusters = resolveRawClusters(source);
  const flatStimuli = Array.isArray(source.currentStimuliSet)
    ? source.currentStimuliSet.filter((stim): stim is RuntimeStimulus => Boolean(stim) && typeof stim === 'object' && !Array.isArray(stim))
    : [];
  let flatIndex = 0;
  return rawClusters.map((rawCluster, clusterIndex) => {
    if (!Array.isArray(rawCluster?.stims)) throw new Error(`Nested stimulus cluster ${clusterIndex} is missing stims`);
    const clusterKC = rawCluster.clusterKC ?? flatStimuli[flatIndex]?.clusterKC;
    const stims = rawCluster.stims.map((rawStim, stimIndex) => {
      const flatStim = flatStimuli[flatIndex];
      flatIndex += 1;
      return createRuntimeStimulus({
        rawCluster,
        rawStim,
        ...(flatStim ? { flatStim } : {}),
        stimuliSetId: source.tdfFile?.stimuliSetId ?? source.currentStimuliSetId,
        clusterIndex,
        stimIndex,
      });
    });
    return { shufIndex: clusterIndex, clusterIndex, clusterKC, stims };
  });
}

export function collectCurrentStimulusAnswers(stimuli: unknown): string[] {
  if (!Array.isArray(stimuli)) return [];
  const answers: string[] = [];
  for (const stimulus of stimuli) {
    const correctResponse = (stimulus as Record<string, unknown>)?.correctResponse;
    if (typeof correctResponse !== 'string') continue;
    const correctBranch = correctResponse.toLowerCase().split(';')
      .find((entry) => !entry.includes('incorrect'));
    const answer = correctBranch?.split('~')[0];
    if (answer && !answers.includes(answer)) answers.push(answer);
  }
  return answers;
}

export function resolveStimulusAnswerDisplayCase(userAnswer: string, stimuli: unknown): string {
  if (!userAnswer || !Array.isArray(stimuli)) return userAnswer;
  const normalized = userAnswer.trim().toLowerCase();
  for (const stimulus of stimuli) {
    const correctResponse = (stimulus as Record<string, unknown>)?.correctResponse;
    if (typeof correctResponse !== 'string') continue;
    for (const branch of correctResponse.split(';')) {
      if (branch.toLowerCase().includes('incorrect')) continue;
      for (const alternative of (branch.split('~')[0] ?? '').split('|')) {
        const trimmed = alternative.trim();
        if (trimmed.toLowerCase() === normalized) return trimmed;
      }
    }
  }
  return userAnswer;
}
