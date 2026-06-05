import { expect } from 'chai';
import { buildAutoTutorDraft, buildDrafts } from './aiContentDraftBuilder';
import { validateAiOutput, validateAutoTutorOutput } from './aiContentValidation';

describe('aiContentDraftBuilder', function() {
  it('maps one item pool into learning and assessment drafts with module-specific structure', function() {
    const validation = validateAiOutput({
      lessonName: 'Spanish Basics',
      instructions: 'Answer each item.',
      promptType: 'text',
      responseType: 'typed',
      visibility: 'public',
      tags: ['spanish', 'ai'],
      items: [
        { prompt: { text: 'rojo' }, response: { correctResponse: 'red' } },
        { prompt: { text: 'azul' }, response: { correctResponse: 'blue' } },
      ],
    });

    const drafts = buildDrafts(validation.output, ['learningSession', 'assessmentSession', 'autoTutor']);

    expect(drafts).to.have.length(2);
    expect(drafts.map((draft) => draft.title)).to.deep.equal(['Spanish_Basics', 'Spanish_Basics_Assessment']);
    const learningTutor = drafts[0]!.workingCopy.tutor as { setspec: Record<string, unknown>; unit: Array<Record<string, unknown>> };
    const assessmentTutor = drafts[1]!.workingCopy.tutor as { setspec: Record<string, unknown>; unit: Array<Record<string, unknown>> };
    expect(learningTutor.setspec.userselect).to.equal('true');
    expect(learningTutor.unit.some((unit) => Boolean(unit.learningsession))).to.equal(true);
    expect(assessmentTutor.unit.some((unit) => Boolean(unit.assessmentsession))).to.equal(true);
    expect(drafts[0]!.workingCopy.stimuli.setspec.clusters).to.have.length(2);
    expect(drafts[1]!.workingCopy.stimuli.setspec.clusters).to.have.length(2);
  });

  it('builds an AutoTutor draft with script, graduation settings, and private/public visibility', function() {
    const validation = validateAutoTutorOutput({
      lessonName: 'Krebs Tutor',
      prompt: 'Explain the Krebs cycle.',
      topic: 'Krebs cycle',
      learningGoal: 'Explain the inputs and outputs of the Krebs cycle.',
      idealAnswer: 'The Krebs cycle oxidizes acetyl-CoA and produces electron carriers.',
      expectations: [
        { id: 'E1', proposition: 'Acetyl-CoA enters the cycle.', assertion: 'Acetyl-CoA enters the cycle.' },
        { id: 'E2', proposition: 'The cycle makes electron carriers.', assertion: 'The cycle makes electron carriers.' },
      ],
      expectationRelationships: {
        E1: { E2: 0.8 },
      },
      expectationRelationshipProvenance: {
        graphVersion: 'autotutor-expectation-relationships-v1',
        generatedAt: '2026-06-05T00:00:00.000Z',
        model: 'google/gemini-embedding-001',
        attemptedModels: ['google/gemini-embedding-001'],
        metric: 'cosine_similarity_normalized_vectors',
        scoreTransform: 'clamp_negative_to_zero',
        sourceKeyType: 'user',
        cacheKey: 'cache-key',
      },
      misconceptions: [
        {
          id: 'M1',
          misconception: 'The Krebs cycle directly makes most ATP.',
          correction: 'It mainly makes electron carriers.',
          repairQuestion: 'What does the Krebs cycle mainly produce?',
        },
      ],
      maxTurns: 12,
      requiredExpectationCount: 1,
      visibility: 'private',
    });

    const draft = buildAutoTutorDraft(validation.output, 'test-openrouter-key', 'openai/test-model');
    const tutor = draft.workingCopy.tutor as { setspec: Record<string, unknown>; unit: Array<Record<string, any>> };
    const firstStim = (draft.workingCopy.stimuli.setspec.clusters[0] as any).stims[0];

    expect(draft.title).to.equal('Krebs_Tutor');
    expect(tutor.setspec.userselect).to.equal('false');
    expect(tutor.setspec.openRouterApiKey).to.equal('test-openrouter-key');
    expect(tutor.setspec.openRouterModel).to.equal('openai/test-model');
    expect(tutor.unit[0]!.autotutorsession.maxTurns).to.equal(12);
    expect(tutor.unit[0]!.autotutorsession.graduation.requiredExpectationCount).to.equal(1);
    expect(firstStim.display.text).to.equal('Explain the Krebs cycle.');
    expect(firstStim.autoTutor.expectations[0].id).to.equal('E1');
    expect(firstStim.autoTutor.expectationRelationships).to.deep.equal({ E1: { E2: 0.8 } });
    expect(firstStim.autoTutor.expectationRelationshipProvenance.cacheKey).to.equal('cache-key');
    expect(firstStim.autoTutor.dialogPolicy.requiredExpectations).to.deep.equal(['E1', 'E2']);
  });
});
