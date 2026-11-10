export const PHET_PROTOCOL = 'phet-research' as const;
export const PHET_PROTOCOL_VERSION = 1 as const;
export type TraceRecordType = 'catalog' | 'initial' | 'property' | 'event' | 'sample' | 'disposed' | 'detached' | 'checkpoint' | 'monitoring-error';
export type TraceRecord = {
  sequence: number; type: TraceRecordType; time: number; frame: number; order: number;
  data: Record<string, unknown>;
};
export type ObservationBatch = { firstSequence: number; lastSequence: number; records: TraceRecord[] };
export type BridgeMessage = {
  protocol: typeof PHET_PROTOCOL; version: typeof PHET_PROTOCOL_VERSION; buildId: string; sessionId: string;
  kind: 'initialize' | 'ready' | 'batch' | 'ack' | 'error' | 'stop'; data: unknown;
};
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
export const MAX_BATCH_RECORDS = 50000;
const recordTypes = new Set<TraceRecordType>(['catalog', 'initial', 'property', 'event', 'sample', 'disposed', 'detached', 'checkpoint', 'monitoring-error']);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateBatch(input: unknown): ObservationBatch {
  if (!isRecord(input) || !Number.isSafeInteger(input.firstSequence) || !Number.isSafeInteger(input.lastSequence)
      || !Array.isArray(input.records) || input.records.length < 1 || input.records.length > MAX_BATCH_RECORDS
      || (input.firstSequence as number) < 1 || input.lastSequence !== (input.firstSequence as number) + input.records.length - 1) {
    throw new Error('Invalid observation batch bounds');
  }
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_BATCH_BYTES) throw new Error('Observation batch exceeds byte limit');
  input.records.forEach((value: unknown, index: number) => {
    if (!isRecord(value) || value.sequence !== (input.firstSequence as number) + index
      || !recordTypes.has(value.type as TraceRecordType) || typeof value.time !== 'number' || !Number.isFinite(value.time)
      || !Number.isSafeInteger(value.frame) || (value.frame as number) < 0
      || !Number.isSafeInteger(value.order) || (value.order as number) < 1 || !isRecord(value.data)) {
      throw new Error('Invalid observation record');
    }
  });
  return input as ObservationBatch;
}
export function acceptsBridgeMessage(event: { origin: string; source: unknown; data: unknown }, expected: {
  origin: string; source: unknown; buildId: string; sessionId: string;
}): event is { origin: string; source: unknown; data: BridgeMessage } {
  const message = event.data;
  return event.origin === expected.origin && event.source === expected.source && isRecord(message)
    && message.protocol === PHET_PROTOCOL && message.version === PHET_PROTOCOL_VERSION
    && message.buildId === expected.buildId && message.sessionId === expected.sessionId
    && ['ready', 'batch', 'error'].includes(String(message.kind));
}

/** State reconstruction is deliberately narrower than physical simulation replay. */
export class ObservedState {
  private readonly catalogData = new Map<string, Record<string, unknown>>();
  readonly catalog: ReadonlyMap<string, Record<string, unknown>> = this.catalogData;
  private readonly paths = new Map<string, Set<string>>();
  private readonly tandems = new Map<string, Set<string>>();
  readonly states = new Map<string, Record<string, unknown>>();
  lastSequence = 0;
  lastOrder = 0;
  complete = true;
  private index(entry: Record<string, unknown>, id: string, add: boolean): void {
    for (const [address, index] of [[entry.path, this.paths], [entry.tandem, this.tandems]] as const) {
      if (typeof address !== 'string') continue;
      if (add) {
        let ids = index.get(address);
        if (!ids) { ids = new Set(); index.set(address, ids); }
        ids.add(id);
      } else {
        const ids = index.get(address); ids?.delete(id);
        if (ids?.size === 0) index.delete(address);
      }
    }
  }
  findAddress(address: { path?: string; tandem?: string }): [string, Record<string, unknown>][] {
    const ids = address.path ? this.paths.get(address.path) : this.tandems.get(address.tandem ?? '');
    return ids ? Array.from(ids, id => [id, this.catalogData.get(id)!]) : [];
  }
  apply(batch: ObservationBatch): void {
    if (!this.complete) throw new Error('Evidence already incomplete');
    if (batch.firstSequence !== this.lastSequence + 1) { this.complete = false; throw new Error('Observation sequence gap or duplicate'); }
    for (const record of batch.records) {
      if (record.order <= this.lastOrder) { this.complete = false; throw new Error('Observation order regression'); }
      this.lastOrder = record.order;
      this.lastSequence = record.sequence;
      const id = record.data.id;
      if (record.type === 'monitoring-error') { this.complete = false; continue; }
      if (record.type === 'checkpoint' && record.data.evidenceComplete !== true) this.complete = false;
      if (typeof id !== 'string') continue;
      if (record.type === 'catalog') {
        const previous = this.catalogData.get(id);
        if (previous) this.index(previous, id, false);
        this.catalogData.set(id, record.data); this.index(record.data, id, true);
      }
      if ((record.type === 'initial' || record.type === 'sample') && isRecord(record.data.state)) this.states.set(id, record.data.state);
      if (record.type === 'property' && Array.isArray(record.data.args)) this.states.set(id, { value: record.data.args[0] });
      if (record.type === 'disposed' || record.type === 'detached') {
        const previous = this.catalogData.get(id);
        if (previous) this.index(previous, id, false);
        this.catalogData.delete(id); this.states.delete(id);
      }
    }
  }
}
