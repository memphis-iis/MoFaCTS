import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { FilesCollection } from 'meteor/ostrio:files';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Real package handlers, Mongo pending records and filesystem streams. No runtime
// handler replacement. Wire-level/restart probes also run on isolated staging2.
if (Meteor.isServer) describe('maintained upload package ownership', function() {
  let files: any;
  let directory: string;
  const owner = 'synthetic-upload-owner';
  let ids: string[];
  async function invoke(operation: string, userId: string | null, ...args: unknown[]) {
    const handler = (Meteor as any).server.method_handlers[files._methodNames[operation]];
    return handler.apply({ userId, unblock() {} }, args);
  }
  async function denied(operation: string, caller: string | null, ...args: unknown[]) {
    let error: any;
    try { await invoke(operation, caller, ...args); } catch (caught) { error = caught; }
    expect(error, `${operation} must reject`).not.to.equal(undefined);
    expect(error.error).to.be.oneOf([403, 409]);
  }
  function options(id: string) {
    return { fileId: id, file: { name: 'synthetic.txt', size: 4, type: 'text/plain', userId: 'forged-owner' }, chunkSize: 4, fileLength: 1 };
  }
  before(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-upload-test-'));
    files = new FilesCollection({ collectionName: `uploadTest${Random.id(8)}`, storagePath: directory, allowClientCode: false, disableSetTokenCookie: true });
  });
  beforeEach(() => { ids = []; });
  afterEach(async () => {
    for (const id of ids) {
      const stream = files._currentUploads[id];
      if (stream && !stream.ended && !stream.aborted) await stream.abort();
      await files._preCollection.removeAsync(id);
      await files.collection.removeAsync(id);
    }
  });
  after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  function id() { const value = Random.id(17); ids.push(value); return value; }

  it('ignores forged ownership and denies anonymous start', async () => {
    const uploadId = id();
    await denied('_Start', null, options(uploadId));
    expect(await files._preCollection.findOneAsync(uploadId)).to.equal(undefined);
    expect(await fs.readdir(directory)).to.deep.equal([]);
    await invoke('_Start', owner, options(uploadId));
    expect((await files._preCollection.findOneAsync(uploadId)).file.userId).to.equal(owner);
  });
  it('rejects cross-user, administrator and anonymous write/finish/abort without changing records or bytes', async () => {
    const uploadId = id();
    await invoke('_Start', owner, options(uploadId));
    const before = await files._preCollection.findOneAsync(uploadId);
    const bytes = await fs.readFile(before.file.path);
    const secondId = id();
    await invoke('_Start', 'other-user', { ...options(secondId), FSName: uploadId });
    const second = await files._preCollection.findOneAsync(secondId);
    expect(second.file.path).not.to.equal(before.file.path);
    for (const caller of [null, 'other-user', 'administrator']) {
      await denied('_Write', caller, { fileId: uploadId, chunkId: 1, binData: Buffer.from('evil').toString('base64') });
      await denied('_Write', caller, { fileId: uploadId, eof: true });
      await denied('_Abort', caller, uploadId);
      await denied('_Start', caller === null ? 'other-user' : caller, options(uploadId));
    }
    expect(await files._preCollection.findOneAsync(uploadId)).to.deep.equal(before);
    expect(await fs.readFile(before.file.path)).to.deep.equal(bytes);
    expect(await files.collection.findOneAsync(uploadId)).to.equal(undefined);
    await invoke('_Abort', owner, uploadId);
    expect(await files._preCollection.findOneAsync(uploadId)).to.equal(undefined);
    let missing = false;
    try { await fs.access(before.file.path); } catch { missing = true; }
    expect(missing).to.equal(true);
  });
  it('resumes from persisted ownership and prevents abort or identifier reuse after completion', async () => {
    const uploadId = id();
    await invoke('_Start', owner, options(uploadId));
    // Release the in-memory stream before any bytes; the next call must reopen
    // using the Mongo pending record, just as a new server process does.
    await files._currentUploads[uploadId].stop(false);
    delete files._currentUploads[uploadId];
    await invoke('_Write', owner, { fileId: uploadId, chunkId: 1, binData: Buffer.from('safe').toString('base64') });
    const result = await invoke('_Write', owner, { fileId: uploadId, eof: true });
    expect(result.status).to.equal(200);
    const completed = await files.collection.findOneAsync(uploadId);
    expect(completed.userId).to.equal(owner);
    expect((await fs.readFile(completed.path)).toString()).to.equal('safe');
    await denied('_Abort', owner, uploadId);
    await denied('_Start', owner, options(uploadId));
    expect(await files.collection.findOneAsync(uploadId)).to.deep.equal(completed);
    expect((await fs.readFile(completed.path)).toString()).to.equal('safe');
  });
  it('rejects missing persisted owners before reopening streams', async () => {
    const uploadId = id();
    await invoke('_Start', owner, options(uploadId));
    await files._preCollection.updateAsync(uploadId, { $unset: { 'file.userId': 1 } });
    const record = await files._preCollection.findOneAsync(uploadId);
    await files._currentUploads[uploadId].stop(false);
    delete files._currentUploads[uploadId];
    await denied('_Write', owner, { fileId: uploadId, chunkId: 1, binData: 'c2FmZQ==' });
    await denied('_Abort', owner, uploadId);
    expect(files._currentUploads[uploadId]).to.equal(undefined);
    expect(await files._preCollection.findOneAsync(uploadId)).to.deep.equal(record);
    expect((await fs.readFile(record.file.path)).length).to.equal(0);
  });
});
