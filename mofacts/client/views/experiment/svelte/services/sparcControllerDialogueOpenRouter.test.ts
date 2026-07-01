import { expect } from 'chai';
import type { SparcTrialDisplay } from '../../../../../../learning-components/trial-displays/sparc/SparcTrialDisplayAdapter';
import type { SparcUtteranceRequest } from '../../../../../../learning-components/units/sparcsession/sparcUtteranceRequest';
import { requireActiveSparcMoveDefinition } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';
import { createSparcDialogueOpenRouterProvider } from './sparcControllerDialogueOpenRouter.ts';

function dialogueDisplay(): SparcTrialDisplay {
  return {
    type: 'sparc',
    documentId: 'dialogue-doc',
    nodes: [],
    clusterTargets: [{
      clusterIndex: 0,
      clusterKC: 'kc-a',
      label: 'Target A',
    }, {
      clusterIndex: 1,
      clusterKC: 'kc-b',
      label: 'Target B',
    }],
    workingMemoryFacts: [{
      factType: 'learningTarget.source',
      slots: {
        clusterKC: 'kc-a',
        label: 'Expectation A',
        proposition: 'A proposition',
        assertion: 'A assertion',
      },
    }, {
      factType: 'diagnostic.misconceptionSource',
      slots: {
        id: 'mis-1',
        label: 'Misconception A',
        description: 'The learner thinks the wrong thing.',
        repair: 'Repair the misconception.',
        repairQuestion: 'What should replace the wrong idea?',
        repairCriteria: 'The learner rejects the wrong idea.',
      },
    }],
  };
}

const utteranceRequest: SparcUtteranceRequest = {
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
    type: 'assertion',
    confidence: 0.8,
  },
  pedagogicalState: {
    targetType: 'learningTarget',
    targetId: 'kc-a',
    selectedMove: 'hint',
  },
  transitionMetadata: {
    previousTargetType: null,
    previousTargetId: null,
    currentTargetType: 'learningTarget',
    currentTargetId: 'kc-a',
    targetChanged: true,
  },
  targetContent: {
    clusterKC: 'kc-a',
    label: 'Expectation A',
    proposition: 'A proposition',
  },
  plannerState: {
    expectations: [{ clusterKC: 'kc-a', coverage: 0.6 }],
  },
  dialogueHistory: [{
    role: 'student',
    text: 'Earlier answer.',
  }],
};

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
              evidence: 'mentions A',
              missingElements: ['detail'],
            }],
            learnerContribution: {
              type: 'assertion',
              confidence: 0.8,
            },
            learnerQuestion: {
              answerableFromAuthoredContent: false,
            },
          },
        };
      },
    });

    const score = await provider.scoreLearnerResponse({
      display: dialogueDisplay(),
      learnerText: 'I think A matters.',
    } as Parameters<typeof provider.scoreLearnerResponse>[0]);

    expect(score.learningTargetScores).to.deep.equal([{
      clusterKC: 'kc-a',
      coverage: 0.6,
      evidence: 'mentions A',
      missingElements: ['detail'],
    }]);
    expect(score.learnerContribution?.type).to.equal('assertion');
    expect(score.learnerQuestion).to.equal(undefined);
    expect(calls).to.have.length(1);
    expect(calls[0]).to.have.nested.property('intent.schemaName', 'mofacts_sparc_dialogue_score');
    expect(calls[0]).to.not.have.nested.property('intent.strictSchema', true);
    expect(calls[0]).to.have.property('tdfId', 'tdf-1');
    const userMessage = (calls[0] as { messages: Array<{ role: string; content: string }> }).messages[1];
    expect(userMessage).to.not.equal(undefined);
    if (!userMessage) {
      throw new Error('SPARC dialogue scoring call did not include a user message');
    }
    expect(JSON.parse(userMessage.content)).to.deep.include({
      learnerText: 'I think A matters.',
    });
    expect(JSON.parse(userMessage.content).learningTargets[0]).to.deep.include({
      clusterKC: 'kc-a',
      label: 'Expectation A',
    });
    expect(JSON.parse(userMessage.content).misconceptions[0]).to.deep.include({
      id: 'mis-1',
      label: 'Misconception A',
      description: 'The learner thinks the wrong thing.',
      repairCriteria: 'The learner rejects the wrong idea.',
    });
  });

  it('requires learner question metadata for question contributions', async function() {
    const provider = createSparcDialogueOpenRouterProvider({
      async callResolvedOpenRouterJson() {
        return {
          parsedContent: {
            learningTargetScores: [],
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
        expect(params).to.not.have.nested.property('intent.strictSchema', true);
        const userMessage = params.messages[1];
        expect(userMessage).to.not.equal(undefined);
        if (!userMessage) {
          throw new Error('SPARC dialogue utterance call did not include a user message');
        }
        expect(params.messages[0]?.content).to.contain('Prompt contract: autotutor.hint v1.');
        expect(params.messages[0]?.content).to.contain('Move-specific prompt policy:');
        expect(params.messages[0]?.content).to.contain('Use the selected move policy to decide whether the tutorMessage should ask a follow-up question.');
        expect(userMessage.content).to.contain('Latest student answer:');
        expect(userMessage.content).to.contain('App-selected plan. Echo targetType, targetId, and selectedMove exactly in the response.');
        expect(userMessage.content).to.contain('Registered move definition:');
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
});
