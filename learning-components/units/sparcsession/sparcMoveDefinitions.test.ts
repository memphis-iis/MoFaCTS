import { strict as assert } from 'node:assert';
import {
  SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS,
  getSparcMoveDefinition,
  requireActiveSparcMoveDefinition,
} from './sparcMoveDefinitions';

describe('SPARC move definitions', function() {
  it('registers active AutoTutor dialogue moves with prompt and output contracts', function() {
    const hint = requireActiveSparcMoveDefinition('hint');

    assert.equal(hint.family, 'autotutor-dialogue');
    assert.equal(hint.status, 'active');
    assert.equal(hint.promptId, 'autotutor.hint');
    assert.equal(hint.promptVersion, 'v1');
    assert.equal(hint.outputSchemaId, 'autotutor.chat_utterance');
    assert.equal(hint.outputSchemaVersion, 'v1');
    assert.equal(hint.renderer, 'sparc.dialogue_utterance');
    assert.equal(hint.historyAction, 'sparc-dialogue-turn');
    assert.ok(hint.promptPolicy.includes('clue'));
  });

  it('preserves the seven active move identities and metadata', function() {
    const expectedMoveIds = [
      'question-deferral',
      'question-scope-refusal',
      'pump',
      'prompt',
      'hint',
      'assertion',
      'summary',
    ];

    assert.deepEqual(
      SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.moveId),
      expectedMoveIds,
    );
    for (const definition of SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS) {
      assert.equal(definition.version, 'v1');
      assert.equal(definition.family, 'autotutor-dialogue');
      assert.equal(definition.status, 'active');
      assert.equal(definition.promptId, `autotutor.${definition.moveId}`);
      assert.equal(definition.promptVersion, 'v1');
      assert.equal(definition.outputSchemaId, 'autotutor.chat_utterance');
      assert.equal(definition.outputSchemaVersion, 'v1');
      assert.equal(definition.renderer, 'sparc.dialogue_utterance');
      assert.equal(definition.historyAction, 'sparc-dialogue-turn');
    }
  });

  it('uses ordered plain-text prompt policies with the learner-language boundary', function() {
    for (const definition of SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS) {
      const lines = definition.promptPolicy.split('\n');
      lines.forEach((line, index) => {
        assert.match(line, new RegExp(`^${index + 1}\\. `));
      });
      assert.ok(definition.promptPolicy.includes(
        'Do not present rubric language as something the learner said, meant, believed, or knew.',
      ));
      assert.doesNotMatch(definition.promptPolicy, /\*\*|`|<br>|\|/i);
      assert.doesNotMatch(definition.promptPolicy, /I hear you|I hear that you think|Always begin/);
    }
  });

  it('defines target-specific execution in every scaffold move', function() {
    for (const moveId of ['pump', 'prompt', 'hint', 'assertion']) {
      const policy = requireActiveSparcMoveDefinition(moveId).promptPolicy;
      assert.ok(policy.includes('If targetType is learningTarget'));
      assert.ok(policy.includes('If targetType is misconception'));
      assert.ok(policy.includes(
        'Do not describe repetition or endorsement of an active misconception as progress, closeness, or a good start.',
      ));
    }
  });

  it('grounds pump and hint moves in the selected authored target content', function() {
    const pump = requireActiveSparcMoveDefinition('pump').promptPolicy;
    const hint = requireActiveSparcMoveDefinition('hint').promptPolicy;

    assert.ok(pump.includes('Use the selected authored target content to choose the dimension of elaboration'));
    assert.ok(pump.includes('When the selected expectation introduces a new extension'));
    assert.ok(hint.includes('Use the selected authored target content as the destination of the clue'));
  });

  it('defines separate legitimate-question and scope-boundary moves', function() {
    const deferral = requireActiveSparcMoveDefinition('question-deferral').promptPolicy;
    const refusal = requireActiveSparcMoveDefinition('question-scope-refusal').promptPolicy;

    assert.ok(deferral.includes('Do not answer the learner\'s question'));
    assert.ok(deferral.includes('work with the problem a little longer'));
    assert.ok(deferral.includes('ask the learner for a response as part of this modifier'));
    assert.ok(refusal.includes('cannot discuss that subject'));
    assert.ok(refusal.includes('rude, lewd, illicit'));
  });

  it('gives summary completion-specific trajectory instructions', function() {
    const policy = requireActiveSparcMoveDefinition('summary').promptPolicy;

    assert.ok(policy.includes('Because targetType is completion'));
    assert.ok(policy.includes('correct expectations the learner established'));
    assert.ok(policy.includes('misconception repairs the learner completed'));
    assert.ok(policy.includes('repaired misconceptions from unresolved misconceptions'));
    assert.ok(policy.includes('If the reason is max-turns'));
  });

  it('does not register retired SPARC move primitives', function() {
    const retiredMoveIds = [
      'positive_pump',
      'elaborate',
      'splice',
      'positive_feedback',
      'neutral_feedback',
      'negative_feedback',
      'positive_neutral_feedback',
      'negative_neutral_feedback',
    ];

    for (const moveId of retiredMoveIds) {
      assert.equal(getSparcMoveDefinition(moveId), undefined);
      assert.throws(
        () => requireActiveSparcMoveDefinition(moveId),
        new RegExp(`selected move "${moveId}" has no registered move definition`),
      );
    }
  });

  it('registers assertion as the direct-content scaffold stage', function() {
    const assertion = requireActiveSparcMoveDefinition('assertion');
    assert.equal(assertion.status, 'active');
    assert.ok(assertion.promptPolicy.includes('state the missing expectation content'));
  });

  it('uses unique move ids and prompt ids', function() {
    const moveIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.moveId);
    const promptIds = SPARC_AUTOTUTOR_DIALOGUE_MOVE_DEFINITIONS.map((definition) => definition.promptId);

    assert.equal(new Set(moveIds).size, moveIds.length);
    assert.equal(new Set(promptIds).size, promptIds.length);
  });
});
