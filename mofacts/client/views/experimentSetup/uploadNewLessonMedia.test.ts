import { expect } from 'chai';
import { uploadNewLessonMedia } from './uploadNewLessonMedia';

describe('Content Upload media list', () => {
  const file = (name: string) => new File(['media'], name);

  it('skips existing files and repeated selections, counts successful uploads and preserves failures', async () => {
    const attempts: string[] = [];
    const files = ['existing.png', 'new.png', 'new.png', 'failed.png'].map(file);
    const error = new Error('upload failed');
    const result = await uploadNewLessonMedia(files, 'lesson', name => name === 'existing.png', async item => {
      attempts.push(item.name);
      if (item.name === 'failed.png') throw error;
    });
    expect(attempts).to.deep.equal(['new.png', 'failed.png']);
    expect(result).to.deep.equal({
      uploaded: 1, duplicates: ['existing.png', 'new.png'], errors: [{ name: 'failed.png', error }],
    });
  });

  it('skips an overlapping selection in the same scope and permits a retry after failure', async () => {
    let rejectFirst!: (error: Error) => void;
    const files = [file('map.png')];
    const first = uploadNewLessonMedia(files, 'one', () => false,
      () => new Promise<void>((_, reject) => { rejectFirst = reject; }));
    const second = await uploadNewLessonMedia(files, 'one', () => false, async () => { throw Error('unexpected upload'); });
    expect(second).to.deep.equal({ uploaded: 0, duplicates: ['map.png'], errors: [] });
    expect((await uploadNewLessonMedia(files, 'two', () => false, async () => {})).uploaded).to.equal(1);
    rejectFirst(new Error('network failure'));
    expect((await first).errors).to.have.length(1);
    expect((await uploadNewLessonMedia(files, 'one', () => false, async () => {})).uploaded).to.equal(1);
  });
});
