import { expect } from 'chai';
import { createConditionStateWriter, nextConditionAllocation, type ConditionAllocationBlock } from './conditionAllocation';

describe('not-max condition block', function() {
  it('uses every tied condition once per block and replenishes after exhaustion', function() {
    let saved: ConditionAllocationBlock | undefined;
    const picks: string[] = [];
    for (let i = 0; i < 8; i++) {
      const next = nextConditionAllocation(['d', 'b', 'a', 'c'], [0, 0, 0, 0], saved, () => 0.5);
      saved = next.block;
      picks.push(next.conditionTdfId);
    }
    expect(new Set(picks.slice(0, 4)).size).to.equal(4);
    expect(new Set(picks.slice(4)).size).to.equal(4);
    expect(saved!.cursor).to.equal(4);
  });
  it('excludes every maximum, rather than only selecting the minimum', function() {
    const next = nextConditionAllocation(['a', 'b', 'c', 'd'], [3, 4, 5, 5], undefined, () => 0.9);
    expect(next.block.order).to.deep.equal(['a', 'b']);
  });
  it('rebuilds when maximum changes even with the same eligible IDs', function() {
    const first = nextConditionAllocation(['a', 'b', 'c'], [1, 2, 4], undefined, () => 0.9);
    const next = nextConditionAllocation(['a', 'b', 'c'], [1, 2, 5], first.block, () => 0.9);
    expect(next.block.cursor).to.equal(1);
    expect(next.block.maximum).to.equal(5);
  });
  it('rebuilds when eligibility changes without a new maximum', function() {
    const first = nextConditionAllocation(['a', 'b', 'c'], [1, 2, 4], undefined, () => 0.9);
    const next = nextConditionAllocation(['a', 'b', 'c'], [4, 2, 4], first.block);
    expect(next.block.order).to.deep.equal(['b']);
  });
  it('keeps the cursor across root condition reordering and non-eligibility count changes', function() {
    const first = nextConditionAllocation(['a', 'b', 'c'], [0, 1, 5], undefined, () => 0.9);
    const next = nextConditionAllocation(['c', 'b', 'a'], [5, 2, 1], first.block, () => { throw Error('must reuse'); });
    expect(next.conditionTdfId).to.equal('b');
    expect(next.block.cursor).to.equal(2);
    expect(first.block.cursor).to.equal(1);
  });
  it('handles a single condition', function() {
    expect(nextConditionAllocation(['a'], [0], undefined).conditionTdfId).to.equal('a');
  });
  it('rejects invalid counts and identities instead of substituting data', function() {
    for (const counts of [[], [-1, 0], [0.1, 0], [NaN, 0], [Infinity, 0]]) {
      expect(() => nextConditionAllocation(['a', 'b'], counts, undefined)).to.throw();
    }
    expect(() => nextConditionAllocation(['a', 'a'], [0, 0], undefined)).to.throw();
    expect(() => nextConditionAllocation([], [], undefined)).to.throw();
  });
  it('rejects corrupted saved blocks', function() {
    const block = { maximum: 1, eligibleIds: ['a', 'b'], order: ['a', 'b'], cursor: 1 };
    for (const change of [{ cursor: 3 }, { cursor: -1 }, { order: ['a', 'a'] }, { maximum: NaN }]) {
      expect(() => nextConditionAllocation(['a', 'b'], [0, 0], { ...block, ...change })).to.throw();
    }
  });
});

function fixture(mode = 'not-max', countcompletion = 'end') {
  let root: any = { _id: 'root', ownerId: 'owner', conditionCounts: [0, 0, 0], tdfRevision: 1,
    content: { tdfs: { tutor: { setspec: { loadbalancing: mode, countcompletion,
      condition: ['a.json', 'b.json', 'c.json'], conditionTdfIds: ['a', 'b', 'c'] } } } } };
  let states: any[] = [];
  let queue = Promise.resolve();
  let failInsert = false;
  let missingChild = false;
  let id = 0;
  const session = {};
  const check = (options: any) => expect(options.session).to.equal(session);
  const writer = createConditionStateWriter({
    random: () => 0.9,
    newId: () => `state-${++id}`,
    transaction: async work => {
      const predecessor = queue;
      let release!: () => void;
      queue = new Promise<void>(resolve => { release = resolve; });
      await predecessor;
      const backup = structuredClone({ root, states });
      try { return await work(session); }
      catch (error) { root = backup.root; states = backup.states; throw error; }
      finally { release(); }
    },
    tdfs: {
      findOne: async (selector, options) => { check(options); return selector._id === 'root' ? structuredClone(root) : missingChild ? null : { _id: selector._id }; },
      updateOne: async (_selector, modifier, options) => {
        check(options);
        Object.assign(root, modifier.$set);
        for (const [key, value] of Object.entries(modifier.$inc as Record<string, number>)) {
          if (key.startsWith('conditionCounts.')) root.conditionCounts[Number(key.split('.')[1])] += value;
          else root[key] += value;
        }
        return { matchedCount: 1 };
      },
      insertOne: async () => { throw Error('not used'); },
    },
    states: {
      findOne: async (selector, options) => { check(options); return structuredClone(states.find(s => s.userId === selector.userId && s.TDFId === selector.TDFId) || null); },
      updateOne: async (selector, modifier, options) => { check(options); Object.assign(states.find(s => s._id === selector._id), modifier.$set); return { matchedCount: 1 }; },
      insertOne: async (doc, options) => { check(options); if (failInsert) throw Error('storage rejected'); states.push(structuredClone(doc)); },
    },
  });
  const write = (userId: string, state = {}, options = {}) => writer({ userId, rootTdfId: 'root', state, ...options });
  return { write, root: () => root, states: () => states,
    failInsert: () => { failInsert = true; }, missingChild: () => { missingChild = true; } };
}

