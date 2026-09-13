import { expect } from 'chai';
import { repairContentMediaIdentity, CONTENT_MEDIA_IDENTITY_REPAIR_KEY } from './repair_content_media_identity';

function asset(_id: string, stimuliSetId: unknown, tdfId = 'tdf-1', name = `${_id}.png`): any {
  return { _id, name, path: `/assets/${_id}.png`,
    meta: { uploadPurpose: 'content-media', tdfId, stimuliSetId } };
}

function harness(records: any[], tdfs: any[] = [{ _id: 'tdf-1', stimuliSetId: 346 }]) {
  let state: any = null;
  const journal = new Map<string, any>();
  const updates: any[] = [];
  const logs: any[] = [];
  let failCheckpoint = false;
  let conflict = false;
  const deps = {
    DynamicAssets: { collection: {
      find(selector: any, options: any) {
        expect(options.limit).to.be.at.most(100);
        const selected = records.filter(r => {
          if (selector.name !== undefined) return r._id !== selector._id.$ne
            && r.name === selector.name && r.meta.stimuliSetId === selector['meta.stimuliSetId'];
          return !selector._id || r._id > selector._id.$gt;
        }).sort((a, b) => a._id.localeCompare(b._id)).slice(0, options.limit);
        return { async fetchAsync() { return structuredClone(selected); } };
      },
      async updateAsync(selector: any, modifier: any) {
        const row = records.find(r => r._id === selector._id);
        expect(journal.has(`${CONTENT_MEDIA_IDENTITY_REPAIR_KEY}:${row._id}`)).to.equal(true);
        if (conflict) return 0;
        expect(row.meta.stimuliSetId).to.equal(selector['meta.stimuliSetId']);
        expect(row.meta.tdfId).to.equal(selector['meta.tdfId']);
        updates.push(structuredClone({ selector, modifier }));
        row.meta.stimuliSetId = modifier.$set['meta.stimuliSetId'];
        return 1;
      },
    } },
    Tdfs: { find(selector: any) {
      expect(selector._id.$in.length).to.be.at.most(100);
      return { async fetchAsync() { return tdfs.filter(t => selector._id.$in.includes(t._id)); } };
    } },
    DynamicSettings: {
      async findOneAsync() { return state ? { value: structuredClone(state) } : null; },
      async upsertAsync(_selector: any, modifier: any) {
        if (failCheckpoint) { failCheckpoint = false; throw new Error('interrupted checkpoint'); }
        state = structuredClone(modifier.$set.value);
      },
    },
    AuditLog: { async upsertAsync(selector: any, modifier: any) {
      if (!journal.has(selector._id)) journal.set(selector._id, structuredClone(modifier.$setOnInsert));
    } },
    serverConsole(...args: any[]) { logs.push(args); },
  };
  return { deps, updates, journal, logs, get state() { return state; },
    failNextCheckpoint() { failCheckpoint = true; }, simulateConflict() { conflict = true; } };
}

describe('content media identity repair', function() {
  it('repairs an existing string link and preserves files, asset IDs and unrelated metadata', async function() {
    const row = asset('a', '346');
    const original = structuredClone(row);
    const h = harness([row]);
    const result = await repairContentMediaIdentity(h.deps);
    expect(result.updated).to.equal(1);
    expect(result.unresolved).to.equal(0);
    original.meta.stimuliSetId = 346;
    expect(row).to.deep.equal(original);
    expect(h.journal.values().next().value.details).to.include({ before: '346', after: 346, writeIntent: true });
    expect(row.meta.stimuliSetId).to.equal(346); // The unchanged media-list selector now matches.
    await repairContentMediaIdentity(h.deps);
    expect(h.updates).to.have.length(1);
  });

  it('leaves correct new uploads and package media untouched, and preserves authored string IDs', async function() {
    const rows = [asset('a', 346), asset('b', 'sparc:selection', 'tdf-2'), asset('c', '346')];
    delete rows[2].meta.uploadPurpose;
    const h = harness(rows, [{ _id: 'tdf-1', stimuliSetId: 346 }, { _id: 'tdf-2', stimuliSetId: 'sparc:selection' }]);
    const before = structuredClone(rows);
    expect((await repairContentMediaIdentity(h.deps)).updated).to.equal(0);
    expect(rows).to.deep.equal(before);
  });

  it('does not guess a missing lesson, different value, leading-zero identity or invalid target', async function() {
    const rows = [asset('a', '346', 'missing'), asset('b', '347'), asset('c', '0346'), asset('d', '346', 'bad')];
    const before = structuredClone(rows);
    const h = harness(rows, [{ _id: 'tdf-1', stimuliSetId: 346 }, { _id: 'bad', stimuliSetId: null }]);
    const result = await repairContentMediaIdentity(h.deps);
    expect(result.unresolved).to.equal(4);
    expect(result.updated).to.equal(0);
    expect(rows).to.deep.equal(before);
  });

  it('does not merge or overwrite a same-name file already in the correct scope', async function() {
    const rows = [asset('a', '346', 'tdf-1', 'same.png'), asset('b', 346, 'tdf-1', 'same.png')];
    const h = harness(rows);
    expect((await repairContentMediaIdentity(h.deps)).unresolved).to.equal(1);
    expect(h.updates).to.have.length(0);
  });

  it('journals before writing and safely resumes after a write succeeds but its checkpoint fails', async function() {
    const h = harness([asset('a', '346')]);
    h.failNextCheckpoint();
    let error = '';
    try { await repairContentMediaIdentity(h.deps); } catch (e) { error = (e as Error).message; }
    expect(error).to.equal('interrupted checkpoint');
    await repairContentMediaIdentity(h.deps);
    expect(h.updates).to.have.length(1);
    expect(h.journal.size).to.equal(1);
    expect(h.state.completedAt).to.be.a('string');
  });

  it('reports concurrent edits without overwriting them', async function() {
    const h = harness([asset('a', '346')]);
    h.simulateConflict();
    const result = await repairContentMediaIdentity(h.deps);
    expect(result.updated).to.equal(0);
    expect(result.unresolved).to.equal(1);
  });

  it('bounds each startup and resumes from the saved indexed cursor', async function() {
    const rows = Array.from({ length: 5001 }, (_, i) => ({ _id: String(i).padStart(5, '0') }));
    const h = harness(rows);
    const first = await repairContentMediaIdentity(h.deps);
    expect(first.scanned).to.equal(5000);
    expect(first.completedAt).to.equal(undefined);
    const second = await repairContentMediaIdentity(h.deps);
    expect(second.scanned).to.equal(5001);
    expect(second.completedAt).to.be.a('string');
  });
});
