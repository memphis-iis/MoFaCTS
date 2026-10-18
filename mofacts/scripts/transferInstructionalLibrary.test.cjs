// Synthetic databases and temporary raster files only. No MongoDB/server connection.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { BSON: { EJSON } } = require('mongodb');
const { collectionMongoName: name } = require('../common/collectionOwnership.ts');
const tool = require('./transferInstructionalLibrary.cjs');
const copy = value => structuredClone(value);
const silent = () => {};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=', 'base64');
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => key === '$or' ? value.some(part => matches(row, part))
    : value && typeof value === 'object' ? ('$in' in value ? value.$in.includes(row[key]) : '$ne' in value ? row[key] !== value.$ne : false)
      : row[key] === value);
}
class Database {
  constructor(rows = {}) { this.rows = copy(rows); this.writes = 0; this.reads = []; this.failOwner = null; }
  collection(collection) {
    const database = this;
    return {
      find(query) {
        database.reads.push(collection);
        const rows = copy(database.rows[collection] ?? []).filter(row => matches(row, query));
        const cursor = { sort() { rows.sort((a, b) => a._id.localeCompare(b._id)); return cursor; }, batchSize() { return cursor; }, limit(count) { rows.length = Math.min(count, rows.length); return cursor; },
          async *[Symbol.asyncIterator]() { yield* rows; } };
        return cursor;
      },
      async findOne(query) { database.reads.push(collection); return copy((database.rows[collection] ?? []).find(row => matches(row, query))); },
      async insertMany(rows) { if (database.failOwner === collection) throw new Error('Injected transaction failure'); database.writes++; (database.rows[collection] ??= []).push(...copy(rows)); },
      async updateOne(selector) { database.writes++; (database.rows[collection] ??= []).push({ ...selector, kind: 'state', revision: 1 }); },
    };
  }
  startSession() {
    const database = this;
    return { async withTransaction(work) { const before = copy(database.rows); try { await work(); } catch (error) { database.rows = before; throw error; } }, async endSession() {} };
  }
}
function fixture(root) {
  const date = new Date('2026-10-18T12:00:00Z');
  const base = { version: 'example-v1', embeddingModel: 'example-model', embeddingVersion: 'example-embedding', embedding: [0.2, 0.8], createdAt: date };
  const clip = { segmentId: 'videoCatalog', videoId: 'abcdefghijk', startSeconds: 12, endSeconds: 25, transcript: 'A complete passage.', title: 'Example', channel: 'Teaching', language: 'en' };
  const library = [
    { ...base, _id: 'imageNew', kind: 'image', ready: true, imageModel: 'example-image', dimensions: 2, situation: '{}' },
    { ...base, _id: 'explanation', kind: 'explanation', content: { text: 'An explanation.' } },
    { ...base, _id: 'feedback', kind: 'feedback', content: { text: 'Useful feedback.' } },
    { ...base, _id: 'support', kind: 'richContent', content: { text: 'A figure.', figure: { assetId: 'imageNew', description: 'A teaching figure.' } } },
    { ...base, _id: 'question', kind: 'question', content: { text: 'Which one?', choices: [{ id: 'a', label: 'One', correct: true }, { id: 'b', label: 'Two', correct: false }] } },
    { ...base, _id: 'videoCatalog', kind: 'video', content: { text: clip.transcript, video: clip }, origins: [{ tdfId: 'sourceLesson', pageId: 'pageA', targetId: 'KC A', targetKind: 'expectation', text: 'An authored expectation.' }] },
    { ...base, _id: 'videoSupport', kind: 'richContent', content: { text: clip.transcript, video: clip } },
    { ...base, _id: 'pending', kind: 'image', ready: false },
  ];
  const asset = id => ({ _id: id, userId: 'privateLearner', name: 'figure.png', size: png.length, type: 'image/png', extension: 'png',
    path: path.join(root, id + '.png'), _storagePath: root, versions: { original: { path: path.join(root, id + '.png'), size: png.length, type: 'image/png', extension: 'png' } },
    meta: { uploadPurpose: 'sparc-prompt-image', public: false, ready: true, figureLibraryVersion: 'example-v1', description: 'A teaching figure.',
      tutorMessage: 'Teaching text.', fileName: 'figure.png', sessionId: 'privateSession', generationIdentity: 'privateIdentity' } });
  return {
    [name('SparcInstructionalLibrary')]: library,
    [name('SparcMoveManifests')]: [{ _id: 'manifest', move: 'example-move', entries: ['explanation', 'support', 'question'] }],
    [name('DynamicAssets')]: [asset('imageNew')],
    [name('Histories')]: [{ _id: 'privateHistory', learnerText: 'Private learner response.' }],
    [name('SparcMoveRequests')]: [{ _id: 'privateRequest' }],
  };
}
async function example(work) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-library-seed-'));
  const root = path.join(directory, 'source'), bundle = path.join(directory, 'bundle'), destination = path.join(directory, 'destination');
  try {
    await fs.mkdir(root);
    for (const id of ['imageNew']) await fs.writeFile(path.join(root, id + '.png'), png);
    const source = new Database(fixture(root));
    await tool.exportLibrary({ db: source, root, bundle, EJSON, log: silent });
    const hash = await tool.digest(await fs.readFile(path.join(bundle, 'manifest.json')));
    const checked = await tool.readBundle(bundle, hash, EJSON);
    await work({ directory, root, bundle, destination, source, hash, checked });
  } finally {
    const resolved = path.resolve(directory), expectedParent = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), expectedParent); assert.ok(path.basename(resolved).startsWith('mofacts-library-seed-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
describe('Fresh instructional library seed', () => {
  it('exports every shared kind, exact embeddings, choices, video bounds and KC provenance; omits private data', async () => example(async ({ source, checked, bundle }) => {
    assert.equal(checked.library.size, 7); assert.equal(checked.assets.size, 1);
    assert.deepEqual(checked.library.get('question').content.choices[0], { id: 'a', label: 'One', correct: true });
    assert.equal('reusable' in checked.library.get('question'), false);
    assert.deepEqual(checked.library.get('videoCatalog').origins[0].targetId, 'KC A');
    assert.equal(checked.library.get('videoSupport').content.video.startSeconds, 12);
    assert.ok(checked.library.get('imageNew').createdAt instanceof Date);
    const text = await fs.readFile(path.join(bundle, 'content.ejson'), 'utf8');
    for (const secret of ['privateLearner', 'privateSession', 'privateIdentity', 'privateHistory', 'Private learner response.']) assert.ok(!text.includes(secret));
    assert.ok(!source.reads.includes(name('Histories'))); assert.ok(!source.reads.includes(name('SparcMoveRequests')));
    assert.equal(checked.assets.get('imageNew').path, 'imageNew.png');
    const { execFileSync } = require('node:child_process');
    const packaged = path.join(bundle, 'tool/scripts/transferInstructionalLibrary.cjs');
    const result = execFileSync(process.execPath, ['-e', 'const tool=require(process.argv[1]);process.stdout.write(tool.FORMAT)', packaged], { encoding: 'utf8', windowsHide: true });
    assert.equal(result, tool.FORMAT);
  }));
  it('keeps dry-run free of database and asset writes', async () => example(async ({ bundle, checked, destination }) => {
    const db = new Database();
    await tool.importLibrary({ db, client: db, root: destination, bundle, checked, log: silent });
    assert.equal(db.writes, 0); await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  }));
  it('seeds a fresh library transactionally, rebases image paths and leaves unrelated application data unchanged', async () => example(async ({ bundle, checked, destination }) => {
    const initial = { [name('Histories')]: [{ _id: 'keepHistory' }], users: [{ _id: 'keepUser' }] };
    const db = new Database(initial);
    await tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent });
    assert.equal(db.rows[name('SparcInstructionalLibrary')].length, 7);
    assert.deepEqual(db.rows.users, initial.users); assert.deepEqual(db.rows[name('Histories')], initial[name('Histories')]);
    const asset = db.rows[name('DynamicAssets')][0];
    assert.equal(asset.path, path.join(destination, asset._id + '.png'));
    assert.equal(asset.versions.original.path, asset.path); assert.equal(asset._storagePath, destination);
    assert.deepEqual(await fs.readFile(asset.path), png);
    assert.equal(db.rows[name('SparcFigureBrowse')][0].revision, 1);
    await assert.rejects(tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent }), /not empty/);
  }));
  it('rejects populated libraries and asset-ID conflicts before writing', async () => example(async ({ bundle, checked, destination }) => {
    for (const rows of [{ [name('SparcInstructionalLibrary')]: [{ _id: 'existing' }] }, { [name('DynamicAssets')]: [{ _id: 'imageNew' }] }]) {
      const db = new Database(rows);
      await assert.rejects(tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent }), /not empty|already in use/);
      assert.equal(db.writes, 0);
    }
  }));
  it('rolls back all database changes on failure and supports retry with the already-copied private files', async () => example(async ({ bundle, checked, destination }) => {
    const db = new Database(); db.failOwner = name('SparcInstructionalLibrary');
    await assert.rejects(tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent }), /Injected/);
    assert.deepEqual(db.rows, {}); assert.deepEqual(await fs.readFile(path.join(destination, 'imageNew.png')), png);
    db.failOwner = null;
    await tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent });
    assert.equal(db.rows[name('SparcInstructionalLibrary')].length, 7);
  }));
  it('rejects corrupted bundles, traversal, duplicate identities, missing figure/catalog references, and destination-file conflicts', async () => example(async ({ bundle, hash, checked, destination }) => {
    await assert.rejects(tool.readBundle(bundle, '0'.repeat(64), EJSON), /manifest checksum/);
    assert.throws(() => tool.contained(bundle, '../outside'), /Unsafe/);
    assert.throws(() => tool.validateGraph([...checked.records, checked.records[0]]), /Duplicate/);
    assert.throws(() => tool.validateGraph(checked.records.filter(row => row.document._id !== 'imageNew')), /missing|outside the shared library/);
    assert.throws(() => tool.validateGraph(checked.records.filter(row => row.document._id !== 'videoCatalog')), /catalog passage/);
    await fs.mkdir(destination); await fs.writeFile(path.join(destination, 'imageNew.png'), 'wrong bytes');
    const db = new Database();
    await assert.rejects(tool.importLibrary({ db, client: db, root: destination, bundle, checked, apply: true, log: silent }), /conflicts/);
    assert.equal(db.writes, 0);
    await fs.appendFile(path.join(bundle, 'assets/imageNew.png'), 'corrupted');
    await assert.rejects(tool.readBundle(bundle, hash, EJSON), /checksum/);
  }));
  it('requires explicit operation/arguments and never treats an unknown flag as apply', () => {
    assert.deepEqual(tool.argumentsFor(['import', '--bundle', 'example']).options, { '--bundle': 'example' });
    for (const args of [[], ['export', '--bundle', 'x', '--apply'], ['import', '--bundle'], ['import', '--bundle', 'x', '--force']]) assert.throws(() => tool.argumentsFor(args));
  });
});
