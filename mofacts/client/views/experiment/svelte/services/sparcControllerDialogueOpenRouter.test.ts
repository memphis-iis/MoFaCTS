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
        supportStrength: 0.5,
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
        slots: { id: 'mis-1', supportStrength: 0.5 },
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
    expect(calls[0]).to.have.property('temperature', 0);
    expect(calls[0]).to.not.have.nested.property('intent.strictSchema', true);
    expect(calls[0]).to.have.property('tdfId', 'tdf-1');
    const systemMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMessage?.content).to.contain('coverage is cumulative evidence');
    expect(systemMessage?.content).to.contain('never reduce it because of later shorthand, omission, or context-dependent restatement');
    expect(systemMessage?.content).to.contain('primary conversational action genuinely requests information or confirmation');
    expect(systemMessage?.content).to.contain('may be either a question or an answer');
    expect(systemMessage?.content).to.contain('score its instructional meaning the same either way');
    expect(systemMessage?.content).to.contain('decide whether the latest response endorses it, is neutral toward it, or repairs it');
    expect(systemMessage?.content).to.contain('using 0 when the repair is unambiguous');
    expect(systemMessage?.content).to.contain('"Unlike X, the correct rule is Y" rejects X');
    expect(systemMessage?.content).to.contain('A response that addresses the problem or answers the tutor cannot be off-task');
    expect(systemMessage?.content).to.contain('0.8 or above means sufficient understanding to count as covered');
    expect(systemMessage?.content).to.contain('A concise but correct semantic paraphrase of a target deserves at least 0.8');
    expect(systemMessage?.content).to.contain('repeated multiplication for a multiplicative-growth target');
    expect(systemMessage?.content).to.contain('score the learner’s expressed stance, not the probability');
    expect(systemMessage?.content).to.contain('Learning-target coverage is continuous from 0 to 1');
    expect(systemMessage?.content).to.contain('0 means the response demonstrates none of the target proposition');
    expect(systemMessage?.content).to.contain('0.75 means the relationship and most essential elements are correct');
    expect(systemMessage?.content).to.contain('expressed stance on a continuous scale from 0 to 1');
    expect(systemMessage?.content).to.contain('0 means no expressed endorsement or explicit rejection');
    expect(systemMessage?.content).to.contain('0.25 means weak or tentative expressed endorsement');
    expect(systemMessage?.content).to.contain('1 means unequivocal endorsement or repeated reliance despite correction');
    expect(systemMessage?.content).to.contain('For misconceptions, decide whether the latest response directly supports');
    expect(systemMessage?.content).to.contain('Do not speculate about what the learner is thinking. This is an evidentiary evaluation');
    expect(systemMessage?.content).to.contain('merely possible, topically related, shares words or numbers');
    expect(systemMessage?.content).to.contain('weak but affirmative semantic support');
    expect(systemMessage?.content).to.contain('A bare number or calculation supports a misconception only when');
    expect(systemMessage?.content).to.contain('preserve consistency with an earlier answer');
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
    expect(userMessage.content.indexOf('"learnerText"')).to.be.greaterThan(
      userMessage.content.indexOf('"dialogueHistory"'),
    );
    expect(JSON.parse(userMessage.content).learningTargets[0]).to.deep.include({
      clusterKC: 'kc-a',
      text: 'A target text',
      priorCoverage: 0.4,
    });
    expect(JSON.parse(userMessage.content).misconceptions[0]).to.deep.include({
      id: 'mis-1',
      text: 'The learner thinks the wrong thing.',
      priorSupportStrength: 0.5,
    });
    expect(userMessage.content).to.not.contain('assertion');
    expect(userMessage.content).to.not.contain('proposition');
    expect(userMessage.content).to.not.contain('repairCriteria');
    expect(userMessage.content).to.not.contain('dialogue.moveContent');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Return only values changed by the latest response');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Resolve references using the problem statement and dialogue history');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('A high value means stronger support for the incorrect belief, not a better answer');
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

  it('rejects internally inconsistent and unknown score updates at the provider boundary', async function() {
    const invalidEnvelopes = [{
      learningTargetScores: [{ clusterKC: 'kc-a', coverage: 0.6 }],
      diagnosticMisconceptionScores: [],
      learnerContribution: { type: 'off-task' },
    }, {
      learningTargetScores: [{ clusterKC: 'unknown-kc', coverage: 0.6 }],
      diagnosticMisconceptionScores: [],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetScores: [],
      diagnosticMisconceptionScores: [
        { id: 'mis-1', supportStrength: 0.5 },
        { id: 'mis-1', supportStrength: 0.8 },
      ],
      learnerContribution: { type: 'answer' },
    }];
    const expectedMessages = [
      'off-task contribution cannot update instructional targets',
      'unknown learning target id "unknown-kc"',
      'duplicate misconception id "mis-1"',
    ];

    for (const [index, parsedContent] of invalidEnvelopes.entries()) {
      const provider = createSparcDialogueOpenRouterProvider({
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
    }
  });

  it('normalizes non-increasing cumulative scores out of otherwise valid model envelopes', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetScores: [{ clusterKC: 'kc-a', coverage: 0.2 }],
            diagnosticMisconceptionScores: [{ id: 'mis-1', supportStrength: 0.5 }],
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
        expect(params.messages[0]?.content).to.contain('must acknowledge only the latest student answer');
        expect(params.messages[0]?.content).to.contain('Ground its first clause in a phrase or construction from Latest student answer');
        expect(params.messages[0]?.content).to.contain('never mention content found only in an earlier response');
        expect(params).to.have.property('temperature', 0.15);
        expect(params.messages[0]?.content).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
        expect(params.messages[0]?.content).to.not.contain('selectedMisconception is an incorrect learner belief');
        expect(params.messages[0]?.content).to.not.contain('Use correctExpectations as the authoritative positive content');
        expect(params.messages[0]?.content).to.contain('The JSON object must exactly follow this envelope shape:');
        expect(userMessage.content).to.contain('Problem statement:');
        expect(userMessage.content).to.contain(problemStatement);
        expect(userMessage.content).to.contain('Latest student answer (the only source for the conversational receipt):');
        expect(userMessage.content.indexOf('Latest student answer')).to.be.greaterThan(
          userMessage.content.indexOf('Full dialogue history'),
        );
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

  it('orders a question-deferral modifier before the terminal scaffold move', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson(params) {
        const systemPrompt = params.messages[0]?.content ?? '';
        const modifierIndex = systemPrompt.indexOf('Response modifier: question-deferral.');
        const selectedMoveIndex = systemPrompt.indexOf('Selected move: prompt.');
        expect(modifierIndex).to.be.greaterThan(-1);
        expect(selectedMoveIndex).to.be.greaterThan(modifierIndex);
        expect(systemPrompt).to.contain('Produce one coherent tutorMessage with one instructional question.');
        expect(systemPrompt).to.contain('Do not answer the learner\'s question');
        return {
          parsedContent: {
            targetType: 'learningTarget',
            targetId: 'kc-a',
            selectedMove: 'prompt',
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
          priorSupportStrength: 0,
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
              supportStrength: 0.5,
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
      supportStrength: 0.5,
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
        expect(systemPrompt).to.contain('Do not answer the learner\'s question');
        expect(userPrompt).to.contain('Learner-question routing context (application classification):');
      }
      if (move === 'question-scope-refusal') {
        expect(systemPrompt).to.contain('cannot discuss that subject');
      }
    });
  });
});
