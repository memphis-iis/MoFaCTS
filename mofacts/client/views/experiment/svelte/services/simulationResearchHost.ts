import { Meteor } from 'meteor/meteor';
import { approvedSimulationBuild } from '../../../../../common/simulationBuildCatalog';
import { acceptsBridgeMessage, isRecord, ObservedState, validateBatch, type BridgeMessage } from '../../../../../../packages/phet-monitor/protocol';
import { projectSimulationBindings, validateSimulationConfig } from '../../../../../../packages/phet-monitor/lesson';

export type SimulationEvidence = { attemptId: string; buildId: string; firstSequence: number; lastSequence: number; checkpointSequence: number };
export const SIMULATION_HOST_CONTEXT = 'sparc-simulation-host';
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
    this.work = Promise.resolve(); this.queuedBytes = 0; this.pendingBatches.clear();
    if (this.timer) clearTimeout(this.timer);
    // Readiness has a deadline. A ready, idle simulation needs no heartbeat:
    // observations arrive through notifications and delivery has its own ACK deadline.
    this.timer = setTimeout(() => this.stop('transport-timeout'), 10000);
    this.options.iframe.src = this.build.url;
  }
  private post(kind: 'initialize' | 'ack' | 'stop', data: unknown): void {
    this.options.iframe.contentWindow?.postMessage({ protocol: 'phet-research', version: 1,
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
    if (pendingKey && this.pendingBatches.has(pendingKey)) {
      // The child retries until durable ACK. An identical retry shares the
      // original in-flight transaction; conflicting content stops this attempt.
      if (this.pendingBatches.get(pendingKey) !== serialized) this.stop('batch-content-conflict');
      return;
    }
    const bytes = serialized.length * 2;
    if (this.queuedBytes + bytes > 32 * 1024 * 1024) { this.stop('host-queue-overflow'); return; }
    if (pendingKey) this.pendingBatches.set(pendingKey, serialized);
    this.queuedBytes += bytes;
    const session = this.sessionId;
    this.work = this.work.then(async () => {
      if (this.disposed || this.failed || session !== this.sessionId) return;
      const deadline = setTimeout(() => {
        if (!this.disposed && !this.failed && session === this.sessionId) this.stop('transport-timeout');
      }, 10000);
      try { await this.process(message); } finally { clearTimeout(deadline); }
    }).catch(error => {
      if (this.disposed || this.failed || session !== this.sessionId) return;
      this.options.monitoringError?.(error instanceof Error ? error.message : 'Observation processing failed');
      this.stop('processing-failed');
    }).finally(() => {
      if (session !== this.sessionId) return;
      this.queuedBytes -= bytes; if (pendingKey) this.pendingBatches.delete(pendingKey);
    });
  };
  private async process(message: BridgeMessage): Promise<void> {
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
    const acknowledgment = await Meteor.callAsync('ingestSimulationResearchBatch', sessionId, batch) as { sequence: number; complete: boolean };
    if (this.disposed || this.failed || sessionId !== this.sessionId) return;
    if (!acknowledgment.complete || acknowledgment.sequence !== batch.lastSequence) { this.stop('incomplete-durable-evidence'); return; }
    if (batch.lastSequence <= this.state.lastSequence) { this.post('ack', acknowledgment); return; }
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
    this.post('ack', acknowledgment);
    for (const observation of observations) {
      if (this.disposed || this.failed || sessionId !== this.sessionId) return;
      await this.options.observation(observation.facts, observation.evidence);
    }
  }
  stop(reason: string): void {
    if (this.failed) return;
    this.failed = true;
    this.options.monitoringError?.(reason);
    if (this.timer) clearTimeout(this.timer);
    this.post('stop', { reason });
    this.options.iframe.src = 'about:blank';
    if (this.sessionId) void Meteor.callAsync('endSimulationResearchAttempt', this.sessionId, reason).catch(() => {
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
