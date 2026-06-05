import { expect } from 'chai';
import { buildAutoTutorAuthoringPrompt, buildItemAuthoringPrompt } from './aiContentPrompts';

describe('aiContentPrompts', function() {
  it('assembles item-generation guidance with selected modules, source, target counts, and attribution rules', function() {
    const prompt = buildItemAuthoringPrompt('Krebs cycle source text', ['learningSession', 'assessmentSession']);

    expect(prompt).to.contain('Selected modules: learningSession, assessmentSession');
    expect(prompt).to.contain('about 50 flash-card/practice items');
    expect(prompt).to.contain('about 20 quiz items');
    expect(prompt).to.contain('atomic knowledge components');
    expect(prompt).to.contain('Set visibility to "public" only');
    expect(prompt).to.contain('prompt.attribution');
    expect(prompt).to.contain('Source content:\nKrebs cycle source text');
  });

  it('assembles AutoTutor guidance with expectation counts and misconception quality criteria', function() {
    const prompt = buildAutoTutorAuthoringPrompt('multiplication tables');

    expect(prompt).to.contain('aim for about 5 expectations');
    expect(prompt).to.contain('Expectations should be atomic teachable propositions');
    expect(prompt).to.contain('MoFaCTS computes expectationRelationships separately from embeddings');
    expect(prompt).to.contain('Misconceptions should be common student misconceptions');
    expect(prompt).to.contain('Return JSON only with this shape');
    expect(prompt).to.contain('Source content:\nmultiplication tables');
  });
});
