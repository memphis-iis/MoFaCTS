import { Worker } from 'node:worker_threads';
import type { LegacyHighs } from 'highs';
import type { ClusterKcRelationship } from '../../../learning-components/runtime/clusterKcRelationshipEngine';
import { validateClusterKcChain } from '../../../learning-components/runtime/clusterKcChain';

type Solve = (model: string) => Promise<ReturnType<LegacyHighs['solve']>>;

/** Exact integer-weight TSP with a zero-weight dummy endpoint and subtour cuts.
 * Fixing dummy--start makes the resulting Hamiltonian path start at that KC.
 * We optimize the graph's existing six-decimal weights, without a cutoff.
 */
export async function computeMaximumKcChain(params: {
  ids: readonly string[];
  startingKC: string;
  relationships: readonly ClusterKcRelationship[];
  solve: Solve;
}): Promise<{ order: string[]; totalStrength: number }> {
  const ids = [...params.ids].sort();
  validateClusterKcChain(ids, params.startingKC, [params.startingKC, ...ids.filter(id => id !== params.startingKC)]);
  const weights = new Map<string, number>();
  for (const edge of params.relationships) {
    const key = JSON.stringify([edge.sourceClusterKC, edge.targetClusterKC]);
    if (weights.has(key) || !Number.isFinite(edge.strength) || edge.strength < 0 || edge.strength > 1) {
      throw new Error('KC chain requires unique finite relationship weights from zero to one');
    }
    weights.set(key, Math.round(edge.strength * 1e6));
  }
  const weight = (a: string, b: string) => weights.get(JSON.stringify([a, b]));
  for (const a of ids) for (const b of ids) if (a !== b) {
    if (weight(a, b) === undefined || weight(a, b) !== weight(b, a)) {
      throw new Error('KC chain requires a complete symmetric relationship graph');
    }
  }
  if (ids.length < 3) {
    const order = [params.startingKC, ...ids.filter(id => id !== params.startingKC)];
    return { order, totalStrength: ids.length === 1 ? 0 : weight(order[0]!, order[1]!)! / 1e6 };
  }
  const dummy = ids.length;
  const vertices = Array.from({ length: ids.length + 1 }, (_, i) => i);
  const edges = vertices.flatMap(a => vertices.filter(b => b > a).map(b => ({
    a, b, name: `x_${a}_${b}`, value: b === dummy ? 0 : weight(ids[a]!, ids[b]!)!,
  })));
  const cuts: number[][] = [];
  const fixed = edges.find(e => e.a === ids.indexOf(params.startingKC) && e.b === dummy)!;
  for (;;) {
    const model = [
      'Maximize', ` obj: ${edges.map(e => `${e.value} ${e.name}`).join(' + ')}`,
      'Subject To',
      ...vertices.map(v => ` degree_${v}: ${edges.filter(e => e.a === v || e.b === v).map(e => e.name).join(' + ')} = 2`),
      ` start: ${fixed.name} = 1`,
      ...cuts.map((cut, i) => ` cut_${i}: ${edges.filter(e => cut.includes(e.a) && cut.includes(e.b)).map(e => e.name).join(' + ')} <= ${cut.length - 1}`),
      'Binary', ...edges.map(e => e.name), 'End',
    ].join('\n');
    const result = await params.solve(model);
    if (result.Status !== 'Optimal') throw new Error(`Exact KC chain solver did not prove optimality: ${result.Status}`);
    const selected = edges.filter(e => (result.Columns[e.name]?.Primal ?? 0) > .5);
    const neighbors = vertices.map(v => selected.filter(e => e.a === v || e.b === v).map(e => e.a === v ? e.b : e.a));
    if (neighbors.some(list => list.length !== 2)) throw new Error('KC chain solver returned an invalid degree');
    const unseen = new Set(vertices);
    const components: number[][] = [];
    while (unseen.size) {
      const stack = [unseen.values().next().value!];
      const component: number[] = [];
      while (stack.length) {
        const v = stack.pop()!;
        if (!unseen.delete(v)) continue;
        component.push(v);
        stack.push(...neighbors[v]!);
      }
      components.push(component);
    }
    if (components.length > 1) { cuts.push(...components); continue; }
    const order: string[] = [];
    let previous = dummy, current = ids.indexOf(params.startingKC);
    while (current !== dummy) {
      order.push(ids[current]!);
      const next = neighbors[current]!.find(v => v !== previous)!;
      previous = current; current = next;
      if (order.length > ids.length) throw new Error('KC chain solver returned an invalid path');
    }
    validateClusterKcChain(ids, params.startingKC, order);
    const total = order.slice(1).reduce((sum, id, i) => sum + weight(order[i]!, id)!, 0);
    if (Math.abs(total - result.ObjectiveValue) > .01) throw new Error('KC chain objective does not match returned path');
    return { order, totalStrength: total / 1e6 };
  }
}

/** WASM solves stay off Meteor's event loop. The worker and its native memory
 * are disposed on success or failure; no solver is shipped to the learner.
 */
export async function generateMaximumKcChain(params: Omit<Parameters<typeof computeMaximumKcChain>[0], 'solve'>, loaderPath: string) {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const ready = require(workerData.loader)();
    parentPort.on('message', async model => {
      try {
        const highs = await ready;
        parentPort.postMessage({ result: highs.solve(model, {
          output_flag: false, mip_rel_gap: 0, mip_abs_gap: 0, random_seed: 0, threads: 1
        }) });
      } catch (error) { parentPort.postMessage({ error: error.message }); }
    });
  `, { eval: true, workerData: { loader: loaderPath } });
  try {
    return await computeMaximumKcChain({ ...params, solve: model => new Promise((resolve, reject) => {
      const cleanup = () => { worker.off('message', message); worker.off('error', error); worker.off('exit', exit); };
      const message = (value: { result?: ReturnType<LegacyHighs['solve']>; error?: string }) => {
        cleanup();
        if (value.result) resolve(value.result); else reject(new Error(value.error || 'KC chain worker returned no solution'));
      };
      const error = (cause: Error) => { cleanup(); reject(cause); };
      const exit = (code: number) => error(new Error(`KC chain worker exited before returning a solution (${code})`));
      worker.once('message', message); worker.once('error', error); worker.once('exit', exit);
      worker.postMessage(model);
    }) });
  } finally { await worker.terminate(); }
}
