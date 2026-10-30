import { expect } from 'chai';
import { createTdfOwnershipTransfer } from './tdfOwnershipTransfer';

function fixture(count = 16) {
  const children = Array.from({ length: count }, (_, i) => ({
    _id: `child-${i}`, ownerId: 'owner', tdfRevision: 4, stimuliSetId: 'shared-stimuli',
    content: { fileName: `condition-${i}.json`, tdfs: { tutor: { setspec: {}, unit: [{}] } } },
  }));
  const root = {
    _id: 'root', ownerId: 'owner', tdfRevision: 7,
    content: { fileName: 'root.json', tdfs: { tutor: { setspec: {
      condition: children.map(c => c.content.fileName), conditionTdfIds: children.map(c => c._id),
      experimentTarget: 'spanish-test',
    } } } },
  };
  const state = { rows: [root, ...children] as any[], recipientExists: true, conflict: false, writes: 0 };
  const matches = (row: any, query: any) => {
    if (query._id) return query._id.$in ? query._id.$in.includes(row._id) : row._id === query._id;
    const ids = query['content.tdfs.tutor.setspec.conditionTdfIds'].$in;
    return (row.content.tdfs.tutor.setspec.conditionTdfIds || []).some((id: string) => ids.includes(id));
  };
  const transfer = createTdfOwnershipTransfer({ transaction: async work => {
    const pending = structuredClone(state.rows);
    const result = await work({
      tdfs: {
        findOneAsync: async query => pending.find(r => matches(r, query)),
        find: query => ({ fetchAsync: async () => pending.filter(r => matches(r, query)) }),
      },
      userExists: async () => state.recipientExists,
      updateOwners: async ids => {
        state.writes++;
        for (const row of pending.filter(r => ids.includes(r._id))) { row.ownerId = 'recipient'; row.tdfRevision++; }
        return ids.length - Number(state.conflict);
      },
    });
    state.rows = pending;
    return result;
  } });
  return { state, transfer };
}

async function rejects(work: Promise<unknown>, code: string | number) {
  try { await work; } catch (error) { expect((error as any).error).to.equal(code); return; }
  throw new Error('Expected ownership transfer to fail');
}

describe('whole lesson-family ownership transfer', function() {
  it('moves the root and all sixteen conditions, preserving identities and content', async function() {
    const { state, transfer } = fixture(); const before = structuredClone(state.rows);
    expect(await transfer('root', 'owner', 'recipient')).to.equal(17);
    expect(state.writes).to.equal(1);
    expect(state.rows).to.deep.equal(before.map(row => ({ ...row, ownerId: 'recipient', tdfRevision: row.tdfRevision + 1 })));
  });
  it('selecting a condition moves its root and siblings together', async function() {
    const { state, transfer } = fixture();
    expect(await transfer('child-0', 'owner', 'recipient')).to.equal(17);
    expect(state.rows.every(r => r.ownerId === 'recipient')).to.equal(true);
  });
  it('continues to support a standalone runnable lesson', async function() {
    const { state, transfer } = fixture(1); state.rows.shift();
    expect(await transfer('child-0', 'owner', 'recipient')).to.equal(1);
  });
  it('uses family metadata without requiring full instructional unit payloads', async function() {
    const { state, transfer } = fixture();
    for (const row of state.rows) delete row.content.tdfs.tutor.unit;
    expect(await transfer('child-0', 'owner', 'recipient')).to.equal(17);
  });
  it('rejects a missing condition before any write', async function() {
    const { state, transfer } = fixture(); state.rows.pop();
    await rejects(transfer('root', 'owner', 'recipient'), 'tdf-identity-repair-required');
    expect(state.writes).to.equal(0);
  });
  it('rejects a misaligned condition filename before any write', async function() {
    const { state, transfer } = fixture(); state.rows[1].content.fileName = 'wrong.json';
    await rejects(transfer('root', 'owner', 'recipient'), 'tdf-identity-repair-required');
    expect(state.writes).to.equal(0);
  });
  it('rejects a family marked for identity repair', async function() {
    const { state, transfer } = fixture(); state.rows[1].tdfAvailability = 'repair-required';
    await rejects(transfer('root', 'owner', 'recipient'), 'tdf-identity-repair-required');
    expect(state.writes).to.equal(0);
  });
  it('rejects already split ownership without taking another user\'s content', async function() {
    const { state, transfer } = fixture(); state.rows[1].ownerId = 'other-owner';
    await rejects(transfer('root', 'owner', 'recipient'), 'tdf-identity-repair-required');
    expect(state.writes).to.equal(0);
  });
  it('rejects unauthorized callers before resolving the family', async function() {
    const { state, transfer } = fixture();
    await rejects(transfer('root', 'other-owner', 'recipient'), 403);
    expect(state.writes).to.equal(0);
  });
  it('rejects a missing recipient or selected lesson', async function() {
    const { state, transfer } = fixture(); state.recipientExists = false;
    await rejects(transfer('root', 'owner', 'recipient'), 400);
    await rejects(transfer('missing', 'owner', 'recipient'), 404);
    expect(state.writes).to.equal(0);
  });
  it('rejects a condition shared with a second root', async function() {
    const { state, transfer } = fixture();
    state.rows.push({ ...structuredClone(state.rows[0]), _id: 'second-root' });
    await rejects(transfer('root', 'owner', 'recipient'), 'tdf-identity-repair-required');
    await rejects(transfer('child-0', 'owner', 'recipient'), 'tdf-identity-repair-required');
    expect(state.writes).to.equal(0);
  });
  it('rolls back all owner changes if the guarded write does not match the entire family', async function() {
    const { state, transfer } = fixture(); state.conflict = true; const before = structuredClone(state.rows);
    await rejects(transfer('root', 'owner', 'recipient'), 'ownership-transfer-conflict');
    expect(state.rows).to.deep.equal(before);
  });
});
