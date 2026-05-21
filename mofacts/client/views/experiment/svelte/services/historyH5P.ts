import { isSelfHostedH5PDisplay } from '../../../../../common/lib/h5pDisplay';
import { normalizeH5PTrialResult } from '../../../../../common/lib/h5pTrialResult';
import type { H5PTrialResult, HistoryRecord } from '../../../../../common/types';

type InsertHistoryRecord = (answerLogRecord: HistoryRecord) => Promise<void>;

export function resolveH5PResultForHistory(
  display: Record<string, unknown> | undefined,
  result: H5PTrialResult | null | undefined
): H5PTrialResult | null {
  if (!isSelfHostedH5PDisplay(display)) {
    return null;
  }

  const h5p = display?.h5p as Record<string, unknown> | undefined;
  if (!result) {
    throw new Error('[History Logging] H5P result missing before history write');
  }
  return normalizeH5PTrialResult(result, String(h5p?.contentId || ''));
}

export function applyH5PSummaryToRecord(record: HistoryRecord, batch: H5PTrialResult): void {
  record.h5p = {
    contentId: batch.contentId,
    library: batch.library,
    widgetType: batch.widgetType,
    eventType: 'summary',
    completed: batch.completed === true,
    passed: batch.passed,
    score: batch.score,
    maxScore: batch.maxScore,
    scaledScore: batch.scaledScore,
    response: batch.responseSummary,
  };
}

export async function insertH5PHistoryRows(
  baseRecord: HistoryRecord,
  batch: H5PTrialResult,
  insertHistoryRecord: InsertHistoryRecord
): Promise<void> {
  const batchId = [
    baseRecord.TDFId,
    baseRecord.sessionID,
    baseRecord.levelUnit,
    baseRecord.levelUnitName,
    baseRecord.CFStimFileIndex,
    batch.contentId,
    baseRecord.problemStartTime,
  ].map((part) => String(part ?? '')).join('|');

  for (const [index, event] of batch.events.entries()) {
    const eventIndex = Number.isFinite(Number(event.eventIndex)) ? Number(event.eventIndex) : index;
    const isCorrect = event.correct === true;
    const row: HistoryRecord = {
      ...baseRecord,
      input: String(event.response ?? batch.responseSummary ?? ''),
      outcome: isCorrect ? 'correct' : 'incorrect',
      typeOfResponse: 'h5p',
      responseValue: String(event.response ?? ''),
      selection: 'h5p interaction',
      action: 'h5p interaction',
      eventType: 'h5p',
      responseDuration: Number(event.latencyMs) || baseRecord.responseDuration,
      h5p: {
        contentId: batch.contentId,
        library: batch.library,
        widgetType: batch.widgetType,
        eventType: 'part',
        subContentId: event.partId,
        targetId: event.targetId,
        targetLabel: event.targetLabel,
        label: event.label,
        batchId,
        eventIndex,
        completed: batch.completed === true,
        passed: batch.passed,
        score: batch.score,
        maxScore: batch.maxScore,
        scaledScore: batch.scaledScore,
        response: event.response,
        correct: isCorrect,
        timestamp: event.timestamp,
        latencyMs: event.latencyMs,
        idempotencyKey: `${batchId}|${eventIndex}`,
      },
    };
    await insertHistoryRecord(row);
  }
}
