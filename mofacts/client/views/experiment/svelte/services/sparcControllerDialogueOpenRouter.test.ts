import { createSparcStateTransitionHistoryRecord } from '../../../../../../learning-components/units/sparcsession/sparcStateTransitionHistory';
import { expect } from 'chai';
// The domain suite is discovered through this app-owned Meteor test entry.
import '../../../../../../learning-components/units/sparcsession/sparcDialogueOpenRouterAdapter.test';
import type { SparcControllerDisplay } from './sparcController';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import type { SparcInstructionComponents } from '../../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import { SPARC_CATEGORIZED_MOVE_DEFINITIONS } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import { SPARC_TARGET_CATEGORIES } from '../../../../../../learning-components/runtime/sparcTargetCategories';
import { SPARC_CATEGORIZED_AGENT_POLICY_ID, SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID } from '../../../../../../learning-components/runtime/sparcInstructionalPolicies';
import { composeSparcCategoryInstructions } from '../../../../../../learning-components/units/sparcsession/sparcCategoryInstructions';
import {
  createSparcDialogueOpenRouterProvider,
  type CallResolvedOpenRouterJson,
  type SparcDialogueLearnerResponseScoringTraceEvent,
  type SparcDialogueOpenRouterUsageEvent,
} from './sparcControllerDialogueOpenRouter.ts';
import { createEmptySparcReplayState } from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import {
  SPARC_DIALOGUE_MAX_MESSAGE_CHARACTERS,
  SPARC_DIALOGUE_UTTERANCE_MAX_TOKENS,
} from '../../../../../../learning-components/units/sparcsession/sparcDialogueTurnNodes';

const problemStatement = 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?';

function dialogueDisplay(): SparcControllerDisplay {
  return {
    pageKey: 'dialogue-doc',
    instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: SPARC_PROGRESSIVE_SCAFFOLDING_POLICY_ID, policyVersion: 1 },
    nodes: [{
      id: 'dialogue-thread',
      nodeType: 'group',
      groupType: 'dialogue-thread',
      children: [{
        id: 'opening-tutor-message',
        nodeType: 'atomic',
        atomType: 'dialogue-utterance',
        speaker: 'tutor',
        value: 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?',
      }],
    }],
    clusterTargets: [{
      clusterIndex: 0,
      clusterKC: 'kc-a',
    }, {
      clusterIndex: 1,
      clusterKC: 'kc-b',
    }],
    autoTutorTargets: {
      expectations: [{
        clusterKC: 'kc-a',
        text: 'A target text',
      }],
      misconceptions: [{
        id: 'mis-1',
        text: 'The learner thinks the wrong thing.',
      }],
    },
    workingMemoryFacts: [{
      factType: 'learningTarget.score',
      slots: {
        clusterKC: 'kc-a',
        coverage: 0.4,
      },
    }, {
      factType: 'diagnostic.misconceptionScore',
      slots: {
        id: 'mis-1',
        supportStrength: 0.5,
      },
    }],
  };
}

type ScorerDialogueEntry = Readonly<{
  speaker: 'learner' | 'tutor';
  text: string;
  component?: string;
  targetId?: string;
  responseId?: string;
  responseFormat?: string;
  figure?: { assetId: string; description: string; displayWidth: number };
}>;

function scorerContext(
  autoTutorTargets = dialogueDisplay().autoTutorTargets,
  dialogueHistory: readonly ScorerDialogueEntry[] = [{
    speaker: 'tutor',
    text: 'What happens after the first year?',
  }],
) {
  return {
    document: {
      id: 'dialogue-doc',
      schemaVersion: 2 as const,
      autoTutorTargets,
      workingMemoryFacts: [{
        factType: 'learningTarget.score',
        slots: { clusterKC: 'kc-a', coverage: 0.4 },
      }, {
        factType: 'diagnostic.misconceptionScore',
        slots: { id: 'mis-1', supportStrength: 0.5 },
      }, ...dialogueHistory.map((entry) => ({
        ...(entry.responseId ? { factId: entry.responseId } : {}),
        factType: 'dialogue.utterance',
        slots: { speaker: entry.speaker, text: entry.text, ...(entry.figure ? { figure: entry.figure } : {}),
          ...(entry.component ? { component: entry.component } : {}), ...(entry.targetId ? { targetId: entry.targetId } : {}),
          ...(entry.responseFormat ? { responseFormat: entry.responseFormat } : {}) },
      }))],
      root: { id: 'root', kind: 'document' as const },
    },
    replayState: createEmptySparcReplayState(),
    problemStatement,
    result: { submittedNodes: {}, timestamp: 1 },
    event: {
      eventId: 'score-event',
      type: 'response-submitted' as const,
      source: { pageKey: 'dialogue-doc', nodeId: 'learner-response-input' },
      time: 1,
    },
  };
}

function latestLearnerEvidence(quote: string) {
  return [{ source: 'learnerText' as const, dialogueHistoryIndex: null, quote }];
}

function dialogueLearnerEvidence(dialogueHistoryIndex: number, quote: string) {
  return [{ source: 'dialogueHistory' as const, dialogueHistoryIndex, quote }];
}

const utteranceRequest: SparcUtteranceRequest = {
  problemStatement,
  targetType: 'learningTarget',
  targetId: 'kc-a',
  action: 'hint',
  contentTexts: ['Use the authored hint.'],
  moveDefinition: requireActiveSparcMoveDefinition('hint'),
  responseModifiers: [],
  selectedAction: {
    targetType: 'learningTarget',
    clusterKC: 'kc-a',
    action: 'hint',
  },
  learnerText: 'I think A matters.',
  learnerContribution: {
    type: 'answer',
    confidence: 0.8,
  },
  pedagogicalState: {
    targetType: 'learningTarget',
    targetId: 'kc-a',
    selectedMove: 'hint',
  },
  targetContent: {
    clusterKC: 'kc-a',
    text: 'A target text',
  },
  plannerState: {
    expectations: [{ clusterKC: 'kc-a', coverage: 0.6 }],
  },
  dialogueHistory: [{
    role: 'student',
    text: 'Earlier answer.',
  }],
};

function utteranceRequestFor(
  action: 'pump' | 'prompt' | 'prompt-supported' | 'hint' | 'assertion' | 'question-deferral' | 'question-scope-refusal' | 'summary',
  targetType: 'learningTarget' | 'misconception' | 'learnerQuestion' | 'completion',
): SparcUtteranceRequest {
  const targetId = targetType === 'learningTarget'
    ? 'kc-a'
    : targetType === 'misconception'
      ? 'mis-1'
      : targetType === 'learnerQuestion'
        ? 'learner-question'
        : 'completion';
  const targetContent = targetType === 'misconception'
    ? {
        selectedMisconception: {
          id: 'mis-1',
          text: 'A fixed annual rate means the same dollar amount is added every year.',
        },
        correctExpectations: [{
          clusterKC: 'kc-a',
          text: 'Interest is earned on the original principal plus accumulated interest.',
        }],
      }
    : targetType === 'learnerQuestion'
      ? { contentFocused: action === 'question-deferral' }
      : targetType === 'completion'
      ? { summary: 'Interest compounds over time.' }
      : { clusterKC: 'kc-a', text: 'A target text' };
  return {
    ...utteranceRequest,
    targetType,
    targetId,
    action,
    contentTexts: targetType === 'learnerQuestion'
      ? []
      : targetType === 'misconception'
      ? ['A fixed annual rate means the same dollar amount is added every year.']
      : ['A target text'],
    moveDefinition: requireActiveSparcMoveDefinition(action),
    responseModifiers: [],
    selectedAction: { targetType, targetId, action },
    learnerText: targetType === 'learnerQuestion'
      ? 'Can you just tell me the answer?'
      : targetType === 'misconception'
      ? 'Well I guess you get $50 every year.'
      : 'I think A matters.',
    pedagogicalState: { targetType, targetId, selectedMove: action },
    targetContent,
  };
}

