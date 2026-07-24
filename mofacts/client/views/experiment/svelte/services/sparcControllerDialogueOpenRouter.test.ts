import { expect } from 'chai';
import type { SparcControllerDisplay } from './sparcController';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import {
  createSparcDialogueOpenRouterProvider,
  type SparcDialogueLearnerResponseScoringTraceEvent,
} from './sparcControllerDialogueOpenRouter.ts';
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

type ScorerDialogueEntry = Readonly<{
  speaker: 'learner' | 'tutor';
  text: string;
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
        factType: 'dialogue.utterance',
        slots: { speaker: entry.speaker, text: entry.text },
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
    const observedTrace: SparcDialogueLearnerResponseScoringTraceEvent[] = [];
    const provider = createSparcDialogueOpenRouterProvider({
      tdfId: 'tdf-1',
      onLearnerResponseScoringTrace(event) {
        observedTrace.push(event);
      },
      async callResolvedOpenRouterJson(params) {
        calls.push(params);
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a',
              evidenceDirection: 'supports',
              evidenceStrength: 0.6,
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1',
              evidenceDirection: 'unaddressed',
              evidenceStrength: 0,
            }],
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
    }]);
    expect(completedEvent.evaluation.evidenceEnvelope.diagnosticMisconceptionEvaluations).to.deep.equal([{
      id: 'mis-1',
      evidenceDirection: 'unaddressed',
      evidenceStrength: 0,
    }]);
    expect(completedEvent.evaluation.learnerResponseScore).to.deep.equal(score);
    expect(calls).to.have.length(1);
    expect(calls[0]).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_score');
    expect(calls[0]).to.have.property('temperature', 0);
    expect(calls[0]).to.not.have.nested.property('intent.strictSchema', true);
    expect(calls[0]).to.have.property('tdfId', 'tdf-1');
    const systemMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[0];
    expect(systemMessage?.content).to.contain('accumulated instructional knowledge across the full dialogue through the latest response');
    expect(systemMessage?.content).to.contain('primary conversational action genuinely requests information or confirmation');
    expect(systemMessage?.content).to.contain('may be either a question or an answer');
    expect(systemMessage?.content).to.contain('score its instructional meaning the same either way');
    expect(systemMessage?.content).to.contain('A response that addresses the problem or answers the tutor cannot be off-task');
    expect(systemMessage?.content).to.contain('exactly one learningTargetEvaluations entry for every supplied learning target');
    expect(systemMessage?.content).to.contain('exactly one diagnosticMisconceptionEvaluations entry for every supplied misconception');
    expect(systemMessage?.content).to.contain('Assess instructional evidence cumulatively from every learner-authored turn');
    expect(systemMessage?.content).to.contain('Study the learner’s trajectory and improvement');
    expect(systemMessage?.content).to.contain('combine distinct complementary learner statements across turns');
    expect(systemMessage?.content).to.contain('Do not average turns, sum per-turn scores');
    expect(systemMessage?.content).to.contain('Tutor turns provide context');
    expect(systemMessage?.content).to.contain('never learner evidence');
    expect(systemMessage?.content).to.contain('return the cumulative semantic coverage the learner has demonstrated');
    expect(systemMessage?.content).to.contain('does not erase knowledge demonstrated in earlier learner turns');
    expect(systemMessage?.content).to.contain('return the learner’s resolved stance at the end of the dialogue');
    expect(systemMessage?.content).to.contain('supersedes conflicting earlier learner evidence');
    expect(systemMessage?.content).to.contain('do not reactivate a repaired misconception solely because an earlier turn supported it');
    expect(systemMessage?.content).to.contain('supports: the learner’s accumulated, resolved account presents some');
    expect(systemMessage?.content).to.contain('contradicts: the learner’s resolved account explicitly rejects');
    expect(systemMessage?.content).to.contain('unaddressed: the learner’s own contributions establish no resolved stance');
    expect(systemMessage?.content).to.not.contain('Score only meaning expressed in the latest learner response');
    expect(systemMessage?.content).to.not.contain('earlier learner or tutor statements are not new evidence by themselves');
    expect(systemMessage?.content).to.contain('naming only one side or participant is not support');
    expect(systemMessage?.content).to.contain('stated relation with the stated roles and direction');
    expect(systemMessage?.content).to.contain('opposite relation or reverses the roles');
    expect(systemMessage?.content).to.contain('one continuous semantic-coverage rubric for evidenceStrength');
    expect(systemMessage?.content).to.contain('explicitly represents in the selected evidenceDirection');
    expect(systemMessage?.content).to.contain('0 means the accumulated learner account represents none of the proposition in that direction');
    expect(systemMessage?.content).to.contain('0.25 means it represents a significant portion');
    expect(systemMessage?.content).to.contain('0.5 means it represents more than half');
    expect(systemMessage?.content).to.contain('0.75 means it represents most');
    expect(systemMessage?.content).to.contain('1 means it represents the entire defining meaning');
    expect(systemMessage?.content).to.contain('anchors on a continuous scale, not discrete categories');
    expect(systemMessage?.content).to.contain('supports and contradicts require evidenceStrength greater than 0');
    expect(systemMessage?.content).to.contain('unaddressed requires evidenceStrength 0');
    expect(systemMessage?.content).to.contain('evidenceDirection determines whether the resolved evidence supports or contradicts');
    expect(systemMessage?.content).to.contain('cumulative semantic coverage, not confidence or the size of the learner’s improvement');
    expect(systemMessage?.content).to.contain('If the latest contribution is off-task');
    expect(systemMessage?.content).to.contain('Still evaluate prior learner-authored turns cumulatively');
    expect(systemMessage?.content).to.not.contain('contradicts and unaddressed require evidenceStrength 0');
    expect(systemMessage?.content).to.not.contain('larger positive evidenceStrength always means more affirmative representation');
    expect(systemMessage?.content).to.contain('Do not speculate about what the learner is thinking. This is an evidentiary evaluation');
    expect(systemMessage?.content).to.contain('Do not infer support from topical similarity, shared vocabulary, shared numbers');
    expect(systemMessage?.content).to.contain('A bare number or calculation supports a misconception only when');
    expect(systemMessage?.content).to.contain('contradicts a misconception when it unambiguously instantiates the correct alternative in context');
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
    });
    expect(JSON.parse(userMessage.content).learningTargets[0]).to.not.have.property('priorCoverage');
    expect(JSON.parse(userMessage.content).misconceptions[0]).to.deep.include({
      id: 'mis-1',
      text: 'The learner thinks the wrong thing.',
    });
    expect(JSON.parse(userMessage.content).misconceptions[0]).to.not.have.property('priorSupportStrength');
    expect(userMessage.content).to.not.contain('assertion');
    expect(userMessage.content).to.not.contain('proposition');
    expect(userMessage.content).to.not.contain('repairCriteria');
    expect(userMessage.content).to.not.contain('dialogue.moveContent');
    expect(systemMessage?.content).to.not.contain('Return only values changed by the latest response');
    expect(systemMessage?.content).to.not.contain('priorCoverage');
    expect(systemMessage?.content).to.not.contain('priorSupportStrength');
    expect(calls[0]).to.have.nested.property('messages[0].content')
      .that.contains('Resolve references using the problem statement and dialogue history');
  });

  it('accepts direction-relative contradiction strength while preserving the sparse downstream score contract', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0.8,
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'contradicts', evidenceStrength: 0.7,
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
            learningTargetEvaluations: [{
              clusterKC: 'kc-a',
              evidenceDirection: 'unaddressed',
              evidenceStrength: 0,
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1',
              evidenceDirection: 'unaddressed',
              evidenceStrength: 0,
            }],
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
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5,
            }],
            learnerContribution: { type: 'off-task' },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'Can we talk about something else?',
      ...scorerContext(),
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([]);
    expect(score.diagnosticMisconceptionScores).to.equal(undefined);
    expect(score.learnerContribution).to.deep.equal({ type: 'off-task' });
  });

  it('rejects incomplete, inconsistent, unknown, and duplicate evidence at the provider boundary', async function() {
    const invalidEnvelopes = [{
      learningTargetEvaluations: [{
        clusterKC: 'unknown-kc', evidenceDirection: 'supports', evidenceStrength: 0.6,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'mis-1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [
        { id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5 },
        { id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.8 },
      ],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [],
      diagnosticMisconceptionEvaluations: [{
        id: 'mis-1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'unaddressed', evidenceStrength: 0.2,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'mis-1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }, {
      learningTargetEvaluations: [{
        clusterKC: 'kc-a', evidenceDirection: 'contradicts', evidenceStrength: 0,
      }],
      diagnosticMisconceptionEvaluations: [{
        id: 'mis-1', evidenceDirection: 'unaddressed', evidenceStrength: 0,
      }],
      learnerContribution: { type: 'answer' },
    }];
    const expectedMessages = [
      'unknown learning target clusterKC "unknown-kc"',
      'duplicate diagnostic misconception id "mis-1"',
      'missing learning target clusterKC "kc-a"',
      'evidenceStrength must be 0 when evidenceDirection is unaddressed',
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
        'evidence-parsed',
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

  it('normalizes non-increasing cumulative scores out of otherwise valid model envelopes', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'kc-a', evidenceDirection: 'supports', evidenceStrength: 0.2,
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'mis-1', evidenceDirection: 'supports', evidenceStrength: 0.5,
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
        expect(params.messages[0]?.content).to.contain('Acknowledgement boundary for every move');
        expect(params.messages[0]?.content).to.contain('Usually begin with a brief acknowledgement');
        expect(params.messages[0]?.content).to.contain('does not agree with the answer or adopt the learner\'s claim as the tutor\'s own position');
        expect(params.messages[0]?.content).to.contain('explicitly attribute it to the learner');
        expect(params.messages[0]?.content).to.contain('Do not use a fixed template or repeat the same opener across turns');
        expect(params.messages[0]?.content).to.contain('Misconception boundary for every move');
        expect(params.messages[0]?.content).to.contain('do not praise, endorse, validate, or describe that claim as correct, useful progress, close, or a good start');
        expect(params.messages[0]?.content).to.contain('never mention content found only in an earlier response');
        expect(params.messages[0]?.content).to.not.contain('I hear you');
        expect(params.messages[0]?.content).to.not.contain('I hear that you think');
        expect(params).to.have.property('temperature', 0.15);
        expect(params.messages[0]?.content).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
        expect(params.messages[0]?.content).to.not.contain('selectedMisconception is an incorrect learner belief');
        expect(params.messages[0]?.content).to.not.contain('Use correctExpectations as the authoritative positive content');
        expect(params.messages[0]?.content).to.contain('The JSON object must exactly follow this envelope shape:');
        expect(userMessage.content).to.contain('Problem statement:');
        expect(userMessage.content).to.contain(problemStatement);
        expect(userMessage.content).to.contain('Latest student answer (the primary source for any acknowledgement):');
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
          properties?: Record<string, { items?: { properties?: Record<string, unknown>; required?: string[] } }>;
        };
        const userMessage = JSON.parse(params.messages[1]?.content ?? '{}') as Record<string, unknown>;
        expect(userMessage).to.deep.include({
          problemStatement: 'Suppose $1,000 earns 5% interest and interest remains in the account. How does the balance grow?',
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
          'clusterKC', 'evidenceDirection', 'evidenceStrength',
        );
        expect(scoreSchema.properties?.learningTargetEvaluations?.items?.required).to.deep.equal([
          'clusterKC', 'evidenceDirection', 'evidenceStrength',
        ]);
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations?.items?.properties).to.have.all.keys(
          'id', 'evidenceDirection', 'evidenceStrength',
        );
        expect(scoreSchema.properties?.diagnosticMisconceptionEvaluations?.items?.required).to.deep.equal([
          'id', 'evidenceDirection', 'evidenceStrength',
        ]);
        return {
          parsedContent: {
            learningTargetEvaluations: [{
              clusterKC: 'compound.e1',
              evidenceDirection: 'supports',
              evidenceStrength: 0.85,
            }, {
              clusterKC: 'compound.e2',
              evidenceDirection: 'supports',
              evidenceStrength: 0.95,
            }],
            diagnosticMisconceptionEvaluations: [{
              id: 'M1',
              evidenceDirection: 'contradicts',
              evidenceStrength: 1,
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
      expect(systemPrompt).to.contain('Acknowledgement boundary for every move');
      expect(systemPrompt).to.contain('explicitly attribute it to the learner');
      expect(systemPrompt).to.contain('Do not use a fixed template or repeat the same opener across turns');
      expect(systemPrompt).to.contain('Misconception boundary for every move');
      expect(systemPrompt.indexOf('Acknowledgement boundary for every move')).to.be.lessThan(
        systemPrompt.indexOf('Selected move:'),
      );
      expect(systemPrompt.indexOf('Misconception boundary for every move')).to.be.lessThan(
        systemPrompt.indexOf('Selected move:'),
      );
      expect(systemPrompt).to.contain(
        'Do not present rubric language as something the learner said, meant, believed, or knew.',
      );
      expect(systemPrompt).to.contain('The JSON object must exactly follow this envelope shape:');
      expect(systemPrompt).to.not.contain('Begin tutorMessage with one brief immediate-feedback statement');
      expect(systemPrompt).to.not.contain('I hear you');
      expect(systemPrompt).to.not.contain('I hear that you think');
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
