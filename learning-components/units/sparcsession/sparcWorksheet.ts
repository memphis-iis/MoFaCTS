import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import { withCanonicalHistorySchemaVersion } from '../../runtime/historyEnvelope';
import type { SparcTrialDisplay } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { sparcTrialDisplayAdapter } from '../../trial-displays/sparc/SparcTrialDisplayAdapter';
import { createSparcAuthoredDocumentFromTrialDisplay } from './sparcTrialDisplayRuntimeBridge';
import { resolveSparcClusterTarget } from './sparcAuthoredModelTargets';
import { processSparcResponseOutcome } from './sparcResponseOutcomeProcessor';
import type { SparcPracticeHistoryCore } from './sparcPracticeHistoryBridge';

type Node = Record<string, unknown>;
export type WorksheetConfig = {
  workDurationSeconds: number;
  reviewDurationSeconds: number;
  randomizeQuestions: boolean;
};
export type WorksheetEvent = {
  attemptId: string;
  checkpointIndex: number;
  sequence: number;
  writeId: string;
  kind: 'start' | 'answer' | 'review' | 'exposure' | 'complete';
  order?: string[];
  deadline?: number;
};
export type WorksheetQuestion = {
  id: string;
  node: Node;
  choices: Node[];
  expected: unknown;
};
export function worksheetEvent(record: CanonicalHistoryRecord): WorksheetEvent | undefined {
  return (record.sparc as { worksheet?: WorksheetEvent } | undefined)?.worksheet;
}
export function readWorksheetConfig(value: unknown): WorksheetConfig {
  const config = value as WorksheetConfig;
  if (!config || !Number.isFinite(config.workDurationSeconds) || config.workDurationSeconds <= 0
    || !Number.isFinite(config.reviewDurationSeconds) || config.reviewDurationSeconds <= 0
    || typeof config.randomizeQuestions !== 'boolean') {
    throw new Error('Worksheet requires positive work/review durations and Boolean randomizeQuestions');
  }
  return config;
}
function children(node: Node): Node[] { return (node.children as Node[] | undefined) ?? []; }
export function worksheetQuestions(display: SparcTrialDisplay): WorksheetQuestion[] {
  const normalized = sparcTrialDisplayAdapter.normalizeDisplay(display);
  const result = normalized.nodes.map((raw) => {
    const node = raw as Node;
    if (node.groupType !== 'multiple-choice') throw new Error('Worksheet questions must be TutorScript multiple-choice nodes');
    const choices = children(node).flatMap(children).filter((child) => child.atomType === 'button');
    const intents = normalized.response?.intentByNode ?? [];
    const expected = intents.find((intent) => intent.node === choices[0]?.id)?.expected;
    if (!node.id || !choices.length || expected === undefined || choices.some((choice) =>
      !Number.isInteger(choice.clusterIndex) || !intents.some((intent) => intent.node === choice.id))) {
      throw new Error('Worksheet question requires normal response and stimulus references');
    }
    return { id: String(node.id), node, choices, expected };
  });
  if (!result.length || result.length > 500 || new Set(result.map((question) => question.id)).size !== result.length) {
    throw new Error('Worksheet requires 1 to 500 distinct question IDs');
  }
  return result;
}

