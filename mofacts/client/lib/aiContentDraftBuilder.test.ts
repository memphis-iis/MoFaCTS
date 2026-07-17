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

  it('builds a clean SPARC AutoTutor draft with canonical dialogue rules and private/public visibility', function() {
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
    const stimuli = draft.workingCopy.stimuli as any;
    const sparcPage = stimuli.setspec.sparcPages[0];
    const display = sparcPage.display;

    expect(draft.title).to.equal('SPARC_AutoTutor_Krebs_Tutor');
    expect(tutor.setspec.userselect).to.equal('false');
    expect(tutor.setspec.openRouterApiKey).to.equal('test-openrouter-key');
    expect(tutor.setspec.openRouterModel).to.equal('openai/test-model');
    expect(tutor.setspec.tags).to.deep.equal(['autotutor', 'sparc-session', 'sparc-autotutor', 'ai-generated']);
    expect(tutor.setspec.tags).not.to.include('autotutor-converted');
    expect(tutor.unit[0]!.autotutorsession).to.equal(undefined);
    expect(tutor.unit[0]!.sparcsession).to.include({
      unitMode: 'distance',
      pageId: 'sparc-session-sparc-autotutor-krebs-tutor',
      clusterlist: '0-1',
    });
    expect(tutor.unit[0]!.sparcsession.calculateProbability).to.be.a('string').and.contain('pFunc.logitdec');

    expect(stimuli.setspec.clusters).to.have.length(2);
    expect(stimuli.setspec.clusters[0].clusterKC).to.equal('autotutor.sparc-autotutor-krebs-tutor.kc.e1');
    expect(stimuli.setspec.clusters[0].stims[0]).to.deep.equal({
      clusterKC: 'autotutor.sparc-autotutor-krebs-tutor.kc.e1',
      text: 'Acetyl-CoA enters the cycle.',
    });

    expect(sparcPage.pageId).to.equal('sparc-session-sparc-autotutor-krebs-tutor');
    expect(display.schema).to.equal('tutorscript-sparc/2.0');
    expect(display.unitType).to.equal('sparc-autotutor-dialogue');
    expect(display.instructionalController).to.deep.equal({
      adapterId: 'sparc-autotutor-v1',
      policyId: 'progressive-scaffolding-v1',
      policyVersion: 1,
      parameters: {
        minimumProgress: 0.3,
        progressResponse: 'deescalate',
        nonAddressingResponse: 'hold',
        postAssertionResponse: 'cycle-to-pump',
      },
    });
    expect(display.clusterTargets).to.deep.equal([
      {
        clusterIndex: 0,
        clusterKC: 'autotutor.sparc-autotutor-krebs-tutor.kc.e1',
      },
      {
        clusterIndex: 1,
        clusterKC: 'autotutor.sparc-autotutor-krebs-tutor.kc.e2',
      },
    ]);
    expect(display.autoTutorTargets.expectations).to.deep.equal([
      {
        clusterKC: 'autotutor.sparc-autotutor-krebs-tutor.kc.e1',
        text: 'Acetyl-CoA enters the cycle.',
      },
      {
        clusterKC: 'autotutor.sparc-autotutor-krebs-tutor.kc.e2',
        text: 'The cycle makes electron carriers.',
      },
    ]);
    expect(display.autoTutorTargets.misconceptions).to.deep.equal([
      {
        id: 'M1',
        text: 'The Krebs cycle directly makes most ATP.',
      },
    ]);
    expect(display.productionRules.map((rule: any) => rule.id)).to.deep.equal([
      'dialogue.completion.summary',
      'dialogue.scaffold.pump',
      'dialogue.scaffold.prompt',
      'dialogue.scaffold.hint',
      'dialogue.scaffold.assertion',
    ]);
    expect(JSON.stringify(draft.workingCopy)).not.to.contain('autotutorsession');
    expect(JSON.stringify(display.clusterTargets)).not.to.match(/sourceAutoTutor|stimulusKC|KCId|KCDefault|KCCluster/);
  });

  it('packages referenced uploaded WebP assets under the exact generated stimulus filename', function() {
    const validation = validateAiOutput({
      lessonName: 'Bird Photos',
      promptType: 'text-image',
      items: [{ prompt: { text: 'Identify this bird.', imgSrc: 'bird.webp' }, response: { correctResponse: 'warbler' } }],
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const drafts = buildDrafts(validation.output, ['learningSession'], [{
      id: 'image-1',
      originalName: 'bird.jpg',
      sourcePath: 'birds/bird.jpg',
      packageFileName: 'bird.webp',
      bytes,
      width: 1280,
      height: 720,
    }]);

    expect(drafts[0]!.generatedBaseline.mediaFiles['bird.webp']).to.deep.equal(bytes);
    expect(drafts[0]!.stats?.mediaCount).to.equal(1);
    expect((drafts[0]!.workingCopy.stimuli.setspec.clusters[0] as any).stims[0].display.imgSrc).to.equal('bird.webp');
  });
});
