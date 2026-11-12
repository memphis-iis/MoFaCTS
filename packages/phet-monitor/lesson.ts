import { isRecord, ObservedState } from './protocol.ts';

export type SimulationBinding = {
  name: string;
  address: { path?: string; tandem?: string };
  projection: 'value' | 'count' | 'any-nonzero';
  memberProperty?: string;
  label?: string;
  unit?: string;
};
export type SimulationNodeConfig = { buildId: string; bindings: SimulationBinding[] };
const reserved = new Set(['pageKey', 'sourceNode', 'eventId', 'eventType', 'time', 'evidence', 'evidenceComplete', 'simulationActivity', 'simulationEvent', 'interactionBinding', 'changeCount', '__proto__', 'prototype', 'constructor']);

export function validateSimulationConfig(input: unknown): SimulationNodeConfig {
  if (!isRecord(input) || typeof input.buildId !== 'string' || !/^[a-z0-9.-]{1,160}$/.test(input.buildId)
    || !Array.isArray(input.bindings) || input.bindings.length < 1 || input.bindings.length > 32) throw new Error('Invalid simulation build or bindings');
  const names = new Set<string>();
  for (const binding of input.bindings) {
    if (!isRecord(binding) || typeof binding.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(binding.name)
      || reserved.has(binding.name) || binding.name.startsWith('previous_') || names.has(binding.name) || !isRecord(binding.address)
      || !['value', 'count', 'any-nonzero'].includes(String(binding.projection))) throw new Error('Invalid simulation binding');
    names.add(binding.name);
    for (const key of ['label', 'unit']) {
      if (binding[key] !== undefined && (typeof binding[key] !== 'string' || binding[key].length > 120)) throw new Error('Invalid simulation binding description');
    }
    const { path, tandem } = binding.address;
    if ((typeof path === 'string') === (typeof tandem === 'string')
      || (typeof path === 'string' && (!path || path.length > 1000))
      || (typeof tandem === 'string' && (!tandem || tandem.length > 1000))) throw new Error('Binding requires exactly one validated address');
    if (binding.projection === 'any-nonzero' && (typeof binding.memberProperty !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(binding.memberProperty))) {
      throw new Error('Current projection requires an explicit member property');
    }
  }
  return input as SimulationNodeConfig;
}

function referencedState(stream: ObservedState, value: unknown, observed = false): Record<string, unknown> {
  if (!isRecord(value) || typeof value.ref !== 'string') throw new Error('Binding requires an observed object reference');
  const state = stream.states.get(value.ref);
  if (!state) throw new Error('Binding references missing or disposed state');
  if (observed && stream.catalog.get(value.ref)?.coverage !== 'observed') throw new Error('Binding references unsupported change coverage');
  return state;
}
function scalar(value: unknown): number | string | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('Required binding has unsupported value coverage');
}
export function projectSimulationBindings(stream: ObservedState, bindings: readonly SimulationBinding[]): Record<string, number | string | boolean | null> {
  if (!stream.complete) throw new Error('Cannot project incomplete simulation evidence');
  const facts: Record<string, number | string | boolean | null> = Object.create(null);
  for (const binding of bindings) {
    const matches = stream.findAddress(binding.address);
    if (matches.length !== 1) throw new Error(`Required simulation address is missing or ambiguous: ${binding.name}`);
    const [id, catalog] = matches[0]!;
    if (catalog.coverage !== 'observed') throw new Error(`Required simulation address is unsupported: ${binding.name}`);
    const state = stream.states.get(id);
    if (!state) throw new Error(`Required simulation state is missing: ${binding.name}`);
    if (binding.projection === 'value') { facts[binding.name] = scalar(state.value); continue; }
    const fields = state.fields;
    if (!isRecord(fields) || !Number.isSafeInteger(fields.length) || (fields.length as number) < 0) throw new Error(`Binding requires an observed collection: ${binding.name}`);
    if (binding.projection === 'count') { facts[binding.name] = fields.length as number; continue; }
    let nonzero = false;
    for (let index = 0; index < (fields.length as number); index++) {
      const member = referencedState(stream, fields[String(index)]);
      if (!isRecord(member.fields)) throw new Error('Dynamic member fields unavailable');
      const property = referencedState(stream, member.fields[binding.memberProperty!], true);
      if (typeof property.value !== 'number' || !Number.isFinite(property.value)) throw new Error('Dynamic current value unavailable');
      if (Math.abs(property.value) > 1e-8) nonzero = true;
    }
    facts[binding.name] = nonzero;
  }
  return facts;
}