/** Shared fixed-question lifecycle. History is the only durable answer source. */
export class SparcWorksheet {
  readonly config: WorksheetConfig;
  readonly questions: WorksheetQuestion[];
  phase: 'work' | 'review' | 'complete' = 'work';
  deadline = 0;
  order: string[] = [];
  attemptId = '';
  closing = false;
  private sequence = 0;
  private queue: Promise<void> = Promise.resolve();
  private failure: unknown;
  private records: CanonicalHistoryRecord[] = [];
  private appearance: Promise<void> | undefined;
  private readonly display: SparcTrialDisplay;
  constructor(private readonly deps: {
    display: SparcTrialDisplay;
    core: SparcPracticeHistoryCore;
    checkpointIndex: number;
    now: () => number;
    id: () => string;
    random: () => number;
    write: (record: CanonicalHistoryRecord) => Promise<void>;
  }) {
    this.config = readWorksheetConfig(deps.display.worksheet);
    this.display = sparcTrialDisplayAdapter.normalizeDisplay(deps.display);
    if (!this.display.pageKey) throw new Error('Worksheet requires pageKey');
    this.questions = worksheetQuestions(this.display);
  }
  async initialize(history: readonly CanonicalHistoryRecord[]): Promise<void> {
    const scoped = history.filter((record) => {
      const event = worksheetEvent(record);
      return event?.checkpointIndex === this.deps.checkpointIndex
        && record.userId === this.deps.core.userId && record.TDFId === this.deps.core.TDFId
        && record.levelUnit === this.deps.core.levelUnit
        && (record.sparc as Node)?.pageKey === this.display.pageKey;
    });
    const starts = scoped.filter((record) => worksheetEvent(record)?.kind === 'start');
    if (starts.length > 1) throw new Error('Multiple worksheet starts in this scope require investigation');
    if (starts.length) {
      const start = starts[0]!;
      const event = worksheetEvent(start)!;
      this.attemptId = event.attemptId;
      this.order = [...event.order!];
      this.deadline = Number(event.deadline);
      // sessionID describes the original learning session, also after a reload.
      this.deps.core = { ...this.deps.core, sessionID: String(start.sessionID) };
      this.records = scoped.filter((record) => worksheetEvent(record)?.attemptId === this.attemptId)
        .sort((a, b) => worksheetEvent(a)!.sequence - worksheetEvent(b)!.sequence);
      const seen = new Set<number>();
      for (const record of this.records) {
        const entry = worksheetEvent(record)!;
        if (seen.has(entry.sequence)) throw new Error('Conflicting worksheet event sequence');
        seen.add(entry.sequence);
        this.sequence = Math.max(this.sequence, entry.sequence);
        if (entry.kind === 'review') { this.phase = 'review'; this.deadline = Number(entry.deadline); }
        if (entry.kind === 'complete') this.phase = 'complete';
      }
      if (!Number.isFinite(this.deadline) || this.order.length !== this.questions.length
        || new Set(this.order).size !== this.questions.length
        || this.order.some((id) => !this.questions.some((question) => question.id === id))) {
        throw new Error('Saved worksheet order or deadline is invalid');
      }
      return;
    }
    if (scoped.length) throw new Error('Worksheet history has no matching start');
    this.attemptId = this.deps.id();
    this.order = this.questions.map((question) => question.id);
    if (this.config.randomizeQuestions) {
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(this.deps.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
      }
    }
    this.deadline = this.deps.now() + this.config.workDurationSeconds * 1000;
    await this.save('start', { order: this.order, deadline: this.deadline });
  }
  private async save(kind: WorksheetEvent['kind'], extra: Partial<WorksheetEvent> = {}, answer?: CanonicalHistoryRecord) {
    const now = this.deps.now();
    const event: WorksheetEvent = { ...extra, attemptId: this.attemptId, checkpointIndex: this.deps.checkpointIndex,
      sequence: ++this.sequence, writeId: this.deps.id(), kind };
    const address = { pageKey: this.display.pageKey!, nodeId: 'root' };
    const record = answer ?? withCanonicalHistorySchemaVersion({ ...this.deps.core, levelUnitType: 'sparc',
      time: now, problemStartTime: now, selection: this.display.pageKey, action: `worksheet-${kind}`,
      outcome: 'unknown', typeOfResponse: 'sparc', responseValue: '', input: '', displayedStimulus: address,
      eventType: 'sparc', sparc: { pageKey: this.display.pageKey, sourceAddress: address } });
    record.sparc = { ...(record.sparc as Node), worksheet: event };
    await this.deps.write(record);
    this.records.push(record);
  }
  answer(nodeId: string): Promise<void> {
    if (this.phase !== 'work' || this.closing || this.deps.now() >= this.deadline) return Promise.resolve();
    const question = this.questions.find((item) => item.choices.some((choice) => choice.id === nodeId));
    const choice = question?.choices.find((item) => item.id === nodeId);
    if (!question || !choice) return Promise.reject(new Error('Unknown worksheet answer node'));
    const time = this.deps.now();
    return this.enqueue(async () => {
      const address = { pageKey: this.display.pageKey!, nodeId };
      const document = createSparcAuthoredDocumentFromTrialDisplay({ pageKey: address.pageKey, display: this.display });
      const processed = processSparcResponseOutcome(this.deps.core, {
        observationId: this.deps.id(), sourceAddress: address, time, problemStartTime: time,
        outcome: choice.value === question.expected ? 'correct' : 'incorrect', responseValue: choice.value,
        modelTarget: resolveSparcClusterTarget(document, Number(choice.clusterIndex), address),
      });
      // Intentionally save the canonical record without applying modelUpdateRequest.
      await this.save('answer', {}, processed.historyRecord);
    });
  }
  private enqueue(action: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => { if (this.failure) throw this.failure; await action(); });
    this.queue = next.catch((error: unknown) => { this.failure = error; });
    return next;
  }
  finishWork(): Promise<void> {
    if (this.phase !== 'work' || this.closing) return this.queue;
    this.closing = true;
    return this.enqueue(async () => {
      const deadline = this.deps.now() + this.config.reviewDurationSeconds * 1000;
      await this.save('review', { deadline });
      this.deadline = deadline; this.phase = 'review'; this.closing = false;
    });
  }
  feedbackAppeared(): Promise<void> {
    if (this.phase !== 'review') return Promise.resolve();
    this.appearance ??= this.enqueue(() => this.save('exposure'));
    return this.appearance;
  }
  complete(): Promise<void> {
    if (this.phase !== 'review' || this.closing) return this.queue;
    this.closing = true;
    return this.enqueue(async () => { await this.save('complete'); this.phase = 'complete'; this.closing = false; });
  }
  selection(question: WorksheetQuestion): Node | undefined {
    const answer = [...this.records].reverse().find((record) => worksheetEvent(record)?.kind === 'answer'
      && question.choices.some((choice) => choice.id === (record.sparc as { sourceAddress?: { nodeId?: string } })?.sourceAddress?.nodeId));
    return answer ? question.choices.find((choice) => choice.value === answer.responseValue) : undefined;
  }
}
