import { isRecord, ObservedState, type ObservationBatch, type TraceRecord } from './protocol.ts';
import { projectSimulationBindings, type SimulationBinding } from './lesson.ts';
import type { SimulationActivityHistory } from '../../learning-components/runtime/simulationActivityHistory';

type Facts = Record<string, number | string | boolean | null>;
export type SimulationEvidence = { attemptId: string; buildId: string; firstSequence: number; lastSequence: number; checkpointSequence: number; sourceSequence: number };
export type SimulationObservation = { facts: Facts; evidence: SimulationEvidence; activity: SimulationActivityHistory };
type Pending = { record: TraceRecord; name: string; binding?: string; previous: Facts; origin: 'input' | 'observation'; values?: Record<string, unknown>; count?: number };

/** Reads reconstructed event state only. Never reads or periodically inspects a simulation model. */
export class SimulationActivityProjector {
  private previous: Facts = {};
  private signature = '';
  private readonly active = new Map<string, { previous: Facts; trusted: boolean }>();
  private readonly resets = new Set<string>();
  private pending: Pending[] = [];
  initialValues: Record<string, unknown> | undefined;
  constructor(private readonly bindings: readonly SimulationBinding[], private readonly buildId: string, private readonly attemptId: string) {}

  private bindingFor(stream: ObservedState, id: unknown): SimulationBinding | undefined {
    return this.bindings.find(binding => stream.findAddress(binding.address).some(([candidate]) => candidate === id));
  }

  apply(stream: ObservedState, batch: ObservationBatch): SimulationObservation[] {
    const observations: SimulationObservation[] = [];
    for (const record of batch.records) {
      const binding = record.type === 'sample' && record.data.trigger === 'collection-mutation' ? this.bindingFor(stream, record.data.id) : undefined;
      const priorFields = binding ? stream.states.get(record.data.id as string)?.fields : undefined;
      stream.apply({ firstSequence: record.sequence, lastSequence: record.sequence, records: [record] });
      if (record.type === 'interaction') {
        const data = record.data, key = String(data.controlId);
        if (data.phase === 'start') {
          this.active.set(key, { previous: { ...this.previous }, trusted: data.trusted === true });
          if (data.kind === 'reset') this.resets.add(key);
        } else {
          const start = this.active.get(key); this.active.delete(key);
          if (data.kind === 'reset') this.resets.delete(key);
          if (start) {
            const properties = Array.isArray(data.properties) ? data.properties.filter(isRecord) : [];
            const targets = this.bindings.filter(binding => stream.findAddress(binding.address).some(([id]) => id === data.propertyId || properties.some(property => property.id === id)));
            const target = targets.length === 1 ? targets[0] : undefined;
            if (data.kind === 'reset' || targets.length) {
              const previous = { ...start.previous };
              for (const binding of targets) {
                const ids = stream.findAddress(binding.address).map(([id]) => id);
                const property = properties.find(property => ids.includes(String(property.id)));
                if (property) previous[binding.name] = property.before as Facts[string];
                else if (ids.includes(String(data.propertyId))) previous[binding.name] = data.before as Facts[string];
              }
              this.pending.push({ record, name: data.kind === 'reset' ? 'reset' : data.phase === 'cancel' ? 'interaction-cancelled' : 'interaction-completed',
                ...(target ? { binding: target.name } : {}), previous,
                origin: start.trusted && data.trusted === true ? 'input' : 'observation' });
            }
          }
        }
      }
      if (binding?.projection === 'count' && isRecord(priorFields) && isRecord(record.data.state) && isRecord(record.data.state.fields) && !this.resets.size) {
        const next = record.data.state.fields;
        const members = (fields: Record<string, unknown>) => Object.entries(fields).filter(([key, value]) => /^\d+$/.test(key) && isRecord(value) && typeof value.ref === 'string').map(([, value]) => (value as { ref: string }).ref);
        const before = members(priorFields), after = members(next);
        for (const [name, ids] of [['collection-added', after.filter(id => !before.includes(id))], ['collection-removed', before.filter(id => !after.includes(id))]] as const) {
          if (ids.length) this.pending.push({ record, name, binding: binding.name, previous: { ...this.previous }, origin: 'observation', count: ids.length,
            values: { members: [...ids], countBefore: Number(priorFields.length), countAfter: Number(next.length) } });
        }
      }
      if (record.type !== 'checkpoint' || !stream.complete) continue;
      const facts = projectSimulationBindings(stream, this.bindings);
      const selected = Object.fromEntries(this.bindings.map(binding => [binding.name, { value: facts[binding.name], label: binding.label ?? binding.name, unit: binding.unit ?? '' }]));
      this.initialValues ??= selected;
      const pending = this.pending.splice(0);
      const reset = pending.some(event => event.name === 'reset');
      const emit = (event: Pending) => {
        const evidence = { attemptId: this.attemptId, buildId: this.buildId, firstSequence: event.record.sequence,
          lastSequence: record.sequence, checkpointSequence: record.sequence, sourceSequence: event.record.sequence };
        const previousFacts = Object.fromEntries(this.bindings.map(binding => [`previous_${binding.name}`, Object.hasOwn(event.previous, binding.name) ? event.previous[binding.name]! : null]));
        const values = Object.fromEntries(this.bindings.map(binding => [binding.name, { before: Object.hasOwn(event.previous, binding.name) ? event.previous[binding.name] : null, value: facts[binding.name], label: binding.label ?? binding.name, unit: binding.unit ?? '' }]));
        observations.push({ facts: { ...facts, ...previousFacts, simulationEvent: event.name, interactionBinding: event.binding ?? '', changeCount: event.count ?? 0 }, evidence,
          activity: { version: 1, recordRole: 'internal', buildId: this.buildId, attemptId: this.attemptId,
            sourceEventId: `${this.attemptId}:${event.record.sequence}:${event.name}`, origin: event.origin, eventName: event.name,
            values: { ...values, ...(event.values ?? {}) }, evidence } });
      };
      pending.forEach(emit);
      const signature = JSON.stringify(facts);
      if (!this.resets.size && !reset && signature !== this.signature) emit({ record, name: 'observation', previous: this.previous, origin: 'observation' });
      this.signature = signature; this.previous = facts;
    }
    return observations;
  }
}
