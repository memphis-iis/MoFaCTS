import {
  assertModelPracticeHistoryIdentity,
  createStimulusKey,
  isBlankIdentityValue,
} from '../../common/historyEnvelope';

type UnknownRecord = Record<string, unknown>;

export type StimulusCrowdStatsDocument = {
  stimulusKey: string;
  stimuliSetId: string | number;
  stimulusKC: string | number;
  KCId: string | number;
  clusterKC?: string | number;
  correctCount: number;
  incorrectCount: number;
  totalCount: number;
  lastOutcomeAt: number;
  updatedAt: Date;
};

export type StimulusCrowdStatsCollection = {
  upsertAsync: (selector: UnknownRecord, modifier: UnknownRecord) => Promise<unknown>;
  find: (selector: UnknownRecord, options?: UnknownRecord) => { fetchAsync: () => Promise<StimulusCrowdStatsDocument[]> };
};

function normalizeOutcome(value: unknown): 'correct' | 'incorrect' | null {
  return value === 'correct' || value === 'incorrect' ? value : null;
}

function isCountablePracticeEvent(record: UnknownRecord): boolean {
  return isBlankIdentityValue(record.eventType);
}

function isTimeoutResponse(record: UnknownRecord): boolean {
  return record.conditionTypeD === 'timeout' ||
    record.source === 'timeout' ||
    record.action === '[timeout]';
}

export function shouldRecordStimulusCrowdOutcome(record: UnknownRecord): boolean {
  if (record.levelUnitType !== 'model') {
    return false;
  }
  if (!isCountablePracticeEvent(record)) {
    return false;
  }
  if (isTimeoutResponse(record)) {
    return false;
  }
  return normalizeOutcome(record.outcome) !== null;
}

function identityValue(value: unknown, fieldName: string): string | number {
  if (isBlankIdentityValue(value)) {
    throw new Error(`Stimulus crowd stats record missing ${fieldName}`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return String(value);
}

function getLastOutcomeAt(record: UnknownRecord): number {
  const numeric = Number(record.recordedServerTime);
  if (!Number.isFinite(numeric)) {
    throw new Error('Stimulus crowd stats record missing recordedServerTime');
  }
  return numeric;
}

export async function recordStimulusCrowdOutcome(
  StimulusCrowdStats: Pick<StimulusCrowdStatsCollection, 'upsertAsync'>,
  record: UnknownRecord
): Promise<boolean> {
  if (!shouldRecordStimulusCrowdOutcome(record)) {
    return false;
  }

  assertModelPracticeHistoryIdentity(record);
  const outcome = normalizeOutcome(record.outcome);
  if (!outcome) {
    return false;
  }

  const stimuliSetId = identityValue(record.stimuliSetId, 'stimuliSetId');
  const stimulusKC = identityValue(record.stimulusKC, 'stimulusKC');
  const KCId = identityValue(record.KCId, 'KCId');
  const clusterKC = isBlankIdentityValue(record.clusterKC)
    ? undefined
    : identityValue(record.clusterKC, 'clusterKC');
  const stimulusKey = createStimulusKey({ stimuliSetId, stimulusKC });

  await StimulusCrowdStats.upsertAsync(
    { stimulusKey },
    {
      $setOnInsert: {
        stimulusKey,
        stimuliSetId,
        stimulusKC,
        KCId,
        ...(clusterKC === undefined ? {} : { clusterKC }),
      },
      $inc: {
        correctCount: outcome === 'correct' ? 1 : 0,
        incorrectCount: outcome === 'incorrect' ? 1 : 0,
        totalCount: 1,
      },
      $set: {
        lastOutcomeAt: getLastOutcomeAt(record),
        updatedAt: new Date(),
      },
    }
  );
  return true;
}

export function buildStimulusCrowdStatKeys(
  stimuliSetId: string | number,
  stimulusKCs: Array<string | number>
): string[] {
  return Array.from(new Set(stimulusKCs.map((stimulusKC) => createStimulusKey({ stimuliSetId, stimulusKC }))));
}
