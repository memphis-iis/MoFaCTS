import assert from 'node:assert/strict';
import { computeMaximumKcChain, generateMaximumKcChain } from './clusterKcChainSolver';
import { resolveKcChainWorkerLoader } from './clusterKcChainWorkerRuntime';

function graph(ids: string[]) {
  return ids.flatMap((sourceClusterKC, i) => ids.filter(id => id !== sourceClusterKC).map(targetClusterKC => {
    const j = ids.indexOf(targetClusterKC);
    return { sourceClusterKC, targetClusterKC, strength: ((i + j) * 17 + i * j * 13) % 97 / 100 };
  }));
}
function permutations(ids: string[]): string[][] {
  return ids.length ? ids.flatMap(id => permutations(ids.filter(other => other !== id)).map(rest => [id, ...rest])) : [[]];
}

describe('exact maximum KC chain', () => {
  it('matches exhaustive search for every fixed start and ignores input array order', async function() {
    this.timeout(30_000);
    const loaderPath = resolveKcChainWorkerLoader();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const relationships = graph(ids);
    const score = (path: string[]) => path.slice(1).reduce((sum, id, i) => sum + Math.round(1e6 * relationships.find(e => e.sourceClusterKC === path[i] && e.targetClusterKC === id)!.strength), 0);
    for (const startingKC of ids) {
      const expected = Math.max(...permutations(ids.filter(id => id !== startingKC)).map(rest => score([startingKC, ...rest])));
      const result = await generateMaximumKcChain({ ids, startingKC, relationships }, loaderPath);
      assert.equal(Math.round(result.totalStrength * 1e6), expected);
      assert.equal(result.order[0], startingKC);
      assert.equal(new Set(result.order).size, ids.length);
      assert.deepEqual(await generateMaximumKcChain({ ids: [...ids].reverse(), startingKC, relationships: [...relationships].reverse() }, loaderPath), result);
    }
  });
  it('handles singleton and pair without optimization', async () => {
    const solve = async () => { throw new Error('Should not call solver'); };
    assert.deepEqual(await computeMaximumKcChain({ ids: ['a'], startingKC: 'a', relationships: [], solve }), { order: ['a'], totalStrength: 0 });
    assert.deepEqual(await computeMaximumKcChain({ ids: ['a', 'b'], startingKC: 'b', relationships: graph(['a', 'b']), solve }), { order: ['b', 'a'], totalStrength: .17 });
  });
  it('rejects invalid starts, missing or asymmetric edges, duplicates, and unproved solutions', async () => {
    const ids = ['a', 'b', 'c'];
    const relationships = graph(ids);
    const solve = async () => ({ Status: 'Time limit reached' as const, ObjectiveValue: 0, Columns: {}, Rows: [] });
    await assert.rejects(computeMaximumKcChain({ ids, startingKC: 'absent', relationships, solve }), /startingKC/);
    await assert.rejects(computeMaximumKcChain({ ids, startingKC: 'a', relationships: relationships.slice(1), solve }), /complete symmetric/);
    await assert.rejects(computeMaximumKcChain({ ids, startingKC: 'a', relationships: [{ ...relationships[0]!, strength: .99 }, ...relationships.slice(1)], solve }), /complete symmetric/);
    await assert.rejects(computeMaximumKcChain({ ids, startingKC: 'a', relationships: [...relationships, relationships[0]!], solve }), /unique finite/);
    await assert.rejects(computeMaximumKcChain({ ids, startingKC: 'a', relationships, solve }), /did not prove optimality/);
  });
});
