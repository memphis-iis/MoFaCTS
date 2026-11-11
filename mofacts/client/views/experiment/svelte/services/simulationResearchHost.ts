import { Meteor } from 'meteor/meteor';
import { approvedSimulationBuild } from '../../../../../common/simulationBuildCatalog';
import { acceptsBridgeMessage, isRecord, ObservedState, validateBatch, type ObservationBatch, type BridgeMessage } from '../../../../../../packages/phet-monitor/protocol';
import { projectSimulationBindings, validateSimulationConfig } from '../../../../../../packages/phet-monitor/lesson';

export type SimulationEvidence = { attemptId: string; buildId: string; firstSequence: number; lastSequence: number; checkpointSequence: number };
export const SIMULATION_HOST_CONTEXT = 'sparc-simulation-host';
type PendingResearch = { batch: ObservationBatch; release: () => void };
const newTraceState = () => ({ failed: false, running: false, pending: [] as PendingResearch[] });
type Scope = { tdfId: string; pageKey: string; nodeId: string; buildId: string };
export type SimulationHostStatus = 'ready' | 'starting' | 'running' | 'stopped' | 'error';
export class SimulationResearchHost {
  private readonly build;
  private readonly config;
  private sessionId = '';
  private state = new ObservedState();
  private disposed = false;
  private failed = false;
  private ready = false;
  private lastFacts = '';
  private queuedBytes = 0;
  private readonly pendingBatches = new Map<string, string>();
  private work: Promise<void> = Promise.resolve();
  private traceWork: Promise<void> = Promise.resolve();
  private traceState = newTraceState();
  private lastReceived: { key: string; serialized: string; sequence: number } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly options: {
    iframe: HTMLIFrameElement; config: unknown; scope: Scope;
    status(value: SimulationHostStatus): void;
    monitoringError?(reason: string): void;
    observation(facts: Record<string, number | string | boolean | null>, evidence: SimulationEvidence): Promise<void>;
  }) {
    this.config = validateSimulationConfig(options.config);
    this.build = approvedSimulationBuild(Meteor.settings.public?.simulationBuilds, this.config.buildId);
    if (new URL(this.build.url).origin === window.location.origin) throw new Error('Simulation requires a separate origin');
    window.addEventListener('message', this.receive);
    options.iframe.addEventListener('load', this.loaded);
  }
  async initialize(): Promise<void> {
    await Meteor.callAsync('interruptSimulationResearchActivity', this.options.scope);
    if (!this.disposed) this.options.status('ready');
  }
  async start(): Promise<void> {
    if (this.disposed) return;
    this.options.status('starting');
    const result = await Meteor.callAsync('startSimulationResearchAttempt', this.options.scope) as { attemptId: string };
    if (this.disposed) { await Meteor.callAsync('endSimulationResearchAttempt', result.attemptId, 'left-node'); return; }
    this.sessionId = result.attemptId;
    this.failed = false; this.ready = false; this.state = new ObservedState(); this.lastFacts = '';
    // An explicit new attempt owns a fresh pipeline. A timed-out request from
    // the previous attempt may still settle, but cannot block or stop this one.
    this.work = Promise.resolve(); this.traceWork = Promise.resolve(); this.traceState = newTraceState(); this.lastReceived = undefined; this.queuedBytes = 0; this.pendingBatches.clear();
    if (this.timer) clearTimeout(this.timer);
    // Readiness has a deadline. A ready, idle simulation needs no heartbeat:
    // observations arrive through notifications and delivery has its own ACK deadline.
    this.timer = setTimeout(() => this.stop('transport-timeout'), 10000);
    this.options.iframe.src = this.build.url;
  }
  private post(kind: 'initialize' | 'ack' | 'stop', data: unknown): void {
    this.options.iframe.contentWindow?.postMessage({ protocol: 'phet-research', version: 2,
      buildId: this.build.id, sessionId: this.sessionId, kind, data }, new URL(this.build.url).origin);
  }
  private loaded = (): void => {
    if (!this.sessionId || this.disposed || this.failed) return;
    if (this.ready) { this.stop('simulation-reloaded'); return; }
    this.post('initialize', {});
  };
  private receive = (event: MessageEvent): void => {
    if (this.disposed || this.failed || !this.sessionId || !acceptsBridgeMessage(event, {
      origin: new URL(this.build.url).origin, source: this.options.iframe.contentWindow,
      buildId: this.build.id, sessionId: this.sessionId,
    })) return;
    const message = event.data;
    // A delivery failure must interrupt even a stalled durable ingestion.
    if (message.kind === 'error') { this.stop('child-monitoring-error'); return; }
    let serialized: string;
    try { serialized = JSON.stringify(message); }
    catch { this.stop('invalid-message-serialization'); return; }
    const pendingKey = message.kind === 'batch' ? `${this.sessionId}:${(message.data as { firstSequence?: unknown })?.firstSequence}` : '';
    if (pendingKey && this.lastReceived?.key === pendingKey) {
      if (this.lastReceived.serialized !== serialized) this.stop('batch-content-conflict');
      else this.post('ack', { sequence: this.lastReceived.sequence });
      return;
    }
    if (pendingKey && this.pendingBatches.has(pendingKey)) {
      // The child retries until browser receipt ACK. An identical retry shares the
      // original in-flight transaction; conflicting content stops this attempt.
      if (this.pendingBatches.get(pendingKey) !== serialized) this.stop('batch-content-conflict');
      else if (isRecord(message.data) && typeof message.data.lastSequence === 'number' && message.data.lastSequence <= this.state.lastSequence) this.post('ack', { sequence: message.data.lastSequence });
      return;
    }
    const bytes = serialized.length * 2;
    if (this.queuedBytes + bytes > 32 * 1024 * 1024) { this.stop('host-queue-overflow'); return; }
    if (pendingKey) this.pendingBatches.set(pendingKey, serialized);
    this.queuedBytes += bytes;
    const session = this.sessionId;
    let writing = false;
    const release = () => {
      if (session !== this.sessionId) return;
      this.queuedBytes -= bytes; if (pendingKey) this.pendingBatches.delete(pendingKey);
    };
    this.work = this.work.then(async () => {
      if (this.disposed || this.failed || session !== this.sessionId) return;
      const deadline = setTimeout(() => {
        if (!this.disposed && !this.failed && session === this.sessionId) this.stop('transport-timeout');
      }, 10000);
      try { await this.process(message, batch => { writing = true; this.persist(batch, release); }); } finally { clearTimeout(deadline); }
    }).catch(error => {
      if (this.disposed || this.failed || session !== this.sessionId) return;
      this.options.monitoringError?.(error instanceof Error ? error.message : 'Observation processing failed');
      this.stop('processing-failed');
    }).finally(() => {
      if (!writing) release();
    });
  };
  private async process(message: BridgeMessage, persist: (batch: ObservationBatch) => void): Promise<void> {
    if (message.kind === 'error') { this.stop('child-monitoring-error'); return; }
    if (message.kind === 'ready') {
      if (this.ready) { this.stop('duplicate-readiness'); return; }
      if (!isRecord(message.data) || message.data.evidenceComplete !== true || message.data.scope !== 'initialized-screen-models') {
        this.stop('incomplete-readiness'); return;
      }
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.ready = true; this.options.status('running'); return;
    }
    if (message.kind !== 'batch' || !this.ready) return;
    const sessionId = this.sessionId;
    const batch = validateBatch(message.data);
    if (batch.lastSequence <= this.state.lastSequence) throw new Error('Unexpected historical batch retry');
    // Retain raw evidence even when projection rejects a required binding or
    // the stream contains an explicit terminal monitoring error.
    persist(batch);
    const observations: { facts: Record<string, number | string | boolean | null>; evidence: SimulationEvidence }[] = [];
    let start = 0;
    for (let index = 0; index < batch.records.length; index++) {
      const record = batch.records[index]!;
      if (record.type !== 'checkpoint' && index !== batch.records.length - 1) continue;
      const records = batch.records.slice(start, index + 1);
      this.state.apply({ firstSequence: records[0]!.sequence, lastSequence: record.sequence, records });
      start = index + 1;
      if (record.type === 'checkpoint') {
        const facts = projectSimulationBindings(this.state, this.config.bindings);
        const signature = JSON.stringify(facts);
        if (signature !== this.lastFacts) {
          this.lastFacts = signature;
          observations.push({ facts, evidence: { attemptId: this.sessionId, buildId: this.build.id,
            firstSequence: batch.firstSequence, lastSequence: batch.lastSequence, checkpointSequence: record.sequence } });
        }
      }
    }
    if (!this.state.complete) throw new Error('Incomplete observation evidence');
    const key = `${this.sessionId}:${batch.firstSequence}`;
    this.lastReceived = { key, serialized: this.pendingBatches.get(key)!, sequence: batch.lastSequence };
    // Receipt acknowledges bounded browser ownership, independently of storage.
    this.post('ack', { sequence: batch.lastSequence });
    for (const observation of observations) {
      if (this.disposed || this.failed || sessionId !== this.sessionId) return;
      await this.options.observation(observation.facts, observation.evidence);
    }
  }
  private persist(batch: ObservationBatch, release: () => void): void {
    const session = this.sessionId, trace = this.traceState;
    trace.pending.push({ batch, release });
    if (trace.running) return;
    trace.running = true;
    this.traceWork = (async () => {
      while (trace.pending.length && !trace.failed) {
        // Each pending storage group gets a coalescing window. This bounds
        // sustained request rate as well as the first burst. Only queued data
        // starts this timer; observation delivery remains independent.
        await new Promise(resolve => setTimeout(resolve, 100));
        const group: PendingResearch[] = [], records: ObservationBatch['records'] = [];
        let bytes = 0;
        while (trace.pending.length) {
          const next = trace.pending[0]!;
          const size = new TextEncoder().encode(JSON.stringify(next.batch)).length;
          if (group.length && (records.length + next.batch.records.length > 4000 || bytes + size > 1024 * 1024)) break;
          trace.pending.shift(); group.push(next); records.push(...next.batch.records); bytes += size;
        }
        const merged = { firstSequence: records[0]!.sequence, lastSequence: records[records.length - 1]!.sequence, records };
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            Meteor.callAsync('ingestSimulationResearchBatch', session, merged) as Promise<{ sequence: number; complete: boolean }>,
            new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Research storage deadline exceeded')), 10000); }),
          ]);
          if (!result.complete || result.sequence !== merged.lastSequence) throw new Error('Incomplete durable research evidence');
        } finally {
          if (deadline) clearTimeout(deadline);
          group.forEach(item => item.release());
        }
      }
    })().catch(error => {
      trace.failed = true;
      if (this.disposed || session !== this.sessionId) return;
      this.options.monitoringError?.(error instanceof Error ? error.message : 'Research storage failed');
      this.stop('incomplete-durable-evidence');
    }).finally(() => {
      trace.running = false;
      trace.pending.splice(0).forEach(item => item.release());
    });
  }

  stop(reason: string): void {
    if (this.failed) return;
    this.failed = true;
    this.options.monitoringError?.(reason);
    if (this.timer) clearTimeout(this.timer);
    this.post('stop', { reason });
    this.options.iframe.src = 'about:blank';
    const session = this.sessionId, trace = this.traceState;
    // Flush accepted records on departure before closing their research attempt.
    // Each write has a deadline; failure marks the attempt incomplete.
    if (session) void this.traceWork.then(() => Meteor.callAsync('endSimulationResearchAttempt', session,
      trace.failed ? 'incomplete-durable-evidence' : reason)).catch(() => {
      // Durable interruption is also enforced before the next explicit start.
    });
    if (!this.disposed) this.options.status('stopped');
  }
  dispose(): void {
    this.disposed = true; this.stop('left-node');
    window.removeEventListener('message', this.receive);
    this.options.iframe.removeEventListener('load', this.loaded);
    this.options.iframe.src = 'about:blank';
  }
}
