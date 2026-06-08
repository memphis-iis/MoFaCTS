import { expect } from 'chai';
import { createTarGzArchive, readTarGzArchive } from './tarArchive';

describe('tar archive helpers', function() {
  it('round-trips H5P content paths that require the ustar prefix field', async function() {
    const longPath = 'h5p-content/h5p-tester-drag-drop-matching-001/724e0b9f73f3e9334aac6b79e250b048c89e5b1d3f4d7bc3eb85af80fb40d5e8/content/content.json';
    const body = Buffer.from('{"ok":true}\n', 'utf8');

    const archive = await createTarGzArchive([{ name: longPath, body }]);
    const entries = await readTarGzArchive(archive);

    expect(entries).to.have.length(1);
    expect(entries[0]?.name).to.equal(longPath);
    expect(entries[0]?.body.toString('utf8')).to.equal(body.toString('utf8'));
  });
});
