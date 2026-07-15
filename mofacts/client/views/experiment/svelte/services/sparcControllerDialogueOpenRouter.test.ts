import { expect } from 'chai';
import type { SparcControllerDisplay } from './sparcController';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import { createSparcDialogueOpenRouterProvider } from './sparcControllerDialogueOpenRouter.ts';
import { createEmptySparcReplayState } from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';

const problemStatement = 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?';

function dialogueDisplay(): SparcControllerDisplay {
  return {
    pageKey: 'dialogue-doc',
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
        confidence: 0.7,
      },
    }],
  };
}

function scorerContext() {
  return {
    document: {
      id: 'dialogue-doc',
      schemaVersion: 2 as const,
      workingMemoryFacts: [{
        factType: 'learningTarget.score',
        slots: { clusterKC: 'kc-a', coverage: 0.4 },
      }, {
        factType: 'diagnostic.misconceptionScore',
        slots: { id: 'mis-1', confidence: 0.7 },
      }, {
        factType: 'dialogue.utterance',
        slots: { speaker: 'tutor', text: 'What happens after the first year?' },
      }],
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

const utteranceRequest: SparcUtteranceRequest = {
  problemStatement,
  targetType: 'learningTarget',
  targetId: 'kc-a',
  action: 'hint',
  contentTexts: ['Use the authored hint.'],
  moveDefinition: requireActiveSparcMoveDefinition('hint'),
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
  action: 'pump' | 'prompt' | 'hint' | 'assertion' | 'question-deferral' | 'question-scope-refusal' | 'summary',
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
  it('scores learner responses through server-resolved OpenRouter without choosing a move', async function() {
    const calls: unknown[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      tdfId: 'tdf-1',
      async callResolvedOpenRouterJson(params) {
        calls.push(params);
        return {
          parsedContent: {
            learningTargetScores: [{
              clusterKC: 'kc-a',
              coverage: 0.6,
            }],
            diagnosticMisconceptionScores: [],
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
    expect(calls).to.have.length(1);
    expect(calls[0]).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_score');
    expect(calls[0]).to.not.have.nested.property('intent.strictSchema', true);
    expect(calls[0]).to.have.property('tdfId', 'tdf-1');
    const systemMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMessage?.content).to.contain('coverage is cumulative evidence');
    expect(systemMessage?.content).to.contain('Later shorthand, omission, or context-dependent restatement must not reduce it');
    expect(systemMessage?.content).to.contain('legitimate question about the current problem or lesson content');
    const userMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[1];
    expect(userMessage).to.not.equal(undefined);
    if (!userMessage) {
      throw new Error('SPARC dialogue scoring call did not include a user message');
    }
    expect(JSON.parse(userMessage.content)).to.deep.include({
      learnerText: 'I think A matters.',
      problemStatement: 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?',
    });
    expect(JSON.parse(userMessage.content).dialogueHistory).to.deep.equal([{
      role: 'tutor',
      text: 'What happens after the first year?',
    }]);
    expect(JSON.parse(userMessage.content).learningTargets[0]).to.deep.include({
      clusterKC: 'kc-a',
      text: 'A target text',
      priorCoverage: 0.4,
    });
    expect(JSON.parse(userMessage.content).misconceptions[0]).to.deep.include({
      id: 'mis-1',
      text: 'The learner thinks the wrong thing.',
      priorConfidence: 0.7,
    });
    expect(userMessage.content).to.not.contain('assertion');
    expect(userMessage.content).to.not.contain('proposition');
    expect(userMessage.content).to.not.contain('repairCriteria');
    expect(userMessage.content).to.not.contain('dialogue.moveContent');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Do not score the latest response from scratch');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Include a learningTargetScores row only when the latest response changes');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Resolve learner references using the current problem statement and dialogue context');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('A high misconception confidence is not a good score');
  });

  it('requires learner question metadata for question contributions', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetScores: [],
            diagnosticMisconceptionScores: [],
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
      'SPARC dialogue scoring learnerQuestion is required when learnerContribution.type is question',
    );
  });

  it('fails clearly when the model echoes tutor metadata that does not match the selected action', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            targetType: 'learningTarget',
            targetId: 'kc-b',
            selectedMove: 'hint',
            tutorMessage: 'Changed target.',
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
    expect((error as Error).message).to.equal(
      'SPARC dialogue utterance response targetId "kc-b" did not match selected targetId "kc-a"',
    );
  });

  it('returns constrained tutor text when the provider echoes the selected target and action', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        expect(params).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_utterance');
        const userMessage = params.messages[1];
        expect(userMessage).to.not.equal(undefined);
        if (!userMessage) {
          throw new Error('SPARC dialogue utterance call did not include a user message');
        }
        expect(params.messages[0]?.content).to.contain('Selected move: hint.');
        expect(params.messages[0]?.content).to.contain('Move prompt:');
        expect(params.messages[0]?.content).to.contain('Follow the selected runtime move policy.');
        expect(params.messages[0]?.content).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
        expect(params.messages[0]?.content).to.not.contain('selectedMisconception is an incorrect learner belief');
        expect(params.messages[0]?.content).to.not.contain('Use correctExpectations as the authoritative positive content');
        expect(params.messages[0]?.content).to.contain('The JSON object must exactly follow this envelope shape:');
        expect(userMessage.content).to.contain('Problem statement:');
        expect(userMessage.content).to.contain(problemStatement);
        expect(userMessage.content).to.contain('Latest student answer:');
        expect(userMessage.content).to.contain('App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response.');
        expect(userMessage.content).to.contain('Registered move definition:');
        expect(userMessage.content).to.not.contain('Immediate-feedback evidence:');
        expect(userMessage.content).to.contain('"targetType": "learningTarget"');
        expect(userMessage.content).to.contain('"targetId": "kc-a"');
        expect(userMessage.content).to.contain('"selectedMove": "hint"');
        expect(params).to.have.nested.property('intent.strictSchema', true);
        expect(userMessage.content).to.contain('Full dialogue history:');
        return {
          parsedContent: {
            targetType: 'learningTarget',
            targetId: 'kc-a',
            selectedMove: 'hint',
            tutorMessage: 'Try using the authored hint.',
          },
        };
      },
    });

    expect(await provider.generateTutorUtterance(utteranceRequest))
      .to.equal('Try using the authored hint.');
  });

  it('supplies the Compound Interest problem and history without evidence control fields', async function() {
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
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const scoreSchema = params.intent.schema as {
          properties?: Record<string, { items?: { properties?: Record<string, unknown>; required?: string[] } }>;
        };
        const userMessage = JSON.parse(params.messages[1]?.content ?? '{}') as Record<string, unknown>;
        expect(userMessage).to.deep.include({
          problemStatement: 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?',
          learnerText: 'well it is 50$ a year until you change your balance',
        });
        expect(userMessage.dialogueHistory).to.deep.equal([{
          role: 'tutor',
          text: 'What happens after the first year?',
        }]);
        expect(userMessage.learningTargets).to.deep.include({
          clusterKC: 'compound.e2',
          text: 'Later interest is calculated on the original principal plus previously earned interest.',
          priorCoverage: 0,
        });
        expect(userMessage.misconceptions).to.deep.include({
          id: 'M1',
          text: 'A fixed annual rate means the same dollar amount is added every year.',
          priorConfidence: 0,
        });
        expect(scoreSchema.properties?.learningTargetScores?.items?.properties).to.not.have.property('addressed');
        expect(scoreSchema.properties?.diagnosticMisconceptionScores?.items?.properties).to.not.have.property('addressed');
        expect(scoreSchema.properties?.learningTargetScores?.items?.properties).to.not.have.property('evidence');
        expect(scoreSchema.properties?.diagnosticMisconceptionScores?.items?.properties).to.not.have.property('evidence');
        expect(scoreSchema.properties?.learningTargetScores?.items?.properties).to.not.have.property('missingElements');
        expect(params.messages[0]?.content).to.not.contain('evidence');
        return {
          parsedContent: {
            learningTargetScores: [{
              clusterKC: 'compound.e2',
              coverage: 0.3,
            }],
            diagnosticMisconceptionScores: [{
              id: 'M1',
              confidence: 0.45,
            }],
            learnerContribution: { type: 'answer', confidence: 0.45 },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display,
      learnerText: 'well it is 50$ a year until you change your balance',
      ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores?.[0]).to.deep.include({
      clusterKC: 'compound.e2',
      coverage: 0.3,
    });
    expect(score.diagnosticMisconceptionScores?.[0]).to.deep.include({
      id: 'M1',
      confidence: 0.45,
    });
  });

  it('constructs the eleven target-aware prompt cases without attributing rubric text to the learner', async function() {
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
        capturedMessages.push(params.messages);
        const userPrompt = params.messages[1]?.content ?? '';
        const planStart = userPrompt.indexOf('{', userPrompt.indexOf('App-selected plan.'));
        const planEnd = userPrompt.indexOf('\n\nRegistered move definition:', planStart);
        const plan = JSON.parse(userPrompt.slice(planStart, planEnd)) as {
          targetType: 'learningTarget' | 'misconception' | 'learnerQuestion' | 'completion';
          targetId: string;
          selectedMove: string;
        };
        return {
          parsedContent: {
            ...plan,
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
      expect(systemPrompt).to.contain(
        'Do not present rubric language as something the learner said, meant, believed, or knew.',
      );
      expect(systemPrompt).to.contain('The JSON object must exactly follow this envelope shape:');
      expect(systemPrompt).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
      expect(userPrompt).to.contain(`"targetType": "${targetType}"`);
      expect(userPrompt).to.contain(`"selectedMove": "${move}"`);

      if (targetType === 'misconception') {
        expect(systemPrompt).to.contain('If targetType is misconception');
        expect(userPrompt).to.contain(
          'Internal diagnostic target context (authored content; not necessarily the learner\'s expressed position):',
        );
        expect(userPrompt).to.contain('Well I guess you get $50 every year.');
        expect(userPrompt).to.contain('A fixed annual rate means the same dollar amount is added every year.');
        expect(userPrompt).to.not.contain('Relevant authored target content:');
      } else {
        expect(userPrompt).to.contain('Relevant authored target content:');
      }
      if (targetType === 'learningTarget') {
        expect(systemPrompt).to.contain('If targetType is learningTarget');
      }
      if (targetType === 'completion') {
        expect(systemPrompt).to.contain('Because targetType is completion');
      }
      if (move === 'question-deferral') {
        expect(systemPrompt).to.contain('Do not answer the question or reveal the target content');
        expect(userPrompt).to.contain('Learner-question routing context (application classification):');
      }
      if (move === 'question-scope-refusal') {
        expect(systemPrompt).to.contain('cannot discuss that subject');
      }
    });
  });
});
