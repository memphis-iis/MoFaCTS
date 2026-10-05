import { expect } from 'chai';
import { saveEditedContent, formatPackageUpdateWarnings } from './contentUpdateWarningsClient';

describe('editor owner review submission', function() {
  const review = { status: 'confirmation-required', tdfId: 'lesson', lessonName: 'Lesson', expectedRevision: 3, structuralWarnings: ['questions-removed'] };
  it('cancels without submitting a confirmed write', async function() {
    let calls = 0;
    const saved = await saveEditedContent({ method: 'saveTdfStimuli', args: ['lesson', {}, null],
      callAsync: async () => { calls++; return review; }, confirm: async () => false });
    expect(saved).to.equal(false);
    expect(calls).to.equal(1);
  });
  it('resubmits the same proposed content and review revision despite in-page edits', async function() {
    const proposed = { setspec: { clusters: [{ stims: [{ display: 'original' }] }] } };
    const calls: any[][] = [];
    const saved = await saveEditedContent({ method: 'saveTdfStimuli', args: ['lesson', proposed, null],
      callAsync: async (_method, ...args) => { calls.push(args); return calls.length === 1 ? review : { success: true }; },
      confirm: async () => { proposed.setspec.clusters[0]!.stims[0]!.display = 'later edit'; return true; } });
    expect(saved).to.equal(true);
    expect(calls[1]!.slice(0, 3)).to.deep.equal(calls[0]);
    expect(calls[1]![3]).to.deep.equal({ expectedRevision: 3, confirmed: true });
  });
  it('retains lesson identification in multi-lesson package warning summaries', function() {
    const text = formatPackageUpdateWarnings([
      { lessonName: 'First synthetic lesson', structuralWarnings: ['questions-removed'] },
      { lessonName: 'Second synthetic lesson', structuralWarnings: ['unit-sequence-changed'] },
    ]);
    expect(text).to.include('First synthetic lesson');
    expect(text).to.include('Second synthetic lesson');
  });
});
