import { expect } from 'chai';
import { createLessonArchiveUpload } from './packageUploadClient';

describe('lesson archive replacement', function() {
  it('uploads the supplied bytes under a distinct name on each collision', async function() {
    const original = new File(['original'], 'lesson.zip');
    const replacement = new Blob(['replacement']);
    const lookup = async (name: string) => name === original.name ? original : null;
    const first = await createLessonArchiveUpload(replacement, original.name, lookup);
    const second = await createLessonArchiveUpload(replacement, original.name, lookup);
    expect(first.name).to.match(/^lesson-.+\.zip$/);
    expect(second.name).not.to.equal(first.name);
    expect(first.type).to.equal('application/zip');
    expect(await first.text()).to.equal('replacement');
    expect(await original.text()).to.equal('original');
  });

  it('preserves the requested filename for a first upload', async function() {
    const file = await createLessonArchiveUpload(new Blob(['first']), 'lesson.zip', async () => null);
    expect(file.name).to.equal('lesson.zip');
  });
});