async function rejects(work: Promise<unknown>, message: string) {
  try { await work; } catch (error) { expect(String(error)).to.contain(message); return; }
  throw Error('Expected rejection');
}

describe('transactional condition state writer', function() {
  it('leaves existing modes and omitted mode to their existing path', async function() {
    for (const mode of ['max', 'min', '']) {
      const f = fixture(mode);
      expect(await f.write('user')).to.equal(null);
      expect(f.states()).to.have.length(0);
      await rejects(f.write('user', {}, { allocateCondition: true }), 'requires loadbalancing');
    }
  });
  it('assigns concurrent new participants without reusing a block slot', async function() {
    const f = fixture();
    const results = await Promise.all(['u1', 'u2', 'u3'].map(u => f.write(u, {}, { allocateCondition: true })));
    expect(new Set(results.map(r => r!.conditionTdfId)).size).to.equal(3);
    expect(f.root().conditionAllocation.cursor).to.equal(3);
    expect(f.root().conditionCounts).to.deep.equal([0, 0, 0]);
  });
  it('replays a concurrent participant assignment without consuming twice', async function() {
    const f = fixture('not-max', 'beginning');
    const results = await Promise.all([1, 2, 3].map(() => f.write('user', {}, { allocateCondition: true })));
    expect(new Set(results.map(r => r!.id)).size).to.equal(1);
    expect(f.root().conditionAllocation.cursor).to.equal(1);
    expect(f.root().conditionCounts).to.deep.equal([1, 0, 0]);
  });
  it('keeps previous assignments and progress without allocating', async function() {
    const f = fixture();
    await f.write('user', { currentUnitNumber: 3, courseAssignmentLaunchContext: { assignmentId: 'course' } }, { allocateCondition: true });
    const result = await f.write('user', { currentUnitNumber: 0 }, { allocateCondition: true });
    expect(result!.currentUnitNumber).to.equal(3);
    expect(result!.courseAssignmentLaunchContext).to.deep.equal({ assignmentId: 'course' });
    expect(f.root().conditionAllocation.cursor).to.equal(1);
  });
  it('protects assignments during stale initialization and replacement writes', async function() {
    const f = fixture();
    await f.write('user', {}, { allocateCondition: true });
    const result = await f.write('user', { currentTdfId: 'root', conditionTdfId: null }, { replaceExistingState: true });
    expect(result!.conditionTdfId).to.equal('a');
    expect(result!.currentTdfId).to.equal('a');
    await rejects(f.write('user', { conditionTdfId: 'b' }), 'cannot be changed');
  });
  it('rejects participant self-selection before first assignment', async function() {
    const f = fixture();
    await rejects(f.write('user', { conditionTdfId: 'b' }), 'cannot be changed');
    expect(f.states()).to.have.length(0);
  });
  it('retains explicit owner previews without consuming a block or count', async function() {
    const f = fixture('not-max', 'beginning');
    const result = await f.write('owner', { conditionTdfId: 'b' }, { replaceExistingState: true });
    expect(result!.conditionTdfId).to.equal('b');
    expect(f.root().conditionAllocation).to.equal(undefined);
    expect(f.root().conditionCounts).to.deep.equal([0, 0, 0]);
  });
  it('rolls back the cursor and beginning count if participant persistence fails', async function() {
    const f = fixture('not-max', 'beginning');
    f.failInsert();
    await rejects(f.write('user', {}, { allocateCondition: true }), 'storage rejected');
    expect(f.root().conditionAllocation).to.equal(undefined);
    expect(f.root().conditionCounts).to.deep.equal([0, 0, 0]);
    expect(f.states()).to.have.length(0);
  });
  it('does not consume an assignment when its condition is missing', async function() {
    const f = fixture();
    f.missingChild();
    await rejects(f.write('user', {}, { allocateCondition: true }), 'unavailable');
    expect(f.root().conditionAllocation).to.equal(undefined);
  });
  it('refuses to replace a removed saved condition with a new random choice', async function() {
    const f = fixture();
    await f.write('user', {}, { allocateCondition: true });
    f.root().content.tdfs.tutor.setspec.conditionTdfIds = ['x', 'b', 'c'];
    await rejects(f.write('user', {}, { allocateCondition: true }), 'no longer belongs');
  });
});
