import { expect } from 'chai';
import { buildImportLessonDraft } from './importCompositionBuilder';
import { buildImportPackageFromDraftLessons } from './importPackageBuilder';

describe('import package expression validation', function() {
  it('rejects an invalid expression introduced after draft generation before creating the ZIP', async function() {
    const draft = buildImportLessonDraft({
      id: 'expression-validation',
      sourceKind: 'manual',
      lessonName: 'Expression validation',
      instructions: 'Instructions',
      items: [{ prompt: { text: 'Question' }, response: { correctResponse: 'Answer' } }],
    });
    const practice = (draft.workingCopy.tutor as any).unit[1].learningsession;
    practice.calculateProbability = 'p.probability = globalThis.secret; return p';

    let error: unknown;
    try {
      await buildImportPackageFromDraftLessons([draft]);
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.contain('member access .secret is not allowed');
  });
});