describe('SPARC dialogue OpenRouter provider', function() {
  it('returns no evaluations for unaddressed targets and separates KC and misconception summaries', async function() {
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      const schema = params.intent.schema as { properties: Record<string, {
        minItems: number; items: { properties: { evidenceDirection: { enum: string[] }; summary: { required: string[] } } };
      }> };
      const kc = schema.properties.learningTargetEvaluations;
      const misconception = schema.properties.diagnosticMisconceptionEvaluations;
      expect(kc!.minItems).to.equal(0);
      expect(misconception!.minItems).to.equal(0);
      expect(kc!.items.properties.evidenceDirection.enum).to.deep.equal(['supports', 'contradicts']);
      expect(kc!.items.properties.summary.required).to.deep.equal(['demonstrated', 'unresolved']);
      expect(misconception!.items.properties.summary.required).to.deep.equal(['demonstrated', 'incorrect', 'unresolved']);
      expect(params.messages[0]!.content).to.include('Omit unaddressed targets entirely');
      return { parsedContent: { learningTargetEvaluations: [], diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    const result = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'Okay.', ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(result.learningTargetScores).to.deep.equal([]);
    expect(result).not.to.have.property('diagnosticMisconceptionScores');
    expect(result).not.to.have.property('evidence');
  });

  it('passes the same retained KC requirements to question generation and cumulative reassessment', async function() {
    const prior = { kind: 'expectation' as const, id: 'kc-a',
      demonstrated: ['Giving method instructions before work differs from requesting an explanation afterward.'],
      unresolved: ['Use domain knowledge to choose the workflow.'] };
    const learnerText = 'Check archive records first, then compare captions.';
    let generatedEvidence: unknown;
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      const input = JSON.parse(String(params.messages[1]!.content));
      if (params.intent.schemaName.includes('question_primitive')) {
        generatedEvidence = input.assessment.evidence;
        return { parsedContent: { tutorMessage: 'Which research method uses the curator’s source expertise?', choices: [
          { id: 'a', label: learnerText, correct: true },
          { id: 'b', label: 'Use the newest caption.', correct: false },
          { id: 'c', label: 'Explain any chosen approach afterward.', correct: false },
        ] } };
      }
      expect(input.priorEvidence.map(({ citations: _citations, ...requirements }: Record<string, unknown>) => requirements)).to.deep.equal(generatedEvidence);
      expect(input.priorEvidence).to.deep.equal([{ ...prior, citations: [] }]);
      const instructions = String(params.messages[0]!.content);
      expect(instructions).to.include('evaluate which exact unresolved requirements the answer now demonstrates');
      expect(instructions).to.include('do not invent a different decomposition or extra requirements on each turn');
      expect(instructions).to.include('including carried earlier demonstrations and newly resolved requirements');
      return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 1,
        learnerEvidence: latestLearnerEvidence(learnerText),
        summary: { demonstrated: [...prior.demonstrated, ...prior.unresolved], unresolved: [] } }],
      diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    const action = 'instruction.dynamic.question.multiple-choice';
    await provider.generateTutorUtterance({ ...utteranceRequest, action, moveDefinition: requireActiveSparcMoveDefinition(action),
      plannerState: { evidence: [prior] } });
    const context = scorerContext();
    const result = await provider.scoreLearnerResponse({ ...context, display: dialogueDisplay(), learnerText,
      document: { ...context.document, workingMemoryFacts: [...context.document.workingMemoryFacts,
        { factType: 'instructional.evidence', factId: 'expectation:kc-a', slots: { ...prior, incorrect: [], citations: [] } }] },
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(result.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 1 }]);
    expect(result.evidence![0]!.demonstrated).to.deep.equal([...prior.demonstrated, ...prior.unresolved]);
    expect(result.evidence![0]!.unresolved).to.deep.equal([]);
  });

  it('rejects incorrect-claim fields in KC summaries instead of retaining them as KC evidence', async function() {
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson() {
      return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: .5,
        learnerEvidence: latestLearnerEvidence('A matters'), summary: { demonstrated: [], incorrect: ['Mistaken claim'], unresolved: [] } }],
      diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    let error: unknown;
    try { await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'A matters.', ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]); } catch (caught) { error = caught; }
    expect(String(error)).to.include('incorrect claims belong to misconceptions');
  });

  it('adds audience directions to every text primitive and leaves scoring prompts unchanged', async () => {
    for (const readingLevel of [undefined, 'unbiased', 'junior-high-freshman', 'high-school-freshman', 'college-freshman'] as const) {
      const generated: string[] = [], scoring: string[] = [];
      const provider = createSparcDialogueOpenRouterProvider({ ...(readingLevel ? { readingLevel } : {}),
        async callResolvedOpenRouterJson(params) {
          const system = String(params.messages[0]!.content);
          if (params.intent.schemaName === 'mofacts_sparc_dialogue_score') {
            scoring.push(system); throw new Error('scoring captured');
          }
          generated.push(system);
          if (params.intent.schemaName.includes('instruction_primitive') && 'workedExample' in (params.intent.schema as { properties: Record<string, unknown> }).properties) return { parsedContent: { tutorMessage: 'A complete explanation.', kind: 'worked-example', heading: 'Worked Example',
            workedExample: 'A complete teaching example.', imagePrompt: null, figureDescription: null, displayWidth: null } };
          return { parsedContent: { tutorMessage: 'A complete tutor response.' } };
        },
      });
      await provider.generateTutorUtterance(utteranceRequest);
      const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-rich-question.text');
      await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition });
      expect(generated).to.have.length(3);
      for (const prompt of generated) {
        if (readingLevel === 'junior-high-freshman') expect(prompt).to.include('a junior high freshman (grade 6)');
        else if (readingLevel === 'high-school-freshman') expect(prompt).to.include('a freshman high school student (grade 9)');
        else if (readingLevel === 'college-freshman') expect(prompt).to.include('a freshman college student (first year)');
        else expect(prompt).not.to.include('For learner-facing text only');
      }
      try { await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'An answer.', ...scorerContext() } as Parameters<typeof provider.scoreLearnerResponse>[0]); } catch (error) { expect(String(error)).to.include('scoring captured'); }
      expect(scoring).to.have.length(1);
      expect(scoring[0]).not.to.include('For learner-facing text only');
    }
  });
  it('retains oversized explanation and question text in one generated move without regeneration', async () => {
    const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-rich-question.text');
    const generated: string[] = [];
    const saved: Partial<SparcInstructionComponents> = {};
    const warnings: unknown[] = [];
    const text = 'An explanation with complete reasoning. '.repeat(80).trim();
    const provider = createSparcDialogueOpenRouterProvider({
      reportWarning: warning => { warnings.push(warning); },
      async callResolvedOpenRouterJson(params) {
        generated.push(params.intent.schemaName);
        if (params.intent.schemaName.includes('instruction_primitive') && 'workedExample' in (params.intent.schema as { properties: Record<string, unknown> }).properties) return { parsedContent: { tutorMessage: text, kind: 'worked-example', heading: 'Worked Example',
          workedExample: text, imagePrompt: null, figureDescription: null, displayWidth: null } };
        return { parsedContent: { tutorMessage: text } };
      },
    });
    const result = await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition,
      onInstructionCheckpoint: async checkpoint => { if (checkpoint.stage === 'accepted') Object.assign(saved, { explanation: checkpoint.content.text, richContent: checkpoint.content.support?.text }); },
      onInstructionComponent: async (kind, value) => { Object.assign(saved, { [kind]: value }); },
    }) as SparcInstructionComponents;
    expect(result).to.include({ richContent: text, explanation: text, question: text });
    expect(saved).to.include({ richContent: text, explanation: text, question: text });
    expect(generated).to.have.length(2);
    expect(warnings).to.have.length(6);
  });

  it('logs an oversized support heading and persists it unchanged without regeneration', async () => {
    const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-rich-question.text');
    const heading = 'Table of conditions and outcomes for comparing the available instructional cases';
    const warnings: unknown[] = [];
    let calls = 0;
    let savedHeading: string | undefined;
    const provider = createSparcDialogueOpenRouterProvider({
      reportWarning: warning => { warnings.push(warning); },
      async callResolvedOpenRouterJson(params) {
        calls++;
        if (params.intent.schemaName.includes('instruction_primitive') && 'workedExample' in (params.intent.schema as { properties: Record<string, unknown> }).properties) return { parsedContent: {
          tutorMessage: 'Compare the conditions in each case.', kind: 'table', heading, workedExample: '| Case | Outcome |\n| --- | --- |\n| A | Applies |',
          imagePrompt: null, figureDescription: null, displayWidth: null,
        } };
        expect(JSON.parse(String(params.messages[1]!.content)).supportHeading).to.equal(heading);
        return { parsedContent: { tutorMessage: 'Compare the conditions in each case.' } };
      },
    });
    const result = await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition,
      onInstructionCheckpoint: async checkpoint => { if (checkpoint.stage === 'accepted') savedHeading = checkpoint.content.support?.supportHeading; },
    }) as SparcInstructionComponents;
    expect(result.supportHeading).to.equal(heading);
    expect(savedHeading).to.equal(heading);
    expect(calls).to.equal(2);
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.include({ code: 'autotutor.outputLimit', field: 'heading',
      observedSize: heading.length, limit: 60, attempts: 1, outcome: 'continued' });
  });

  it('logs an oversized figure brief and creates the image without regeneration', async () => {
    let calls = 0;
    let images = 0;
    const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'lesson', sessionId: 'session',
      reportWarning: () => {},
      async callResolvedOpenRouterJson() {
        calls++;
        return { parsedContent: { tutorMessage: 'Which step is missing?', imagePrompt: 'A process with one missing step.',
          figureDescription: calls === 1 ? 'a'.repeat(2048) : 'The process.', displayWidth: 360 } };
      },
      async callSparcPromptImage(params) {
        images++; expect(calls).to.equal(1);
        expect(params.figureDescription).to.equal('a'.repeat(2048));
        return { tutorMessage: params.tutorMessage, figure: { assetId: 'image123', description: params.figureDescription, displayWidth: 360 } };
      },
    });
    await provider.generateTutorUtterance({ ...utteranceRequestFor('prompt-supported', 'learningTarget'), selectedAction: { snapshotId: 'same-event' } });
    expect(images).to.equal(1);
    expect(calls).to.equal(1);
  });
  it('retrieves a complete matched instruction before question generation and journals using the canonical history session', async function() {
    const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-rich-question.text');
    const order: string[] = [];
    const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'tdf', sessionId: 'opaque-provider-correlation',
      async callResolvedOpenRouterJson() { throw new Error('No generation should run on a library hit'); },
      async callSparcPromptImage() { throw new Error('No image generation should run on a library hit'); },
      moveLibrary: {
        async lookup(query) {
          expect(query.sessionId).to.equal('canonical-history-session');
          expect(query.context.specification).to.contain(definition.promptVersion);
          order.push(`lookup:${query.context.kind}`);
          return { status: 'hit', content: { text: `Saved ${query.context.kind}`,
            ...(query.context.kind === 'instruction' ? { support: { text: 'A complete saved worked case.', supportHeading: 'Worked Example' } } : {}) },
          reference: { entryId: `saved-${query.context.kind}`, version: 'sparc-moves-v1', source: 'retrieved', similarity: .99 } };
        },
        async publish() { throw new Error('Retrieved content must not be republished'); },
      },
    });
    const result = await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition,
      selectedAction: { snapshotId: 'event' }, historySessionId: 'canonical-history-session',
      onInstructionCheckpoint: async checkpoint => { order.push(`persist:instruction:${checkpoint.stage}`); },
      onInstructionComponent: async kind => { order.push(`persist:${kind}`); } }) as SparcInstructionComponents;
    expect(result.question).to.equal('Saved question');
    expect(result.richContent).to.equal('A complete saved worked case.');
    expect(order).to.deep.equal(['lookup:instruction', 'persist:instruction:accepted', 'lookup:question', 'persist:question']);
  });

  it('orients a starting explanation to the selected KC without inventing an opening answer or feedback', async function() {
    const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-question.text');
    const prompts: string[] = [];
    const provider = createSparcDialogueOpenRouterProvider({ callResolvedOpenRouterJson: async params => {
      prompts.push(String(params.messages[0]?.content));
      expect(String(params.messages[1]?.content)).to.contain('"lessonTopic":"Confidence intervals"');
      expect(String(params.messages[1]?.content)).not.to.contain('openingContext');
      return { parsedContent: { tutorMessage: params.intent.schemaName.includes('instruction_primitive')
        ? 'When first thinking about interval construction, begin with an estimate.' : 'How is the interval constructed?' } };
    } });
    await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition,
      problemStatement: 'Confidence intervals', learnerText: '', dialogueHistory: [], plannerState: { decision: { transition: 'start' } } });
    expect(prompts[0]).to.contain('Starting an expectation: give this selected concept a brief basis or purpose');
    expect(prompts[0]).to.contain('No learner answer or feedback exists yet');
    expect(prompts[0]).not.to.contain('Feedback has already been delivered');
    expect(prompts[1]).not.to.contain('Starting an expectation:');
  });
  it('realizes all 112 category/composition/format specifications with the selected instructions and actual support', async function() {
    for (const category of SPARC_TARGET_CATEGORIES) for (const definition of SPARC_CATEGORIZED_MOVE_DEFINITIONS) {
      const observed: string[] = [];
      const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'tdf', sessionId: 'session',
        async callSparcVisualSupport(params) { return { figure: { assetId: 'image123', description: params.figureDescription, displayWidth: 360 } }; },
        callResolvedOpenRouterJson: async params => {
        const system = String(params.messages[0]!.content);
        expect(system).to.contain('The KC text identifies the knowledge; its assigned KLI category supplies the learning-process focus');
        expect(system).to.contain('Combine every selected category focus');
        expect(system).not.to.match(/authored KC demands|specified KC demands|as the authored KC requires|recall or recognition target/i);
        for (const aspect of ['fact', 'model', 'rule']) {
          expect(system.includes(`${aspect.toUpperCase()}:`)).to.equal(category.split('-').includes(aspect));
        }
        if (category.split('-').includes('fact')) expect(system).to.contain('FACT: Focus on memory and fluency through retrieval and recall');
        if (category.split('-').includes('rule')) expect(system).to.contain('RULE: Focus on induction and refinement');
        if (category.split('-').includes('model')) expect(system).to.contain('MODEL: Focus on understanding and sense-making');
        observed.push(params.intent.schemaName);
        if (params.intent.schemaName.includes('instruction_primitive')) return { parsedContent: {
          tutorMessage: 'The condition determines whether the rule applies.',
          ...(definition.supportKind === 'visual' ? { kind: 'figure', workedExample: null, heading: null,
            imagePrompt: 'Case A and Case B under different conditions.', figureDescription: 'Case A compared with Case B.', displayWidth: 360 }
            : definition.components!.includes('richContent') ? { kind: 'comparison', workedExample: 'Case A meets the decisive condition. Case B does not.', heading: 'Comparison',
              imagePrompt: null, figureDescription: null, displayWidth: null } : {}),
        } };
        if (definition.components!.includes('richContent')) expect(String(params.messages[1]!.content)).to.contain('Case A');
        expect(system).to.contain('RESPONSE FORMAT:');
        return { parsedContent: { tutorMessage: definition.responseFormat === 'cloze' ? 'Which case meets the specified _____?' : 'Which case meets the specified condition?', ...(definition.responseFormat === 'true-false' ? {
          choices: [{ id: 'true', label: 'True', correct: true }, { id: 'false', label: 'False', correct: false }],
        } : definition.responseFormat === 'multiple-choice' ? {
          choices: [{ id: 'a', label: 'Case A', correct: true }, { id: 'b', label: 'Case B', correct: false }, { id: 'c', label: 'Neither case', correct: false }],
        } : {}) } };
      } });
      const output = await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId,
        targetContent: { clusterKC: 'kc-a', text: 'A target text', category },
        selectedAction: { snapshotId: 'category-case' },
        moveDefinition: { ...definition, promptPolicy: composeSparcCategoryInstructions(category, definition.components!, definition.responseFormat!) } }) as SparcInstructionComponents;
      expect(output.question).to.contain('Which case');
      expect(observed).to.have.length(definition.components!.includes('explanation') ? 2 : 1);
      if (definition.responseFormat === 'multiple-choice' || definition.responseFormat === 'true-false') expect(output.choices!.filter(choice => choice.correct)).to.have.length(1);
      else expect(output.choices).to.equal(undefined);
      if (definition.supportKind === 'visual') { expect(output.figure?.assetId).to.equal('image123'); expect(output.supportHeading).to.equal(undefined); }
      else if (definition.components!.includes('richContent')) expect(output.supportHeading).to.equal('Comparison');
    }
  });
  it('rejects generated MC options without one defensible answer instead of substituting text or another move', async function() {
    const definition = requireActiveSparcMoveDefinition('instruction.dynamic.question.multiple-choice');
    const provider = createSparcDialogueOpenRouterProvider({ callResolvedOpenRouterJson: async () => ({ parsedContent: {
      tutorMessage: 'Select a case.', choices: [{ id: 'a', label: 'A', correct: false }, { id: 'b', label: 'B', correct: false }, { id: 'c', label: 'C', correct: false }],
    } }) });
    let error: unknown;
    try { await provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition }); }
    catch (caught) { error = caught; }
    expect(String(error)).to.contain('exactly one correct');
  });
  it('realizes the retained component compositions through dependent primitives', async function() {
    for (const action of ['instruction.dynamic.question.text', 'instruction.dynamic.explanation-question.text', 'instruction.dynamic.explanation-rich-question.text']) {
      const definition = requireActiveSparcMoveDefinition(action);
      const output = { explanation: definition.components!.includes('explanation') ? 'An explanation.' : null,
        richContent: definition.components!.includes('richContent') ? 'In this worked case, A is 1 because of the rule.' : null,
        question: 'What follows?', ...(definition.components!.includes('richContent') ? { supportHeading: 'Worked Example' } : {}) };
      const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
        expect(params.intent.schema).to.have.property('additionalProperties', false);
        expect(params.messages[0]!.content).to.include(definition.promptPolicy);
        if (params.intent.schemaName.includes('instruction_primitive') && 'workedExample' in (params.intent.schema as { properties: Record<string, unknown> }).properties) return { parsedContent: { tutorMessage: output.explanation, kind: 'worked-example', heading: 'Worked Example', workedExample: output.richContent, imagePrompt: null, figureDescription: null, displayWidth: null } };
        return { parsedContent: { tutorMessage: params.intent.schemaName.includes('instruction_primitive') ? output.explanation : output.question } };
      } });
      expect(await provider.generateTutorUtterance({ ...utteranceRequest, action, moveDefinition: definition })).to.deep.equal(output);
    }
  });

  it('guides the initial question with earlier questions and accepts the first output without a repetition check', async function() {
    const evidence = { kind: 'expectation', id: 'kc-a', demonstrated: ['Known A'], unresolved: ['Remaining A'] };
    const calls: string[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const system = String(params.messages[0]!.content);
        const context = JSON.parse(String(params.messages[1]!.content));
        expect(context.assessment).to.deep.equal({ evidence: [evidence] });
        expect(context).not.to.have.property('dialogueHistory');
        expect(context).not.to.have.property('learnerText');
        expect(JSON.stringify(params.messages)).not.to.include('UNRELATED');
        const question = params.intent.schemaName.includes('question_primitive');
        expect(system.includes('Earlier question?')).to.equal(question);
        if (question) {
          expect(context.explanation).to.equal('Current explanation.');
          expect(system).to.include('different task or case');
          expect(system).to.include('changing only names, wording, or option order does not create a new task');
          expect(system).to.include('Do not broaden the target or add requirements');
        }
        calls.push(params.intent.schemaName);
        return { parsedContent: { tutorMessage: question ? 'Earlier question?' : 'Current explanation.' } };
      },
    });
    const output = await provider.generateTutorUtterance({ ...utteranceRequest, action: 'instruction.dynamic.explanation-question.text',
      moveDefinition: requireActiveSparcMoveDefinition('instruction.dynamic.explanation-question.text'),
      learnerText: 'UNRELATED previous answer',
      plannerState: { evidence: [evidence, { ...evidence, id: 'kc-b', demonstrated: ['UNRELATED target'] },
        { ...evidence, kind: 'misconception', demonstrated: ['UNRELATED colliding id'] }],
        expectations: [{ clusterKC: 'kc-b', text: 'UNRELATED score' }], candidates: ['UNRELATED candidate'] },
      dialogueHistory: [{ role: 'tutor', text: 'UNRELATED explanation', figure: { assetId: 'old', description: 'UNRELATED figure' } },
        { role: 'tutor', text: 'Earlier question?', responseId: 'old:question' }, { role: 'student', text: 'UNRELATED answer' }],
    });
    expect(calls).to.have.length(2);
    expect(output).to.deep.equal({ explanation: 'Current explanation.', richContent: null, question: 'Earlier question?' });
  });

  it('rejects rich output that cannot be rendered or invents an image asset', async function() {
    for (const richContent of ['<svg><circle /></svg>', '<img src="https://example.org/invented.png" alt="A diagram">']) {
      const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson() {
        return { parsedContent: { tutorMessage: 'Explanation.', kind: 'worked-example', heading: 'Worked Example', workedExample: richContent, imagePrompt: null, figureDescription: null, displayWidth: null } };
      } });
      let error: unknown;
      try { await provider.generateTutorUtterance({ ...utteranceRequest, action: 'instruction.dynamic.explanation-rich-question.text',
        moveDefinition: requireActiveSparcMoveDefinition('instruction.dynamic.explanation-rich-question.text') }); } catch (caught) { error = caught; }
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.include('Invalid written support');
    }
  });
  it('uses the actual generated figure and explanation for the isomorphic question and resumes saved support', async function() {
    const realized: Partial<{ -readonly [K in keyof SparcInstructionComponents]: SparcInstructionComponents[K] }> = {};
    let images = 0;
    let explanations = 0;
    let questions = 0;
    const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'tdf', sessionId: 'session',
      async callSparcVisualSupport(params) {
        images++; expect(params.imagePrompt).to.include('complete teaching figure');
        return { tutorMessage: params.tutorMessage, figure: { assetId: 'image123', description: params.figureDescription, displayWidth: params.displayWidth } };
      },
      async callResolvedOpenRouterJson(params) {
        if (params.intent.schemaName.includes('instruction_primitive')) {
          explanations++; expect(images).to.equal(0);
          expect(JSON.stringify(params.messages)).not.to.include('data:image/');
          return { parsedContent: { tutorMessage: 'The parameter stays fixed across repeated samples.', kind: 'figure', workedExample: null, heading: null,
            imagePrompt: 'Three intervals and a fixed mean.', figureDescription: 'Three different intervals and one fixed mean.', displayWidth: 360 } };
        }
        questions++;
        expect(String(params.messages[0]!.content)).to.include('Selected target for this question:');
        expect(String(params.messages[0]!.content)).to.include(JSON.stringify(request.contentTexts));
        const content = params.messages[1]!.content;
        expect(JSON.stringify(content)).to.include('parameter stays fixed');
        expect(JSON.stringify(content)).to.include('Three different intervals');
        expect(content).to.be.a('string');
        expect(JSON.stringify(params.messages)).not.to.include('data:image/');
        if (questions === 1) throw new Error('question provider failed');
        return { parsedContent: { tutorMessage: 'In a new repeated-sampling experiment, which quantity stays fixed?' } };
      },
    });
    const request: SparcUtteranceRequest = { ...utteranceRequest, action: 'instruction.dynamic.explanation-visual-question.text',
      moveDefinition: requireActiveSparcMoveDefinition('instruction.dynamic.explanation-visual-question.text'), selectedAction: { snapshotId: 'response-1' },
      onInstructionCheckpoint: async (checkpoint: import('../../../../../../learning-components/runtime/sparcMoveLibraryContract').SparcInstructionCheckpoint) => { Object.assign(request, { instructionCheckpoint: checkpoint }); },
      realizedInstruction: realized, onInstructionComponent: async (component, text, figure) => { realized[component] = text; if (figure) realized.figure = figure; } };
    let error: unknown;
    try { await provider.generateTutorUtterance(request); } catch (caught) { error = caught; }
    expect((error as Error).message).to.equal('question provider failed');
    const result = await provider.generateTutorUtterance(request) as SparcInstructionComponents;
    expect(result.figure!.assetId).to.equal('image123');
    expect(result.question).to.include('new repeated-sampling');
    expect(images).to.equal(1); expect(explanations).to.equal(1); expect(questions).to.equal(2);
  });
  it('propagates requested figure failure before asking a question without substituting a worked example', async function() {
    let questions = 0;
    const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'tdf', sessionId: 'session',
      async callSparcVisualSupport() { throw new Error('figure unavailable'); },
      async callResolvedOpenRouterJson(params) {
        if (params.intent.schemaName.includes('instruction_primitive')) return { parsedContent: { tutorMessage: 'An explanation.', kind: 'figure', workedExample: null, heading: null, imagePrompt: 'Draw the model.', figureDescription: 'The model.', displayWidth: 300 } };
        questions++; return { parsedContent: { tutorMessage: 'A question?' } };
      },
    });
    let error: unknown;
    try { await provider.generateTutorUtterance({ ...utteranceRequest, action: 'instruction.dynamic.explanation-visual-question.text',
      moveDefinition: requireActiveSparcMoveDefinition('instruction.dynamic.explanation-visual-question.text'), selectedAction: { snapshotId: 'response-2' } }); } catch (caught) { error = caught; }
    expect((error as Error).message).to.equal('figure unavailable'); expect(questions).to.equal(0);
  });
  for (const failure of ['composed-before', 'composed-after', 'visual', 'resolved-before', 'resolved-after', 'publish-after', 'accepted-before', 'accepted-after', 'question'] as const) {
    it(`resumes the matched instruction at its durable boundary after ${failure} failure`, async () => {
      const definition = requireActiveSparcMoveDefinition('instruction.dynamic.explanation-visual-question.text');
      let checkpoint: import('../../../../../../learning-components/runtime/sparcMoveLibraryContract').SparcInstructionCheckpoint | undefined;
      let failed = false, compositions = 0, visuals = 0, questions = 0, publications = 0;
      let accepted: import('../../../../../../learning-components/runtime/sparcMoveLibraryContract').SparcPrimitiveContent | undefined;
      const activities: string[] = [];
      const provider = createSparcDialogueOpenRouterProvider({ tdfId: 'lesson', sessionId: 'provider-session',
        onActivity: activity => { activities.push(activity); },
        async callResolvedOpenRouterJson(params) {
          if (params.intent.schemaName.includes('instruction_primitive')) {
            compositions++;
            return { parsedContent: { tutorMessage: 'The parameter remains fixed.', kind: 'figure', workedExample: null, heading: null,
              imagePrompt: 'Show three intervals against the same fixed parameter.', figureDescription: 'Three intervals and one parameter.', displayWidth: 360 } };
          }
          questions++;
          expect(checkpoint?.stage).to.equal('accepted');
          const context = JSON.parse(String(params.messages[1]!.content));
          expect(context.explanation).to.equal('The parameter remains fixed.');
          expect(context.figure.assetId).to.equal('image123');
          if (failure === 'question' && !failed) { failed = true; throw new Error('interrupted'); }
          return { parsedContent: { tutorMessage: 'What varies across samples?' } };
        },
        async callSparcVisualSupport(params) {
          visuals++;
          expect(checkpoint?.stage).to.equal('composed');
          expect(params.imagePrompt).to.include(checkpoint!.visualBrief!.imagePrompt);
          expect(checkpoint!.content.text).to.equal('The parameter remains fixed.');
          if (failure === 'visual' && !failed) { failed = true; throw new Error('interrupted'); }
          return { figure: { assetId: 'image123', description: params.figureDescription, displayWidth: 360 } };
        },
        moveLibrary: {
          async lookup(query) {
            expect(query.context.kind).to.be.oneOf(['instruction', 'question']);
            const embedding = Array.from({ length: 4096 }, (_, index) => Math.sin(index) / 64);
            expect(Buffer.byteLength(JSON.stringify(embedding))).to.be.greaterThan(16384);
            return { status: 'generate', ticket: { query, embedding }, previousQuestions: [] };
          },
          async publish(ticket, content) {
            if (ticket.query.context.kind === 'instruction') {
              publications++;
              accepted ??= structuredClone(content);
              if (failure === 'publish-after' && !failed) { failed = true; throw new Error('interrupted'); }
              return { accepted: true, content: accepted, reference: { entryId: 'instruction-entry', version: 'sparc-moves-v1', source: 'generated', similarity: null } };
            }
            return { accepted: true, content, reference: { entryId: 'question-entry', version: 'sparc-moves-v1', source: 'generated', similarity: null } };
          },
        },
      });
      const attempt = () => provider.generateTutorUtterance({ ...utteranceRequest, action: definition.moveId, moveDefinition: definition,
        selectedAction: { snapshotId: 'same-event' }, historySessionId: 'lesson-session', ...(checkpoint ? { instructionCheckpoint: structuredClone(checkpoint) } : {}),
        onInstructionCheckpoint: async next => {
          if (next.ticket) expect(next.ticket).not.to.have.property('embedding');
          createSparcStateTransitionHistoryRecord({ core: { userId: 'user', TDFId: 'lesson', sessionID: 'session', levelUnit: 0 },
            transition: { transitionId: `startup:instruction:${next.stage}`, event: { eventId: 'startup', type: 'document-loaded',
              source: { pageKey: 'page', nodeId: 'root' }, time: 1 },
              writes: [{ target: { pageKey: 'page', nodeId: 'root' }, key: 'instructionalComposition', value: next }] } });
          if (failure === `${next.stage}-before` && !failed) { failed = true; throw new Error('interrupted'); }
          checkpoint = structuredClone(next);
          if (failure === `${next.stage}-after` && !failed) { failed = true; throw new Error('interrupted'); }
        }, onInstructionComponent: async () => {},
      });
      let error: unknown;
      try { await attempt(); } catch (caught) { error = caught; }
      expect((error as Error).message).to.equal('interrupted');
      const output = await attempt() as SparcInstructionComponents;
      expect(output.explanation).to.equal('The parameter remains fixed.');
      expect(output.figure?.assetId).to.equal('image123');
      expect(compositions).to.equal(failure === 'composed-before' ? 2 : 1);
      expect(visuals).to.equal(failure === 'visual' || failure === 'resolved-before' ? 2 : 1);
      expect(questions).to.equal(failure === 'question' ? 2 : 1);
      expect(publications).to.equal(['publish-after', 'accepted-before'].includes(failure) ? 2 : 1);
      expect(activities).not.to.include('explanation');
      expect(activities).not.to.include('richContent');
    });
  }

  it('gives standalone feedback the existing assessment without next-move instructions', async function() {
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      expect(params.messages[0]!.content).to.include('Do not choose a new instructional target or ask another question');
      expect(params.messages[0]!.content).not.to.include('Active-target isolation');
      expect(params.messages[1]!.content).to.include('Existing assessment');
      expect(params.messages[1]!.content).to.include('0.4');
      return { parsedContent: { tutorMessage: 'The parameter is fixed; the intervals vary.' } };
    } });
    const result = await provider.generateTutorUtterance({ ...utteranceRequest, targetType: 'feedback', action: 'instruction.feedback',
      moveDefinition: requireActiveSparcMoveDefinition('instruction.feedback'), plannerState: { assessment: [{ clusterKC: 'kc-a', coverage: .4 }] } });
    expect(result).to.equal('The parameter is fixed; the intervals vary.');
  });
  it('scores a figure-supported answer from question and KC text without sending its figure context', async function() {
    const figure = { assetId: 'image123', description: 'A balance that includes earlier interest.', displayWidth: 360 };
    const learnerText = 'Interest is calculated on the total balance.';
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        expect(params.messages.every(message => typeof message.content === 'string')).to.equal(true);
        const input = JSON.parse(params.messages[1]!.content as string);
        expect(input.dialogueHistory).to.deep.equal([{ role: 'tutor', text: 'How is interest calculated?' }]);
        expect(JSON.stringify(params.messages)).not.to.include(figure.description);
        expect(input.learningTargets[0]).to.have.all.keys('clusterKC', 'text');
        expect(JSON.stringify(params.messages)).not.to.include('image_url');
        expect(JSON.stringify(params.messages)).not.to.include('data:image/');
        return { parsedContent: {
          learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6,
            learnerEvidence: latestLearnerEvidence('total balance') }],
          diagnosticMisconceptionEvaluations: [],
          learnerContribution: { type: 'answer' },
        } };
      },
    });
    const score = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText,
      ...scorerContext(undefined, [{ speaker: 'tutor', text: 'How is interest calculated?', figure }]),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(score.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 0.6 }]);
  });

  it('limits assessment to graph neighbors and embedded misconceptions, reusing authored vectors across turns', async () => {
    const expectations = Array.from({ length: 5 }, (_, i) => ({ clusterKC: `kc-${i}`, text: `Expectation ${i}` }));
    const misconceptions = Array.from({ length: 6 }, (_, i) => ({ id: `mis-${i}`, text: `Misconception ${i}` }));
    const targets = { expectations, misconceptions };
    const context = scorerContext(targets);
    const display = { ...dialogueDisplay(), autoTutorTargets: targets,
      instructionalController: { adapterId: 'sparc-autotutor-v1', policyId: SPARC_CATEGORIZED_AGENT_POLICY_ID, policyVersion: 1 } };
    (context.document.workingMemoryFacts as import('../../../../../../learning-components/units/sparcsession/sparcSessionContracts').SparcWorkingMemoryFact[]).push(
      { factType: 'instructional.activeCycle', slots: { targetKind: 'expectation', targetId: 'kc-0', status: 'active' } },
      ...expectations.slice(1).map((entry, i) => ({ factType: 'kcGraph.relationship', slots: {
        sourceClusterKC: 'kc-0', targetClusterKC: entry.clusterKC, strength: .9 - i * .1,
      } })),
    );
    let embeddings = 0;
    const provider = createSparcDialogueOpenRouterProvider({
      embedAssessmentTargets: async texts => { embeddings++; return texts.map(text => text.startsWith('Expectation') ? [1, 0]
        : [Number(text.at(-1)) + 1, 1]); },
      callResolvedOpenRouterJson: async params => {
        const input = JSON.parse(params.messages[1]!.content as string);
        expect(input.learningTargets.map((target: { clusterKC: string }) => target.clusterKC)).to.deep.equal(['kc-0', 'kc-1', 'kc-2', 'kc-3']);
        expect(input.misconceptions.map((target: { id: string }) => target.id)).to.deep.equal(['mis-5', 'mis-4', 'mis-3', 'mis-2']);
        return { parsedContent: {
          learningTargetEvaluations: [],
          diagnosticMisconceptionEvaluations: [],
          learnerContribution: { type: 'other' },
        } };
      },
    });
    await provider.prepareAssessment(display);
    expect(embeddings).to.equal(1);
    for (let i = 0; i < 2; i++) {
      const score = await provider.scoreLearnerResponse({ display, learnerText: 'Okay.', ...context,
      } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      expect(score.learningTargetScores).to.deep.equal([]);
      expect(score.diagnosticMisconceptionScores).to.equal(undefined);
    }
    expect(embeddings).to.equal(1);
  });

  it('evaluates a selected MC meaning as evidence rather than converting its answer key into coverage', async function() {
    const context = scorerContext();
    const learnerText = 'Interest is calculated on the total balance.';
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const input = JSON.parse(params.messages[1]!.content as string);
        expect(input).to.include({ learnerText, responseFormat: 'multiple-choice', selectedChoiceId: 'option-b' });
        expect(input).not.to.have.property('correct');
        expect(params.messages[0]!.content).to.include('Unselected distractors are not student beliefs');
        expect(params.messages[0]!.content).to.include('rather than independently producing the supplied explanation');
        return { parsedContent: {
          learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6,
            learnerEvidence: latestLearnerEvidence('total balance') }],
          diagnosticMisconceptionEvaluations: [],
          learnerContribution: { type: 'answer', confidence: 0.9 },
        } };
      },
    });
    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(), learnerText, ...context,
      event: { ...context.event, payload: { questionId: 'accepted-turn:question', responseFormat: 'multiple-choice', choiceId: 'option-b', correct: true } },
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(score.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 0.6 }]);
    expect(score.diagnosticMisconceptionScores).to.equal(undefined);
  });

  it('credits the meaning of a completed cloze statement without requiring an independently produced explanation', async () => {
    const context = scorerContext(undefined, [{ speaker: 'tutor', text: 'Interest is calculated on the total _____, including earlier interest.' }]);
    for (const learnerText of ['balance', 'balnce', 'account balance']) {
      const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
        const input = JSON.parse(params.messages[1]!.content as string);
        expect(input).to.include({ learnerText, responseFormat: 'cloze', questionId: 'cloze-question' });
        expect(input).not.to.have.property('selectedChoiceId');
        const system = String(params.messages[0]!.content);
        expect(system).to.contain('understanding of the entire statement');
        expect(system).to.contain('not as an isolated missing word');
        expect(system).to.contain('without treating the supplied wording as an independently constructed explanation');
        expect(system).to.contain('Do not impose a fixed cloze scoring ceiling');
        expect(system).to.contain('Accept equivalent wording and ordinary typographical errors');
        return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: .9,
          learnerEvidence: latestLearnerEvidence(learnerText) }], diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
      } });
      const score = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText, ...context,
        event: { ...context.event, payload: { questionId: 'cloze-question', responseFormat: 'cloze' } } } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      expect(score.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: .9 }]);
    }
  });
  it('interprets a False judgment as rejection of the saved statement rather than endorsement of its misconception', async () => {
    const context = scorerContext(undefined, [{ speaker: 'tutor', text: 'Interest is calculated only on the original deposit.' }]);
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      const input = JSON.parse(params.messages[1]!.content as string);
      expect(input).to.include({ learnerText: 'False', responseFormat: 'true-false', selectedChoiceId: 'false' });
      expect(input).not.to.have.property('correct');
      const system = String(params.messages[0]!.content);
      expect(system).to.contain('False rejects it');
      expect(system).to.contain('does not endorse its false claim or establish every alternative');
      return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: .7,
        learnerEvidence: latestLearnerEvidence('False') }], diagnosticMisconceptionEvaluations: [{ id: 'mis-1', evidenceDirection: 'contradicts', evidenceStrength: .8, learnerEvidence: latestLearnerEvidence('False') }], learnerContribution: { type: 'answer' } } };
    } });
    const score = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'False', ...context,
      event: { ...context.event, payload: { questionId: 'binary-question', responseFormat: 'true-false', choiceId: 'false', correct: true } } } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(score.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: .7 }]);
  });

  it('does not award cloze coverage automatically when the semantic evaluator finds no demonstrated meaning', async () => {
    const context = scorerContext(undefined, [{ speaker: 'tutor', text: 'Interest is calculated on the total _____, including earlier interest.' }]);
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      const input = JSON.parse(params.messages[1]!.content as string);
      expect(input).to.include({ learnerText: 'calendar', responseFormat: 'cloze' });
      return { parsedContent: { learningTargetEvaluations: [],
        diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    const score = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'calendar', ...context,
      event: { ...context.event, payload: { questionId: 'cloze-question', responseFormat: 'cloze' } } } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(score.learningTargetScores).to.deep.equal([]);
  });

  it('scores learner responses through server-resolved OpenRouter without choosing a move', async function() {
    const calls: unknown[] = [];
    const observedTrace: SparcDialogueLearnerResponseScoringTraceEvent[] = [];
    const observedUsage: SparcDialogueOpenRouterUsageEvent[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      tdfId: 'tdf-1',
      sessionId: 'opaque-session',
      onUsage(event) {
        observedUsage.push(event);
      },
      onLearnerResponseScoringTrace(event) {
        observedTrace.push(event);
      },
      async callResolvedOpenRouterJson(params) {
        calls.push(params);
        return {
          usage: {
            promptTokens: 100,
            cachedPromptTokens: 60,
          },
          sessionIdApplied: true,
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a',
              evidenceDirection: 'supports',
              evidenceStrength: 0.6,
              learnerEvidence: latestLearnerEvidence('I think A matters.'),
            }],
            diagnosticMisconceptionEvaluations: [],
            learnerContribution: {
              type: 'answer',
              confidence: 0.8,
            },
            learnerQuestion: {
              contentFocused: false,
            },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'I think A matters.',
      ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([{
      clusterKC: 'kc-a',
      coverage: 0.6,
    }]);
    expect(score.learnerContribution?.type).to.equal('answer');
    expect(score.learnerQuestion).to.equal(undefined);
    expect(observedTrace.map((event) => event.stage)).to.deep.equal([
      'provider-response',
      'evidence-parsed',
      'evaluation-completed',
    ]);
    expect(observedTrace[0]).to.have.nested.property(
      'parsedContent.learningTargetEvaluations[0].clusterKC',
      'kc-a',
    );
    const completedEvent = observedTrace.find((event) => event.stage === 'evaluation-completed');
    if (!completedEvent || completedEvent.stage !== 'evaluation-completed') {
      throw new Error('SPARC scoring provider did not expose the complete evaluation');
    }
    expect(completedEvent.evaluation.evidenceEnvelope.learningTargetEvaluations).to.deep.equal([{
      clusterKC: 'kc-a',
      evidenceDirection: 'supports',
      evidenceStrength: 0.6,
      learnerEvidence: latestLearnerEvidence('I think A matters.'),
    }]);
    expect(completedEvent.evaluation.evidenceEnvelope.diagnosticMisconceptionEvaluations).to.deep.equal([]);
    expect(completedEvent.evaluation.learnerResponseScore).to.deep.equal(score);
    expect(calls).to.have.length(1);
    expect(calls[0]).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_score');
    expect(calls[0]).to.have.property('temperature', 0);
    expect(calls[0]).to.not.have.property('maxTokens');
    expect(calls[0]).to.have.nested.property('intent.strictSchema', true);
    expect(calls[0]).to.have.property('tdfId', 'tdf-1');
    expect(calls[0]).to.have.property('sessionId', 'opaque-session');
    expect(observedUsage).to.deep.equal([{
      operation: 'scoring',
      usage: {
        promptTokens: 100,
        cachedPromptTokens: 60,
      },
      sessionIdApplied: true,
    }]);
    const systemMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[0];
    const scoringPrompt = String(systemMessage?.content);
    expect(scoringPrompt.split(/\s+/).length).to.be.lessThan(1000);
    expect(scoringPrompt.match(/^[1-5]\. .+$/gm)).to.deep.equal([
      '1. Interpret the answer in question context.',
      '2. Assess accumulated student evidence.',
      '3. Distinguish student evidence from supplied information.',
      '4. Report direction and coverage.',
      '5. Cite evidence and identify remaining requirements.',
    ]);
    expect(scoringPrompt).to.match(/Multiple-choice:/);
    expect(scoringPrompt).to.match(/Cloze:/);
    expect(scoringPrompt).to.match(/True\/false:/);
    const userMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[1];
    expect(userMessage).to.not.equal(undefined);
    if (!userMessage) {
      throw new Error('SPARC dialogue scoring call did not include a user message');
    }
    const scoringUserPayload = JSON.parse(userMessage.content);
    expect(scoringUserPayload).to.deep.include({
      learnerText: 'I think A matters.',
    });
    expect(Object.keys(scoringUserPayload)).to.deep.equal([
      'dialogueHistory',
      'learningTargets',
      'misconceptions',
      'priorEvidence',
      'learnerText',
      'evaluationDirective',
    ]);
    expect(scoringUserPayload.dialogueHistory).to.deep.equal([{
      role: 'tutor',
      text: 'What happens after the first year?',
    }]);
    expect(scoringUserPayload).not.to.have.property('problemStatement');
    expect((userMessage.content as string).indexOf('"learnerText"')).to.be.greaterThan(
      (userMessage.content as string).indexOf('"dialogueHistory"'),
    );
    expect((userMessage.content as string).indexOf('"evaluationDirective"')).to.be.greaterThan(
      (userMessage.content as string).indexOf('"learnerText"'),
    );
    expect(scoringUserPayload.evaluationDirective).to.be.a('string').and.not.be.empty;
    expect(scoringUserPayload.learningTargets[0]).to.deep.include({
      clusterKC: 'kc-a',
      text: 'A target text',
    });
    expect(scoringUserPayload.learningTargets[0]).to.not.have.property('priorCoverage');
    expect(scoringUserPayload.misconceptions[0]).to.deep.include({
      id: 'mis-1',
      text: 'The learner thinks the wrong thing.',
    });
    expect(scoringUserPayload.misconceptions[0]).to.not.have.property('priorSupportStrength');
    expect(userMessage.content).to.not.contain('learningTarget.score');
    expect(userMessage.content).to.not.contain('diagnostic.misconceptionScore');
    expect(userMessage.content).to.not.contain('instructional.activeCycle');
    expect(userMessage.content).to.not.contain('controller.selectedAction');
    expect(userMessage.content).to.not.contain('assertion');
    expect(userMessage.content).to.not.contain('proposition');
    expect(userMessage.content).to.not.contain('repairCriteria');
    expect(userMessage.content).to.not.contain('dialogue.moveContent');
    expect(systemMessage?.content).to.not.contain('Return only values changed by the latest response');
    expect(systemMessage?.content).to.not.contain('priorCoverage');
    expect(systemMessage?.content).to.not.contain('priorSupportStrength');
  });

  it('keeps assessment instructions stable and sizes the AutoTutor schema to the rubric while appending assessment dialogue', async function() {
    const calls: Array<Parameters<CallResolvedOpenRouterJson>[0]> = [];
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson(params) {
      calls.push(params);
      return { parsedContent: { learningTargetEvaluations: [], diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    const history: ScorerDialogueEntry[] = [
      { speaker: 'tutor', component: 'explanation', text: 'EXCLUDED explanation. '.repeat(500) },
      { speaker: 'tutor', component: 'richContent', text: 'EXCLUDED support. '.repeat(500) },
      { speaker: 'tutor', component: 'question', responseId: 'question-one', targetId: 'kc-a', responseFormat: 'text', text: 'What grows?',
        figure: { assetId: 'excluded-asset', description: 'EXCLUDED visual context.', displayWidth: 300 } },
      { speaker: 'learner', responseId: 'answer-one', text: 'A grows.' },
      { speaker: 'tutor', text: 'Correct: A grows.' },
    ];
    await provider.scoreLearnerResponse({ ...scorerContext(undefined, history), display: dialogueDisplay(), learnerText: 'A grows.' } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    const changedTargets = { expectations: [{ clusterKC: 'new-kc', text: 'A new proposition.' }], misconceptions: [] };
    await provider.scoreLearnerResponse({ ...scorerContext(changedTargets, [...history,
      { speaker: 'tutor', component: 'question', responseId: 'question-two', targetId: 'new-kc', responseFormat: 'cloze', text: 'The new relation is _____.' },
    ]), display: { ...dialogueDisplay(), autoTutorTargets: changedTargets }, learnerText: 'The new relation.' } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(calls[1]!.messages[0]).to.deep.equal(calls[0]!.messages[0]);
    const firstSchema = calls[0]!.intent.schema as { properties: Record<string, { maxItems?: number }> };
    const secondSchema = calls[1]!.intent.schema as typeof firstSchema;
    expect(firstSchema.properties.learningTargetEvaluations!.maxItems).to.equal(1);
    expect(firstSchema.properties.diagnosticMisconceptionEvaluations!.maxItems).to.equal(1);
    // Removing the misconception changes its budget, while the evidence contract stays identical.
    expect(secondSchema).to.deep.equal({ ...firstSchema, properties: { ...firstSchema.properties,
      diagnosticMisconceptionEvaluations: { ...firstSchema.properties.diagnosticMisconceptionEvaluations, maxItems: 0 },
    } });
    const firstText = calls[0]!.messages[1]!.content as string;
    const secondText = calls[1]!.messages[1]!.content as string;
    const first = JSON.parse(firstText), second = JSON.parse(secondText);
    expect(first.dialogueHistory).to.deep.equal([
      { role: 'tutor', text: 'What grows?', targetId: 'kc-a', responseFormat: 'text' },
      { role: 'student', text: 'A grows.' },
      { role: 'tutor', text: 'Correct: A grows.' },
    ]);
    expect(firstText).not.to.match(/EXCLUDED|excluded-asset|responseId|problemStatement|displayWidth|primitiveReference/);
    expect(first.learningTargets[0]).to.have.all.keys('clusterKC', 'text');
    expect(second.learningTargets).to.deep.equal(changedTargets.expectations);
    expect(secondText.startsWith('{"dialogueHistory":' + JSON.stringify(first.dialogueHistory).slice(0, -1))).to.equal(true);
  });

  it('resolves citations against compact assessment indexes while retaining the original learner response identity', async function() {
    const provider = createSparcDialogueOpenRouterProvider({ async callResolvedOpenRouterJson() {
      return { parsedContent: { learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.8,
        learnerEvidence: dialogueLearnerEvidence(1, 'A grows.'), summary: { demonstrated: ['A grows.'], unresolved: [] } }],
        diagnosticMisconceptionEvaluations: [], learnerContribution: { type: 'answer' } } };
    } });
    const context = scorerContext(undefined, [
      { speaker: 'tutor', component: 'explanation', text: 'Long explanation.' },
      { speaker: 'tutor', component: 'question', text: 'What grows?' },
      { speaker: 'learner', responseId: 'original-learner-answer', text: 'A grows.' },
      { speaker: 'tutor', text: 'Correct.' },
    ]);
    const before = JSON.stringify(context.document);
    const score = await provider.scoreLearnerResponse({ ...context, display: dialogueDisplay(), learnerText: 'I agree.' } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(score.evidence?.[0]?.citations).to.deep.equal([{ responseId: 'original-learner-answer', start: 0, end: 8 }]);
    expect(JSON.stringify(context.document)).to.equal(before);
  });

  it('accepts direction-relative contradiction strength while preserving the sparse downstream score contract', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0.8,
              learnerEvidence: latestLearnerEvidence('No, that is not how it works.'),
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'contradicts', evidenceStrength: 0.7,
              learnerEvidence: latestLearnerEvidence('No, that is not how it works.'),
            }],
            learnerContribution: { type: 'answer' },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'No, that is not how it works.',
      ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([]);
    expect(score.diagnosticMisconceptionScores).to.deep.equal([{ id: 'mis-1', supportStrength: 0 }]);
    expect(score.learnerContribution).to.deep.equal({ type: 'answer' });
  });

  it('requires learner question metadata for question contributions', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [],
            diagnosticMisconceptionEvaluations: [],
            learnerContribution: {
              type: 'question',
            },
          },
        };
      },
    });

    let error: unknown;
    try {
      await provider.scoreLearnerResponse({
        display: dialogueDisplay(),
        learnerText: 'Can you explain A?',
        ...scorerContext(),
      } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.equal(
      'SPARC learner question metadata is required when learnerContribution.type is question',
    );
  });

  it('accepts accumulated prior evidence when the latest learner contribution is off-task', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.4,
              learnerEvidence: dialogueLearnerEvidence(0, 'Earlier I explained A.'),
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5,
              learnerEvidence: dialogueLearnerEvidence(0, 'Earlier I explained A.'),
            }],
            learnerContribution: { type: 'off-task' },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'Can we talk about something else?',
      ...scorerContext(undefined, [{
        speaker: 'learner',
        text: 'Earlier I explained A.',
      }, {
        speaker: 'tutor',
        text: 'What happens after the first year?',
      }]),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([]);
    expect(score.diagnosticMisconceptionScores).to.equal(undefined);
    expect(score.learnerContribution).to.deep.equal({ type: 'off-task' });
  });

  it('rejects unaddressed, inconsistent, unknown, and duplicate evidence at the provider boundary', async function() {
    const invalidEnvelopes = [{
      learningTargetEvaluations: [{
        clusterKC: 'unknown-kc', evidenceDirection: 'supports', evidenceStrength: 0.6,
        learnerEvidence: latestLearnerEvidence('I am responding to the current problem.'),
      }],
      diagnosticMisconceptionEvaluations: [],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [],
      diagnosticMisconceptionEvaluations: [
        { id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5, learnerEvidence: latestLearnerEvidence('I am responding to the current problem.') },
        { id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.8, learnerEvidence: latestLearnerEvidence('I am responding to the current problem.') },
      ],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0.2,
        learnerEvidence: [],
      }],
      diagnosticMisconceptionEvaluations: [],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0,
        learnerEvidence: latestLearnerEvidence('I am responding to the current problem.'),
      }],
      diagnosticMisconceptionEvaluations: [],
      learnerContribution: { type: 'answer' },
    }];
    const expectedMessages = [
      'unknown learning target clusterKC "unknown-kc"',
      'duplicate diagnostic misconception id "mis-1"',
      'must be supports or contradicts; omit unaddressed targets',
      'evidenceStrength must be greater than 0 when evidenceDirection is contradicts',
    ];

    for (const [index, parsedContent] of invalidEnvelopes.entries()) {
      const observedTrace: SparcDialogueLearnerResponseScoringTraceEvent[] = [];
      const provider = createSparcDialogueOpenRouterProvider({
        onLearnerResponseScoringTrace(event) {
          observedTrace.push(event);
        },
        async callResolvedOpenRouterJson() {
          return { parsedContent };
        },
      });
      let error: unknown;
      try {
        await provider.scoreLearnerResponse({
          display: dialogueDisplay(),
          learnerText: 'I am responding to the current problem.',
          ...scorerContext(),
        } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.contain(expectedMessages[index]);
      expect(observedTrace.map((event) => event.stage)).to.deep.equal([
        'provider-response',
        ...(index === 2 ? [] : ['evidence-parsed']),
      ]);
      expect(observedTrace[0]).to.deep.equal({
        stage: 'provider-response',
        parsedContent,
      });
    }
  });

  it('retains the raw provider response trace when the evidence envelope cannot be parsed', async function() {
    const parsedContent = {
      learningTargetEvaluations: 'not-an-array',
      diagnosticMisconceptionEvaluations: [],
      learnerContribution: { type: 'answer' },
    };
    const observedTrace: SparcDialogueLearnerResponseScoringTraceEvent[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      onLearnerResponseScoringTrace(event) {
        observedTrace.push(event);
      },
      async callResolvedOpenRouterJson() {
        return { parsedContent };
      },
    });

    let error: unknown;
    try {
      await provider.scoreLearnerResponse({
        display: dialogueDisplay(),
        learnerText: 'I am responding to the current problem.',
        ...scorerContext(),
      } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.contain('learningTargetEvaluations must be an array');
    expect(observedTrace).to.deep.equal([{
      stage: 'provider-response',
      parsedContent,
    }]);
  });

  it('requires citations to agree with the evaluation direction', async function() {
    const invalidCitations = [{
      learnerEvidence: [],
      message: 'must cite at least one learner-authored phrase',
    }, {
      learnerEvidence: latestLearnerEvidence('Latest evidence.'),
      direction: 'unaddressed' as const,
      strength: 0,
      message: 'must be supports or contradicts; omit unaddressed targets',
    }];

    for (const invalid of invalidCitations) {
      const provider = createSparcDialogueOpenRouterProvider({
        async callResolvedOpenRouterJson() {
          return {
            parsedContent: {
              learningTargetEvaluations: [{
                clusterKC: 'kc-a',
                evidenceDirection: invalid.direction ?? 'supports',
                evidenceStrength: invalid.strength ?? 0.5,
                learnerEvidence: invalid.learnerEvidence,
              }],
              diagnosticMisconceptionEvaluations: [],
              learnerContribution: { type: 'answer' },
            },
          };
        },
      });
      let error: unknown;
      try {
        await provider.scoreLearnerResponse({
          display: dialogueDisplay(),
          learnerText: 'Latest evidence.',
          ...scorerContext(undefined, [{
            speaker: 'learner',
            text: 'Learner evidence.',
          }, {
            speaker: 'tutor',
            text: 'Tutor claim.',
          }]),
        } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.contain(invalid.message);
    }
  });

  it('keeps scoring with unchanged citations when a reference points to a tutor or missing entry', async function() {
    for (const citation of [
      ...dialogueLearnerEvidence(7, 'Latest learner answer.'),
      ...dialogueLearnerEvidence(7, 'Tutor claim.'),
      ...dialogueLearnerEvidence(8, 'Latest learner answer.'),
    ]) {
      const warnings: unknown[] = [];
      const traces: SparcDialogueLearnerResponseScoringTraceEvent[] = [];
      const provider = createSparcDialogueOpenRouterProvider({
        tdfId: 'tdf-demo',
        reportWarning: (warning) => { warnings.push(warning); },
        onLearnerResponseScoringTrace: (trace) => { traces.push(trace); },
        async callResolvedOpenRouterJson() {
          return { parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6,
              learnerEvidence: [citation],
            }],
            diagnosticMisconceptionEvaluations: [],
            learnerContribution: { type: 'answer' },
          } };
        },
      });
      const result = await provider.scoreLearnerResponse({
        display: dialogueDisplay(), learnerText: 'Latest learner answer.',
        ...scorerContext(undefined, Array.from({ length: 8 }, (_, index) => ({
          speaker: index % 2 === 0 ? 'learner' as const : 'tutor' as const,
          text: index % 2 === 0 ? 'Earlier learner answer.' : 'Tutor claim.',
        }))),
      } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      expect(result.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 0.6 }]);
      expect(warnings).to.deep.equal([{
        code: 'autotutor.citationMismatch', tdfId: 'tdf-demo', mismatchCount: 1,
      }]);
      const parsed = traces.find((trace) => trace.stage === 'evidence-parsed');
      expect(parsed?.stage === 'evidence-parsed'
        && parsed.evidenceEnvelope.learningTargetEvaluations[0]?.learnerEvidence).to.deep.equal([citation]);
      expect(traces.at(-1)?.stage).to.equal('evaluation-completed');
    }
  });

  it('keeps scores unchanged for quotation mismatches and reports one text-free warning per response', async function() {
    const warnings: unknown[] = [];
    const score = async (quote: string) => createSparcDialogueOpenRouterProvider({
      tdfId: 'tdf-demo',
      reportWarning: (warning) => { warnings.push(warning); },
      async callResolvedOpenRouterJson() {
        return { parsedContent: {
          learningTargetEvaluations: [{
            clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6,
            learnerEvidence: latestLearnerEvidence(quote),
          }],
          diagnosticMisconceptionEvaluations: [{
            id: 'mis-1', evidenceDirection: 'contradicts', evidenceStrength: 0.4,
            learnerEvidence: latestLearnerEvidence(quote),
          }],
          learnerContribution: { type: 'answer' },
        } };
      },
    }).scoreLearnerResponse({
      display: dialogueDisplay(), learnerText: 'I think A matters.', ...scorerContext(),
    } as Parameters<ReturnType<typeof createSparcDialogueOpenRouterProvider>['scoreLearnerResponse']>[0]);
    const exact = await score('I think A matters.');
    expect(warnings).to.deep.equal([]);
    const mismatched = await score('A matters to me.');
    expect(mismatched).to.deep.equal(exact);
    expect(warnings).to.deep.equal([{
      code: 'autotutor.citationMismatch', tdfId: 'tdf-demo', mismatchCount: 2,
    }]);
  });

  it('retains summaries but saves only verified learner citations when the provider mixes valid and invalid references', async function() {
    const warnings: unknown[] = [];
    const summary = { demonstrated: ['A matters'], unresolved: [] };
    const provider = createSparcDialogueOpenRouterProvider({
      reportWarning: warning => { warnings.push(warning); },
      async callResolvedOpenRouterJson() {
        return { parsedContent: {
          learningTargetEvaluations: [{ clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6, summary,
            learnerEvidence: [...latestLearnerEvidence('A matters'), ...latestLearnerEvidence('A paraphrase'),
              ...dialogueLearnerEvidence(0, 'Tutor claim.'), ...dialogueLearnerEvidence(99, 'Missing response')] }],
          diagnosticMisconceptionEvaluations: [],
          learnerContribution: { type: 'answer' },
        } };
      },
    });
    const result = await provider.scoreLearnerResponse({ display: dialogueDisplay(), learnerText: 'A matters.',
      ...scorerContext(undefined, [{ speaker: 'tutor', text: 'Tutor claim.' }]),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);
    expect(result.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 0.6 }]);
    expect(result.evidence).to.deep.equal([{ kind: 'expectation', id: 'kc-a', ...summary, incorrect: [],
      citations: [{ responseId: 'score-event:learner', start: 0, end: 9 }] }]);
    expect(warnings).to.have.length(1);
    expect(warnings[0]).to.have.property('mismatchCount', 3);
  });

  it('continues scoring when warning delivery throws or rejects', async function() {
    for (const reportWarning of [
      () => { throw new Error('diagnostic unavailable'); },
      () => Promise.reject(new Error('diagnostic unavailable')),
    ]) {
      const provider = createSparcDialogueOpenRouterProvider({
        reportWarning,
        async callResolvedOpenRouterJson() {
          return { parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.6,
              learnerEvidence: latestLearnerEvidence('Paraphrased evidence.'),
            }],
            diagnosticMisconceptionEvaluations: [],
            learnerContribution: { type: 'answer' },
          } };
        },
      });
      const result = await provider.scoreLearnerResponse({
        display: dialogueDisplay(), learnerText: 'I think A matters.', ...scorerContext(),
      } as Parameters<typeof provider.scoreLearnerResponse>[0]);
      expect(result.learningTargetScores).to.deep.equal([{ clusterKC: 'kc-a', coverage: 0.6 }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('normalizes non-increasing cumulative scores out of otherwise valid model envelopes', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.2,
              learnerEvidence: latestLearnerEvidence('I am responding to the current problem.'),
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5,
              learnerEvidence: latestLearnerEvidence('I am responding to the current problem.'),
            }],
            learnerContribution: { type: 'answer' },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'I am responding to the current problem.',
      ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([]);
    expect(score.diagnosticMisconceptionScores).to.equal(undefined);
    expect(score.learnerContribution?.type).to.equal('answer');
  });

  it('generates an aligned brief then a private image and supplies only its saved description on later turns', async function() {
    const utteranceRequest = utteranceRequestFor('prompt-supported', 'learningTarget');
    const figure = { assetId: 'image123', description: 'Two stages separated by an unfinished middle step.', displayWidth: 360 };
    let jsonCalls = 0;
    let imageCalls = 0;
    const provider = createSparcDialogueOpenRouterProvider({
      tdfId: 'lesson', sessionId: 'session',
      async callResolvedOpenRouterJson(params) {
        jsonCalls++;
        if (jsonCalls === 1) {
          expect(params.intent.schema.required).to.deep.equal(['tutorMessage', 'imagePrompt', 'figureDescription', 'displayWidth']);
          return { parsedContent: { tutorMessage: 'What happens between these stages?', imagePrompt: 'A polished illustration with its middle step omitted.', figureDescription: figure.description, displayWidth: figure.displayWidth } };
        }
        const content = params.messages[1]!.content;
        expect(content).to.be.a('string');
        expect(content).to.include(figure.description);
        expect(content).not.to.include('data:image/');
        expect(content).not.to.include('image_url');
        return { parsedContent: { tutorMessage: 'What is the next step?' } };
      },
      async callSparcPromptImage(params) {
        imageCalls++;
        expect(params.generationId).to.equal('event');
        expect(params.displayWidth).to.equal(360);
        expect(params.imagePrompt).to.contain('Intended display width: 360 CSS pixels');
        expect(params.imagePrompt).to.contain(utteranceRequest.problemStatement);
        expect(params.imagePrompt).to.contain('middle step omitted');
        expect(params.imagePrompt).to.contain('compact canvas shape');
        return { tutorMessage: params.tutorMessage, figure };
      },
    });
    expect(await provider.generateTutorUtterance({ ...utteranceRequest, selectedAction: { snapshotId: 'event' } }))
      .to.deep.equal({ tutorMessage: 'What happens between these stages?', figure });
    await provider.generateTutorUtterance({ ...utteranceRequestFor('hint', 'learningTarget'),
      dialogueHistory: [{ role: 'tutor', text: 'What happens between these stages?', figure }] });
    expect(imageCalls).to.equal(1);
    expect(jsonCalls).to.equal(2);
  });

  it('requires nonblank tutor text without delegating control metadata to the model', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            tutorMessage: '   ',
          },
        };
      },
    });

    let error: unknown;
    try {
      await provider.generateTutorUtterance(utteranceRequest);
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.equal('SPARC dialogue utterance response requires tutorMessage');
  });

  it('returns oversized provider text unchanged and logs its size after a single call', async () => {
    let calls = 0;
    const warnings: unknown[] = [];
    const text = 'a'.repeat(SPARC_DIALOGUE_MAX_MESSAGE_CHARACTERS + 1);
    const provider = createSparcDialogueOpenRouterProvider({
      reportWarning: warning => { warnings.push(warning); },
      async callResolvedOpenRouterJson() { calls++; return { parsedContent: { tutorMessage: text } }; },
    });
    expect(await provider.generateTutorUtterance(utteranceRequest)).to.equal(text);
    expect(calls).to.equal(1);
    expect(warnings).to.have.length(2);
  });

  it('returns constrained tutor text while the application retains target and move ownership', async function() {
    const observedUsage: SparcDialogueOpenRouterUsageEvent[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      sessionId: 'opaque-session',
      onUsage(event) {
        observedUsage.push(event);
      },
      async callResolvedOpenRouterJson(params) {
        expect(params).to.have.property('sessionId', 'opaque-session');
        expect(params).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_utterance');
        expect(params.intent.schema).to.deep.equal({
          type: 'object',
          additionalProperties: false,
          properties: {
            tutorMessage: {
              type: 'string',
              minLength: 1,
            },
          },
          required: ['tutorMessage'],
        });
        const userMessage = params.messages[1];
        expect(userMessage).to.not.equal(undefined);
        if (!userMessage) {
          throw new Error('SPARC dialogue utterance call did not include a user message');
        }
        expect(params.messages[0]?.content).to.contain('Selected move: hint.');
        expect(params.messages[0]?.content).to.contain('Move prompt:');
        expect(params.messages[0]?.content).to.contain('Follow the selected runtime move policy.');
        expect(params.messages[0]?.content).to.contain('Active-target isolation:');
        expect(params.messages[0]?.content).to.contain(
          'Do not preview or address a requirement outside the selected target',
        );
        expect(params.messages[0]?.content).to.contain('Acknowledgement boundary for every move');
        expect(params.messages[0]?.content).to.contain('Usually begin with one brief, natural response');
        expect(params.messages[0]?.content).to.contain('without agreeing with an incorrect claim');
        expect(params.messages[0]?.content).to.contain('rather than narrating the receipt or processing of their message');
        expect(params.messages[0]?.content).to.contain('avoid repeating the same opening pattern across nearby turns');
        expect(params.messages[0]?.content).to.contain('Learner-language and terminology boundary for every move');
        expect(params.messages[0]?.content).to.contain('use canonical authored terminology and silently normalize obvious misspellings');
        expect(params.messages[0]?.content).to.contain('Misconception boundary for every move');
        expect(params.messages[0]?.content).to.contain('do not praise, endorse, validate, or describe that claim as correct, useful progress, close, or a good start');
        expect(params.messages[0]?.content).to.contain('never mention content found only in an earlier response');
        expect(params.messages[0]?.content).to.not.contain('I hear you');
        expect(params.messages[0]?.content).to.not.contain('I hear that you think');
        expect(params).to.have.property('temperature', 0.15);
        expect(params).to.have.property('maxTokens', SPARC_DIALOGUE_UTTERANCE_MAX_TOKENS);
        expect(params.messages[0]?.content).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
        expect(params.messages[0]?.content).to.not.contain('selectedMisconception is an incorrect learner belief');
        expect(params.messages[0]?.content).to.not.contain('Use correctExpectations as the authoritative positive content');
        expect(params.messages[0]?.content).to.contain(
          'Generate only tutorMessage. The application owns the selected target and dialogue move metadata.',
        );
        expect(params.messages[0]?.content).to.contain('The JSON object must exactly follow this envelope shape:');
        expect(userMessage.content).to.contain('Lesson context (background for the selected target and actual preceding tutor question):');
        expect(userMessage.content).to.contain(problemStatement);
        expect(userMessage.content).to.contain('Latest student answer (the primary source for any acknowledgement):');
        expect((userMessage.content as string).indexOf('Latest student answer')).to.be.greaterThan(
          (userMessage.content as string).indexOf('Full dialogue history'),
        );
        expect(userMessage.content).to.contain('Target kind: learningTarget.');
        expect(userMessage.content).to.contain('Registered move definition:');
        expect(userMessage.content).to.not.contain('Immediate-feedback evidence:');
        expect(userMessage.content).to.contain('"targetId": "kc-a"');
        expect(userMessage.content).to.not.contain('Current scored planner state:');
        expect(params).to.have.nested.property('intent.strictSchema', true);
        expect(userMessage.content).to.contain('Full dialogue history:');
        return {
          usage: {
            promptTokens: 80,
            cachedPromptTokens: 20,
          },
          sessionIdApplied: true,
          parsedContent: {
            tutorMessage: 'Try using the authored hint.',
          },
        };
      },
    });

    expect(await provider.generateTutorUtterance(utteranceRequest))
      .to.equal('Try using the authored hint.');
    expect(observedUsage).to.deep.equal([{
      operation: 'utterance',
      usage: {
        promptTokens: 80,
        cachedPromptTokens: 20,
      },
      sessionIdApplied: true,
    }]);
  });

  it('orders a question-deferral modifier before the terminal scaffold move', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const systemPrompt = params.messages[0]?.content as string ?? '';
        const modifierIndex = systemPrompt.indexOf('Response modifier: question-deferral.');
        const selectedMoveIndex = systemPrompt.indexOf('Selected move: prompt.');
        expect(modifierIndex).to.be.greaterThan(-1);
        expect(selectedMoveIndex).to.be.greaterThan(modifierIndex);
        expect(systemPrompt).to.contain('Produce exactly one coherent tutorMessage with no more than one instructional question');
        expect(systemPrompt).to.contain('give brief and direct correctness feedback on that proposal');
        expect(systemPrompt).to.contain('Confirm it when correct');
        expect(systemPrompt).to.contain('confirm or reject only the proposition the learner supplied');
        expect(systemPrompt).to.contain('Do not calculate an unstated result');
        expect(systemPrompt).to.contain('Defer only when the learner asks the tutor to perform reasoning');
        expect(systemPrompt).to.not.contain('work with the problem a little longer');
        return {
          parsedContent: {
            tutorMessage: 'Let us work with that question a little longer. What relationship should you examine next?',
          },
        };
      },
    });
    const request: SparcUtteranceRequest = {
      ...utteranceRequest,
      action: 'prompt',
      moveDefinition: requireActiveSparcMoveDefinition('prompt'),
      responseModifiers: [{
        action: 'question-deferral',
        sourceRuleId: 'dialogue.question.defer',
        moveDefinition: requireActiveSparcMoveDefinition('question-deferral'),
      }],
    };

    expect(await provider.generateTutorUtterance(request))
      .to.equal('Let us work with that question a little longer. What relationship should you examine next?');
  });

  it('supplies the full Compound Interest learner trajectory for cumulative evidence', async function() {
    const display: SparcControllerDisplay = {
      ...dialogueDisplay(),
      autoTutorTargets: {
        expectations: [{
          clusterKC: 'compound.e1',
          text: 'After each compounding period, earned interest is added to the balance or principal.',
        }, {
          clusterKC: 'compound.e2',
          text: 'Later interest is calculated on the original principal plus previously earned interest.',
        }],
        misconceptions: [{
          id: 'M1',
          text: 'A fixed annual rate means the same dollar amount is added every year.',
        }],
      },
    };
    const cumulativeDialogueHistory: readonly ScorerDialogueEntry[] = [{
      speaker: 'learner',
      text: 'well I think it grows 50$ per year',
    }, {
      speaker: 'tutor',
      text: 'After the first year, is the second-year amount still $1,000?',
    }, {
      speaker: 'learner',
      text: 'its still 1000',
    }, {
      speaker: 'tutor',
      text: 'Interest left in the account is added to the balance.',
    }, {
      speaker: 'learner',
      text: 'after year 1 there is 1050 and in year 2 you add 52.50',
    }, {
      speaker: 'tutor',
      text: 'What amount is the year-2 interest based on?',
    }];
    const latestLearnerText = 'It is based on the total so far, so each year it is 5% of a larger number.';
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const scoreSchema = params.intent.schema as {
          properties?: Record<string, {
            minItems?: number;
            maxItems?: number;
            items?: { properties?: Record<string, Record<string, unknown>>; required?: string[] };
          }>;
        };
        const userMessage = JSON.parse(params.messages[1]?.content as string ?? '{}') as Record<string, unknown>;
        expect(userMessage).to.deep.include({
          learnerText: latestLearnerText,
        });
        expect(userMessage.dialogueHistory).to.deep.equal(cumulativeDialogueHistory.map((entry) => ({
          role: entry.speaker === 'learner' ? 'student' : 'tutor',
          text: entry.text,
        })));
        expect(userMessage.learningTargets).to.deep.include({
          clusterKC: 'compound.e2',
          text: 'Later interest is calculated on the original principal plus previously earned interest.',
        });
        expect((userMessage.learningTargets as Array<Record<string, unknown>>)[0]).to.not.have.property('priorCoverage');
        expect(userMessage.misconceptions).to.deep.include({
          id: 'M1',
          text: 'A fixed annual rate means the same dollar amount is added every year.',
        });
        expect((userMessage.misconceptions as Array<Record<string, unknown>>)[0]).to.not.have.property('priorSupportStrength');
        expect(scoreSchema.properties?.learningTargetEvaluations?.items?.properties).to.have.all.keys(
          'clusterKC', 'evidenceDirection', 'evidenceStrength', 'learnerEvidence', 'summary',
        );
        expect(scoreSchema.properties?.learningTargetEvaluations?.items?.required).to.deep.equal([
          'clusterKC', 'evidenceDirection', 'evidenceStrength', 'learnerEvidence', 'summary',
        ]);
        expect(scoreSchema.properties?.learningTargetEvaluations).to.include({ minItems: 0, maxItems: display.autoTutorTargets!.expectations!.length });
        expect(scoreSchema.properties?.learningTargetEvaluations?.items?.properties?.clusterKC)
          .to.deep.equal({ type: 'string', minLength: 1 });
        expect(scoreSchema.properties?.learningTargetEvaluations?.items?.properties?.evidenceStrength)
          .to.include({ minimum: 0, maximum: 1 });
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations?.items?.properties).to.have.all.keys(
          'id', 'evidenceDirection', 'evidenceStrength', 'learnerEvidence', 'summary',
        );
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations?.items?.required).to.deep.equal([
          'id', 'evidenceDirection', 'evidenceStrength', 'learnerEvidence', 'summary',
        ]);
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations).to.include({ minItems: 0, maxItems: display.autoTutorTargets!.misconceptions!.length });
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations?.items?.properties?.id)
          .to.deep.equal({ type: 'string', minLength: 1 });
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'compound.e1',
              evidenceDirection: 'supports',
              evidenceStrength: 0.85,
              learnerEvidence: dialogueLearnerEvidence(4, 'after year 1 there is 1050 and in year 2 you add 52.50'),
            }, {
              clusterKC: 'compound.e2',
              evidenceDirection: 'supports',
              evidenceStrength: 0.95,
              learnerEvidence: latestLearnerEvidence('based on the total so far'),
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'M1',
              evidenceDirection: 'contradicts',
              evidenceStrength: 1,
              learnerEvidence: latestLearnerEvidence('each year it is 5% of a larger number'),
            }],
            learnerContribution: { type: 'answer', confidence: 0.9 },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display,
      learnerText: latestLearnerText,
      ...scorerContext(display.autoTutorTargets, cumulativeDialogueHistory),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([{
      clusterKC: 'compound.e1',
      coverage: 0.85,
    }, {
      clusterKC: 'compound.e2',
      coverage: 0.95,
    }]);
    expect(score.diagnosticMisconceptionScores).to.equal(undefined);
  });

  it('constructs the eleven move prompts without attributing rubric text to the learner', async function() {
    const cases = [
      ['pump', 'learningTarget'],
      ['pump', 'misconception'],
      ['prompt', 'learningTarget'],
      ['prompt', 'misconception'],
      ['hint', 'learningTarget'],
      ['hint', 'misconception'],
      ['assertion', 'learningTarget'],
      ['assertion', 'misconception'],
      ['question-deferral', 'learnerQuestion'],
      ['question-scope-refusal', 'learnerQuestion'],
      ['summary', 'completion'],
    ] as const;
    const capturedMessages: Array<readonly { role: string; content: string }[]> = [];
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        capturedMessages.push(params.messages as readonly { role: string; content: string }[]);
        return {
          parsedContent: {
            tutorMessage: 'Constructed response.',
          },
        };
      },
    });

    for (const [move, targetType] of cases) {
      await provider.generateTutorUtterance(utteranceRequestFor(move, targetType));
    }

    expect(capturedMessages).to.have.length(cases.length);
    capturedMessages.forEach((messages, index) => {
      const [move, targetType] = cases[index]!;
      const systemPrompt = messages[0]?.content ?? '';
      const userPrompt = messages[1]?.content ?? '';
      expect(systemPrompt).to.contain(`Selected move: ${move}.`);
      expect(systemPrompt).to.contain('Acknowledgement boundary for every move');
      expect(systemPrompt).to.contain('rather than narrating the receipt or processing of their message');
      expect(systemPrompt).to.contain('avoid repeating the same opening pattern across nearby turns');
      expect(systemPrompt).to.contain('Learner-language and terminology boundary for every move');
      expect(systemPrompt).to.contain('Misconception boundary for every move');
      expect(systemPrompt.indexOf('Acknowledgement boundary for every move')).to.be.lessThan(
        systemPrompt.indexOf('Selected move:'),
      );
      expect(systemPrompt.indexOf('Misconception boundary for every move')).to.be.lessThan(
        systemPrompt.indexOf('Selected move:'),
      );
      expect(systemPrompt).to.contain('Do not attribute rubric language, unstated beliefs, or missing content to the learner.');
      expect(systemPrompt).to.contain('The JSON object must exactly follow this envelope shape:');
      expect(systemPrompt).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
      expect(systemPrompt).to.not.contain('I hear you');
      expect(systemPrompt).to.not.contain('I hear that you think');
      expect(userPrompt).to.contain(`Target kind: ${targetType}.`);
      expect(userPrompt).to.not.contain('App-selected plan.');

      if (move === 'pump') {
        expect(systemPrompt).to.contain('Explicitly identify the active concept before the open invitation');
        expect(userPrompt).to.contain('Lesson context (background for the selected target and actual preceding tutor question):');
        expect(userPrompt).to.contain(problemStatement);
        expect(userPrompt).to.contain('App-selected pedagogical state:');
        expect(userPrompt).to.not.contain('Current scored planner state:');
        if (targetType === 'misconception') {
          expect(userPrompt).to.contain('Internal diagnostic target context');
          expect(userPrompt).to.contain('A fixed annual rate means the same dollar amount is added every year.');
          expect(userPrompt).to.contain('mis-1');
        } else {
          expect(userPrompt).to.contain('Relevant authored target content:');
          expect(userPrompt).to.contain('A target text');
          expect(userPrompt).to.contain('kc-a');
        }
      } else if (targetType === 'misconception') {
        expect(systemPrompt).to.contain('If targetType is misconception');
        expect(userPrompt).to.contain(
          'Internal diagnostic target context (authored content; not necessarily the learner\'s expressed position):',
        );
        expect(userPrompt).to.contain('Well I guess you get $50 every year.');
        expect(userPrompt).to.contain('A fixed annual rate means the same dollar amount is added every year.');
        expect(userPrompt).to.not.contain('Relevant authored target content:');
      } else if (targetType === 'learnerQuestion') {
        expect(userPrompt).to.contain('Learner-question routing context (application classification):');
        expect(userPrompt).to.not.contain('Relevant authored target content:');
      } else {
        expect(userPrompt).to.contain('Relevant authored target content:');
      }
      if (targetType === 'learningTarget' && ['prompt', 'hint', 'assertion'].includes(move)) {
        expect(systemPrompt).to.contain('If targetType is learningTarget');
      }
      if (targetType === 'completion') {
        expect(systemPrompt).to.contain('For required-coverage completion');
      }
      if (move === 'question-deferral') {
        expect(systemPrompt).to.contain('Confirm it when correct');
        expect(systemPrompt).to.contain('Do not calculate an unstated result');
        expect(systemPrompt).to.contain('Defer only when the learner asks the tutor to perform reasoning');
        expect(userPrompt).to.contain('Learner-question routing context (application classification):');
      }
      if (move === 'question-scope-refusal') {
        expect(systemPrompt).to.contain('cannot discuss that subject');
      }
    });
  });
});
